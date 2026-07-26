/**
 * 諸侯領オーバーレイと base 勢力の「二重輪郭・二重ラベル」を解消するための
 * 派生データを生成するパイプライン（TASK-78）。
 *
 * 入力はどちらも既存の生成物（ネットワーク不要）:
 * - data/europe_<year>.geojson（scripts/build-data.ts）
 * - data/france_fiefs_<year>.geojson（scripts/build-france-fiefs.ts）
 *
 * 出力（year ∈ FIEF_DEDUPE_YEARS）:
 * 1. data/fief-dedupe.json … 諸侯領 union による base 勢力の被覆率表
 *    （year → 勢力 NAME → 0..1）。ランタイム（src/fief_dedupe.ts）は
 *    FIEF_COVERAGE_SUPPRESS_THRESHOLD 以上の勢力のラベルを抑制する。
 * 2. data/base_outline_<year>.geojson … base 境界線（各ポリゴンの環）を
 *    諸侯領 union の外側だけに切り出した LineString の集合。ランタイムは
 *    諸侯領対象年に限り base ポリゴンの stroke を止めてこの層を描くため、
 *    諸侯領の内側を走る base 境界線が消え、外側の境界線は従来と同一に見える。
 *
 * なぜ 2 系統に分けるのか（実測に基づく設計判断。1200 年のデータで計測）:
 * - 完全内包される base 勢力は Britany（被覆率 1.0000）のみで、次に高い
 *   Angevin Empire は 0.5126。つまり被覆率だけで抑制できるのは「勢力全体が
 *   諸侯領に置き換わっている」ケースに限られ、ラベルの重複（AC #1）はこれで解ける。
 * - 一方、諸侯領の内側を走る base 境界線は部分重複の勢力に由来する分が多数を
 *   占める（1200 年: Angevin Empire 2,097 km・Kingdom of France 795 km に対し
 *   Britany は 794 km。うち union 外周から 3km 以上内側に入るものが大半）。
 *   deck.gl の accessor は feature 単位でしか効かないため、被覆率による
 *   feature 単位の減衰では消せない。線を幾何的に切り出す必要がある。
 *
 * 決定性: 入力の座標をそのまま使い（切断点のみ COORD_PRECISION で丸める）、
 * feature の並びは入力順、被覆率表のキーは NAME の昇順に固定する。
 */

