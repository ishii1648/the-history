/**
 * ベースマップスタイルの組み立て（DOM 非依存の純粋ロジック）。
 *
 * 歴史地図の下地として「地形・海岸線・河川」だけを描画し、現代の
 * 国境・地名・道路等はスタイル定義の段階で除外する（docs/app-spec.md §2.2）。
 *
 * Natural Earth 主要河川オーバーレイ（TASK-21）は、クリック/ホバー可能に
 * するため TASK-24 で deck.gl の GeoJsonLayer（src/rivers.ts + main.ts）へ
 * 移行した。ここでは MapLibre style に rivers ソース/レイヤーを含めない。
 */

import { layers, namedFlavor } from "@protomaps/basemaps";
import { BASEMAP_SOURCE_ID } from "./config.ts";

/**
 * @protomaps/basemaps ^5.7.2 の nolabels_layers()（src/base_layers.ts）に
 * 実在するレイヤー id のうち、採用するもの。
 *
 * 採用（地形・海岸線・河川に相当）:
 * - background:   下地色
 * - earth:        陸地ポリゴン（海との境界 = 海岸線の描画を担う）
 * - landcover:    森林・草地・氷河など自然被覆（地形の表現）
 * - water:        海洋・湖沼ポリゴン
 * - water_river:  河川（線）
 * - water_stream: 小河川（線）
 *
 * 除外（現代の情報が歴史地図に透けるため）:
 * - boundaries / boundaries_country: 現代の国境・行政境界
 * - roads_*:                         道路・鉄道・滑走路など
 * - landuse_*:                       公園・病院・工業地など現代の土地利用
 * - buildings:                       建物
 * - ラベル系（places_* / *_label* / pois / roads_shields 等）はそもそも
 *   layers() を lang なしで呼ぶことで生成しない（labels_layers() を使わない）
 */
export const BASEMAP_LAYER_IDS: readonly string[] = [
  "background",
  "earth",
  "landcover",
  "water",
  "water_stream",
  "water_river",
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

/** buildBasemapStyle が返すスタイルの最小型（MapLibre StyleSpecification 互換） */
export interface BasemapStyle {
  version: 8;
  sources: {
    [id: string]: BasemapVectorSource;
  };
  layers: Array<{ id: string; type: string; [key: string]: unknown }>;
}

/**
 * PMTiles URL からベースマップ用の MapLibre スタイルを組み立てる純粋関数。
 * ラベルレイヤーを生成しないため glyphs / sprite は不要。
 */
export function buildBasemapStyle(pmtilesUrl: string): BasemapStyle {
  const flavor = namedFlavor("light");
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
    },
    layers: filterBasemapLayers(allLayers) as BasemapStyle["layers"],
  };
}
