/**
 * deck.gl レイヤーと MapLibre スタイルの重ね順の構成（TASK-77）。
 * DOM / deck.gl / MapLibre に依存しない純粋ロジックのみを置く。
 *
 * 扱う関心は 2 つで、どちらも「政治ポリゴンをベースマップの水面より下へ回す」
 * ことから派生する:
 *   1. どの deck レイヤーに beforeId（水面レイヤー）を付けるか（underWaterBeforeId）
 *   2. どの deck レイヤーを interleaved ではなく overlaid オーバーレイに載せるか
 *      （OVERLAID_LAYER_IDS / overlaySplitIsValid）
 *
 * 背景（1: 海へのはみ出し）:
 * ベースマップ（Protomaps / OSM の現代海岸線・メートル級）と政治ポリゴン
 * （historical-basemaps 等・セグメント中央値で数〜十数 km）は別々の海岸線を
 * 持つため、勢力・諸侯領の塗りが海岸線を越えて海へはみ出す（1200 年の
 * ブルターニュ半島先端・ジロンド北岸などで顕著。西欧域で計 ≈ 2.5 万 km2）。
 * データ側で海岸線を一致させるのは解像度差が大きく現実的でないため、描画順で
 * 隠す: interleaved レンダリング（MapboxOverlay の interleaved: true）では
 * レイヤー prop beforeId で MapLibre スタイルの任意レイヤーの直下へ deck
 * レイヤーを差し込めるので、塗りを不透明な水面ポリゴン（basemap.ts の
 * WATER_LAYER_ID、fill-color #c7d2d0）の下へ回し、海上のはみ出しを覆わせる。
 *
 * 注意（AC #4）: @deck.gl/mapbox の resolveLayerGroups は
 * `map.addLayer(group, beforeId)` を呼ぶだけで beforeId の実在を検証しない。
 * MapLibre は存在しない beforeId に対して例外ではなく error イベントを発火し
 * レイヤーを追加しないため、そのままでは対象ポリゴンが「無言で描画されない」。
 * よって beforeId は必ず現在のスタイルのレイヤー id 列と突き合わせ、無ければ
 * undefined（= 従来どおり最前面グループ）へフォールバックする。
 */

import { WATER_LAYER_ID } from "./basemap.ts";
import {
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
  POWER_LAYER_ID,
} from "./picking.ts";

/**
 * 水面より下へ差し込む対象とする MapLibre スタイル側のレイヤー ID。
 * ベースマップスタイルの water（basemap.ts）と同一。
 */
export const WATER_STYLE_LAYER_ID = WATER_LAYER_ID;

/**
 * base 勢力の境界線オーバーレイ（GeoJsonLayer / LineString）のレイヤー ID
 * （TASK-78）。諸侯領オーバーレイ対象年（1000〜1300）では powers の stroke を
 * 止め、代わりに「諸侯領 union の外側だけに切り出した base 輪郭」
 * （data/base_outline_<year>.geojson）をこの層で描く。これにより諸侯領の内側を
 * 走る base 境界線（二重輪郭）が消え、外側の境界線は従来と同一に見える。
 *
 * pickable: false のため PICKING_PRIORITY には含めない（picking 非関与。
 * base ポリゴンの塗り・ホバー/クリックは powers 側にそのまま残る）。
 */
export const BASE_OUTLINE_LAYER_ID = "base-outlines";

/**
 * 水面より下へ回す deck レイヤーの ID（政治ポリゴンの塗り 3 枚 + base 輪郭）。
 * 相対順（powers → base-outlines → france-fiefs → hre-powers）は同一 beforeId の
 * グループ内で deck レイヤー配列順が保たれるため従来と変わらない。base-outlines も
 * ここに含めるのが必須で、powers と別グループになると諸侯領より上／水面より上に
 * 描かれて海上へのはみ出しが露出する（TASK-78）。
 *
 * hre-extent（帝国範囲の強調輪郭）は含めない: 常時表示ではなくトグルで出す
 * 強調記号であり、水面より下だと海側の輪郭が切れて「どこからどこまでが帝国か」の
 * 表現が壊れるため、従来どおり水面より上に残す。
 */
export const UNDER_WATER_LAYER_IDS: readonly string[] = [
  POWER_LAYER_ID,
  BASE_OUTLINE_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
];