import area from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { featureCollection, lineString } from "@turf/helpers";
import intersect from "@turf/intersect";
import lineSplit from "@turf/line-split";
import truncate from "@turf/truncate";
import union from "@turf/union";
import type {
  BBox,
  Feature,
  FeatureCollection,
  LineString,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import { FRANCE_FIEF_OVERLAY_YEARS } from "../src/config.ts";
import { COORD_PRECISION } from "./build-data.ts";

/**
 * 生成対象年。諸侯領オーバーレイが存在する年と同一
 * （src/config.ts FRANCE_FIEF_OVERLAY_YEARS = scripts/build-france-fiefs.ts の
 * FRANCE_FIEF_YEARS）。対象外の年は派生データを持たないため、ランタイムは
 * 従来どおりの描画（powers の stroke・base ラベル全件）になる（AC #3）。
 */
export const FIEF_DEDUPE_YEARS: readonly number[] = FRANCE_FIEF_OVERLAY_YEARS;

/** 被覆率を丸める小数桁数（0.0001 = 面積比 0.01% 刻み） */
export const COVERAGE_PRECISION = 4;

/**
 * 被覆率表に記録する下限。これ未満（0.1% 未満）の重複は境界線の解像度差や
 * 座標丸めに由来するノイズで、抑制判定にも目視確認にも意味を持たないため
 * 表に載せない（ファイルを小さく保ち、差分を読みやすくする）。
 */
export const MIN_RECORDED_COVERAGE = 0.001;

/** ポリゴン系ジオメトリを持つ feature */
type PolygonalFeature = Feature<Polygon | MultiPolygon>;

/** feature がポリゴン系ジオメトリを持つか */
function isPolygonal(feature: Feature): feature is PolygonalFeature {
  const type = feature.geometry?.type;
  return type === "Polygon" || type === "MultiPolygon";
}

/** feature のポリゴン（= 環の配列）一覧を返す */
function polygonsOf(feature: PolygonalFeature): Position[][][] {
  return feature.geometry.type === "Polygon"
    ? [feature.geometry.coordinates]
    : feature.geometry.coordinates;
}

/** properties.NAME を取り出す。空文字・非文字列は null */
function nameOf(feature: Feature): string | null {
  const value = feature.properties?.NAME;
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * 諸侯領 FeatureCollection を 1 つのポリゴンへ統合する（純粋関数）。
 * 被覆率も境界線の切り出しも「諸侯領全体が覆う面」に対する判定なので、
 * 諸侯領同士の重なり（OHM の伯領は境界が微妙に重なる）を先に潰しておく。
 * ポリゴンを持つ feature が無ければ null。
 */
export function fiefUnionOf(fiefs: FeatureCollection): PolygonalFeature | null {
  let merged: PolygonalFeature | null = null;
  for (const feature of fiefs.features) {
    if (!isPolygonal(feature)) continue;
    if (merged === null) {
      merged = feature;
      continue;
    }
    merged = union(featureCollection([merged, feature])) ?? merged;
  }
  return merged;
}

/**
 * base 勢力ごとの「諸侯領 union に覆われた面積の割合」を返す（純粋関数）。
 * 同一 NAME の複数 feature（飛び地）は面積で加重して 1 件に集計する。
 * fiefUnion が null（諸侯領なし）のときは空表。
 *
 * 面積は turf の測地面積（m²）で、緯度による経線収束の影響を受けない。
 * intersect が不正ジオメトリで例外を投げた場合はその feature の重複を 0 と
 * みなし、警告して続行する（生成を失敗させない: build-france-fiefs と同方針）。
 */
export function coverageByPowerName(
  base: FeatureCollection,
  fiefUnion: PolygonalFeature | null,
  warnFn: (message: string) => void = console.warn,
): Record<string, number> {
  if (fiefUnion === null) return {};
  const totals = new Map<string, { base: number; covered: number }>();
  for (const feature of base.features) {
    const name = nameOf(feature);
    if (name === null || !isPolygonal(feature)) continue;
    const entry = totals.get(name) ?? { base: 0, covered: 0 };
    entry.base += area(feature);
    try {
      const overlap = intersect(featureCollection([feature, fiefUnion]));
      if (overlap !== null) entry.covered += area(overlap);
    } catch (error) {
      warnFn(`${name} と諸侯領の交差計算に失敗しました: ${String(error)}`);
    }
    totals.set(name, entry);
  }
  const coverage: Record<string, number> = {};
  for (
    const name of [...totals.keys()].sort((a, b) => a.localeCompare(b, "en"))
  ) {
    const entry = totals.get(name)!;
    if (entry.base <= 0) continue;
    const ratio = Number(
      (entry.covered / entry.base).toFixed(COVERAGE_PRECISION),
    );
    if (ratio < MIN_RECORDED_COVERAGE) continue;
    coverage[name] = ratio;
  }
  return coverage;
}

/** 環の bbox（[minX, minY, maxX, maxY]） */
function ringBbox(ring: readonly Position[]): BBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** ポリゴン系ジオメトリ全体の bbox */
function geometryBbox(feature: PolygonalFeature): BBox {
  const boxes = polygonsOf(feature).map((polygon) => ringBbox(polygon[0]));
  return [
    Math.min(...boxes.map((b) => b[0])),
    Math.min(...boxes.map((b) => b[1])),
    Math.max(...boxes.map((b) => b[2])),
    Math.max(...boxes.map((b) => b[3])),
  ];
}

/** 2 つの bbox が交差するか（接触も交差扱い） */
function bboxIntersects(a: BBox, b: BBox): boolean {
  return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
}

/**
 * ライン片の代表点（中央セグメントの中点）。端点は諸侯領の境界上に乗るため
 * 内外判定に使えない（lineSplit の切断点は必ず境界上に来る）。
 */
function representativePoint(coords: readonly Position[]): Position {
  const i = Math.floor((coords.length - 1) / 2);
  return [
    (coords[i][0] + coords[i + 1][0]) / 2,
    (coords[i][1] + coords[i + 1][1]) / 2,
  ];
}

/**
 * base 境界線（各ポリゴンの外環・内環）を諸侯領 union の外側だけに切り出した
 * LineString の FeatureCollection を返す（純粋関数）。
 *
 * - union と bbox が交差しない環はそのまま採用する（切断不要・座標も無変更）
 * - 交差しうる環は lineSplit で union の境界で切り、代表点が union の内側に
 *   ある片を捨てる
 * - fiefUnion が null なら全ての環をそのまま返す（対象外年の非退行）
 *
 * 出力の properties は元の feature の properties をそのまま引き継ぐ
 * （NAME により、どの勢力の境界線かをデバッグできるようにする。描画では未使用）。
 */
export function outlinesOutsideFiefs(
  base: FeatureCollection,
  fiefUnion: PolygonalFeature | null,
  warnFn: (message: string) => void = console.warn,
): FeatureCollection<LineString> {
  const unionBbox = fiefUnion === null ? null : geometryBbox(fiefUnion);
  const lines: Feature<LineString>[] = [];
  for (const feature of base.features) {
    if (!isPolygonal(feature)) continue;
    const properties = feature.properties ?? {};
    for (const polygon of polygonsOf(feature)) {
      for (const ring of polygon) {
        if (ring.length < 2) continue;
        const line = lineString(ring, properties);
        if (
          fiefUnion === null || unionBbox === null ||
          !bboxIntersects(ringBbox(ring), unionBbox)
        ) {
          lines.push(line);
          continue;
        }
        let pieces: Feature<LineString>[];
        try {
          pieces = lineSplit(line, fiefUnion).features;
        } catch (error) {
          // 切断に失敗した環は従来どおり全体を描く（線が消えるより二重輪郭が残る方が安全）
          warnFn(
            `${nameOf(feature) ?? "(no name)"} の境界線の切断に失敗しました: ${
              String(error)
            }`,
          );
          lines.push(line);
          continue;
        }
        // lineSplit は交差点が 1 つも無いと 0 件を返す（元の線を返さない）。
        // bbox は重なるが実際には交差しない環（神聖ローマ帝国・イングランドの
        // 輪郭で発生）がここに来るため、環全体の内外を代表点 1 つで判定する
        // （交差が無い = 環全体が union の内側か外側のどちらかに決まる）。
        if (pieces.length === 0) {
          if (!booleanPointInPolygon(representativePoint(ring), fiefUnion)) {
            lines.push(line);
          }
          continue;
        }
        for (const piece of pieces) {
          const coords = piece.geometry.coordinates;
          if (coords.length < 2) continue;
          if (booleanPointInPolygon(representativePoint(coords), fiefUnion)) {
            continue;
          }
          lines.push(lineString(coords, properties));
        }
      }
    }
  }
  // 切断点は浮動小数の交点計算で桁が伸びるため、base データと同じ精度へ丸める
  return truncate(featureCollection(lines), {
    precision: COORD_PRECISION,
    coordinates: 2,
  });
}

/** fief-dedupe.json の中身 */
export interface FiefDedupeFile {
  metadata: {
    generatedBy: string;
    /** 年 → 入力ファイルのパス（再生成の手掛かり） */
    inputs: Record<string, { base: string; fiefs: string }>;
    coveragePrecision: number;
    minRecordedCoverage: number;
  };
  /** 年（文字列キー）→ 勢力 NAME → 被覆率（0..1） */
  years: Record<string, Record<string, number>>;
}

/** base / fiefs / base_outline の各パスを返す（純粋関数） */
export function basePathFor(year: number): string {
  return `data/europe_${year}.geojson`;
}

export function fiefsPathFor(year: number): string {
  return `data/france_fiefs_${year}.geojson`;
}

export function outlinePathFor(year: number): string {
  return `data/base_outline_${year}.geojson`;
}

/** fief-dedupe.json のパス */
export const DEDUPE_PATH = "data/fief-dedupe.json";

async function readCollection(path: string): Promise<FeatureCollection> {
  return JSON.parse(await Deno.readTextFile(path)) as FeatureCollection;
}

async function main(): Promise<void> {
  const years: Record<string, Record<string, number>> = {};
  const inputs: Record<string, { base: string; fiefs: string }> = {};
  for (const year of FIEF_DEDUPE_YEARS) {
    const base = await readCollection(basePathFor(year));
    const fiefs = await readCollection(fiefsPathFor(year));
    const fiefUnion = fiefUnionOf(fiefs);
    if (fiefUnion === null) {
      throw new Error(
        `${fiefsPathFor(year)} にポリゴンが無く諸侯領 union を作れません`,
      );
    }
    const coverage = coverageByPowerName(base, fiefUnion);
    years[String(year)] = coverage;
    inputs[String(year)] = {
      base: basePathFor(year),
      fiefs: fiefsPathFor(year),
    };

    const outlines = outlinesOutsideFiefs(base, fiefUnion);
    const outlinePath = outlinePathFor(year);
    const json = JSON.stringify(outlines);
    await Deno.writeTextFile(outlinePath, json);
    console.log(
      `${outlinePath}: ${json.length} bytes, lines=${outlines.features.length}`,
    );
    const suppressed = Object.entries(coverage)
      .filter(([, ratio]) => ratio >= 0.9)
      .map(([name, ratio]) => `${name}(${ratio})`);
    console.log(
      `  ${year} 被覆率: ${
        Object.entries(coverage).map(([n, r]) => `${n}=${r}`).join(", ")
      }`,
    );
    console.log(
      `  ${year} 完全内包（>=0.9）: ${suppressed.join(", ") || "なし"}`,
    );
  }
  const file: FiefDedupeFile = {
    metadata: {
      generatedBy: "scripts/build-fief-dedupe.ts",
      inputs,
      coveragePrecision: COVERAGE_PRECISION,
      minRecordedCoverage: MIN_RECORDED_COVERAGE,
    },
    years,
  };
  await Deno.writeTextFile(DEDUPE_PATH, JSON.stringify(file, null, 2) + "\n");
  console.log(`${DEDUPE_PATH}: years=${Object.keys(years).join(", ")}`);
}

if (import.meta.main) {
  await main();
}
