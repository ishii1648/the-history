/**
 * データパイプラインスクリプト。
 * - historical-basemaps の world_<year>.geojson × 20 年代を取得（コミット固定）
 * - ヨーロッパ bbox でクリップし、空ジオメトリになった feature を除去
 * - NAME の表記ゆれ・null を name-overrides.json で補正
 * - simplify + 座標丸めで 1 ファイル SIZE_LIMIT_BYTES 以下に収める
 * - data/europe_<year>.geojson × 20 と data/index.json を生成する
 *
 * ロジックは純粋関数として export しテスト対象にする（scripts/build-data_test.ts）。
 */

import type {
  BBox,
  Feature,
  FeatureCollection,
  Geometry,
  MultiPolygon,
  Polygon,
} from "geojson";
import bboxClip from "@turf/bbox-clip";
import simplify from "@turf/simplify";
import truncate from "@turf/truncate";
import { SNAPSHOT_YEARS } from "../src/config.ts";

/** 取得元リポジトリ（出典・ライセンス表記の根拠） */
export const SOURCE_REPO = "aourednik/historical-basemaps";
/** 取得元のピン留めコミット。元データ更新で境界が勝手に変わらないよう固定する */
export const SOURCE_COMMIT = "62d8f1a03a71f2d3ff17f2d166f7553f256bce68";
/** 取得元のライセンス。派生データも同ライセンスで公開する義務がある */
export const SOURCE_LICENSE = "GPL-3.0";

/** ヨーロッパ域の bbox = [西経25°, 北緯34°, 東経60°, 北緯72°] */
export const EUROPE_BBOX: BBox = [-25, 34, 60, 72];

/**
 * 対象スナップショット年。src/config.ts の SNAPSHOT_YEARS を唯一の定義元とし、
 * 二重定義によるドリフトを避ける（docs/app-spec.md §2.1）。
 */
export const YEARS: number[] = [...SNAPSHOT_YEARS];

/**
 * simplify のトレランス候補（昇順）。サイズが limit 以下になる最小トレランス
 * （＝最も詳細を残す結果）を採用する。
 */
export const SIMPLIFY_TOLERANCES: number[] = [0.005, 0.01, 0.02, 0.05, 0.1];

/** 出力 1 ファイルあたりのサイズ上限（バイト）。300 KB を安全側に解釈する */
export const SIZE_LIMIT_BYTES = 300 * 1000;

/** 座標を丸める小数桁数 */
export const COORD_PRECISION = 5;

const DATA_DIR = "data";
const OVERRIDES_PATH = `${DATA_DIR}/name-overrides.json`;
const INDEX_PATH = `${DATA_DIR}/index.json`;

/** name-overrides.json の構造（表記ゆれ・別名のリネームマップ） */
export interface NameOverrides {
  renames: Record<string, string>;
}

/** index.json の source フィールド */
export interface SourceMeta {
  repo: string;
  commit: string;
  license: string;
}

/** index.json の内容 */
export interface IndexData {
  years: number[];
  source: SourceMeta;
}

/** ピン留めコミットの raw GeoJSON URL を生成する（純粋関数） */
export function buildSourceUrl(year: number): string {
  return `https://raw.githubusercontent.com/${SOURCE_REPO}/${SOURCE_COMMIT}/geojson/world_${year}.geojson`;
}

/**
 * ジオメトリから空パート（bbox 外のクリップ結果）を除去する（純粋関数）。
 * 残るパートが無ければ null を返す。Polygon / MultiPolygon 以外は null。
 */
function cleanGeometry(geometry: Geometry): Geometry | null {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates.filter((ring) => ring.length > 0);
    return rings.length > 0 ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates
      .map((polygon) => polygon.filter((ring) => ring.length > 0))
      .filter((polygon) => polygon.length > 0);
    return polygons.length > 0
      ? { type: "MultiPolygon", coordinates: polygons }
      : null;
  }
  return null;
}

/**
 * bbox でクリップし、空ジオメトリになった feature を除去する（純粋関数）。
 * 元データは全 feature が MultiPolygon。Polygon / MultiPolygon 以外はスキップする。
 */
