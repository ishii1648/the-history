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
 * TASK-75: エルベ川が河口（北海）まで描かれず、ハンブルク西のヴェーデル付近
 * （東経 9.784034 / 北緯 53.554638 = 50m データの Elbe feature の西端）で
 * 途切れる。これはパイプライン側（EUROPE_BBOX クリップ・MAX_SCALERANK・名寄せ・
 * simplify）ではなく元データの制約で、Natural Earth は下流の幅の広い河口部を
 * 河川ではなく海としてモデル化している（同コミットの ne_10m_coastline は両岸を
 * 東経約 9.83 度まで遡って囲む）。
 *
 * 補完ソースを 3 つ実測して却下済み（数値と再現手順は
 * docs/data-inventory/README.md §10）:
 * - ne_10m_rivers_lake_centerlines: Elbe の西端は東経 9.819021 で 50m より手前
 * - ne_10m_rivers_europe: 河口部に feature が存在しない（Elbe は上流のみ）
 * よって 10m 版からの区間マージでは解決しないため、ユーザ向けの既知の制約
 * （data/known-limitations.json の rivers-elbe-estuary-missing）として明示する
 * 方針を採る。ソースコミットを更新する際はこの前提を再確認する。
 */

/**
 * 主要河川とみなす scalerank の上限（値が小さいほど主要）。
 * 50m データでは Danube=2, Volga=3, Rhine=4, Seine=4, Elbe=5 に加え、
 * rank 6 に欧州史の主要河川（Po・Rhône・Garonne・Don・Thames・Dniester・
 * Drava・Duero・Tisza 等）が収録されているため 6 まで含める（TASK-152。
 * 5 では上記がすべて欠落していた）。7 以下は 50m 版に存在しない
 * （Severn / Trent / Shannon 等は 10m 版に scalerank=8 でのみ存在）。
 */
export const MAX_SCALERANK = 6;

/**
 * 除外する人工水路のソース名（TASK-152）。NE 50m は featurecla=River のまま
 * 人工運河を収録しているが、本オーバーレイの趣旨は「欧州史の自然河川」の補完
 * であり、近代築造の運河は大半の年代で存在しない anachronism になるため名前で
 * 除外する。
 * - Ferenc Csatorna（フランツ運河 / 現バチカ大運河）: 1793〜1802 年築造の
 *   ドナウ〜ティサ間の人工運河。自然河川ではない。
 * 一方 Soroksari Duna（ソロクシャーリ・ドナウ）はドナウがチェペル島で分かれた
 * 自然分流であり、既存のデルタ分流（Waal・Nederrijn・Bratul 各分流・Borcea）と
 * 同じ扱いで採用する。
 * ソースコミット更新時の注意: この名前がソースから消えても検出はスナップ
 * ショット再生成（--print-source-names）時の目視に頼る（除外後の名前一覧には
 * 現れないため、死んだエイリアス検査のような自動検出はできない）。
 */
export const EXCLUDED_WATERWAY_NAMES: ReadonlySet<string> = new Set([
  "Ferenc Csatorna",
]);

/**
 * 人工水路（EXCLUDED_WATERWAY_NAMES）の feature を除去する（純粋関数）。
 * name が無い feature は除外対象名と一致しようがないため残す。
 */
