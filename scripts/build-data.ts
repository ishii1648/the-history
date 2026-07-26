/**
 * データパイプラインスクリプト。
 * - historical-basemaps の world_<year>.geojson × 20 年代を取得（コミット固定）
 * - ヨーロッパ bbox でクリップし、空ジオメトリになった feature を除去
 * - NAME の表記ゆれ・null を name-overrides.json で補正
 * - 上流が王国領に一括で含めている半独立の封土を、諸侯領オーバーレイの区画で
 *   切り出して独立 feature にする（BASE_FIEF_SPLITS、TASK-101）
 * - simplify + 座標丸め + ポリゴンのクリーンアップ（自己交差の解消・微小破片の除去、
 *   scripts/clean-polygons.ts）で 1 ファイル SIZE_LIMIT_BYTES 以下に収める
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
import difference from "@turf/difference";
import { featureCollection } from "@turf/helpers";
import intersect from "@turf/intersect";
import simplify from "@turf/simplify";
import truncate from "@turf/truncate";
import union from "@turf/union";
import {
  cleanFeatureCollection,
  type CleanStats,
  formatCleanStats,
} from "./clean-polygons.ts";
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

/**
 * base の勢力ポリゴンから切り出して独立 feature にする封土の指定（TASK-101）。
 *
 * 上流（historical-basemaps）は「王が名目上の宗主である領域」をまとめて 1 つの
 * 王国ポリゴンにしており、実効支配が及んでいない半独立の封土も王国領として
 * 塗られてしまう。切り出す区画は諸侯領オーバーレイ（OHM 由来）の同名 feature を
 * 使うため、出典を持たない座標を合成することにはならない（decision-18）。
 *
 * ライセンス: 切り出しは base（GPL-3.0）に OHM 由来の形を取り込む操作なので、
 * 入力に使えるのは CC0 のオーバーレイ（france_fiefs / hre_fiefs / italy_fiefs）に
 * 限る。ETH Zürich（Roller）の HRE 領邦データ（CC BY-NC-SA 4.0、hre_<year>）は
 * GPL-3.0 派生と統合してはならないため、ここには渡さない（decision-2）。
 */
export interface BaseFiefSplit {
  /** 対象年 */
  year: number;
  /** 切り出し元の base 勢力 NAME */
  fromName: string;
  /** 切り出す封土の NAME。オーバーレイ側の NAME と一致させる */
  fiefName: string;
  /**
   * 切り出した feature に与える SUBJECTO。NAME と同じ値（自己参照）なら
   * 独立勢力の扱いになり、色キー（powers.ts colorKeyFor）はオーバーレイと同じ
   * NAME 単独キー、表示ラベル（info.ts displayLabel）は NAME のみ、勢力圏の
   * 外枠（suzerain_extent.ts）は自分だけを囲う。
   */
  subjecto: string;
  /** 切り出しに使うオーバーレイ GeoJSON のパス */
  fiefPath: string;
}

/**
 * 適用する切り出しの一覧（TASK-101）。
 *
 * ## ノルマンディー公国（1000 / 1100）
 * 上流の `Kingdom of France` はノルマンディーを含むが、911 年のサン・クレール・
 * シュール・エプト条約以降のノルマンディーはカペー朝の実効支配が及ばない事実上
 * 独立した公国で、フランス王国領として一括表示するのは不正確（カペー朝の実効
 * 支配はイル・ド・フランス周辺に限られる）。
 *
 * SUBJECTO を NAME 自身（＝独立勢力）にする理由:
 * - 1000 年・1100 年とも公はフランス王へ臣従礼を行う立場ではあるが、それは名目に
 *   留まり、王が公領へ実効的な権限を及ぼした事実は無い。decision-19 は宗主補正を
 *   「歴史的に宗主関係が明白でデータが欠いているもの」に限る方針で、名目のみの
 *   この関係は該当しない（明白な例＝ブルターニュ公とは性質が異なる）。
 * - `SUBJECTO = "France"` にすると勢力圏の外枠（TASK-94）は宗主キーの union なので
 *   フランス王国を選んだときの外枠がノルマンディーを囲んだままになり、本タスクが
 *   直そうとしている「フランス王国領として囲われて見える」症状が残る。
 * - 1100 年はノルマンディー公ロベール 2 世とイングランド王ヘンリー 1 世が別人の
 *   英諾分離期（1087〜1106）なので、England 配下に付け替えるのも不正確。
 * - 独立扱いにすると色キーがオーバーレイと同じ `Duchy of Normandy` になり、base の
 *   塗りと諸侯領オーバーレイの色が一致する（colors.json に新キーも増えない）。
 */
