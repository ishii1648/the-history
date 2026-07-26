/**
 * 主要山脈データパイプラインスクリプト（TASK-97）。
 * - Natural Earth 50m geography_regions_polys を取得（河川と同じピン留めコミット）
 * - FEATURECLA = Range/mtn（山脈）だけを抽出する
 * - ヨーロッパ bbox（EUROPE_BBOX）でクリップし、山体の大半が域外に出る feature を落とす
 * - properties を name / scalerank / min_label の最小限に間引く
 * - simplify + 座標丸めで MOUNTAINS_SIZE_LIMIT_BYTES 以下に収める
 * - data/mountains.geojson を生成する
 *
 * 背景: 山岳は地形陰影（hillshade、TASK-34）でしか表現されておらず、どの起伏が
 * どの山脈なのかを地図から同定できない。本スクリプトの生成物からラベルの
 * アンカーを作り（src/mountains.ts）、常時表示の山脈名ラベルを重ねる。
 *
 * 年代非依存の 1 ファイルにするのは河川（build-rivers.ts）と同じ理由で、山脈は
 * 全年代で同一の地形だから（AC #4）。ポリゴンのまま出力するのは、ラベルの
 * アンカー（pole of inaccessibility）を持たせるだけでなく、後続タスク
 * （TASK-100 のホバー/クリック）が同じデータで領域判定できるようにするため。
 *
 * ロジックは純粋関数として export しテスト対象にする（scripts/build-mountains_test.ts）。
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
import area from "@turf/area";
import { EUROPE_BBOX, shrinkToLimit } from "./build-data.ts";

/** 取得元リポジトリ（出典・ライセンス表記の根拠）。河川と同一 */
export const MOUNTAINS_SOURCE_REPO = "nvkelso/natural-earth-vector";
/**
 * 取得元のピン留めコミット。河川（build-rivers.ts RIVERS_SOURCE_COMMIT）と
 * 同じコミットを指し、Natural Earth 由来のオーバーレイの世代を揃える。
 */
export const MOUNTAINS_SOURCE_COMMIT =
  "ca96624a56bd078437bca8184e78163e5039ad19";
/** 取得元のライセンス。Natural Earth はパブリックドメイン */
export const MOUNTAINS_SOURCE_LICENSE = "Public Domain (Natural Earth)";

/**
 * 収録対象の FEATURECLA。geography_regions_polys には Range/mtn のほかに
 * Plateau / Plain / Desert / Island / Pen/cape / Continent などが混在する。
 *
 * Plateau を含めないのは「山脈」ではないから: EUROPE_BBOX 内の Plateau は
 * イベリア半島（PENÍNSULA IBÉRICA）・中央ロシア高地・ウスチュルト台地の 3 件で、
 * とくにイベリア半島は半島全体を覆う巨大ポリゴンなので、山脈ラベルとして出すと
 * 地形の注記ではなく地域名の注記になってしまう。
 */
export const MOUNTAIN_FEATURECLA = "Range/mtn";

/**
 * EUROPE_BBOX クリップ後に残っていなければならない面積の比率。
 *
 * 山脈ラベルのアンカーはクリップ後のポリゴンから作るため、山体の大半が域外に
 * 出る山脈では「地図に映っている断片の中心」にラベルが立ち、山脈の代表位置と
 * しては誤りになる。実測値（面積は @turf/area、クリップ後 / 元）は
 * ZAGROS MOUNTAINS 14% / KUH RUD MOUNTAINS 10% / ATLAS SAHARIEN 46% /
 * ATLAS MOUNTAINS 49% / URAL MOUNTAINS 84% で、それ以外は 100%。
 *
 * 0.4 はザグロス・クーフラッド（ペルシア内陸の山脈で、地図の南東端に
 * 細い断片としてしか映らない）を落としつつ、アトラス山脈（マグリブ。都市
 * マーカーのアルジェ・チュニスと同じく地図に本体が映り、陰影も見える）を
 * 残す境界として採る。
 */
export const MIN_CLIP_AREA_RATIO = 0.4;

/** 出力ファイルのサイズ上限（バイト）。河川（150 KB）と同じ扱いで安全側に取る */
export const MOUNTAINS_SIZE_LIMIT_BYTES = 150 * 1000;

/** 出力先パス */
export const MOUNTAINS_OUTPUT_PATH = "data/mountains.geojson";

/**
 * 収録する山脈の NAME 一覧（生成物 data/mountains.geojson に載る name）。
 *
 * filterMountainRanges → clipMountainsToBbox の結果として決まる集合を、
 * 「実データを読めないテスト」（.geojson は静的 import できず、CI の
 * `deno test` は --allow-read=data のみ）から参照できるよう定数化したもの。
 * main() は生成時に実データ由来の集合とこの定数を突き合わせ、食い違えば
 * fail する（ソースコミットや閾値を変えたら必ず気付ける）。
 *
 * 除外されたもの: ZAGROS MOUNTAINS / KUH RUD MOUNTAINS（MIN_CLIP_AREA_RATIO
 * 未満）、Plateau 3 件（MOUNTAIN_FEATURECLA）。
 */
export const ADOPTED_MOUNTAIN_NAMES: readonly string[] = [
  "ALPS",
  "APPENNINI",
  "ATLAS MOUNTAINS",
  "ATLAS SAHARIEN",
  "Balkan Mts.",
  "CARPATHIAN MOUNTAINS",
  "CAUCASUS MTS.",
  "Cord. Cantábrica",
  "Dinaric Alps",
  "ELBURZ MTS.",
  "KJØLEN MOUNTAINS",
  "Lesser Caucasus",
  "PONTIC MOUNTAINS",
  "PYRENEES",
  "S. Nevada",
  "Sierra Morena",
  "URAL MOUNTAINS",
];

