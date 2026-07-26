/**
 * base 勢力データの歴史的帰属 横断監査スクリプト（TASK-103 / spike）。
 *
 * `data/europe_<year>.geojson`（全 20 年代）の properties を年代横断で突き合わせ、
 * 「名称・宗主・存続期間」の観点で史実との乖離が疑われる箇所を機械的に洗い出す。
 * 史実との照合と是正方針の決定は人手で行い、結果は
 * `docs/data-inventory/base-attribution-audit.md` にまとめる。本スクリプトは
 * その一覧の**再現手段**であり、判定そのものは行わない（候補の抽出まで）。
 *
 * 検出器（いずれも純粋関数として export する）:
 * - A `suzerainShifts`        … 同一 NAME の SUBJECTO が年代間で変わる
 * - B `singleYearNames`       … 1 年代にしか現れない NAME（消滅・出現の妥当性確認用）
 * - C `presenceGaps`          … 出現 → 不在 → 再出現（存続期間の途切れ）
 * - D `danglingSuzerains`     … SUBJECTO が同年代の NAME に存在しない（宙に浮いた宗主）
 * - E `shapeCarriedRenames`   … 隣接年代で bbox が一致するのに NAME が違う（改名 or 使い回し）
 * - F `colorKeyDrift`         … 同一 NAME の色キー（powers.ts colorKeyFor）が年代間で変わる
 *
 * 実行: deno task audit-attribution
 * 出力: .outputs/claude/task-103/attribution-audit.{json,md}（git 管理外）
 */

import type { FeatureCollection, GeoJsonProperties } from "geojson";
import { colorKeyFor } from "../src/powers.ts";
import { SNAPSHOT_YEARS } from "../src/config.ts";

/** レポート出力先（git 管理外。docs 側に載せる集計はここから転記する） */
export const AUDIT_OUTPUT_DIR = ".outputs/claude/task-103";

/**
 * 隣接年代の feature を「同じ形」とみなす bbox の一致許容差（度）。
 *
 * 生成物の座標は build-data.ts の COORD_PRECISION = 5 桁（1e-5 度 ≒ 1 m）に
 * 丸められているため、丸め誤差の 10 倍を採る。上流が改名時にポリゴンを
 * そのまま流用しているケースは bbox が完全一致（差 0）で出るため、この値を
 * 1 桁動かしても結果は変わらない。
 */
export const SHAPE_MATCH_EPS_DEG = 1e-4;

/** 監査対象の年代（src/config.ts の SNAPSHOT_YEARS を唯一の定義元とする） */
export const YEARS: number[] = [...SNAPSHOT_YEARS];

/** 年代 → その年の FeatureCollection */
export type YearlyCollections = ReadonlyMap<number, FeatureCollection>;

/** feature 1 件から監査に使う properties だけを取り出したもの */
export interface PowerRecord {
  readonly name: string;
  readonly subjecto: string;
  readonly colorKey: string;
  readonly bbox: readonly [number, number, number, number];
}

/** properties の文字列値を取り出す（空文字・非文字列は "" 扱い） */
function str(props: GeoJsonProperties, key: string): string {
  const v = props?.[key];
  return typeof v === "string" ? v : "";
}

/** renames（name-overrides.json）で表記ゆれを正規化する */
export function normalizeName(
  name: string,
  renames: Record<string, string>,
): string {
  return renames[name] ?? name;
}

/** ポリゴン / マルチポリゴンの bbox を返す。座標を持たない geometry は null */
export function bboxOf(
  geometry: FeatureCollection["features"][number]["geometry"],
): [number, number, number, number] | null {
  const rings: number[][][] = [];
  if (geometry.type === "Polygon") rings.push(...geometry.coordinates);
  else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates) rings.push(...poly);
  } else return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX, maxY];
}

/**
 * FeatureCollection から監査用のレコード列を作る（純粋関数）。
 * NAME を持たない feature（上流がどの勢力にも帰属させていない土地）は対象外。
 */
