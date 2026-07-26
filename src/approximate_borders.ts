/**
 * 「概略境界」としての境界線表現（TASK-80）。DOM / MapLibre / deck.gl に
 * 依存しない純粋ロジックのみを置く。
 *
 * なぜ必要か: 採用データ（aourednik/historical-basemaps）は全 feature の
 * BORDERPRECISION が 1 = approximate（残りの値は 2 = moderately precise /
 * 3 = determined by international law）で、提供者自身が「この年代の全境界は
 * 概略」と宣言している。にもかかわらず従来は 1px の不透明に近い線
 * （powers.ts LINE_COLOR alpha 190/255・blur なし）で描いていたため、精密に
 * 測量された国境という誤ったメッセージを出していた。実際、1200 年のフランス
 * 周辺では境界が数百 km の直線 1 本で近似されている箇所がある（ユーザー指摘:
 * 仏王国 ↔ アンジュー帝国 277 km、トゥールーズ伯領北縁 計 206 km）。
 *
 * 方針は 2 段構え:
 * 1. 全区間を「にじみ + 低 alpha」で描く（BORDERPRECISION=1 の宣言に忠実）。
 * 2. セグメント長で 3 段に分け、長い区間ほど alpha を下げ・太く・強くにじませる
 *    （長い直線 = 頂点が無く補間もされていない = 特に概略）。
 *
 * 実装手段として MapLibre の line レイヤーを使う: deck.gl の GeoJsonLayer /
 * PathLayer には blur も破線も無い（線幅と色しか制御できない）が、MapLibre の
 * line レイヤーには line-blur がある。段ごとに 1 枚のレイヤーへ分け、paint を
 * 定数（TIER_STYLES）から組み立てる。データ駆動式（["match", ["get","tier"], …]）
 * を使わないのは、段ごとの paint をズーム補間と組み合わせた式が入れ子で
 * 読みにくくなるうえ、レイヤー単位なら各段の見た目を単体テストで
 * 1 対 1 に検証できるため。
 *
 * 却下した案: 塗りの色境界に沿う「かすみ帯」（Euratlas の fuzzy_borders 相当。
 * TASK-80 AC #4）。線を和らげても隣接勢力の塗りの色境界が直線であることは残る
 * ため、長い区間に沿って幅 9〜15px・低 alpha の帯を重ねる案を実装して 1200 年・
 * z6 のヘッドレススクリーンショットで比較した。インクの帯は「より太くはっきり
 * した境界線」になり AC #3 と正面から矛盾する。羊皮紙色（earth #f0e6cd）の帯は
 * 両側の塗りを等しく退色させるが、塗りの中に第 3 の色の明るい筋が生まれ、
 * 帯が付く区間（= まさに目立たせたくない超長直線）だけが光って見えるため、
 * かえって視線を引く結果になった。色の変わり目そのものを和らげるには塗りの
 * ジオメトリ側を揺らす必要がある（TASK-80 Description の案 (d) sketchy
 * rendering）ため、色境界への対処は次段階へ送る。
 */

import type {
  Feature,
  FeatureCollection,
  Geometry,
  LineString,
  Position,
} from "geojson";
import { LINE_COLOR } from "./powers.ts";
import { MAX_ZOOM, MIN_ZOOM } from "./config.ts";

/** GeoJSON ソースの ID（レイヤー ID の接頭辞にもする） */
export const APPROXIMATE_BORDER_SOURCE_ID = "approximate-borders";

/** 不確かさの段（normal → very-long の順に「より概略」） */
export type UncertaintyTier = "normal" | "long" | "very-long";

/** 段の一覧（弱い順）。レイヤー生成・検証はこの順に従う */
export const UNCERTAINTY_TIERS: readonly UncertaintyTier[] = [
  "normal",
  "long",
  "very-long",
];