/** ピン留めコミットの raw GeoJSON URL を生成する（純粋関数） */
export function buildMountainsSourceUrl(): string {
  return `https://raw.githubusercontent.com/${MOUNTAINS_SOURCE_REPO}/${MOUNTAINS_SOURCE_COMMIT}/geojson/ne_50m_geography_regions_polys.geojson`;
}

/** FEATURECLA が山脈（Range/mtn）の feature だけ残す（純粋関数） */
export function filterMountainRanges(fc: FeatureCollection): FeatureCollection {
  const features = fc.features.filter(
    (feature) => feature.properties?.FEATURECLA === MOUNTAIN_FEATURECLA,
  );
  return { type: "FeatureCollection", features };
}

/** ポリゴンジオメトリから空パート（bbox 外のクリップ結果）を除去する */
function cleanPolygonGeometry(geometry: Geometry): Geometry | null {
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates.filter((ring) => ring.length >= 4);
    return rings.length > 0 ? { type: "Polygon", coordinates: rings } : null;
  }
  if (geometry.type === "MultiPolygon") {
    const polygons = geometry.coordinates
      .map((rings) => rings.filter((ring) => ring.length >= 4))
      .filter((rings) => rings.length > 0);
    return polygons.length > 0
      ? { type: "MultiPolygon", coordinates: polygons }
      : null;
  }
  return null;
}

/**
 * bbox でクリップし、(1) 空ジオメトリになった feature と (2) クリップ後の面積が
 * 元の minAreaRatio 未満になった feature を除去する（純粋関数）。
 *
 * (2) が必要な理由は MIN_CLIP_AREA_RATIO のコメントを参照。面積は @turf/area
 * （測地面積 m²）で測るので、緯度による経緯度面積の歪みの影響を受けない。
 */
export function clipMountainsToBbox(
  fc: FeatureCollection,
  bbox: BBox,
  minAreaRatio: number = MIN_CLIP_AREA_RATIO,
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
    const source = feature as Feature<Polygon | MultiPolygon>;
    const clipped = bboxClip(source, bbox);
    const cleaned = cleanPolygonGeometry(clipped.geometry);
    if (cleaned === null) continue;
    const sourceArea = area(source);
    if (sourceArea <= 0) continue;
    const clippedArea = area({ ...feature, geometry: cleaned } as Feature);
    if (clippedArea / sourceArea < minAreaRatio) continue;
    features.push({ ...feature, geometry: cleaned });
  }
  return { type: "FeatureCollection", features };
}

/** properties から文字列プロパティを取り出す。非文字列・空文字は null */
function stringProp(props: Record<string, unknown> | null, key: string) {
  const v = props?.[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/** properties から数値プロパティを取り出す。非数値は null */
function numberProp(props: Record<string, unknown> | null, key: string) {
  const v = props?.[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * properties を name / scalerank / min_label の最小限に間引く（純粋関数）。
 * - name: NE の NAME（英語）。日本語表記は河川と同じく data/name-ja.json で
 *   引く（表記の定義元を 1 か所に保ち、NE 側の NAME_JA の誤り —
 *   ELBURZ MTS. → 「エルブルス山」— もリポジトリ側で正せるようにする）
 * - scalerank: ラベルの衝突優先度（src/mountains.ts mountainLabelPriority）
 * - min_label: ラベルを出し始めるズーム段（同 mountainLabelMinZoom）
 */
export function pruneMountainProperties(
  fc: FeatureCollection,
): FeatureCollection {
  const features = fc.features.map((feature) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    return {
      ...feature,
      properties: {
        name: stringProp(props, "NAME"),
        scalerank: numberProp(props, "SCALERANK"),
        min_label: numberProp(props, "MIN_LABEL"),
      },
    };
  });
  return { type: "FeatureCollection", features };
}

/** 生成物に載る山脈名をソートして返す（純粋関数。収録一覧の突合に使う） */
export function extractMountainNames(fc: FeatureCollection): string[] {
  const names = new Set<string>();
  for (const feature of fc.features) {
    const name = feature.properties?.name ?? feature.properties?.NAME;
    if (typeof name === "string") names.add(name);
  }
  return [...names].sort();
}

/** ピン留め URL から FeatureCollection を取得する */
async function fetchFeatureCollection(): Promise<FeatureCollection> {
  const url = buildMountainsSourceUrl();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (status ${res.status})`);
  }
  return await res.json() as FeatureCollection;
}

async function main(): Promise<void> {
  const raw = await fetchFeatureCollection();
  const ranges = filterMountainRanges(raw);
  const clipped = clipMountainsToBbox(ranges, EUROPE_BBOX);
  const names = extractMountainNames(clipped);
  const expected = [...ADOPTED_MOUNTAIN_NAMES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `収録される山脈が ADOPTED_MOUNTAIN_NAMES と一致しません。\n` +
        `実データ: ${JSON.stringify(names)}\n` +
        `定数: ${JSON.stringify(expected)}\n` +
        `（定数を更新し、data/name-ja.json に日本語表記を追加してください）`,
    );
  }
  const pruned = pruneMountainProperties(clipped);
  const { fc, tolerance, size } = shrinkToLimit(
    pruned,
    MOUNTAINS_SIZE_LIMIT_BYTES,
  );
  await Deno.writeTextFile(MOUNTAINS_OUTPUT_PATH, JSON.stringify(fc));
  console.log(
    `${MOUNTAINS_OUTPUT_PATH}: ${size} bytes, tolerance=${tolerance}, features=${fc.features.length}`,
  );
}

if (import.meta.main) {
  await main();
}
