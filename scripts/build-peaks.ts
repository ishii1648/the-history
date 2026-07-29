/**
 * 主要山峰データパイプラインスクリプト（TASK-99）。
 * - Natural Earth 10m geography_regions_elevation_points を取得
 *   （河川・山脈と同じピン留めコミット）
 * - ヨーロッパ bbox（EUROPE_BBOX）内の点だけに絞る
 * - featurecla = mountain（窪地・無名の標高点を除く）かつ主要度の閾値
 *   （MAX_PEAK_SCALERANK / MIN_PEAK_ELEVATION_M）を満たす山峰だけを残す
 * - properties を name / elevation / scalerank の最小限に間引く
 * - 座標を COORD_PRECISION 桁に丸め、PEAKS_SIZE_LIMIT_BYTES 以下に収める
 * - data/peaks.geojson を生成する
 *
 * 背景: 山脈名ラベル（TASK-97、data/mountains.geojson）だけでは「どの起伏が
 * どの山なのか」まで読めない。モンブラン・マッターホルンのような主要山峰を
 * 標高付きのマーカーとして重ね、山岳情報を具体的に読めるようにする。
 *
 * 年代非依存の 1 ファイルにするのは河川（build-rivers.ts）・山脈
 * （build-mountains.ts）と同じ理由で、山峰は全年代で同一の地形だから（AC #5）。
 * ポリゴンではなく Point のまま出力するのは、描画側（src/peaks.ts）が
 * マーカー（ScatterplotLayer）とラベル（TextLayer）のアンカーに使うため。
 *
 * 注意: 10m elevation points レイヤーの properties キーは**小文字**
 * （name / elevation / scalerank / featurecla）で、山脈が使う 50m
 * geography_regions_polys の大文字キー（NAME / SCALERANK / FEATURECLA）とは
 * 異なる。上流が将来キーの大小を揃えても壊れないよう、prop() は両方を見る。
 *
 * ロジックは純粋関数として export しテスト対象にする（scripts/build-peaks_test.ts）。
 */

import type { BBox, Feature, FeatureCollection, Point } from "geojson";
import { COORD_PRECISION, EUROPE_BBOX } from "./build-data.ts";

/** 取得元リポジトリ（出典・ライセンス表記の根拠）。河川・山脈と同一 */
export const PEAKS_SOURCE_REPO = "nvkelso/natural-earth-vector";
/**
 * 取得元のピン留めコミット。河川（RIVERS_SOURCE_COMMIT）・山脈
 * （MOUNTAINS_SOURCE_COMMIT）と同じコミットを指し、Natural Earth 由来の
 * オーバーレイの世代を揃える（一致は build-peaks_test.ts が固定する）。
 */
export const PEAKS_SOURCE_COMMIT = "ca96624a56bd078437bca8184e78163e5039ad19";
/** 取得元のライセンス。Natural Earth はパブリックドメイン */
export const PEAKS_SOURCE_LICENSE = "Public Domain (Natural Earth)";

/**
 * 収録対象の featurecla。elevation_points には mountain のほかに
 * spot elevation / depression / pass / plateau / cape が混在する。
 *
 * mountain 以外を採らないのは、EUROPE_BBOX 内の該当 6 件（spot elevation 5 件・
 * カスピ海沿岸低地の depression 1 件）が全て name 欠損で、マーカーに付ける
 * ラベルを持たないため（山峰マーカーとして意味を成さない）。
 */
export const PEAK_FEATURECLA = "mountain";

/**
 * 収録する scalerank の上限（値が小さいほど主要）。
 *
 * EUROPE_BBOX 内の名前付き mountain は 99 件で、scalerank は 2/3/6/7/9 の
 * 5 段しか使われていない（実測の内訳: 2=1, 3=1, 6=20, 7=25, 9=52 件）。
 * 6 までで 22 件・7 まで広げると 47 件になり、7 までではアルプス〜バルカンで
 * ラベルが密集して 15〜30 件の目安（TASK-99 の実装プラン）も超える。
 *
 * scalerank 6 の帯には標高が低くても地図の目印になる山（ベン・ネビス 1343 m・
 * ヴェスヴィオ 1281 m・スノードン 1085 m）が入る。NE の scalerank は標高では
 * なく「低ズームでも出す価値のある地物か」の格付けなので、歴史地図の目印
 * としてはこの帯を丸ごと採るのが素直（エトナ・ヴェスヴィオ・オリンポスは
 * 標高順では落ちるが、歴史的には外せない）。
 */
export const MAX_PEAK_SCALERANK = 6;