/**
 * 「長い」と見なすセグメント長（km）の閾値（TASK-80 AC #2/#5）。
 *
 * 根拠は実データの分布（data/base_outline_1200.geojson の 4659 セグメント:
 * 中央値 15.8 km・p90 53.8 km・p99 291 km。europe_900 / europe_1500 でも
 * 中央値 10〜15 km・p90 35〜42 km と同傾向）。
 * - LONG_SEGMENT_KM = 50 ≒ p90。セグメント数の 7〜11% だが線の総延長の
 *   35〜52% を占める「頂点が粗い区間」の入口。
 * - VERY_LONG_SEGMENT_KM = 100 ≒ p95。ユーザー指摘の直線（277 km / 141 km、
 *   諸侯領 union で切った後の 128 km）と同種の超長直線（Burgandy ↔ 神聖
 *   ローマ帝国 150 km、León ↔ Castile 294 km）が全てここに入る一方、
 *   セグメント数では 2〜5% に留まるため、地図全体が薄くなりすぎない。
 */
export const LONG_SEGMENT_KM = 50;
export const VERY_LONG_SEGMENT_KM = 100;

/** 地球半径（km）。scripts/audit-rivers.ts の haversineKm と同値 */
const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

/**
 * 2 点間の大円距離（km）。
 *
 * scripts/audit-rivers.ts に同じ式の haversineKm があるが、あちらは Deno 専用の
 * 監査スクリプト側のモジュールで、ブラウザバンドル（src/）から import すると
 * 監査用の I/O まで巻き込む。数式は 6 行なのでここに持つ（両者が乖離しても
 * 用途が独立しているため実害は無い）。
 */
export function segmentLengthKm(a: Position, b: Position): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** セグメント長から不確かさの段を決める（境界値は上側の段に含める） */
export function uncertaintyTier(lengthKm: number): UncertaintyTier {
  if (lengthKm >= VERY_LONG_SEGMENT_KM) return "very-long";
  if (lengthKm >= LONG_SEGMENT_KM) return "long";
  return "normal";
}

/** 1 段分の見た目（色の alpha・線幅 px・にじみ px） */
export interface TierStyle {
  readonly alpha: number;
  readonly widthPx: number;
  readonly blurPx: number;
}

/**
 * 段ごとの見た目（TASK-80 AC #1/#2/#5）。
 *
 * 設計: 段が進むほど alpha を下げ、太く、そして「にじみ / 線幅」の比を上げる。
 * ink の総量をおおよそ保ったまま「輪郭のある細い線 → 輪郭を持たない幅広い帯」へ
 * 連続的に移すのが狙いで、帯として読めれば「この辺りが境目」という情報は残り、
 * 「ここが測量された国境線」という誤読だけが消える。
 *
 * - normal（< 50 km）: alpha 0.62・1.0px・blur 0.6px（比 0.6）。従来
 *   （alpha 0.75・blur 0）より弱くにじむが、輪郭は残す。ここを更に弱めると
 *   1815 年のドイツ諸邦のような小国が密集する年代で境界が読めなくなり
 *   （ヘッドレス確認で alpha 0.5・blur 1.0px 版が塗りの色差だけになることを確認）、
 *   「概略として描く」ではなく「描かない」になってしまう。
 * - long（50〜100 km）: alpha 0.4・1.8px・blur 2.5px（比 1.4）。少し離れると
 *   線ではなく帯に見える。
 * - very-long（≥ 100 km）: alpha 0.24・2.8px・blur 5.0px（比 1.8）。位置は
 *   分かるが輪郭がまったく無く、「引いた線」には見えない（AC #3）。
 */
export const TIER_STYLES: Record<UncertaintyTier, TierStyle> = {
  "normal": { alpha: 0.62, widthPx: 1.0, blurPx: 0.6 },
  "long": { alpha: 0.4, widthPx: 1.8, blurPx: 2.5 },
  "very-long": { alpha: 0.24, widthPx: 2.8, blurPx: 5.0 },
};

/**
 * 線のインク（RGB）。従来の境界線（powers.ts LINE_COLOR）と同じ褪せ顔料
 * （TASK-73/74 のパレット）にし、段ごとに alpha だけを変える。
 */