export function clipToBbox(
  fc: FeatureCollection,
  bbox: BBox,
): FeatureCollection {
  const features: Feature[] = [];
  for (const feature of fc.features) {
    const geometry = feature.geometry;
    if (
      geometry === null ||
      (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    ) {
      continue;
    }
    const clipped = bboxClip(
      feature as Feature<Polygon | MultiPolygon>,
      bbox,
    );
    const cleaned = cleanGeometry(clipped.geometry);
    if (cleaned === null) continue;
    features.push({ ...feature, geometry: cleaned });
  }
  return { type: "FeatureCollection", features };
}

/** 値の中から最初の非空文字列を返す（純粋関数）。無ければ null */
function firstNonEmptyString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

/**
 * feature の properties から表示名を解決する（純粋関数）。
 * NAME を優先し、null なら ABBREVN → SUBJECTO → PARTOF の順にフォールバックする。
 * 解決後の名前に overrides.renames のリネームを適用する。全て空なら null。
 */
export function resolveName(
  props: Record<string, unknown>,
  overrides: NameOverrides,
): string | null {
  const base = firstNonEmptyString(
    props.NAME,
    props.ABBREVN,
    props.SUBJECTO,
    props.PARTOF,
  );
  if (base === null) return null;
  return overrides.renames[base] ?? base;
}

/**
 * 全 feature の NAME を resolveName で解決して書き換える（純粋関数）。
 * 他の properties は保持する。
 */
export function applyNameOverrides(
  fc: FeatureCollection,
  overrides: NameOverrides,
): FeatureCollection {
  const features = fc.features.map((feature) => {
    const props = feature.properties ?? {};
    const name = resolveName(props as Record<string, unknown>, overrides);
    return { ...feature, properties: { ...props, NAME: name } };
  });
  return { type: "FeatureCollection", features };
}

/** index.json の内容を生成する（純粋関数） */
export function buildIndex(years: number[], source: SourceMeta): IndexData {
  return {
    years: [...years],
    source: {
      repo: source.repo,
      commit: source.commit,
      license: source.license,
    },
  };
}

/** UTF-8 でシリアライズしたときのバイト数を返す */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * simplify と座標丸めで FeatureCollection を limitBytes 以下に収める（純粋関数）。
 * tolerances を昇順に試し、シリアライズ後サイズが limit 以下になる最小トレランスの
 * 結果を返す。どのトレランスでも超える場合はエラーを投げる。
 */
export function shrinkToLimit(
  fc: FeatureCollection,
  limitBytes: number,
  tolerances: number[] = SIMPLIFY_TOLERANCES,
  precision: number = COORD_PRECISION,
): { fc: FeatureCollection; tolerance: number; size: number } {
  for (const tolerance of tolerances) {
    const simplified = simplify(fc, {
      tolerance,
      highQuality: false,
      mutate: false,
    });
    const truncated = truncate(simplified, {
      precision,
      coordinates: 2,
      mutate: true,
    });
    const size = byteLength(JSON.stringify(truncated));
    if (size <= limitBytes) return { fc: truncated, tolerance, size };
  }
  throw new Error(
    `どのトレランス (${
      tolerances.join(", ")
    }) でも ${limitBytes} バイト以下にできませんでした`,
  );
}

/** ピン留め URL から FeatureCollection を取得する */
async function fetchFeatureCollection(
  year: number,
): Promise<FeatureCollection> {
  const url = buildSourceUrl(year);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (status ${res.status})`);
  }
  return await res.json() as FeatureCollection;
}

/** name-overrides.json を読み込む。存在しなければ空のマップを返す */
async function loadOverrides(path: string): Promise<NameOverrides> {
  try {
    const data = JSON.parse(await Deno.readTextFile(path));
    const renames = data && typeof data === "object" && data.renames &&
        typeof data.renames === "object"
      ? data.renames as Record<string, string>
      : {};
    return { renames };
  } catch {
    return { renames: {} };
  }
}

async function main(): Promise<void> {
  await Deno.mkdir(DATA_DIR, { recursive: true });
  const overrides = await loadOverrides(OVERRIDES_PATH);

  for (const year of YEARS) {
    const raw = await fetchFeatureCollection(year);
    const clipped = clipToBbox(raw, EUROPE_BBOX);
    const named = applyNameOverrides(clipped, overrides);
    const { fc, tolerance, size } = shrinkToLimit(named, SIZE_LIMIT_BYTES);
    const outPath = `${DATA_DIR}/europe_${year}.geojson`;
    await Deno.writeTextFile(outPath, JSON.stringify(fc));
    console.log(
      `${outPath}: ${size} bytes, tolerance=${tolerance}, features=${fc.features.length}`,
    );
  }

  const index = buildIndex(YEARS, {
    repo: SOURCE_REPO,
    commit: SOURCE_COMMIT,
    license: SOURCE_LICENSE,
  });
  await Deno.writeTextFile(INDEX_PATH, `${JSON.stringify(index, null, 2)}\n`);
  console.log(`${INDEX_PATH} を生成しました`);
}

if (import.meta.main) {
  await main();
}