/**
 * scalerank が上限を超えていても収録する標高の下限（m）。
 *
 * NE の scalerank は標高と一致しない。実データではモンテ・ローザ（4634 m、
 * アルプス第 2 の高峰）・シュハラ（5200 m、コーカサス第 3）・アララト
 * （5137 m）が scalerank 9、サバラン（4814 m）が 7 に落ちており、
 * scalerank だけで絞ると「地図上いちばん高いはずの山が出ない」ことになる。
 *
 * scalerank 7 以下の山峰を標高降順に並べた実測は
 * 5200 シュハラ / 5137 アララト / 4814 サバラン / 4634 モンテ・ローザ /
 * 4494 テビュロスムタ / 4466 バザルデュジ / 4274 フィンシュターアールホルン
 * / 4090 アラガツ / 4038 ドムバイ・ウリゲン / 3931 カッカール …
 * で、4634 と 4494 の間の 140 m がこの帯で最も広い空き（他は 14〜63 m 刻み）。
 * 4600 はその空きの中に置いた境界で、上流の標高がわずかに更新されても収録
 * 集合が揺れない。
 *
 * 4600 で落ちるのはコーカサスの二次峰（テビュロスムタ・バザルデュジ）と
 * ベルナー・アルプスのフィンシュターアールホルンで、いずれも「その山脈の
 * 最高峰は既にマーカーになっている（エルブルス 5642 / モンブラン 4807）」
 * 山なので、落としても山域の情報は失われない。
 */
export const MIN_PEAK_ELEVATION_M = 4600;

/**
 * 出力ファイルのサイズ上限（バイト）。実測は 5,142 バイト（26 件）で、河川・山脈の
 * 150 KB より 1 桁以上小さい。20 KB は「収録条件の退行で件数が桁違いに増えた」
 * ことを検知するためのしきい値として置く。
 */
export const PEAKS_SIZE_LIMIT_BYTES = 20 * 1000;

/** 出力先パス */
export const PEAKS_OUTPUT_PATH = "data/peaks.geojson";

/**
 * 収録する山峰の name 一覧（生成物 data/peaks.geojson に載る name）。
 *
 * clipPeaksToBbox → selectMajorPeaks の結果として決まる集合を、「実データを
 * 読めないテスト」（.geojson は静的 import できず、CI の `deno test` は
 * --allow-read=data のみ）から参照できるよう定数化したもの。main() は生成時に
 * 実データ由来の集合とこの定数を突き合わせ、食い違えば fail する
 * （ソースコミットや閾値を変えたら必ず気付ける）。山脈の
 * ADOPTED_MOUNTAIN_NAMES と同じ扱い。
 *
 * 標高・scalerank 付きの一覧は docs/data-inventory/README.md §3.10 を参照。
 */
export const ADOPTED_PEAK_NAMES: readonly string[] = [
  "Ben Nevis",
  "Carrauntoohil",
  "Djebel Chelia",
  "Galdhpiggen",
  "Gora Elbrus",
  "Gora Konzhakovskiy Kamen",
  "Gora Shkhara",
  "Gora Yamantau",
  "Grossglockner",
  "Hvannadalshnkur",
  "Jebel Tidirhine",
  "Kebnekaise",
  "Lalla Khedidja",
  "Matterhorn",
  "Moldoveanu",
  "Mont Blanc",
  "Monte Etna",
  "Monte Rosa",
  "Mount Ararat",
  "Mount Damavand",
  "Mount Olympus",
  "Musala",
  "Oksskolten",
  "Sabalon Kuh",
  "Snowdon",
  "Vesuvio",
];

/** ピン留めコミットの raw GeoJSON URL を生成する（純粋関数） */
export function buildPeaksSourceUrl(): string {
  return `https://raw.githubusercontent.com/${PEAKS_SOURCE_REPO}/${PEAKS_SOURCE_COMMIT}/geojson/ne_10m_geography_regions_elevation_points.geojson`;
}

/**
 * properties から値を取り出す（純粋関数）。10m elevation points は小文字キー、
 * 50m polys は大文字キーなので、大文字 → 小文字の順に探す。
 */
function prop(props: Record<string, unknown> | null, key: string): unknown {
  return props?.[key.toUpperCase()] ?? props?.[key.toLowerCase()];
}

/** properties から文字列プロパティを取り出す。非文字列・空文字は null */
function stringProp(props: Record<string, unknown> | null, key: string) {
  const v = prop(props, key);
  return typeof v === "string" && v !== "" ? v : null;
}