export const APPROXIMATE_BORDER_INK: readonly [number, number, number] = [
  LINE_COLOR[0],
  LINE_COLOR[1],
  LINE_COLOR[2],
];

/** 段に対応する line-color（CSS rgba 文字列） */
export function approximateBorderColor(tier: UncertaintyTier): string {
  const [r, g, b] = APPROXIMATE_BORDER_INK;
  return `rgba(${r}, ${g}, ${b}, ${TIER_STYLES[tier].alpha})`;
}

/**
 * 線幅・にじみのズーム倍率（TASK-80）。線幅とにじみに同じ倍率をかけるので、
 * 段の見た目の比率（にじみ / 線幅）はズームに依らず一定に保たれる。
 * - 最小ズーム（ヨーロッパ全体）は境界線が密集するため 0.9 倍に絞る（潰れ防止）
 * - 最大ズーム（地方）は 1.4 倍に広げ、拡大してもにじみが 1px 未満にならない
 *   ようにする
 * 補間の両端は config.ts の MIN_ZOOM / MAX_ZOOM に合わせる: アプリはこの範囲外へ
 * ズームできない（maxBounds と同様に Map の minZoom/maxZoom で制限している）ため、
 * 端をこれより外に置くと最小・最大ズームでも倍率が中途半端な値のままになる。
 */
export const ZOOM_SCALE = {
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  minScale: 0.9,
  maxScale: 1.4,
} as const;

/** run（同じ段の連続区間）の properties キー */
export const TIER_PROPERTY = "tier";
export const MAX_SEGMENT_KM_PROPERTY = "maxSegmentKm";

/** feature を持たない空の FeatureCollection（同一参照で setData の差分を減らす） */
export const EMPTY_APPROXIMATE_BORDER_DATA: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** ジオメトリから「線として扱う座標列」を取り出す（ポリゴンの環も線として扱う） */
function linesOf(geometry: Geometry): Position[][] {
  switch (geometry.type) {
    case "LineString":
      return [geometry.coordinates];
    case "MultiLineString":
      return geometry.coordinates;
    // ポリゴンの環（外環・穴）はそのまま閉じた線。GeoJSON では先頭 = 末尾の
    // 座標を含むため、閉合セグメントも自然に含まれる
    case "Polygon":
      return geometry.coordinates;
    case "MultiPolygon":
      return geometry.coordinates.flat();
    case "GeometryCollection":
      return geometry.geometries.flatMap(linesOf);
    default:
      // Point / MultiPoint は境界線を持たない
      return [];
  }
}

/**
 * 1 本の座標列を「同じ段が連続する区間（run）」へ切り分ける。
 * 隣接する run は切り替え位置の頂点を共有するため、段が変わる場所で線が
 * 途切れない（レイヤーが分かれても見た目は 1 本の連続した境界に見える）。
 */
function runsOf(line: Position[]): Feature<LineString>[] {
  if (line.length < 2) return [];
  const runs: Feature<LineString>[] = [];
  let start = 0;
  let tier = uncertaintyTier(segmentLengthKm(line[0], line[1]));
  let maxKm = segmentLengthKm(line[0], line[1]);
  const flush = (end: number) => {
    const coordinates = line.slice(start, end + 1);
    if (coordinates.length < 2) return;
    runs.push({
      type: "Feature",
      properties: {
        [TIER_PROPERTY]: tier,
        // 描画には使わないが、実データの検証・ヘッドレス確認で「どの区間が
        // どれだけ長いのか」を追えるようにする
        [MAX_SEGMENT_KM_PROPERTY]: maxKm,
      },
      geometry: { type: "LineString", coordinates },
    });
  };
  for (let i = 1; i < line.length; i++) {
    const km = segmentLengthKm(line[i - 1], line[i]);
    const next = uncertaintyTier(km);
    if (next !== tier) {
      flush(i - 1);
      start = i - 1;
      tier = next;
      maxKm = km;
    } else {
      maxKm = Math.max(maxKm, km);
    }
  }
  flush(line.length - 1);
  return runs;
}

