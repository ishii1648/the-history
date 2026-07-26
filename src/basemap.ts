/**
 * ベースマップスタイルの組み立て（DOM 非依存の純粋ロジック）。
 *
 * 歴史地図の下地として「地形・海岸線」だけを描画し、現代の
 * 国境・地名・道路等はスタイル定義の段階で除外する（docs/app-spec.md §2.2）。
 *
 * Natural Earth 主要河川オーバーレイ（TASK-21）は、クリック/ホバー可能に
 * するため TASK-24 で deck.gl の GeoJsonLayer（src/rivers.ts + main.ts）へ
 * 移行した。ここでは MapLibre style に rivers ソース/レイヤーを含めない。
 * さらに TASK-44 でベースマップ側の川ライン（water_river / water_stream）も
 * 除外し、河川の見た目とクリック対象を deck オーバーレイへ一本化した。
 */

import { type Flavor, layers, namedFlavor } from "@protomaps/basemaps";
import { BASEMAP_SOURCE_ID, DEM_PMTILES_URL, DEM_SOURCE_ID } from "./config.ts";

/**
 * 自然被覆（landcover）の羊皮紙トーン（TASK-73）。
 *
 * light flavor の landcover は彩度の高い緑（forest rgba(196,231,210)、
 * grassland rgba(210,239,207) 等）で、羊皮紙の下地に載せると「現代の
 * 植生図」に見えてしまう。古地図の顔料（黄土・オリーブ）に寄せるため、
 * 色相を緑〜黄緑から黄土へ振り、彩度を大きく落とす。被覆種別の識別は
 * 明度差（forest が最も暗く、barren が最も明るい）で残す。
 *
 * なお landcover は fill-opacity が z5→z7 で 1→0 に落ちるため、この色が
 * 効くのは広域表示（ヨーロッパ全体〜地方）に限られる。
 */
export const PARCHMENT_LANDCOVER_COLORS = {
  // 森林: 最も暗いオリーブ（古地図の緑顔料の退色を想定）
  forest: "rgba(196, 188, 145, 1)",
  // 草地・農地: 森林よりやや明るい黄土オリーブ
  grassland: "rgba(214, 203, 160, 1)",
  farmland: "rgba(219, 209, 168, 1)",
  scrub: "rgba(223, 213, 174, 1)",
  // 荒地: 砂地（sand）に近い明るい黄土
  barren: "rgba(234, 223, 193, 1)",
  // 市街地: 彩度をほぼ落とした灰褐色（現代的な要素なので目立たせない）
  urban_area: "rgba(221, 209, 181, 1)",
  // 氷河: 羊皮紙の最も明るい部分（純白にはしない）
  glacier: "rgba(244, 239, 226, 1)",
} as const satisfies Record<string, string>;

/**
 * ベースマップ（protomaps light flavor）への羊皮紙トーン上書き（TASK-73）。
 *
 * 地図外 UI（app.css の --parchment #f4ecd7 / --parchment-shade #e7d9b2 /
 * --ink #3a2712 / --frame #5c3d22、TASK-40）に対し、地図本体が light flavor の
 * まま（海 #80deea のシアン、背景 #cccccc のグレー）だったため配色が乖離して
 * いた。地図外 UI と同じ羊皮紙系のパレットへ揃える。
 *
 * 各値の根拠:
 * - background #e7d9b2: --parchment-shade と同値。タイル未読込領域と UI の
 *   縁が同色になり、地図の「紙」が画面外まで続いて見える。
 * - earth #f0e6cd: --parchment (#f4ecd7) をわずかに沈めた値。ラベルの
 *   クリーム halo（labels.ts LABEL_OUTLINE_COLOR = rgb(244,236,215)、TASK-72）
 *   より暗いため、halo が下地に完全に溶けず、かつ同系色で浮かない。
 * - water #c7d2d0: くすんだ青灰。陸（暖色）との明度・色相差で海岸線は明確に
 *   読めるが、彩度は勢力ポリゴンの塗り（colors.json 由来）より十分低く、
 *   海が主張して勢力の色分けを邪魔しない。
 * - glacier #f4efe2 / sand #e8dcc0 / beach #ece0c4: 陸地と同系の羊皮紙階調。
 */
