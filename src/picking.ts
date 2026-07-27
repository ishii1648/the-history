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

import { MOUNTAIN_HIT_LAYER_ID } from "./mountains.ts";
import { PEAK_HIT_LAYER_ID, PEAK_LAYER_ID } from "./peaks.ts";

/**
 * 山岳系のレイヤー ID は本モジュールではなく mountains.ts / peaks.ts が定義し、
 * ここでは再エクスポートするだけにする（TASK-100）。両モジュールは
 * 「その層が何を描くか」の設計根拠（判定円の半径・記号の形）と ID を一体で
 * 持っており、ID だけを picking.ts へ移すと根拠と定義が離れる。逆向きの
 * 依存（mountains/peaks → picking）を作らないので循環にはならない。
 */
export { MOUNTAIN_HIT_LAYER_ID, PEAK_HIT_LAYER_ID, PEAK_LAYER_ID };

/** 勢力圏ポリゴン（GeoJsonLayer）のレイヤー ID（TASK-5） */
export const POWER_LAYER_ID = "powers";

/** HRE（神聖ローマ帝国）主要領邦オーバーレイのレイヤー ID（TASK-19） */
export const HRE_LAYER_ID = "hre-powers";

/**
 * 中世フランス諸侯領（公領・伯領）オーバーレイのレイヤー ID（TASK-71）。
 * HRE 領邦（hre-powers）と同じ「ベースの勢力ポリゴンの上に重ねる領邦層」で、
 * 現状は対象年が排他（フランス諸侯 1000〜1300 / HRE 領邦 1500〜1700）だが、
 * 機構としては独立レイヤーとして共存する。同時表示年が生じた場合の picking は
 * PICKING_PRIORITY の並び（hre-powers > france-fiefs > powers）で一意に決まる。
 */
export const FRANCE_FIEF_LAYER_ID = "france-fiefs";

/**
 * 中世イタリア諸侯領（都市共和国・公領・辺境伯領）オーバーレイのレイヤー ID
 * （TASK-96）。出典は OpenHistoricalMap（CC0、生成は
 * scripts/build-italy-fiefs.ts → scripts/build-fief-flat.ts）。
 *
 * なぜ既存レイヤーへ合流させず独立レイヤーにするのか:
 * - hre-powers への合流は帰属の記述が壊れる。hre_fiefs_<year> は全 feature が
 *   SUBJECTO/PARTOF = Holy Roman Empire を持つ前提で、フィレンツェ・ジェノヴァ
 *   （名目は帝国内だが実質独立）やスポレート公国・アンコーナ共和国（教皇領側）を
 *   そこへ混ぜると、色キー（powers.ts colorKeyFor）も情報パネル（info.ts
 *   displayLabel）も誤った宗主を主張してしまう。
 * - france-fiefs への合流は年集合が食い違う。仏諸侯領は 1000〜1300、伊諸侯領は
 *   1000〜1492 なので、1400 / 1492 では "france-fiefs" レイヤーがイタリアの
 *   ポリゴンだけを載せることになり、レイヤー ID が実態を偽る。
 * - 独立レイヤーの追加コストは PICKING_PRIORITY / UNDER_WATER_LAYER_IDS /
 *   POWER_HIGHLIGHT_LAYER_IDS への各 1 行で、整合はいずれも既存の汎用テスト
 *   （layerOrderMatchesPickingPriority 等）がそのまま検証する。
 *
 * PICKING_PRIORITY 上の位置は powers の直上（既存 2 系統の下）。3 系統は
 * scripts/build-fief-flat.ts が幾何的に排他化するため同一ピクセルを 2 枚が
 * 覆うことは無く、オーバーレイ同士の相対順は表示・picking のどちらにも影響
 * しない。ならば既存の相対順（hre-powers > france-fiefs）を動かさない位置に
 * 置くのが最も影響が小さい。
 */
export const ITALY_FIEF_LAYER_ID = "italy-fiefs";

