/**
 * 神聖ローマ帝国（HRE）主要領邦オーバーレイのデータパイプラインスクリプト（TASK-19）。
 * - ETH Research Collection（DSpace API）から Roller データセットの Shapefile を取得
 *   （bitstream UUID 固定・認証不要）
 * - dbf の start / end 属性で「year 時点で有効」な領邦に絞る（欠損は無期限扱い）
 * - 宗派期間ごとの同一領邦の重複行を dedup する
 * - 主要領邦のみ選定し、properties を NAME / SUBJECTO / PARTOF に間引く
 * - simplify + 座標丸めで 1 ファイル HRE_SIZE_LIMIT_BYTES 以下に収める
 * - data/hre_<year>.geojson（year ∈ HRE_OVERLAY_YEARS）を生成する
 *
 * 出典: Roller, Ramona. "Spatio-temporal data on territories of the
 * Holy Roman Empire", ETH Zürich Research Collection.
 * DOI: 10.3929/ethz-b-000472583 / handle: 20.500.11850/472583
 * ライセンス: CC BY-NC-SA 4.0
 *
 * ライセンス上の重要制約: 本データ（CC BY-NC-SA 4.0）は GPL-3.0 派生の
 * data/europe_<year>.geojson に統合してはならない。必ず別ファイル
 * data/hre_<year>.geojson として生成し、オーバーレイとしてのみ利用する。
 *
 * ロジックは純粋関数として export しテスト対象にする（scripts/build-hre_test.ts）。
 */

import type { Feature, FeatureCollection } from "geojson";
import { shrinkToLimit } from "./build-data.ts";

/** 出典データセットの DOI */
export const HRE_SOURCE_DOI = "10.3929/ethz-b-000472583";
/** 出典アイテムの handle（ETH Research Collection / DSpace） */
export const HRE_SOURCE_HANDLE = "20.500.11850/472583";
/** 出典データのライセンス。europe_<year>.geojson（GPL-3.0 派生）と混合禁止 */
export const HRE_SOURCE_LICENSE = "CC BY-NC-SA 4.0";

/**
 * territories_manual.* の bitstream UUID（DSpace API で列挙して固定）。
 * 元データ更新で境界・属性が勝手に変わらないよう UUID をピン留めする。
 * shx / prj は npm:shapefile のパースには不要だが、出典の完全性のため記録する
 * （prj は GCS_WGS_1984、cpg は ISO-8859-1 = latin-1 を確認済み）。
 */
export const HRE_BITSTREAM_UUIDS = {
  shp: "3291edf3-6d4c-4b18-a8af-420da09c6355",
  dbf: "4a74aa26-c5f0-4829-89e6-9f64c0c5e0d6",
  shx: "b1c670ba-a88e-4cea-9218-82ba07fec0fe",
  prj: "754ba5f9-e460-4ec2-b4e9-3a897194804b",
} as const;

/** DSpace API の bitstream ダウンロード URL を生成する（純粋関数） */
export function buildBitstreamUrl(uuid: string): string {
  return `https://www.research-collection.ethz.ch/server/api/core/bitstreams/${uuid}/content`;
}

/**
 * オーバーレイ対象年。src/config.ts の HRE_OVERLAY_YEARS を唯一の定義元とし、
 * 表示側との二重定義によるドリフトを避ける（build-data.ts の YEARS と同じ方針）。
 */
import { HRE_OVERLAY_YEARS } from "../src/config.ts";
export { HRE_OVERLAY_YEARS };

/** 出力 1 ファイルあたりのサイズ上限（バイト） */
export const HRE_SIZE_LIMIT_BYTES = 200 * 1000;

/** オーバーレイ feature の SUBJECTO / PARTOF に入れる帝国名 */
export const HRE_NAME = "Holy Roman Empire";

/** 年代で称号が変わる領邦の NAME 期間定義 */
export interface TerritoryNamePeriod {
  /** この期間の称号付き英語表示名 */
  name: string;
  /** この称号が有効になる最初の年（含む）。省略時は最初期から有効 */
  start?: number;
}

/**
 * 領邦 id が解決する英語表示名の指定。固定名の文字列、または年代で称号が
 * 変わる場合は期間定義の配列（start 昇順・先頭は start 省略）。
 */
export type TerritoryNameSpec = string | TerritoryNamePeriod[];

