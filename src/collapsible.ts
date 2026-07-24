/**
 * 折りたたみパネルの共通配線ファクトリ（TASK-53）。
 *
 * attribution フッター（TASK-26）と既知の制限一覧（TASK-46）で同型に複製
 * されていた「イベント → reducer → aria-expanded / hidden の同期」の配線を
 * 1 箇所に集約する。状態遷移そのものは footer.ts の reducer（純粋関数）を
 * そのまま使い、このモジュールはイベント購読と属性同期だけを担う。
 * - トグル click でトグル（native button なので Enter/Space は標準動作）
 * - root 外の document click / Escape キーで折りたたみ（展開時のみ）
 * - 配線直後に初期 render を 1 回実行（aria-expanded="false"・hidden=true）
 *
 * DOM 型には直接依存せず、HTMLElement / document が構造的に満たす最小
 * インターフェースで受ける（Deno のユニットテストで fake を渡せるようにする）。
 * 「e.target が root 内か」の判定は、fake では `instanceof Node` が成立しない
 * ため注入可能な述語 containsTarget に寄せる（実呼び出し側の main.ts が
 * `target instanceof Node && root.contains(target)` を渡し、実 DOM での挙動は
 * 従来と変わらない）。
 */

import {
  ariaExpandedValue,
  createFooterState,
  type FooterEvent,
  isContentHidden,
  reduceFooterEvent,
} from "./footer.ts";

/** トグルボタンの最小インターフェース（HTMLButtonElement が満たす） */
export interface CollapsibleToggle {
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
}

/** 展開コンテンツの最小インターフェース（HTMLElement が満たす） */
export interface CollapsibleContent {
  hidden: boolean;
}

/**
 * document 相当のイベント購読口の最小インターフェース（Document が満たす）。
 * 実呼び出し側は document を渡す。
 */
export interface CollapsibleEventSource {
  addEventListener(
    type: "click",
    listener: (event: { target: unknown }) => void,
  ): void;
  addEventListener(
    type: "keydown",
    listener: (event: { key: string }) => void,
  ): void;
}

/** wireCollapsiblePanel の配線対象一式 */
export interface CollapsiblePanelOptions {
  toggle: CollapsibleToggle;
  content: CollapsibleContent;
  /**
   * click の target がパネル root 内にあるかの述語（Node でない target は
   * false を返すこと）。展開中の root 外クリック（outside-click）の判定に
   * 使う。トグル自身のクリックは root 内なのでここでは処理せず、二重発火
   * しない（従来の setupFooter / setupKnownLimitationsUI と同じ）。
   */
  containsTarget: (target: unknown) => boolean;
  eventSource: CollapsibleEventSource;
}

/**
 * 折りたたみパネルを配線する。状態遷移は footer.ts の reducer に集約されて
 * いるため、ここでは「イベント → reducer → 属性同期」だけを行う。
 */
export function wireCollapsiblePanel(options: CollapsiblePanelOptions): void {
  const { toggle, content, containsTarget, eventSource } = options;

  let state = createFooterState();

  /** 現在の状態を aria-expanded / hidden へ反映する */
  function render(): void {
    toggle.setAttribute("aria-expanded", ariaExpandedValue(state));
    content.hidden = isContentHidden(state);
  }

  function dispatch(event: FooterEvent): void {
    state = reduceFooterEvent(state, event);
    render();
  }

  toggle.addEventListener("click", () => dispatch("toggle"));

  // 展開中に root 外をクリック/タップしたら折りたたむ。
  // expanded 判定を先に行うため、折りたたみ中は containsTarget に到達しない。
  eventSource.addEventListener("click", (e) => {
    if (!state.expanded) return;
    if (containsTarget(e.target)) return;
    dispatch("outside-click");
  });

  // Escape キーで折りたたむ（未展開時は reducer が状態を変えない）
  eventSource.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!state.expanded) return;
    dispatch("escape");
  });

  render();
}