/** 主要都市マーカー（ScatterplotLayer）のレイヤー ID（TASK-27） */
export const CITY_LAYER_ID = "cities";

/**
 * 都市マーカーの透明ヒット層（ScatterplotLayer）のレイヤー ID（TASK-82）。
 * cities と同一データを完全透明・大半径（cities.ts CITY_HIT_RADIUS_PX）で
 * 描画する判定専用レイヤー。rivers-hit（TASK-43）と同型の仕組みで、
 * 「ホバーは直下 pick のみ・クリックだけ近傍再ピック」という非対称
 * （TASK-36 の設計判断）を、ホバー側にコストを足さずに解消する。
 *
 * PICKING_PRIORITY 上は cities（可視ドット）と rivers（可視ライン）には
 * 劣後させ、rivers-hit よりは優先させる:
 * - 可視の河川ライン直上は従来どおり河川（decision-7 / TASK-49 維持）
 * - 都市ドット直上は都市（ドット層が上なので隣接都市の判定円に負けない）
 * - 河川の判定帯（rivers-hit、±7px）と都市の判定円が重なる領域は都市。
 *   河畔都市（パリ・ルーアン等）でも「中心から一定距離以内は必ず都市」
 *   （AC #1）を成立させるため。可視ラインは rivers が最優先のままなので、
 *   見えている川をクリックできなくなる領域は生じない。
 */
export const CITY_HIT_LAYER_ID = "cities-hit";

/** 主要河川ライン（GeoJsonLayer）のレイヤー ID（TASK-24） */
export const RIVERS_LAYER_ID = "rivers";

/**
 * picking の許容半径（px）（TASK-36、TASK-51 で main.ts から移設）。
 * deck.gl Deck の pickingRadius（ホバー）・pickMultipleObjects の radius
 * （クリック時の近傍再ピック、main.ts resolveClickInfo）両方に使う値。
 * 「カーソル直下に何も無い場合」の近傍探索半径で、細い河川ライン（通常
 * 3px）でもカーソルが多少ずれた位置のクリック/ホバーを拾えるようにする
 * （TASK-24 AC #2）。
 *
 * rivers.ts の RIVER_HIT_LINE_WIDTH_PX（透明ヒットライン層の幅）とは別の
 * 実効判定幅の構成要素で、河川クリックの実効許容範囲は
 * 「ヒットライン半幅（RIVER_HIT_LINE_WIDTH_PX / 2）+ この半径」の合成になる。
 * 導出値は rivers.ts の RIVER_CLICK_TOLERANCE_PX を参照（TASK-51）。
 */
export const PICKING_RADIUS_PX = 6;

/**
 * 河川の透明ヒットライン層（GeoJsonLayer）のレイヤー ID（TASK-43）。
 * rivers と同一データを完全透明・太幅（RIVER_HIT_LINE_WIDTH_PX）で描画し、
 * 判定専用レイヤーとして重ねる。deck.gl の picking はカーソル直下オブジェクト
 * 優先で、全面を覆う powers ポリゴンの手前では rivers の実効判定幅が描画
 * ライン幅（3px）の半分程度しかなく、特にホバーが pickingRadius（直下に
 * 何も無い場合のみ効く）では補えない（TASK-36 で実測）。この層を重ねることで、
 * ホバー/クリックとも直下 pick だけで太幅分の判定幅を得る。
 *
 * PICKING_PRIORITY 上は cities より劣後させる（TASK-49）。rivers-hit は
 * 幅 14px（±7px）と太く、河畔都市（ズーム 4〜7 のパリ等）のマーカーを帯の
 * 内側に含んでしまい、cities より優先だと都市の picking を構造的に遮蔽して
 * クリック/ホバー不能にするバグがあった（TASK-49 で確認）。rivers-hit は
 * あくまで「可視の河川ライン・都市ドットのどちらの上でもない場所」を河川と
 * みなすための補助層であり、都市ドットには勝たない設計とする。
 */
