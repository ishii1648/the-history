/**
 * 勢力・領邦ポリゴンのアクティブ強調（ホバー/クリック）の DOM・deck.gl 非依存な
 * 純粋ロジック（TASK-90）。
 * - 強調キーの解決（powerHighlightKey。適用単位の定義そのもの）
 * - クリックの保持・解除規則（togglePowerSelection）
 * - アクティブ判定と塗り色（isPowerActive / powerFillColor）
 * - 変化検知つきの状態保持（createPowerHighlightStore）
 *
 * HRE 帝国範囲の強調（hre_extent.ts、TASK-30）は「HRE という 1 勢力の外縁を
 * 臙脂の線で囲む」別建ての表現で、本モジュールは「ホバー/クリックした任意の
 * 勢力・領邦の塗り自体を変える」表現を担う。両者はレイヤーも色域も分かれて
 * いるため同時に成立する（AC #5）。
 *
 * 参照仕様: docs/app-spec.md §3.3 / §5.2
 */

import type { GeoJsonProperties } from "geojson";
import { colorKeyFor, fillColorFor, type Rgba } from "./powers.ts";
import {
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
  POWER_LAYER_ID,
} from "./picking.ts";

/**
 * アクティブ強調の対象になるレイヤー（政治ポリゴンの 3 層）。
 * 河川・都市・判定専用層・ラベル層は対象外（それぞれ固有の強調表現を持つか、
 * そもそも「国土の広がり」を持たない）。
 */
export const POWER_HIGHLIGHT_LAYER_IDS: readonly string[] = [
  POWER_LAYER_ID,
  HRE_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
];

/**
 * アクティブ時の塗り色（緑青＝ヴェルディグリ #2e6e66、alpha 214）。
 *
 * 色の選定（TASK-90 AC #8。TASK-73 / TASK-74 の褪せ顔料・古地図トーン方針に沿う）:
 * - 緑青（銅の錆）は古地図の彩色に実在した顔料で、羊皮紙トーンの下地
 *   （basemap.ts PARCHMENT_FLAVOR_OVERRIDES）と同じ「褪せた顔料」の系統に収まる。
 *   蛍光的な選択色（純シアン・純黄など）を使わずに済み、地図全体の質感を壊さない。
 * - 既存の強調色と色相が離れている: HRE 帝国範囲の臙脂 [140,30,30]（main.ts
 *   HRE_EXTENT_LINE_COLOR）・諸侯領境界の藍紫 [74,42,130]（main.ts
 *   FIEF_LINE_COLOR）・河川選択の赤茶 [122,46,34]（rivers.ts）のいずれとも
 *   色相が 60 度以上離れる（単体テストで固定）。「臙脂の外縁 = 帝国範囲」
 *   「藍紫の細線 = 諸侯領の区画」「緑青の塗り = いま指している勢力の国土」が
 *   同時に出ても読み分けられる。
 * - alpha は通常塗り（powers.ts FILL_ALPHA = 128）より高い 214。勢力ごとの
 *   固有色（colors.json）を実質的に覆い隠すことで、飛び地を含む同一勢力の
 *   範囲が「1 つの面」として一目で読める。完全不透明にしないのは、下地の
 *   陰影・概略境界・領邦境界を残して地図としての情報を失わせないため。
 */
export const ACTIVE_FILL_COLOR: Rgba = [46, 110, 102, 214];

/** 年代切替時の塗りフェード時間（ms）。従来からの値（docs/app-spec.md §5.1） */
export const YEAR_FILL_TRANSITION_MS = 400;

/**
 * 強調の変化に使う塗りの遷移時間（ms）。
 *
 * 年代切替のフェード（400ms）をそのままホバー強調へ流用すると、カーソルを
 * 動かすたびに色が遅れて追いつく「反応が鈍い」表示になる（deck.gl の
 * transitions は accessor 単位で、getFillColor 一本に両方の用途が乗る）。
 * そこで renderLayers の呼び出し要因に応じて duration を切り替え、強調では
 * 120ms（知覚上ほぼ即時だが、切り替えの硬さを取る程度）を使う。0 にしない
 * のは、パリパリと切り替わる印象を避けて古地図トーンの落ち着きを保つため。
 */
export const HIGHLIGHT_FILL_TRANSITION_MS = 120;