/** properties から数値プロパティを取り出す。非数値は null */
function numberProp(props: Record<string, unknown> | null, key: string) {
  const v = prop(props, key);
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * bbox（[west, south, east, north]）内の Point だけを残す（純粋関数）。
 * 元データは全 feature が Point。Point 以外はスキップする
 * （山脈・河川と違い面や線を持たないので、クリップではなく内外判定で足りる）。
 */
export function clipPeaksToBbox(
  fc: FeatureCollection,
  bbox: BBox,
): FeatureCollection {
  const [west, south, east, north] = bbox;
  const features: Feature[] = [];
  for (const feature of fc.features) {
    if (feature.geometry?.type !== "Point") continue;
    const [lon, lat] = (feature.geometry as Point).coordinates;
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    if (lon < west || lon > east || lat < south || lat > north) continue;
    features.push(feature);
  }
  return { type: "FeatureCollection", features };
}

/**
 * 収録する山峰だけを残す（純粋関数）。
 * - featurecla が PEAK_FEATURECLA（mountain）であること
 * - name を持つこと（ラベルと日本語名の引き先が無い点は載せない）
 * - scalerank が maxScalerank 以下、または elevation が minElevation 以上
 *
 * 2 条件を OR にする理由は MAX_PEAK_SCALERANK / MIN_PEAK_ELEVATION_M の
 * コメントを参照（NE の scalerank と標高が一致しないため）。
 */
export function selectMajorPeaks(
  fc: FeatureCollection,
  maxScalerank: number = MAX_PEAK_SCALERANK,
  minElevation: number = MIN_PEAK_ELEVATION_M,
): FeatureCollection {
  const features = fc.features.filter((feature) => {
    const props = feature.properties as Record<string, unknown> | null;
    if (stringProp(props, "FEATURECLA") !== PEAK_FEATURECLA) return false;
    if (stringProp(props, "NAME") === null) return false;
    const scalerank = numberProp(props, "SCALERANK");
    const elevation = numberProp(props, "ELEVATION");
    if (scalerank !== null && scalerank <= maxScalerank) return true;
    return elevation !== null && elevation >= minElevation;
  });
  return { type: "FeatureCollection", features };
}

/**
 * properties を name / elevation / scalerank の最小限に間引く（純粋関数）。
 * - name: NE の name（英語）。日本語表記は河川・山脈と同じく data/name-ja.json
 *   で引く（表記の定義元を 1 か所に保つ）
 * - elevation: 標高（m）。ラベルに併記する（AC #1）
 * - scalerank: ズーム出し分けとラベルの衝突優先度の入力（src/peaks.ts）
 *
 * 3 キーは TASK-99 実装プランのデータ契約（生成側と描画側の唯一の取り決め）。
 */
export function prunePeakProperties(fc: FeatureCollection): FeatureCollection {
  const features = fc.features.map((feature) => {
    const props = (feature.properties ?? {}) as Record<string, unknown>;
    return {
      ...feature,
      properties: {
        name: stringProp(props, "NAME"),
        elevation: numberProp(props, "ELEVATION"),
        scalerank: numberProp(props, "SCALERANK"),
      },
    };
  });
  return { type: "FeatureCollection", features };
}

/**
 * 座標を precision 桁に丸める（純粋関数）。
 * 山脈・河川は simplify + truncate（shrinkToLimit）で丸めるが、Point は
 * simplify の対象外なので丸めだけを行う。桁は base データ（build-data.ts の
 * COORD_PRECISION = 3 桁 ≒ 100 m）に揃える。
 */
export function roundPeakCoordinates(
  fc: FeatureCollection,
  precision: number = COORD_PRECISION,
): FeatureCollection {
  const factor = 10 ** precision;
  const round = (v: number) => Math.round(v * factor) / factor;
  const features = fc.features.map((feature) => {
    if (feature.geometry?.type !== "Point") return feature;
    const [lon, lat] = (feature.geometry as Point).coordinates;
    return {
      ...feature,
      geometry: {
        type: "Point" as const,
        coordinates: [round(lon), round(lat)],
      },
    };
  });
  return { type: "FeatureCollection", features };
}

/** 生成物に載る山峰名をソートして返す（純粋関数。収録一覧の突合に使う） */
export function extractPeakNames(fc: FeatureCollection): string[] {
  const names = new Set<string>();
  for (const feature of fc.features) {
    const name = stringProp(
      feature.properties as Record<string, unknown> | null,
      "NAME",
    );
    if (name !== null) names.add(name);
  }
  return [...names].sort();
}

/** ピン留め URL から FeatureCollection を取得する */
async function fetchFeatureCollection(): Promise<FeatureCollection> {
  const url = buildPeaksSourceUrl();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (status ${res.status})`);
  }
  return await res.json() as FeatureCollection;
}

async function main(): Promise<void> {
  const raw = await fetchFeatureCollection();
  const inEurope = clipPeaksToBbox(raw, EUROPE_BBOX);
  const selected = selectMajorPeaks(inEurope);
  const names = extractPeakNames(selected);
  const expected = [...ADOPTED_PEAK_NAMES].sort();
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(
      `収録される山峰が ADOPTED_PEAK_NAMES と一致しません。\n` +
        `実データ: ${JSON.stringify(names)}\n` +
        `定数: ${JSON.stringify(expected)}\n` +
        `（定数を更新し、data/name-ja.json に日本語表記を追加してください）`,
    );
  }
  const fc = roundPeakCoordinates(prunePeakProperties(selected));
  const json = JSON.stringify(fc);
  const size = new TextEncoder().encode(json).length;
  if (size > PEAKS_SIZE_LIMIT_BYTES) {
    throw new Error(
      `${PEAKS_OUTPUT_PATH} が ${size} バイトで上限 ${PEAKS_SIZE_LIMIT_BYTES} を超えました`,
    );
  }
  await Deno.writeTextFile(PEAKS_OUTPUT_PATH, json);
  console.log(
    `${PEAKS_OUTPUT_PATH}: ${size} bytes, features=${fc.features.length}`,
  );
}

if (import.meta.main) {
  await main();
}
