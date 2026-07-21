/**
 * 主要河川データパイプラインスクリプト（TASK-21）。
 * - Natural Earth 50m rivers_lake_centerlines を取得（コミット固定）
 * - ヨーロッパ bbox（EUROPE_BBOX）でクリップし、空ジオメトリになった feature を除去
 * - scalerank 閾値で主要河川（ライン・ドナウ・エルベ・セーヌ・ヴォルガ等）に絞る
 * - properties を name / scalerank の最小限に間引く
 * - simplify + 座標丸めで RIVERS_SIZE_LIMIT_BYTES 以下に収める
 * - data/rivers.geojson を生成する
 *
 * 背景: ベースマップ（Protomaps PMTiles, maxzoom 8）には低ズームの河川ライン
 * が含まれず、アプリの z3〜z8 で河川が一切描画されない。本スクリプトの生成物
 * をフロントでオーバーレイして補完する。
 *
 * ロジックは純粋関数として export しテスト対象にする（scripts/build-rivers_test.ts）。
 */

import type {
  BBox,
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  MultiLineString,
} from "geojson";
import bboxClip from "@turf/bbox-clip";
import { EUROPE_BBOX, shrinkToLimit } from "./build-data.ts";

/** 取得元リポジトリ（出典・ライセンス表記の根拠） */
export const RIVERS_SOURCE_REPO = "nvkelso/natural-earth-vector";
/** 取得元のピン留めコミット。元データ更新で河川形状が勝手に変わらないよう固定する */
export const RIVERS_SOURCE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19";
/** 取得元のライセンス。Natural Earth はパブリックドメイン */
export const RIVERS_SOURCE_LICENSE = "Public Domain (Natural Earth)";

/**
 * 主要河川とみなす scalerank の上限（値が小さいほど主要）。
 * 50m データでは Danube=2, Volga=3, Rhine=4, Seine=4, Elbe=5 のため、
 * 5 まで含めることで欧州史の主要河川を網羅する（6 は細かすぎるため除外）。
 */
export const MAX_SCALERANK = 5;

/** 出力ファイルのサイズ上限（バイト）。150 KB を安全側に解釈する */
export const RIVERS_SIZE_LIMIT_BYTES = 150 * 1000;

/** 出力先パス */
export const RIVERS_OUTPUT_PATH = "data/rivers.geojson";

/** ピン留めコミットの raw GeoJSON URL を生成する（純粋関数） */
export function buildRiversSourceUrl(): string {
  return `https://raw.githubusercontent.com/${RIVERS_SOURCE_REPO}/${RIVERS_SOURCE_COMMIT}/geojson/ne_50m_rivers_lake_centerlines.geojson`;
}

/**
 * scalerank が maxScalerank 以下の feature のみ残す（純粋関数）。
 * scalerank が数値でない feature は主要度を判定できないため除去する。
 * name プロパティは後段のテスト（主要河川の含有確認）のため保持する。
 */
export function filterMajorRivers(
  fc: FeatureCollection,
  maxScalerank: number = MAX_SCALERANK,
): FeatureCollection {
  const features = fc.features.filter((feature) => {
    const scalerank = feature.properties?.scalerank;
    return typeof scalerank === "number" && scalerank <= maxScalerank;
  });
  return { type: "FeatureCollection", features };
}

/**
 * ラインジオメトリから空パート（bbox 外のクリップ結果）を除去する（純粋関数）。
 * 点数 2 未満のラインは描画できないため落とす。残るパートが無ければ null。
 */
function cleanLineGeometry(geometry: Geometry): Geometry | null {
  if (geometry.type === "LineString") {
    return geometry.coordinates.length >= 2 ? geometry : null;
  }
  if (geometry.type === "MultiLineString") {
    const lines = geometry.coordinates.filter((line) => line.length >= 2);
    return lines.length > 0
      ? { type: "MultiLineString", coordinates: lines }
      : null;
  }
  return null;
}

/**
 * bbox でクリップし、空ジオメトリになった feature を除去する（純粋関数）。
 * 元データは全 feature が MultiLineString。LineString / MultiLineString 以外は
 * スキップする（@turf/bbox-clip はラインもサポートする）。
 */
export function clipRiversToBbox(
  fc: FeatureCollection,
  bbox: BBox,
): FeatureCollection {
  const features: Feature[] = [];
  for (const feature of fc.features) {
    const geometry = feature.geometry;
    if (
      geometry === null ||
      (geometry.type !== "LineString" && geometry.type !== "MultiLineString")
    ) {
      continue;
    }
    const clipped = bboxClip(
      feature as Feature<LineString | MultiLineString>,
      bbox,
    );
    const cleaned = cleanLineGeometry(clipped.geometry);
    if (cleaned === null) continue;
    features.push({ ...feature, geometry: cleaned });
  }
  return { type: "FeatureCollection", features };
}

/**
 * properties を name / scalerank の最小限に間引く（純粋関数）。
 * name はオーバーレイ側のラベル表示と主要河川の含有テストに使う。
 * scalerank はズームに応じた表示制御に使えるよう残す。name 欠損は null に正規化。
 */
export function pruneRiverProperties(fc: FeatureCollection): FeatureCollection {
  const features = fc.features.map((feature) => {
    const props = feature.properties ?? {};
    const name = typeof props.name === "string" ? props.name : null;
    return { ...feature, properties: { name, scalerank: props.scalerank } };
  });
  return { type: "FeatureCollection", features };
}

/** ピン留め URL から FeatureCollection を取得する */
async function fetchFeatureCollection(): Promise<FeatureCollection> {
  const url = buildRiversSourceUrl();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (status ${res.status})`);
  }
  return await res.json() as FeatureCollection;
}

async function main(): Promise<void> {
  const raw = await fetchFeatureCollection();
  const major = filterMajorRivers(raw, MAX_SCALERANK);
  const clipped = clipRiversToBbox(major, EUROPE_BBOX);
  const pruned = pruneRiverProperties(clipped);
  const { fc, tolerance, size } = shrinkToLimit(
    pruned,
    RIVERS_SIZE_LIMIT_BYTES,
  );
  await Deno.writeTextFile(RIVERS_OUTPUT_PATH, JSON.stringify(fc));
  console.log(
    `${RIVERS_OUTPUT_PATH}: ${size} bytes, tolerance=${tolerance}, features=${fc.features.length}`,
  );
}

if (import.meta.main) {
  await main();
}