export function recordsOf(
  fc: FeatureCollection,
  renames: Record<string, string> = {},
): PowerRecord[] {
  const out: PowerRecord[] = [];
  for (const feature of fc.features) {
    const props = feature.properties ?? {};
    const rawName = str(props, "NAME");
    if (rawName === "") continue;
    const name = normalizeName(rawName, renames);
    const rawSubjecto = str(props, "SUBJECTO");
    const subjecto = rawSubjecto === ""
      ? ""
      : normalizeName(rawSubjecto, renames);
    const key = colorKeyFor({ ...props, NAME: name, SUBJECTO: subjecto }) ??
      name;
    const bbox = bboxOf(feature.geometry) ?? [0, 0, 0, 0];
    out.push({ name, subjecto, colorKey: key, bbox });
  }
  return out;
}

/** 年代 → レコード列。以降の検出器は全てこの形を入力に取る */
export type YearlyRecords = ReadonlyMap<number, readonly PowerRecord[]>;

/** A: 同一 NAME の SUBJECTO が年代間で変わるもの */
export interface SuzerainShift {
  readonly name: string;
  /** 年代 → その年に現れる SUBJECTO（空文字は「独立（自己参照）」に正規化済み） */
  readonly byYear: ReadonlyMap<number, readonly string[]>;
}

/** SUBJECTO の空文字と自己参照はどちらも「独立」を意味するので "" に寄せる */
function suzerainOf(rec: PowerRecord): string {
  return rec.subjecto === rec.name ? "" : rec.subjecto;
}

export function suzerainShifts(records: YearlyRecords): SuzerainShift[] {
  const byName = new Map<string, Map<number, Set<string>>>();
  for (const [year, recs] of records) {
    for (const rec of recs) {
      const years = byName.get(rec.name) ?? new Map<number, Set<string>>();
      const set = years.get(year) ?? new Set<string>();
      set.add(suzerainOf(rec));
      years.set(year, set);
      byName.set(rec.name, years);
    }
  }
  const out: SuzerainShift[] = [];
  for (const [name, years] of byName) {
    const all = new Set<string>();
    for (const set of years.values()) for (const s of set) all.add(s);
    if (all.size < 2) continue;
    const byYear = new Map<number, readonly string[]>();
    for (const year of [...years.keys()].sort((a, b) => a - b)) {
      byYear.set(year, [...years.get(year)!].sort());
    }
    out.push({ name, byYear });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 年代 → NAME 集合 */
function namesByYear(records: YearlyRecords): Map<number, Set<string>> {
  const out = new Map<number, Set<string>>();
  for (const [year, recs] of records) {
    out.set(year, new Set(recs.map((r) => r.name)));
  }
  return out;
}

/** NAME → 出現年代（昇順） */
export function presenceByName(records: YearlyRecords): Map<string, number[]> {
  const out = new Map<string, number[]>();
  for (const [year, recs] of records) {
    for (const rec of recs) {
      const years = out.get(rec.name) ?? [];
      if (!years.includes(year)) years.push(year);
      out.set(rec.name, years);
    }
  }
  for (const years of out.values()) years.sort((a, b) => a - b);
  return out;
}

/** B: 1 年代にしか現れない NAME */
export function singleYearNames(
  records: YearlyRecords,
): { name: string; year: number }[] {
  const out: { name: string; year: number }[] = [];
  for (const [name, years] of presenceByName(records)) {
    if (years.length === 1) out.push({ name, year: years[0] });
  }
  return out.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name));
}

/** C: 出現 → 不在 → 再出現（存続期間の途切れ） */
export interface PresenceGap {
  readonly name: string;
  readonly present: readonly number[];
  readonly missing: readonly number[];
}