export const BASE_FIEF_SPLITS: readonly BaseFiefSplit[] = [1000, 1100].map(
  (year) => ({
    year,
    fromName: "Kingdom of France",
    fiefName: "Duchy of Normandy",
    subjecto: "Duchy of Normandy",
    fiefPath: `data/france_fiefs_flat_${year}.geojson`,
  }),
);

/** ポリゴン系ジオメトリを持つ feature か */
function isPolygonal(
  feature: Feature,
): feature is Feature<Polygon | MultiPolygon> {
  const type = feature.geometry?.type;
  return type === "Polygon" || type === "MultiPolygon";
}

/**
 * FeatureCollection から NAME が一致するポリゴンを 1 つに統合する（純粋関数）。
 * 該当が無ければ null。
 */
export function unionByName(
  fc: FeatureCollection,
  name: string,
): Feature<Polygon | MultiPolygon> | null {
  let merged: Feature<Polygon | MultiPolygon> | null = null;
  for (const feature of fc.features) {
    if (feature.properties?.NAME !== name || !isPolygonal(feature)) continue;
    merged = merged === null
      ? feature
      : union(featureCollection([merged, feature])) ?? merged;
  }
  return merged;
}

/**
 * base の勢力 feature から封土の区画を差し引き、独立した封土 feature を
 * 同じ FeatureCollection に立てる（純粋関数、TASK-101）。
 *
 * 封土のジオメトリは「オーバーレイの区画 ∩ 切り出し元の勢力」にする。オーバーレイ
 * （OHM）と base（historical-basemaps）は解像度も海岸線も異なるため、オーバーレイを
 * そのまま置くと base の外へはみ出して海や隣国に重なる。交差を取れば base の
 * 面の内訳が入れ替わるだけになり、他勢力の領域には一切触れない。
 *
 * 差し引きで面が残らなかった元 feature は落とす（飛び地が丸ごと封土だった場合）。
 * 切り出し元が見つからない・交差が空の場合は警告して base をそのまま返す
 * （生成を失敗させない）。
 */