/**
 * picking 結果から強調キーを解決する（純粋関数）。
 *
 * 適用単位の決定（AC #4）: feature 単位ではなく **勢力キー単位**
 * （powers.ts colorKeyFor と同一のキー = NAME もしくは "NAME|SUBJECTO"）。
 * - 要望は「国土（領域）の広がりが一目で分かる」ことで、飛び地・島嶼で複数
 *   feature に分かれる勢力（イングランド + 大陸領、デンマーク等）を同時に
 *   強調しなければ「国土」にならない。
 * - キーを colorKeyFor と同一にすることで「同じ色で塗られている面が全部
 *   アクティブ色になる」が構造的に保証され、塗り分けと強調の単位が食い違わない。
 * - hre-powers / france-fiefs の領邦は colorKeyFor が親と別のキー
 *   （"Bavaria|Holy Roman Empire" / "Normandy"）を返すため、親勢力（HRE 本体・
 *   France 本体）とは独立に強調される。領邦をホバーしたときに帝国全体が
 *   塗り潰されると、TASK-30 の帝国範囲強調（臙脂の外縁）と情報が二重になり
 *   範囲が読めなくなる（AC #5）。
 * - レイヤー ID でキーを修飾しない（"powers:France" のようにしない）のは、
 *   同一勢力が base と領邦オーバーレイの双方に現れる場合でも同じ国土として
 *   同時に光るのが自然なため。
 *
 * 対象外レイヤー（河川・都市・判定専用層）や NAME を持たない feature は null。
 */
export function powerHighlightKey(
  layerId: string | undefined,
  props: GeoJsonProperties | undefined,
): string | null {
  if (layerId === undefined) return null;
  if (!POWER_HIGHLIGHT_LAYER_IDS.includes(layerId)) return null;
  return colorKeyFor(props ?? null);
}

/**
 * クリックによる強調選択の遷移（純粋関数）。rivers.ts の toggleRiverSelection と
 * 同一の規則にし、河川とポリゴンで「クリックの意味」を揃える。
 * - 選択中と同じ勢力を再クリック → 解除（null）
 * - 別の勢力をクリック → その勢力へ移動
 * - 強調対象でないクリック（河川・都市・何も無い場所 = clickedKey が null）→ 解除
 */
export function togglePowerSelection(
  current: string | null,
  clickedKey: string | null,
): string | null {
  if (clickedKey === null) return null;
  return current === clickedKey ? null : clickedKey;
}

/**
 * 強調キーがアクティブ（選択中またはホバー中）かを判定する（純粋関数）。
 *
 * 選択とホバーを OR で扱う（rivers.ts のように「選択 > ホバー」の段階を作らない）
 * 理由: 強調はアクティブ色 1 段階のみで、段階を分ける表現差が無い。選択中に
 * 別の勢力へホバーしたときは両方がアクティブ色になるが、これは河川で
 * 「選択中の川を残したままホバー中の川も強調される」のと同じ挙動で、
 * ホバーのフィードバックがクリック後に死なないという利点がある。
 * キーが null（NAME を持たない feature）は決してアクティブにしない。
 */
export function isPowerActive(
  key: string | null,
  selected: string | null,
  hovered: string | null,
): boolean {
  if (key === null) return false;
  return key === selected || key === hovered;
}

/**
 * 政治ポリゴンの塗り色を決める（純粋関数）。アクティブならアクティブ色、
 * それ以外は従来どおり colors.json 由来の勢力色（powers.ts fillColorFor）。
 * 3 層（powers / hre-powers / france-fiefs）で共用する。
 */
export function powerFillColor(
  props: GeoJsonProperties,
  colors: Record<string, string>,
  selected: string | null,
  hovered: string | null,
): Rgba {
  if (isPowerActive(colorKeyFor(props), selected, hovered)) {
    return ACTIVE_FILL_COLOR;
  }
  return fillColorFor(props, colors);
}

/** 強調状態（選択・ホバー）の保持と変化検知 */
export interface PowerHighlightStore {
  /** クリックで選択中の強調キー（null は未選択） */
  selected(): string | null;
  /** ホバー中の強調キー（null はホバーなし） */
  hovered(): string | null;
  /** ホバー状態を更新する。変化した場合のみ onChange を呼ぶ */
  hover(key: string | null): void;
  /** クリックを反映する（togglePowerSelection の規則）。変化時のみ onChange */
  click(key: string | null): void;
  /** 選択・ホバーをまとめて解除する（年代切替など）。変化時のみ onChange */
  clear(): void;
}

/**
 * 強調状態のストアを作る（TASK-90 AC #3/#7）。
 *
 * onChange（main.ts では renderLayers）は **値が実際に変わったときだけ** 呼ぶ。
 * ホバーは mousemove ごとに発火するため、この変化検知を外すと TASK-50 と同じ
 * 「ホバーのたびに全レイヤー再構築」の性能退行になる。clear は選択・ホバーの
 * 両方を落とすが、onChange は最大 1 回（再構築をまとめる）。
 */
export function createPowerHighlightStore(
  onChange: () => void,
): PowerHighlightStore {
  let selectedKey: string | null = null;
  let hoveredKey: string | null = null;

  return {
    selected: () => selectedKey,
    hovered: () => hoveredKey,
    hover(key) {
      if (key === hoveredKey) return;
      hoveredKey = key;
      onChange();
    },
    click(key) {
      const next = togglePowerSelection(selectedKey, key);
      if (next === selectedKey) return;
      selectedKey = next;
      onChange();
    },
    clear() {
      if (selectedKey === null && hoveredKey === null) return;
      selectedKey = null;
      hoveredKey = null;
      onChange();
    },
  };
}