export const PARCHMENT_FLAVOR_OVERRIDES = {
  background: "#e7d9b2",
  earth: "#f0e6cd",
  water: "#c7d2d0",
  glacier: "#f4efe2",
  sand: "#e8dcc0",
  beach: "#ece0c4",
} as const satisfies Record<string, string>;

/**
 * light flavor に羊皮紙トーンの上書きを適用した flavor を返す純粋関数
 * （TASK-73）。namedFlavor("light") の戻り値は呼び出しごとの新しいオブジェクト
 * だが、破壊的変更を避けるため常に新オブジェクトへ spread して返す。
 * 採用しないレイヤー（道路・建物・POI 等、BASEMAP_LAYER_IDS 外）の色は
 * light flavor のまま残す（filterBasemapLayers で捨てられるため無害）。
 */
export function parchmentFlavor(): Flavor {
  return {
    ...namedFlavor("light"),
    ...PARCHMENT_FLAVOR_OVERRIDES,
    landcover: { ...PARCHMENT_LANDCOVER_COLORS },
  };
}

/**
 * @protomaps/basemaps ^5.7.2 の nolabels_layers()（src/base_layers.ts）に
 * 実在するレイヤー id のうち、採用するもの。
 *
 * 採用（地形・海岸線に相当）:
 * - background:   下地色
 * - earth:        陸地ポリゴン（海との境界 = 海岸線の描画を担う）
 * - landcover:    森林・草地・氷河など自然被覆（地形の表現）
 * - water:        海洋・湖沼ポリゴン
 *
 * 除外（河川ライン。TASK-44）:
 * - water_river / water_stream: ベースマップの川ラインは deck.gl の pickable
 *   河川（NE50m, src/rivers.ts）と経路が乖離し、クリックできないデコイに
 *   なるため採用しない。河川表示は deck オーバーレイへ一本化する。
 *
 * 除外（現代の情報が歴史地図に透けるため）:
 * - boundaries / boundaries_country: 現代の国境・行政境界
 * - roads_*:                         道路・鉄道・滑走路など
 * - landuse_*:                       公園・病院・工業地など現代の土地利用
 * - buildings:                       建物
 * - ラベル系（places_* / *_label* / pois / roads_shields 等）はそもそも
 *   layers() を lang なしで呼ぶことで生成しない（labels_layers() を使わない）
 */
/**
 * 海洋・湖沼ポリゴンのレイヤー ID（@protomaps/basemaps の base_layers.ts 由来）。
 * TASK-77: 勢力・諸侯領ポリゴンをこのレイヤーより下へ差し込む（deck.gl の
 * beforeId）ため、id を定数として公開する。スタイル側の実在は
 * basemap_test.ts / underwater_test.ts が実レイヤー定義に対して検証する。
 */
export const WATER_LAYER_ID = "water";

export const BASEMAP_LAYER_IDS: readonly string[] = [
  "background",
  "earth",
  "landcover",
  WATER_LAYER_ID,
];

const KEEP_IDS: ReadonlySet<string> = new Set(BASEMAP_LAYER_IDS);

/** レイヤー定義から採用レイヤーのみを残す純粋関数（id の完全一致で判定） */
export function filterBasemapLayers<T extends { id: string }>(
  layerList: readonly T[],
): T[] {
  return layerList.filter((layer) => KEEP_IDS.has(layer.id));
}

/** ベクタタイルソースの最小型（MapLibre VectorSourceSpecification 互換） */
export interface BasemapVectorSource {
  type: "vector";
  url: string;
  attribution?: string;
}

/**
 * 地形 DEM ソースの最小型（MapLibre RasterDEMSourceSpecification 互換）。
 * TASK-34: terrarium エンコーディングの PMTiles を hillshade の入力にする。
 */
export interface BasemapRasterDemSource {
  type: "raster-dem";
  url: string;
  encoding: "terrarium";
  tileSize: number;
  attribution?: string;
}

/** スタイルに現れうるソースの合併型 */
export type BasemapSource = BasemapVectorSource | BasemapRasterDemSource;

/** buildBasemapStyle が返すスタイルの最小型（MapLibre StyleSpecification 互換） */
export interface BasemapStyle {
  version: 8;
  sources: {
    [id: string]: BasemapSource;
  };
  layers: Array<{ id: string; type: string; [key: string]: unknown }>;
}

/** 地形陰影（hillshade）レイヤーの ID（TASK-34） */
export const HILLSHADE_LAYER_ID = "hillshade";