export const RIVERS_HIT_LAYER_ID = "rivers-hit";

/**
 * picking の優先順（先頭が最優先）: 河川 > 都市 > 都市ヒット層 > 河川ヒット層 >
 * HRE 領邦 > 仏諸侯領 > 伊諸侯領 > 勢力（AC #4、TASK-49 で rivers-hit を cities
 * より劣後させ都市 picking の遮蔽を解消、TASK-71 で france-fiefs を powers の上に
 * 追加、TASK-82 で cities-hit を cities と rivers-hit の間に追加、TASK-96 で
 * italy-fiefs を powers の直上に追加）。
 * pickable なレイヤーだけを含む（ラベル系レイヤーは
 * pickable: false のため picking に関与せず、このリストにも含めない）。
 *
 * TASK-71: france-fiefs は powers（ベースの France ポリゴン）の上に置く。
 * 諸侯領は France ポリゴンの内側に完全に含まれるため、下に置くと常に
 * powers が勝って諸侯領をホバー/クリックできない。hre-powers との相対順は
 * 現状意味を持たない（同時表示年が無い）が、後から追加された層を上へ
 * 積む既定として hre-powers を上位に保つ。
 *
 * rivers-hit を cities の下・hre-powers/powers の上に置くことで:
 * - 可視の河川ライン（3px）直上は常に河川が最優先（従来どおり、decision-7 維持）
 * - 都市ドット直上は都市が rivers-hit の判定帯より優先（TASK-49 で解消したバグ）
 * - 帯内でラインにも都市にも乗っていない位置は rivers-hit = 河川として扱われ、
 *   TASK-43 が意図した判定幅拡大は維持される
 */
/**
 * TASK-100: 山岳 3 層（山峰マーカー peaks / 山峰判定円 peaks-hit / 山脈判定円
 * mountains-hit）を追加した。位置決めの原則は 2 つで、どちらも既存の並びから
 * 導いたもの:
 *
 * 1. **可視の記号は透明の判定層より上**。rivers（可視ライン）・cities（可視
 *    ドット）が cities-hit / rivers-hit より上にあるのと同じ理由で、可視記号
 *    peaks（▲）は透明層 3 種より上に置く。「見えている記号の直上をクリック
 *    したら必ずその記号」が保証される（TASK-49 / TASK-82 の設計を踏襲）。
 *    可視記号どうしの順は 河川 > 都市 > 山峰。地形の注記（山岳）は年代ごとに
 *    変わる主題（都市・河川）に譲るという TASK-97 / TASK-99 のラベル優先度の
 *    方針を picking にもそのまま持ち込む。
 * 2. **透明の判定層は「主題としての重み」の順**。cities-hit > peaks-hit >
 *    mountains-hit > rivers-hit。rivers-hit を最下段に据え置くのは TASK-49 の
 *    経緯そのもので、幅 14px の帯が点状の対象（都市ドット、いまは山峰・
 *    山脈のアンカーも）を飲み込み、構造的に picking 不能にするため。
 *
 * **山岳 3 層はいずれも政治ポリゴン 4 層より上**に置く（AC #1/#2）。陸上は
 * ほぼ全面が powers に覆われているので、下に置くことは「一度も拾えない」と
 * 同義になる。それでも AC #3（勢力・都市・河川の picking を妨げない）が
 * 成立するのは、山岳側の判定範囲が**面ではなく点まわりの固定 px 円**に
 * 限定されているから（mountains.ts MOUNTAIN_HIT_LAYER_ID の設計判断。
 * 山脈ポリゴンをそのまま pickable にしていたら、勢力のクリックを広範囲で
 * 奪って AC #3 を壊していた）。実際に勢力から奪う面積は、山脈が半径
 * MOUNTAIN_HIT_RADIUS_PX の円 17 個、山峰が半径 PEAK_HIT_RADIUS_PX の円で
 * 現在のズーム段に出ている件数分だけになる。
 */