export function excludeArtificialWaterways(
  fc: FeatureCollection,
): FeatureCollection {
  const features = fc.features.filter((feature) => {
    const name = feature.properties?.name;
    return typeof name !== "string" || !EXCLUDED_WATERWAY_NAMES.has(name);
  });
  return { type: "FeatureCollection", features };
}

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
 * NE 50m データは河川が国境をまたぐ区間で呼称のみ変わり、実体は同一の川が
 * 複数 feature・複数 name に分割される（TASK-56）。src/rivers.ts の選択強調
 * （riverLineColor/riverLineWidth）は feature の name 完全一致で判定するため、
 * 正規化しないと該当区間だけ強調から漏れ、クリック/ホバー時に川全体ではなく
 * 途中で強調が切れる不具合になる。
 *
 * 実データ（座標）で確認した継続区間（前後の feature の端点座標が一致する
 * = 実体は 1 本の連続したライン）:
 * - Rhein（独、2 feature）→ Rhin（仏）→ Rhine（英名。独仏国境をまたぐ本流）
 * - Donau（独墺）→ Danube（バルカン以東）
 * - Dicle（トルコ）→ Tigris（イラク）
 * - Firat/Al Furat（トルコ・シリア、各 2 feature）→ Euphrates（イラク）
 * - Dnepre → Dnipro（白・宇。範囲が重なる並行区間）
 * - Tisza（ハンガリー）→ Tisa（セルビア）: Tisza の南端と Tisa の北端の座標
 *   [20.178851, 46.260846] が完全一致する継続区間（TASK-152）
 *
 * エイリアス不要と確認済み（TASK-152）: Duero（スペイン語名）は 50m データでは
 * 単一 feature が西経 8.67 度（ポルトガル・ポルト近郊）まで達しており、
 * ポルトガル語名 Douro の feature はソースに存在しない（名前分割なし）。
 * Dniester（Nistru）・Drava（Drau）も同様に単一名のみ収録。
 *
 * 一方、デルタの分流（Rhine の Nederrijn/Lek/Waal、Danube の
 * Bratul Chillia/Bratul Sfintu Gheorghe/Bratul Sulina/Borcea）は本流から
 * 分岐した別水路という実体があり、data/name-ja.json でも個別の日本語名を
 * 持つため正規化の対象外とする。
 *
 * 正規化先（値）は data/name-ja.json にキーを持つ名前を選ぶ（登録は
 * scripts/build-rivers_test.ts の回帰テストが保証する）。
 */
export const RIVER_NAME_ALIASES: Record<string, string> = {
  "Rhein": "Rhine",
  "Rhin": "Rhine",
  "Donau": "Danube",
  "Dicle": "Tigris",
  "Firat": "Euphrates",
  "Al Furat": "Euphrates",
  "Dnepre": "Dnipro",
  "Tisa": "Tisza",
};

/**
 * 河川名を代表名（canonical name）へ正規化する（純粋関数）。
 * RIVER_NAME_ALIASES に無い名前（デルタの分流・別名を持たない河川）はそのまま返す。
 */
export function canonicalRiverName(name: string): string {
  return RIVER_NAME_ALIASES[name] ?? name;
}

/**
 * 対象抽出後（filterMajorRivers + clipRiversToBbox）・エイリアス適用前の
 * 生ソース名のユニーク一覧をソートして返す（純粋関数）。
 *
 * 回帰テスト（scripts/build-rivers_test.ts の SOURCE_RIVER_NAMES）は名寄せ前の
 * ソース名を検証対象とする。生成物 data/rivers.geojson は正準名しか含まないため、
 * 生成物由来の一覧では『国境またぎの名前分割がエイリアス登録漏れになっていない
 * か』を検出できない（TASK-63）。このスナップショットの再生成には
 * `deno task build-rivers --print-source-names` を使う。
 */
export function extractSourceRiverNames(fc: FeatureCollection): string[] {
  const names = new Set<string>();
  for (const feature of fc.features) {
    const name = feature.properties?.name;
    if (typeof name === "string") names.add(name);
  }
  return [...names].sort();
}

/**
 * properties を name / scalerank の最小限に間引く（純粋関数）。
 * name はオーバーレイ側のラベル表示と主要河川の含有テストに使う。国境をまたぐ
 * 呼称違い（RIVER_NAME_ALIASES）は canonicalRiverName で代表名へ正規化し、
 * 選択強調（riverLineColor 等）が同一河川の全区間に一致するようにする
 * （TASK-56）。scalerank はズームに応じた表示制御に使えるよう残す。
 * name 欠損は null に正規化。
 */
export function pruneRiverProperties(fc: FeatureCollection): FeatureCollection {
  const features = fc.features.map((feature) => {
    const props = feature.properties ?? {};
    const name = typeof props.name === "string"
      ? canonicalRiverName(props.name)
      : null;
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
  const natural = excludeArtificialWaterways(major);
  const clipped = clipRiversToBbox(natural, EUROPE_BBOX);
  if (Deno.args.includes("--print-source-names")) {
    // 回帰テスト用スナップショット（scripts/build-rivers_test.ts の
    // SOURCE_RIVER_NAMES）の再生成モード。名寄せ前の生ソース名を出力して終了する。
    console.log(JSON.stringify(extractSourceRiverNames(clipped), null, 2));
    return;
  }
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