/**
 * 主要領邦の選定結果（ドイツ語 id → 称号付き英語表示名）。マップに載る id のみ
 * 出力する。実データ（558 行・276 ユニーク id）を確認し、選帝侯 7（Böhmen /
 * Kurbrandenburg / Kurpfalz / Kurmainz / Kurtrier / KölnErzstift / ザクセン
 * 選帝侯領）+ 面積の大きい主要領邦（Österreich / Bayern / Württemberg /
 * Hessen 系 / SalzburgErzstift）を採用。
 * 表示名は正式称号付きで統一する（TASK-32）: 世俗選帝侯は Electorate、
 * 聖界 3 選帝侯は Archbishopric、ボヘミアのみ Kingdom。
 * ザクセンは 1547 年（ヴィッテンベルクの降伏）前後で選帝侯位がエルネスティン系 →
 * アルベルティン系へ移るため、年代に応じて実在する id を採用しつつ表示名は
 * "Electorate of Saxony"（選帝侯領）と "Duchy of Saxony"（公領）の 2 系統に
 * 固定する。バイエルンは 1623 年の選帝侯昇格を境に Duchy → Electorate に
 * 切り替える（同一 id・同一領域）。
 * ヘッセンは 1567 年の分割相続を境に Hessen → HessenKassel / HessenDarmstadt。
 */
export const HRE_TERRITORIES: Record<string, TerritoryNameSpec> = {
  "Österreich": "Archduchy of Austria",
  "Kurbrandenburg": "Electorate of Brandenburg",
  "Böhmen": "Kingdom of Bohemia",
  "Bayern": [
    { name: "Duchy of Bavaria" },
    { name: "Electorate of Bavaria", start: 1623 },
  ],
  "ernestinischesSachsenbis1547": "Electorate of Saxony",
  "albertinischesSachsenbis1547": "Duchy of Saxony",
  "albertinischesSachsennach1635": "Electorate of Saxony",
  "ernestinischesSachsennach1547": "Duchy of Saxony",
  "Kurpfalz": "Electorate of the Palatinate",
  "Kurmainz": "Archbishopric of Mainz",
  "Kurtrier": "Archbishopric of Trier",
  "KölnErzstift": "Archbishopric of Cologne",
  "Württemberg": "Duchy of Württemberg",
  "Hessen": "Landgraviate of Hesse",
  "HessenKassel": "Landgraviate of Hesse-Kassel",
  "HessenDarmstadt": "Landgraviate of Hesse-Darmstadt",
  "SalzburgErzstift": "Archbishopric of Salzburg",
};

/**
 * 表示名指定を year 時点の英語表示名に解決する（純粋関数）。
 * 期間配列は start 昇順を前提に、start <= year を満たす最後の期間を採用する。
 * 全期間が year より後（通常は起こらない）の場合は先頭の名前に落とす。
 */
export function resolveTerritoryName(
  spec: TerritoryNameSpec,
  year: number,
): string {
  if (typeof spec === "string") return spec;
  let resolved = spec[0].name;
  for (const period of spec) {
    if (period.start === undefined || year >= period.start) {
      resolved = period.name;
    }
  }
  return resolved;
}

/** start / end の上書き指定（片側のみも可） */
export interface RangeOverride {
  start?: number;
  end?: number;
}

/**
 * 実データの欠損・断絶を補う start / end の上書き（id 単位・歴史的根拠つき）。
 * - Bayern: データは 1506（ランツフート継承戦争後の再統合）〜1623（選帝侯昇格で
 *   行が打ち切り）のみ。バイエルンは 1500 時点（分割公国）も 1623 以降（選帝侯領）
 *   も同一の中核領域で継続しているため、粗いオーバーレイの近似として
 *   1500〜1806（帝国解体）に広げる。
 * - albertinischesSachsennach1635: dbf 上 start / end とも欠損（アスタリスク埋め）
 *   かつアルベルティン系ザクセンには 1572〜1635 の行が存在しない。選帝侯領
 *   ザクセンは 1547〜1806 に連続して存在するため、先行行（nach 1567）が終わる
 *   1572 から 1806 までをこの形状で近似する。
 */
export const HRE_RANGE_OVERRIDES: Record<string, RangeOverride> = {
  "Bayern": { start: 1500, end: 1806 },
  "albertinischesSachsennach1635": { start: 1572, end: 1806 },
};

/** properties から有限数値を取り出す。欠損（null / undefined / NaN）は null */
function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * feature が year 時点で有効かを start / end 属性で判定する（純粋関数）。
 * 半開区間 start <= year < end。境界年は後継領邦側に譲る（bis 1547 と nach 1547 の
 * 二重計上を防ぐ）。欠損（null / undefined / NaN。dbf のアスタリスク埋め由来）は
 * 無期限として扱う（Österreich は両側欠損 = 全期間有効）。
 */
export function isActiveAtYear(
  props: Record<string, unknown>,
  year: number,
): boolean {
  const start = finiteNumber(props.start);
  const end = finiteNumber(props.end);
  if (start !== null && year < start) return false;
  if (end !== null && year >= end) return false;
  return true;
}

/**
 * 上書き対象 id の feature の start / end を差し替える（純粋関数）。
 * 対象外の feature・他の properties は保持し、入力は破壊しない。
 */