export function presenceGaps(
  records: YearlyRecords,
  years: readonly number[] = YEARS,
): PresenceGap[] {
  const out: PresenceGap[] = [];
  for (const [name, present] of presenceByName(records)) {
    if (present.length < 2) continue;
    const first = present[0];
    const last = present[present.length - 1];
    const missing = years.filter(
      (y) => y > first && y < last && !present.includes(y),
    );
    if (missing.length > 0) out.push({ name, present, missing });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** D: SUBJECTO が同年代の NAME に存在しない（宙に浮いた宗主） */
export interface DanglingSuzerain {
  readonly year: number;
  readonly suzerain: string;
  readonly vassals: readonly string[];
}

export function danglingSuzerains(
  records: YearlyRecords,
): DanglingSuzerain[] {
  const names = namesByYear(records);
  const out: DanglingSuzerain[] = [];
  for (const [year, recs] of records) {
    const present = names.get(year) ?? new Set<string>();
    const grouped = new Map<string, Set<string>>();
    for (const rec of recs) {
      const suzerain = suzerainOf(rec);
      if (suzerain === "" || present.has(suzerain)) continue;
      const set = grouped.get(suzerain) ?? new Set<string>();
      set.add(rec.name);
      grouped.set(suzerain, set);
    }
    for (const [suzerain, vassals] of grouped) {
      out.push({ year, suzerain, vassals: [...vassals].sort() });
    }
  }
  return out.sort((a, b) =>
    a.year - b.year || a.suzerain.localeCompare(b.suzerain)
  );
}

/** E: 隣接年代で bbox が一致するのに NAME が違う（改名 or ポリゴン使い回し） */
export interface ShapeCarriedRename {
  readonly fromYear: number;
  readonly fromName: string;
  readonly toYear: number;
  readonly toName: string;
  readonly bbox: readonly [number, number, number, number];
}

export function shapeCarriedRenames(
  records: YearlyRecords,
  years: readonly number[] = YEARS,
  eps: number = SHAPE_MATCH_EPS_DEG,
): ShapeCarriedRename[] {
  const out: ShapeCarriedRename[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < years.length - 1; i++) {
    const a = years[i];
    const b = years[i + 1];
    for (const ra of records.get(a) ?? []) {
      for (const rb of records.get(b) ?? []) {
        if (ra.name === rb.name) continue;
        const same = ra.bbox.every((v, k) => Math.abs(v - rb.bbox[k]) < eps);
        if (!same) continue;
        const key = `${ra.name} ${rb.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          fromYear: a,
          fromName: ra.name,
          toYear: b,
          toName: rb.name,
          bbox: ra.bbox,
        });
      }
    }
  }
  return out;
}

/** F: 同一 NAME の色キーが年代間で変わる（年代切替で配色が動く） */
export interface ColorKeyDrift {
  readonly name: string;
  readonly keys: readonly string[];
}

export function colorKeyDrift(records: YearlyRecords): ColorKeyDrift[] {
  const byName = new Map<string, Set<string>>();
  for (const recs of records.values()) {
    for (const rec of recs) {
      const set = byName.get(rec.name) ?? new Set<string>();
      set.add(rec.colorKey);
      byName.set(rec.name, set);
    }
  }
  const out: ColorKeyDrift[] = [];
  for (const [name, keys] of byName) {
    if (keys.size < 2) continue;
    out.push({ name, keys: [...keys].sort() });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 全検出器をまとめて走らせた結果 */
export interface AuditReport {
  readonly years: readonly number[];
  readonly suzerainShifts: readonly SuzerainShift[];
  readonly singleYearNames: readonly { name: string; year: number }[];
  readonly presenceGaps: readonly PresenceGap[];
  readonly danglingSuzerains: readonly DanglingSuzerain[];
  readonly shapeCarriedRenames: readonly ShapeCarriedRename[];
  readonly colorKeyDrift: readonly ColorKeyDrift[];
}

export function auditAll(
  records: YearlyRecords,
  years: readonly number[] = YEARS,
): AuditReport {
  return {
    years: [...years],
    suzerainShifts: suzerainShifts(records),
    singleYearNames: singleYearNames(records),
    presenceGaps: presenceGaps(records, years),
    danglingSuzerains: danglingSuzerains(records),
    shapeCarriedRenames: shapeCarriedRenames(records, years),
    colorKeyDrift: colorKeyDrift(records),
  };
}

/** レポートを Markdown に整形する（純粋関数） */
export function formatReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push(`# base 勢力データ 帰属監査（機械抽出）`);
  lines.push("");
  lines.push(
    `対象年代: ${report.years.join(" / ")}（${report.years.length} 年代）`,
  );
  lines.push("");
  lines.push("## A. SUBJECTO の年代間の揺れ");
  for (const shift of report.suzerainShifts) {
    const parts = [...shift.byYear].map(([year, subs]) =>
      `${year}=[${subs.map((s) => s === "" ? "独立" : s).join("/")}]`
    );
    lines.push(`- ${shift.name}: ${parts.join(", ")}`);
  }
  lines.push("");
  lines.push("## B. 単一年代にしか現れない NAME");
  for (const { name, year } of report.singleYearNames) {
    lines.push(`- ${year}: ${name}`);
  }
  lines.push("");
  lines.push("## C. 存続期間の途切れ");
  for (const gap of report.presenceGaps) {
    lines.push(
      `- ${gap.name}: 出現=${gap.present.join(",")} 欠落=${
        gap.missing.join(",")
      }`,
    );
  }
  lines.push("");
  lines.push("## D. 宙に浮いた宗主（SUBJECTO が同年代に存在しない）");
  for (const d of report.danglingSuzerains) {
    lines.push(`- ${d.year}: ${d.suzerain} ← ${d.vassals.join(", ")}`);
  }
  lines.push("");
  lines.push("## E. bbox 一致・異名（改名 / ポリゴン使い回し）");
  for (const r of report.shapeCarriedRenames) {
    const bbox = r.bbox.map((v) => v.toFixed(2)).join(",");
    lines.push(
      `- ${r.fromYear} ${r.fromName} → ${r.toYear} ${r.toName}（bbox=${bbox}）`,
    );
  }
  lines.push("");
  lines.push("## F. 色キーの年代間の揺れ");
  for (const drift of report.colorKeyDrift) {
    lines.push(`- ${drift.name}: ${drift.keys.join(" / ")}`);
  }
  lines.push("");
  return lines.join("\n");
}

/** data/europe_<year>.geojson を読み込む */
async function loadYearly(
  years: readonly number[],
): Promise<YearlyCollections> {
  const out = new Map<number, FeatureCollection>();
  for (const year of years) {
    const text = await Deno.readTextFile(`data/europe_${year}.geojson`);
    out.set(year, JSON.parse(text) as FeatureCollection);
  }
  return out;
}

/** name-overrides.json の renames を読む（無ければ空） */
async function loadRenames(): Promise<Record<string, string>> {
  try {
    const text = await Deno.readTextFile("data/name-overrides.json");
    const data = JSON.parse(text);
    return typeof data?.renames === "object" && data.renames !== null
      ? data.renames as Record<string, string>
      : {};
  } catch {
    return {};
  }
}

if (import.meta.main) {
  const collections = await loadYearly(YEARS);
  const renames = await loadRenames();
  const records = new Map<number, readonly PowerRecord[]>();
  for (const [year, fc] of collections) {
    records.set(year, recordsOf(fc, renames));
  }
  const report = auditAll(records);
  await Deno.mkdir(AUDIT_OUTPUT_DIR, { recursive: true });
  await Deno.writeTextFile(
    `${AUDIT_OUTPUT_DIR}/attribution-audit.json`,
    JSON.stringify(
      {
        ...report,
        suzerainShifts: report.suzerainShifts.map((s) => ({
          name: s.name,
          byYear: Object.fromEntries(s.byYear),
        })),
      },
      null,
      2,
    ),
  );
  await Deno.writeTextFile(
    `${AUDIT_OUTPUT_DIR}/attribution-audit.md`,
    formatReport(report),
  );
  console.log(
    [
      `年代数: ${report.years.length}`,
      `A SUBJECTO 揺れ: ${report.suzerainShifts.length}`,
      `B 単一年代のみ: ${report.singleYearNames.length}`,
      `C 存続の途切れ: ${report.presenceGaps.length}`,
      `D 宙に浮いた宗主: ${report.danglingSuzerains.length}`,
      `E bbox 一致・異名: ${report.shapeCarriedRenames.length}`,
      `F 色キー揺れ: ${report.colorKeyDrift.length}`,
      `→ ${AUDIT_OUTPUT_DIR}/attribution-audit.{json,md}`,
    ].join("\n"),
  );
}