export function splitFiefFromBase(
  base: FeatureCollection,
  fief: Feature<Polygon | MultiPolygon>,
  split: BaseFiefSplit,
  warnFn: (message: string) => void = console.warn,
): FeatureCollection {
  const sourceIndexes = base.features
    .map((feature, index) =>
      feature.properties?.NAME === split.fromName && isPolygonal(feature)
        ? index
        : -1
    )
    .filter((index) => index >= 0);
  if (sourceIndexes.length === 0) {
    warnFn(
      `${split.year}: ${split.fromName} が base に無いため ${split.fiefName} を切り出せません`,
    );
    return base;
  }

  let carved: Feature<Polygon | MultiPolygon> | null = null;
  const remainders = new Map<number, Feature | null>();
  for (const index of sourceIndexes) {
    const source = base.features[index] as Feature<Polygon | MultiPolygon>;
    const overlap = intersect(featureCollection([source, fief]));
    if (overlap !== null) {
      carved = carved === null
        ? overlap
        : union(featureCollection([carved, overlap])) ?? carved;
    }
    const rest = difference(featureCollection([source, fief]));
    remainders.set(
      index,
      rest === null ? null : { ...source, geometry: rest.geometry },
    );
  }
  if (carved === null) {
    warnFn(
      `${split.year}: ${split.fiefName} が ${split.fromName} と交差しないため切り出しません`,
    );
    return base;
  }

  const fiefFeature: Feature = {
    type: "Feature",
    properties: { NAME: split.fiefName, SUBJECTO: split.subjecto },
    geometry: carved.geometry,
  };
  const lastSourceIndex = sourceIndexes[sourceIndexes.length - 1];
  const features: Feature[] = [];
  for (const [index, feature] of base.features.entries()) {
    if (remainders.has(index)) {
      const rest = remainders.get(index)!;
      if (rest !== null) features.push(rest);
    } else {
      features.push(feature);
    }
    // 封土は切り出し元の直後に置き、feature の並び（＝描画順）を決定的にする
    if (index === lastSourceIndex) features.push(fiefFeature);
  }
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
 * simplify・座標丸め・ポリゴンのクリーンアップで FeatureCollection を
 * limitBytes 以下に収める（純粋関数）。
 * tolerances を昇順に試し、シリアライズ後サイズが limit 以下になる最小トレランスの
 * 結果を返す。どのトレランスでも超える場合はエラーを投げる。
 *
 * クリーンアップ（自己交差の解消と微小破片・微小な穴の除去、TASK-81）は
 * simplify の後段に置く。simplify 自体が自己交差を生む（凹んだ海岸線を粗くすると
 * 辺が交差する）ため、前段に置いても意味が無い。サイズ判定はクリーンアップ後の
 * 出力に対して行うので、生成物は必ず limit 以下になる。
 * 詳細は scripts/clean-polygons.ts を参照。
 */
export function shrinkToLimit(
  fc: FeatureCollection,
  limitBytes: number,
  tolerances: number[] = SIMPLIFY_TOLERANCES,
  precision: number = COORD_PRECISION,
): {
  fc: FeatureCollection;
  tolerance: number;
  size: number;
  cleanStats: CleanStats;
} {
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
    const { fc: cleaned, stats: cleanStats } = cleanFeatureCollection(
      truncated,
      precision,
    );
    const size = byteLength(JSON.stringify(cleaned));
    if (size <= limitBytes) {
      return { fc: cleaned, tolerance, size, cleanStats };
    }
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

/**
 * 切り出しに使うオーバーレイの区画を読み込む（TASK-101）。
 * 入力は生成済みかつリポジトリにコミット済みの派生データなので、欠けていれば
 * 黙って素通りさせず失敗させる（素通りすると再生成のたびに修正が消えるため）。
 */
async function loadFiefPolygon(
  split: BaseFiefSplit,
): Promise<Feature<Polygon | MultiPolygon>> {
  const fc = JSON.parse(
    await Deno.readTextFile(split.fiefPath),
  ) as FeatureCollection;
  const merged = unionByName(fc, split.fiefName);
  if (merged === null) {
    throw new Error(
      `${split.fiefPath} に ${split.fiefName} のポリゴンが無く、base から切り出せません`,
    );
  }
  return merged;
}

/** その年に適用する切り出しを全て適用する（TASK-101） */
async function applyBaseFiefSplits(
  fc: FeatureCollection,
  year: number,
): Promise<FeatureCollection> {
  let result = fc;
  for (const split of BASE_FIEF_SPLITS.filter((s) => s.year === year)) {
    const fief = await loadFiefPolygon(split);
    result = splitFiefFromBase(result, fief, split);
    console.log(
      `${year}: ${split.fromName} から ${split.fiefName} を独立 feature として切り出しました`,
    );
  }
  return result;
}

async function main(): Promise<void> {
  await Deno.mkdir(DATA_DIR, { recursive: true });
  const overrides = await loadOverrides(OVERRIDES_PATH);

  for (const year of YEARS) {
    const raw = await fetchFeatureCollection(year);
    const clipped = clipToBbox(raw, EUROPE_BBOX);
    const named = applyNameOverrides(clipped, overrides);
    // 切り出しは simplify の前に行い、王国側の残余と封土が同じ座標列から
    // 同じトレランスで簡略化されるようにする
    const split = await applyBaseFiefSplits(named, year);
    const { fc, tolerance, size, cleanStats } = shrinkToLimit(
      split,
      SIZE_LIMIT_BYTES,
    );
    const outPath = `${DATA_DIR}/europe_${year}.geojson`;
    await Deno.writeTextFile(outPath, JSON.stringify(fc));
    console.log(
      `${outPath}: ${size} bytes, tolerance=${tolerance}, features=${fc.features.length}`,
    );
    const cleanLog = formatCleanStats(cleanStats);
    if (cleanLog !== null) console.log(cleanLog);
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