/**
 * hillshade レイヤー定義（TASK-34）。
 *
 * paint 値の根拠:
 * - hillshade-exaggeration 0.4: 既定 0.5 よりやや控えめ。アルプス・カルパチア
 *   等の起伏は視認できるが、勢力ポリゴン（alpha 0.5 相当の塗り）やラベルの
 *   判読を妨げない強さにする。
 * - shadow-color: 半透明の暖色グレー。不透明黒（既定 #000）だと z4 の広域表示で
 *   山岳が黒潰れし、上に重なる勢力塗りの色が沈むため alpha 0.35 に抑える。
 * - highlight-color: 半透明白。light flavor の淡い下地では強い白ハイライトは
 *   ほぼ見えない一方、塗り越しでは白浮きするため alpha 0.25 に抑える。
 * - accent-color: 影と同系の弱い暖色グレー。急斜面の輪郭をわずかに締めるだけに
 *   する（強くすると等高線状のノイズに見える）。
 */
const HILLSHADE_LAYER: BasemapStyle["layers"][number] = {
  id: HILLSHADE_LAYER_ID,
  type: "hillshade",
  source: DEM_SOURCE_ID,
  paint: {
    "hillshade-exaggeration": 0.4,
    "hillshade-shadow-color": "rgba(80, 70, 60, 0.35)",
    "hillshade-highlight-color": "rgba(255, 255, 255, 0.25)",
    "hillshade-accent-color": "rgba(80, 70, 60, 0.15)",
  },
};

/**
 * hillshade をベースマップレイヤー列の landcover の後・water の前に挿入する。
 * 陸地（earth / landcover）の陰影が水域・河川の下になり、海面に陰影が
 * かからない。deck.gl の勢力ポリゴン・ラベル等は overlay として常にこの
 * スタイルの上へ重なるため、視認性への影響は paint の不透明度だけで制御できる。
 */
function insertHillshade(
  baseLayers: BasemapStyle["layers"],
): BasemapStyle["layers"] {
  const waterIdx = baseLayers.findIndex((l) => l.id === "water");
  if (waterIdx < 0) {
    // water が無い場合（想定外）は末尾に置き、スタイル全体は壊さない
    return [...baseLayers, HILLSHADE_LAYER];
  }
  return [
    ...baseLayers.slice(0, waterIdx),
    HILLSHADE_LAYER,
    ...baseLayers.slice(waterIdx),
  ];
}

/**
 * PMTiles URL からベースマップ用の MapLibre スタイルを組み立てる純粋関数。
 * ラベルレイヤーを生成しないため glyphs / sprite は不要。
 *
 * TASK-73: 配色は protomaps の light flavor をそのまま使わず、
 * parchmentFlavor()（羊皮紙トーン）を通す。
 *
 * TASK-34: DEM（terrarium PMTiles）ソースと hillshade レイヤーを含める。
 * DEM アーカイブは任意生成のため存在しない環境もあるが、MapLibre はソースの
 * タイル取得失敗でスタイル全体を落とさず、hillshade が描画されないだけで
 * 従来表示を維持する（dem ソースのエラーで OpenFreeMap へフォールバック
 * しないことは src/fallback.ts が担保する）。
 */
export function buildBasemapStyle(pmtilesUrl: string): BasemapStyle {
  // TASK-73: light flavor をそのまま使わず、羊皮紙トーンへ上書きした flavor
  // から生成する（配色の定義は PARCHMENT_FLAVOR_OVERRIDES に集約）。
  const flavor = parchmentFlavor();
  const allLayers = layers(BASEMAP_SOURCE_ID, flavor);
  return {
    version: 8,
    sources: {
      [BASEMAP_SOURCE_ID]: {
        type: "vector",
        url: `pmtiles://${pmtilesUrl}`,
        attribution:
          '<a href="https://protomaps.com">Protomaps</a> © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>',
      },
      [DEM_SOURCE_ID]: {
        type: "raster-dem",
        url: `pmtiles://${DEM_PMTILES_URL}`,
        encoding: "terrarium",
        // terrarium（AWS Terrain Tiles）は 256px タイル
        tileSize: 256,
        attribution:
          '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (Mapzen)',
      },
    },
    layers: insertHillshade(
      filterBasemapLayers(allLayers) as BasemapStyle["layers"],
    ),
  };
}