/**
 * 境界線の FeatureCollection（base 勢力ポリゴン、または TASK-78 の派生
 * base_outline の LineString 群）から、段ごとに切り分けた LineString 群を作る。
 *
 * 入力を選ばないのは、諸侯領オーバーレイ対象年（1000〜1300）は
 * data/base_outline_<year>.geojson（諸侯領 union の外側だけに切り出した線。
 * TASK-78 の二重輪郭解消をそのまま維持する）、それ以外の年は
 * data/europe_<year>.geojson のポリゴンの環、と入力形が違うため。
 *
 * 実行時に計算する（ビルド時の派生データを増やさない）: 対象は 1 年あたり
 * 5〜7 千セグメントで、年代切替のたびに走っても数 ms 程度。年代ごとに
 * 派生ファイルを増やすと dist へのコピー・サイズ・生成スクリプトの保守が
 * 増える一方、得られるのは同じ結果でしかない。
 */
export function buildApproximateBorderData(
  source: FeatureCollection,
): FeatureCollection {
  const features = source.features.flatMap((feature) =>
    feature.geometry === null ? [] : linesOf(feature.geometry).flatMap(runsOf)
  );
  return { type: "FeatureCollection", features };
}

/** 段に対応する MapLibre レイヤー ID */
export function approximateBorderLayerId(tier: UncertaintyTier): string {
  return `${APPROXIMATE_BORDER_SOURCE_ID}-${tier}`;
}

/**
 * 概略境界レイヤーの ID 一覧（弱い段から順 = 下から順）。順序は layer_stack.ts が
 * deck の挿入位置（先頭 = 最下段の直下へ政治ポリゴンを入れる）を決めるのに使う
 * ため、下から順であることが必須。
 */
export const APPROXIMATE_BORDER_LAYER_IDS: readonly string[] = UNCERTAINTY_TIERS
  .map(approximateBorderLayerId);

/** MapLibre の line レイヤー定義の最小型（LineLayerSpecification 互換） */
export interface ApproximateBorderLayerSpec {
  readonly id: string;
  readonly type: "line";
  readonly source: string;
  readonly filter: unknown;
  readonly layout: Readonly<Record<string, unknown>>;
  readonly paint: Readonly<Record<string, unknown>>;
}

/** 線幅・にじみのズーム補間式を組み立てる（値は TIER_STYLES × ZOOM_SCALE） */
function zoomScaled(basePx: number): unknown {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    ZOOM_SCALE.minZoom,
    basePx * ZOOM_SCALE.minScale,
    ZOOM_SCALE.maxZoom,
    basePx * ZOOM_SCALE.maxScale,
  ];
}

/**
 * 段ごとの line レイヤー定義（弱い段から順）。同一 GeoJSON ソースを引き、
 * filter で自段の run だけを描く。
 */
export function approximateBorderLayerSpecs(): ApproximateBorderLayerSpec[] {
  return UNCERTAINTY_TIERS.map((tier) => ({
    id: approximateBorderLayerId(tier),
    type: "line" as const,
    source: APPROXIMATE_BORDER_SOURCE_ID,
    filter: ["==", ["get", TIER_PROPERTY], tier],
    // 角・端の処理は layout プロパティ（paint に置くとスタイル検証で弾かれる）。
    // 概略の帯なので尖らせず丸め、にじみと馴染ませる
    layout: { "line-join": "round", "line-cap": "round" },
    paint: {
      "line-color": approximateBorderColor(tier),
      "line-width": zoomScaled(TIER_STYLES[tier].widthPx),
      "line-blur": zoomScaled(TIER_STYLES[tier].blurPx),
    },
  }));
}

/** GeoJSON ソース定義（MapLibre GeoJSONSourceSpecification 互換の最小型） */
export function approximateBorderSourceSpec(
  data: FeatureCollection = EMPTY_APPROXIMATE_BORDER_DATA,
): { readonly type: "geojson"; readonly data: FeatureCollection } {
  return { type: "geojson", data };
}