export const PICKING_PRIORITY: readonly string[] = [
  RIVERS_LAYER_ID,
  CITY_LAYER_ID,
  PEAK_LAYER_ID,
  CITY_HIT_LAYER_ID,
  PEAK_HIT_LAYER_ID,
  MOUNTAIN_HIT_LAYER_ID,
  RIVERS_HIT_LAYER_ID,
  HRE_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
  ITALY_FIEF_LAYER_ID,
  POWER_LAYER_ID,
];

/**
 * layerId が河川系（rivers 本体 / rivers-hit 判定専用層）のいずれかかを
 * 判定する（TASK-43）。main.ts のホバー/クリック処理は河川名の取得元を
 * layerId === RIVERS_LAYER_ID で判定していたが、rivers-hit 追加後は
 * このヘルパーで両方をまとめて扱う。
 */
export function isRiversPickLayerId(id: string | undefined): boolean {
  return id === RIVERS_LAYER_ID || id === RIVERS_HIT_LAYER_ID;
}

/**
 * layerId が都市系（cities 可視ドット / cities-hit 判定専用層）かを判定する
 * （TASK-82）。両層は同一データ（CityMarkerDatum）を持つため、ツールチップ/
 * パネルの表示（main.ts pickedLabel）はどちらの pick でも同じ経路で扱える。
 */
export function isCityPickLayerId(id: string | undefined): boolean {
  return id === CITY_LAYER_ID || id === CITY_HIT_LAYER_ID;
}

/**
 * layerId が山峰系（peaks 可視マーカー / peaks-hit 判定専用層）かを判定する
 * （TASK-100）。両層は同一データ（PeakMarkerDatum）を持つため、
 * ツールチップ/パネルの表示はどちらの pick でも同じ経路で扱える
 * （isCityPickLayerId と同型）。
 */
export function isPeakPickLayerId(id: string | undefined): boolean {
  return id === PEAK_LAYER_ID || id === PEAK_HIT_LAYER_ID;
}

/**
 * layerId が山脈系かを判定する（TASK-100）。山脈は可視の記号を持たず
 * 判定専用層（mountains-hit）1 枚だけなので候補は 1 つだが、河川・都市・
 * 山峰と同じ形のヘルパーを置いて main.ts 側の分岐を揃える。
 */
export function isMountainPickLayerId(id: string | undefined): boolean {
  return id === MOUNTAIN_HIT_LAYER_ID;
}

/**
 * クリック時の「カーソル直下に何も無い場合の近傍再ピック」
 * （main.ts resolveClickInfo の pickMultipleObjects、半径 PICKING_RADIUS_PX）
 * の候補として採用してよいレイヤーか（TASK-82）。
 *
 * cities-hit だけを対象外にする。理由: cities-hit は「ホバーでもクリックでも
 * 直下 pick で拾える」ことを目的とした層なので、そこにさらに再ピック半径が
 * 合成されると、クリックだけ CITY_HIT_RADIUS_PX + PICKING_RADIUS_PX まで
 * 広がってホバーとの非対称（TASK-82 が解消すべき当の問題）が再発する。
 * 除外することで都市の実効判定範囲はホバー・クリックとも
 * cities.ts CITY_PICK_TOLERANCE_PX（= CITY_HIT_RADIUS_PX）で一致する。
 *
 * rivers-hit を除外しないのは、河川が「細いライン + 全面を覆う powers」という
 * 構造上、合成された余裕（rivers.ts RIVER_CLICK_TOLERANCE_PX）を意図して
 * 残している既存設計（TASK-51）だから。
 *
 * TASK-100: 山峰・山脈の判定円（peaks-hit / mountains-hit）も同じ理由で除外
 * する。どちらも「ホバーでもクリックでも直下 pick だけで拾える」ことを目的に
 * 置いた層なので、再ピック半径が合成されるとクリックだけ
 * PEAK_HIT_RADIUS_PX / MOUNTAIN_HIT_RADIUS_PX + PICKING_RADIUS_PX まで広がり、
 * ホバーとの非対称が生まれる。とくに山脈は判定円が 18px と大きく、合成すると
 * 24px になって勢力から奪う面積が 1.8 倍になる（AC #3 のコストが膨らむ）。
 */
