/**
 * ホバーツールチップとクリックパネルの DOM 配線（TASK-7/109/111, app-spec
 * §5.2。TASK-146 で main.ts から抽出）。
 *
 * decision-29 の方針どおり module-scope の可変状態は持たず、setupInfoUI が
 * ハンドル（showTooltip / hideTooltip / showInfoPanel）を返す。従来の
 * 「モジュールスコープの let フックへ実体を差し込む」パターンの置き換えで、
 * buildPowerLayer 等のレイヤー側は main.ts が受領したハンドルを参照する
 * （DOM 配線は 1 度だけ行う）。
 * - ツールチップ: onHover の {x, y} を使いカーソル近傍へ absolute 配置。
 *   object なしで非表示
 * - パネル: クリックで表示し続ける固定小パネル（左上）。閉じるボタンで非表示
 * どちらも displayLabel（純粋関数）で整形済みのラベルを受け取るだけにする。
 * DOM 要素欠如時は warn を出して no-op ハンドルへ縮退する（契約維持）。
 */
import { type SourceLine, tooltipPlacement } from "../info.ts";
import type { UiDocument } from "./dom.ts";

/** クリックパネルの出典欄（TASK-109）を包む要素の class 名 */
export const INFO_PANEL_SOURCE_CLASS = "info-panel-source";

/** ツールチップ要素の最小形（HTMLElement が満たす） */
interface TooltipElement {
  textContent: string | null;
  hidden: boolean;
  style: { left: string; top: string };
  getBoundingClientRect(): { width: number; height: number };
}

/** パネル要素の最小形（HTMLElement が満たす） */
interface PanelElement {
  hidden: boolean;
  appendChild(node: unknown): unknown;
}

/** パネルの名前 1 行の最小形 */
interface PanelLabelElement {
  textContent: string | null;
}

/** 閉じるボタンの最小形（HTMLButtonElement が満たす） */
interface PanelCloseElement {
  addEventListener(type: "click", listener: () => void): void;
}

/** 出典欄 dl / dt / dd / a の最小形（createElement の返り値を絞り込む） */
interface SourceNodeElement {
  className: string;
  hidden: boolean;
  textContent: string | null;
  href: string;
  target: string;
  rel: string;
  appendChild(node: unknown): unknown;
  replaceChildren(...nodes: unknown[]): void;
}

/** setupInfoUI が返すハンドル。main.ts が picking ハンドラから呼ぶ */
export interface InfoUiHandle {
  showTooltip(label: string, x: number, y: number): void;
  hideTooltip(): void;
  showInfoPanel(label: string, sources: SourceLine[]): void;
}

/** setupInfoUI へ main.ts から注入する依存 */
export interface InfoUiDeps {
  doc: UiDocument;
  /** viewport の実寸（main.ts は globalThis.innerWidth/Height を渡す） */
  viewportSize(): { width: number; height: number };
}

/** 要素欠如時の縮退用 no-op ハンドル */
const NOOP_INFO_UI: InfoUiHandle = {
  showTooltip: () => {},
  hideTooltip: () => {},
  showInfoPanel: () => {},
};

/**
 * 出典行 1 件を dt（見出し）+ dd（値）の 2 ノードにする（TASK-109）。
 * href があればリンクにし、無ければただのテキストにする。metadata 由来の
 * 文字列は textContent / href で入れるだけで、HTML としては解釈しない。
 */
function sourceLineNodes(doc: UiDocument, line: SourceLine): unknown[] {
  const dt = doc.createElement("dt") as SourceNodeElement;
  dt.className = `${INFO_PANEL_SOURCE_CLASS}-label`;
  dt.textContent = line.label;
  const dd = doc.createElement("dd") as SourceNodeElement;
  dd.className = `${INFO_PANEL_SOURCE_CLASS}-value`;
  if (line.href === undefined) {
    dd.textContent = line.value;
  } else {
    const a = doc.createElement("a") as SourceNodeElement;
    a.href = line.href;
    a.target = "_blank";
    // 新規タブへ開く外部リンクの定石（opener 経由の書き換え・リファラ漏れ防止）
    a.rel = "noopener noreferrer";
    a.textContent = line.value;
    dd.appendChild(a);
  }
  return [dt, dd];
}

/**
 * ホバーツールチップとクリックパネルの DOM を配線し、表示ハンドルを返す。
 */
export function setupInfoUI(deps: InfoUiDeps): InfoUiHandle {
  const { doc } = deps;
  const tooltip = doc.getElementById("info-tooltip") as TooltipElement | null;
  const panel = doc.getElementById("info-panel") as PanelElement | null;
  const panelLabel = doc.getElementById(
    "info-panel-label",
  ) as PanelLabelElement | null;
  const panelClose = doc.getElementById(
    "info-panel-close",
  ) as PanelCloseElement | null;
  if (!tooltip || !panel || !panelLabel || !panelClose) {
    console.warn("情報表示 UI 要素が見つからないため配線をスキップします");
    return NOOP_INFO_UI;
  }

  // TASK-111: カーソル近傍への配置は tooltipPlacement（純粋関数）に委ね、ここは
  // 実測サイズの取得と style への反映だけを行う。hidden のままでは
  // getBoundingClientRect が 0 を返すので、先に表示してから測る。折り返し後の
  // 実寸が要るため、textContent の更新より後に測ることも必須。測る前に left/top を
  // 原点へ戻すのは、絶対配置の shrink-to-fit 幅が「左端から親の右端まで」の
  // 余白に依存し、前回の右寄り座標のままだと本来より狭く折り返された幅を
  // 測ってしまうため（配置後は left + width <= viewport なので再折り返しは起きない）。
  const showTooltip = (label: string, x: number, y: number): void => {
    tooltip.textContent = label;
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    tooltip.hidden = false;
    const rect = tooltip.getBoundingClientRect();
    const { left, top } = tooltipPlacement(
      { x, y },
      { width: rect.width, height: rect.height },
      deps.viewportSize(),
    );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  const hideTooltip = (): void => {
    tooltip.hidden = true;
  };

  // TASK-109: 出典欄（見出し + 値の定義リスト）。index.html には置かず、
  // 名前 1 行だけだった従来のパネル DOM に対して 1 度だけ足す。行の中身は
  // sourceLines（純粋関数）が決めた配列をそのまま写すだけにする。
  const panelSource = doc.createElement("dl") as SourceNodeElement;
  panelSource.className = INFO_PANEL_SOURCE_CLASS;
  panelSource.hidden = true;
  panel.appendChild(panelSource);

  const showInfoPanel = (label: string, sources: SourceLine[]): void => {
    panelLabel.textContent = label;
    panelSource.replaceChildren(
      ...sources.flatMap((line) => sourceLineNodes(doc, line)),
    );
    // 出典 metadata を持たないデータ（rivers / cities / mountains 等）では
    // 行が 0 件になるので、罫線ごと出典欄を畳んで従来の 1 行パネルに戻す
    panelSource.hidden = sources.length === 0;
    panel.hidden = false;
  };

  panelClose.addEventListener("click", () => {
    panel.hidden = true;
  });

  return { showTooltip, hideTooltip, showInfoPanel };
}