export function applyRangeOverrides(
  fc: FeatureCollection,
  overrides: Record<string, RangeOverride> = HRE_RANGE_OVERRIDES,
): FeatureCollection {
  const features = fc.features.map((feature) => {
    const props = feature.properties ?? {};
    const id = props.id;
    const override = typeof id === "string" ? overrides[id] : undefined;
    if (override === undefined) return feature;
    const patched = { ...props };
    if (override.start !== undefined) patched.start = override.start;
    if (override.end !== undefined) patched.end = override.end;
    return { ...feature, properties: patched };
  });
  return { type: "FeatureCollection", features };
}

/**
 * 同一 id の重複行（宗派期間ごとに 1 行あるため同一領邦が複数回現れる）を
 * 除去し、最初の 1 行のみ残す（純粋関数）。出現順は保持する。
 */
export function dedupById(fc: FeatureCollection): FeatureCollection {
  const seen = new Set<string>();
  const features: Feature[] = [];
  for (const feature of fc.features) {
    const id = feature.properties?.id;
    const key = typeof id === "string" ? id : "";
    if (seen.has(key)) continue;
    seen.add(key);
    features.push(feature);
  }
  return { type: "FeatureCollection", features };
}

/**
 * 選定マップに載っている id の feature のみ残し、year 時点の称号付き英語表示名に
 * リネームして properties を { NAME, SUBJECTO, PARTOF } の最小限に間引く
 * （純粋関数）。複数 id が同一表示名に解決された場合（ザクセンの年代別 id など）は
 * 最初の 1 件のみ残す（同一年に同名領邦を二重計上しない）。
 */
export function selectMajorTerritories(
  fc: FeatureCollection,
  year: number,
  territories: Record<string, TerritoryNameSpec> = HRE_TERRITORIES,
): FeatureCollection {
  const seenNames = new Set<string>();
  const features: Feature[] = [];
  for (const feature of fc.features) {
    const id = feature.properties?.id;
    if (typeof id !== "string") continue;
    const spec = territories[id];
    if (spec === undefined) continue;
    const name = resolveTerritoryName(spec, year);
    if (seenNames.has(name)) continue;
    seenNames.add(name);
    features.push({
      ...feature,
      properties: { NAME: name, SUBJECTO: HRE_NAME, PARTOF: HRE_NAME },
    });
  }
  return { type: "FeatureCollection", features };
}

/**
 * 全行の FeatureCollection から year 時点のオーバーレイを組み立てる（純粋関数）。
 * 上書き適用 → 年代フィルタ → id dedup → 主要領邦の選定・リネーム・間引き。
 */
export function buildYearCollection(
  fc: FeatureCollection,
  year: number,
  territories: Record<string, TerritoryNameSpec> = HRE_TERRITORIES,
  overrides: Record<string, RangeOverride> = HRE_RANGE_OVERRIDES,
): FeatureCollection {
  const patched = applyRangeOverrides(fc, overrides);
  const active: FeatureCollection = {
    type: "FeatureCollection",
    features: patched.features.filter((feature) =>
      isActiveAtYear(feature.properties ?? {}, year)
    ),
  };
  return selectMajorTerritories(dedupById(active), year, territories);
}

/** npm:shapefile の read 関数の型（型定義が同梱されないため最小限を自前定義） */
interface ShapefileModule {
  read(
    shp: ArrayBuffer,
    dbf: ArrayBuffer,
    options?: { encoding?: string },
  ): Promise<FeatureCollection>;
}

/** ピン留め UUID の bitstream をバイト列として取得する */
async function fetchBitstream(uuid: string): Promise<ArrayBuffer> {
  const url = buildBitstreamUrl(uuid);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (status ${res.status})`);
  }
  return await res.arrayBuffer();
}

/**
 * Shapefile（shp + dbf）を取得して FeatureCollection にパースする。
 * dbf の文字コードは latin-1（cpg bitstream: ISO-8859-1）。
 */
async function fetchTerritories(): Promise<FeatureCollection> {
  const [shp, dbf] = await Promise.all([
    fetchBitstream(HRE_BITSTREAM_UUIDS.shp),
    fetchBitstream(HRE_BITSTREAM_UUIDS.dbf),
  ]);
  const shapefile = await import("shapefile") as ShapefileModule;
  return await shapefile.read(shp, dbf, { encoding: "latin1" });
}

async function main(): Promise<void> {
  const raw = await fetchTerritories();
  for (const year of HRE_OVERLAY_YEARS) {
    const selected = buildYearCollection(raw, year);
    const { fc, tolerance, size } = shrinkToLimit(
      selected,
      HRE_SIZE_LIMIT_BYTES,
    );
    const outPath = `data/hre_${year}.geojson`;
    await Deno.writeTextFile(outPath, JSON.stringify(fc));
    console.log(
      `${outPath}: ${size} bytes, tolerance=${tolerance}, features=${fc.features.length}`,
    );
  }
}

if (import.meta.main) {
  await main();
}