export function isNearCursorRepickable(id: string | undefined): boolean {
  return id !== CITY_HIT_LAYER_ID && id !== PEAK_HIT_LAYER_ID &&
    id !== MOUNTAIN_HIT_LAYER_ID;
}

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
 * クリック時の半径内 picking 候補（deck.gl pickMultipleObjects 相当。カーソル
 * 直下に何もなくても近傍の pickable オブジェクトを距離順に複数返す）から、
 * PICKING_PRIORITY の最優先候補を選ぶ（TASK-36）。
 *
 * 背景: Deck レベル onClick はカーソル直下ピクセルの最前面 1 件しか返さない。
 * powers（GeoJsonLayer）が全面を覆うため、河川ライン（描画幅 2px）の外側では
 * 常に距離 0 の powers が勝ち、pickingRadius は「直下に何も無い場合」の近傍
 * 探索にしか効かない。pickMultipleObjects で半径内の候補を集め、
 * selectPreferredPick で優先順に選び直すことでこれを解消する。
 *
 * - 候補ゼロなら null
 * - layer が pickable な候補が 1 件も無ければ先頭候補（layer: null の info。
 *   何も無い場所のクリック）をそのまま返す
 * - rivers が候補に無ければ既存挙動（先頭 = カーソル直下の最前面）と同じ結果
 *   になる（render 順が PICKING_PRIORITY の逆順であるため、pickMultipleObjects
 *   の先頭候補は非 rivers 候補の中でも既に最優先の層である）
 */
/**
 * クリックの直下 pick をそのまま確定してよいレイヤーか（TASK-49）。
 * rivers/rivers-hit に加え cities も確定扱いにする: 都市ドットの直下ヒットを
 * 近傍河川の radius 再ピック（PICKING_PRIORITY で rivers > cities）が奪うと、
 * 河畔都市がクリック不能になるため。radius 再ピックは「直下が powers/HRE/空白
 * だった場合の近傍探索」に限定する。
 *
 * TASK-100: 山峰・山脈も同じ理由で確定扱いにする。アルプス周辺はローヌ川・
 * ライン川・ドナウ川・ポー川が massif を貫くので、直下で山峰・山脈を拾えて
 * いるのに近傍の河川（PICKING_PRIORITY 上位）へ奪われる状況が起きやすい。
 */
export function isDirectPickFinal(id: string | undefined): boolean {
  return isRiversPickLayerId(id) || isCityPickLayerId(id) ||
    isPeakPickLayerId(id) || isMountainPickLayerId(id);
}

export function resolveClickPick<T extends { layer: { id: string } | null }>(
  picks: readonly T[],
): T | null {
  // TASK-82: cities-hit は近傍再ピックの候補にしない（isNearCursorRepickable）。
  // 直下 pick が cities-hit なら isDirectPickFinal でここへ来ないため、ここに
  // 現れる cities-hit は「カーソルから半径 PICKING_RADIUS_PX 以内にあるが
  // 判定円の外」= ホバーでは都市を拾えない位置の候補で、採用するとクリック
  // だけ範囲が広がる。
  const considered = picks.filter((candidate) =>
    isNearCursorRepickable(candidate.layer?.id)
  );
  if (considered.length === 0) return null;
  const pickable = considered.filter(
    (candidate): candidate is T & { layer: { id: string } } =>
      candidate.layer !== null,
  );
  if (pickable.length === 0) return considered[0];
  const withLayerId = pickable.map((info) => ({
    layerId: info.layer.id,
    info,
  }));
  const best = selectPreferredPick(withLayerId);
  return best === null ? considered[0] : best.info;
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