/**
 * deck レイヤーに与える beforeId を返す純粋関数。
 * - 対象外のレイヤー（河川・都市・ラベル等）は undefined（従来の描画順）
 * - 対象でも、渡されたスタイルに水面レイヤーが無ければ undefined
 *   （フォールバックスタイルやスタイル未読込でも例外を投げない。AC #4）
 *
 * @param layerId deck レイヤーの ID
 * @param styleLayerIds 現在の MapLibre スタイルのレイヤー ID 列
 */
export function underWaterBeforeId(
  layerId: string,
  styleLayerIds: readonly string[],
): string | undefined {
  if (!UNDER_WATER_LAYER_IDS.includes(layerId)) return undefined;
  return styleLayerIds.includes(WATER_STYLE_LAYER_ID)
    ? WATER_STYLE_LAYER_ID
    : undefined;
}

/**
 * 勢力名ラベル（TextLayer）のレイヤー ID（TASK-20）。
 * powers / hre-powers の上に重ね、年代切替では data のみ差し替える。
 */
export const LABEL_LAYER_ID = "power-labels";

/** 河川名ラベル（TextLayer）のレイヤー ID（TASK-24） */
export const RIVER_LABEL_LAYER_ID = "river-labels";

/** 都市名ラベル（TextLayer）のレイヤー ID（TASK-27） */
export const CITY_LABEL_LAYER_ID = "city-labels";

/**
 * interleaved ではなく overlaid オーバーレイ（deck 専用 canvas）に載せる
 * レイヤーの ID（TASK-77）。
 *
 * なぜ分けるのか: beforeId を使うと interleaved のレイヤーグループが 2 つに
 * 分かれる（水面より下のグループ / 従来の最前面グループ）。@deck.gl/mapbox は
 * グループごとに `deck._drawLayers` を呼び、そのグループのレイヤーだけを通す
 * layerFilter を渡す。CollisionFilterExtension の CollisionFilterEffect は
 * preRender でこの layerFilter を衝突マップ（collision FBO）の描画にも適用する
 * ため、先に描画される「水面より下」グループのパスで衝突マップがラベル抜きで
 * 描き直され、空のマップができる。さらに同エフェクトは「レイヤーもビューポートも
 * 変わっていなければ再描画しない」ため、後続のラベル側グループのパスでは
 * 描き直されない。結果、衝突判定で全ラベルが不可視と判定され 1 つも表示され
 * なくなる（@deck.gl/extensions 9.3.7 collision-filter-effect.js の
 * preRender / _render で確認。ヘッドレス実機でもラベル全滅を再現し、
 * collisionEnabled: false にすると復活することで原因を特定した）。
 *
 * ラベル 3 層は pickable: false で picking に一切関与せず（PICKING_PRIORITY に
 * 含まれない）、描画順も常に最前面のため、overlaid オーバーレイ（地図 canvas の
 * 上に重ねる deck 専用 canvas。コンテナは pointer-events: none なので地図操作を
 * 妨げない）へ移しても見た目・操作は変わらない。移すことで衝突判定が
 * interleaved のグループ分割から完全に切り離され、水面オクルージョンと衝突
 * フィルタが両立する。3 層は同一 deck インスタンスにまとめて残すため、共有
 * 衝突空間（labels.ts の COLLISION_SIZE_SCALE と priority による間引き）も
 * 従来どおり効く。
 */
export const OVERLAID_LAYER_IDS: readonly string[] = [
  LABEL_LAYER_ID,
  RIVER_LABEL_LAYER_ID,
  CITY_LABEL_LAYER_ID,
];

/**
 * interleaved / overlaid 2 つのオーバーレイへのレイヤー分配が正しいかを
 * 検証する純粋関数（main.ts の renderLayers が毎回この不変条件を確認する。
 * layerOrderMatchesPickingPriority と同じ「壊れたら即座に気付く」ための検査）。
 *
 * 正しい分配とは:
 * - overlaid 側が OVERLAID_LAYER_IDS と完全一致（順序込み。過不足・混入なし）
 * - interleaved 側に overlaid 対象のレイヤーが残っていない
 */
export function overlaySplitIsValid(
  interleavedIds: readonly string[],
  overlaidIds: readonly string[],
): boolean {
  if (overlaidIds.length !== OVERLAID_LAYER_IDS.length) return false;
  if (!overlaidIds.every((id, i) => id === OVERLAID_LAYER_IDS[i])) return false;
  return !interleavedIds.some((id) => OVERLAID_LAYER_IDS.includes(id));
}
