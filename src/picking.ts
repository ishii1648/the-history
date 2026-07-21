/**
 * picking（ホバー/クリック対象の解決）の優先順位ロジック（TASK-29）。
 * DOM / deck.gl に依存しない純粋関数のみを置く。
 *
 * deck.gl の Deck レベル onHover/onClick は「最前面の picking 結果 1 件」だけを
 * 返すため、picking の優先順位は描画レイヤー順（配列の後ろほど上）で決まる。
 * 本モジュールはその暗黙の対応を PICKING_PRIORITY として明示し、
 * - renderOrderFromPickingPriority: 優先順から描画順（下→上）を導出する
 * - layerOrderMatchesPickingPriority: レイヤー配列が優先順と整合するか検証する
 * - selectPreferredPick: 複数候補から最優先の 1 件を選ぶ
 * を提供する。
 */

/** 勢力圏ポリゴン（GeoJsonLayer）のレイヤー ID（TASK-5） */
export const POWER_LAYER_ID = "powers";

/** HRE（神聖ローマ帝国）主要領邦オーバーレイのレイヤー ID（TASK-19） */
export const HRE_LAYER_ID = "hre-powers";

/** 主要都市マーカー（ScatterplotLayer）のレイヤー ID（TASK-27） */
export const CITY_LAYER_ID = "cities";

/** 主要河川ライン（GeoJsonLayer）のレイヤー ID（TASK-24） */
export const RIVERS_LAYER_ID = "rivers";

/**
 * picking の優先順（先頭が最優先）: 河川 > 都市 > HRE 領邦 > 勢力（AC #4）。
 * pickable なレイヤーだけを含む（ラベル系レイヤーは pickable: false のため
 * picking に関与せず、このリストにも含めない）。
 */
export const PICKING_PRIORITY: readonly string[] = [
  RIVERS_LAYER_ID,
  CITY_LAYER_ID,
  HRE_LAYER_ID,
  POWER_LAYER_ID,
];

/**
 * picking 優先順から描画レイヤー順（配列順 = 下→上）を導出する。
 * deck.gl の picking は最前面（配列の最後）が勝つため、描画順は優先順の
 * 逆順になる。入力配列は変更しない。
 */
export function renderOrderFromPickingPriority(
  priority: readonly string[],
): string[] {
  return [...priority].reverse();
}

/**
 * 複数の picking 候補から PICKING_PRIORITY の最優先 1 件を選ぶ。
 * - 候補ゼロなら null
 * - 優先リスト外の layerId は最後（優先リスト内のどの候補よりも劣後）
 * - 同順位は先勝ち（入力順で安定）
 */
export function selectPreferredPick<T extends { layerId: string }>(
  picks: readonly T[],
): T | null {
  let best: T | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const candidate of picks) {
    const index = PICKING_PRIORITY.indexOf(candidate.layerId);
    // 優先リスト外はどのリスト内候補よりも後ろの順位として扱う
    const rank = index === -1 ? PICKING_PRIORITY.length : index;
    if (rank < bestRank) {
      best = candidate;
      bestRank = rank;
    }
  }
  return best;
}

/**
 * 描画レイヤー配列（下→上）の並びが PICKING_PRIORITY と整合するか検証する。
 * 「整合する」とは、配列中の pickable レイヤー（PICKING_PRIORITY に含まれる
 * ID）を出現順に抜き出したとき、優先順の逆順（優先が高いものほど上に描画）に
 * 並んでいて重複が無いこと。優先リスト外の ID（ラベル系など）は無視し、
 * 一部の pickable レイヤーが無い構成でも残りの相対順だけで判定する。
 */
export function layerOrderMatchesPickingPriority(
  layerIds: readonly string[],
): boolean {
  const actual = layerIds.filter((id) => PICKING_PRIORITY.includes(id));
  const expected = renderOrderFromPickingPriority(PICKING_PRIORITY)
    .filter((id) => actual.includes(id));
  if (actual.length !== expected.length) return false;
  return actual.every((id, i) => id === expected[i]);
}
