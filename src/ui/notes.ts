/**
 * 年代解説パネルの DOM 配線（TASK-33。TASK-146 で main.ts から抽出）。
 *
 * 状態遷移は notes.ts の reducer（純粋関数）に集約し、ここでは
 * 「イベント → reducer → aria-expanded / hidden の同期」と内容描画だけを行う。
 * - 「解説」トグル click で開閉（native button なので Enter/Space は標準動作）
 * - Escape キーで折りたたみ（展開時のみ）
 * - outside-click では閉じない（地図クリック操作で解説が誤って閉じないため。
 *   方針は notes.ts の先頭コメント参照）
 *
 * decision-29 の方針どおり module-scope の可変状態は持たない。解説データ
 * （notesData）の所有は main.ts に残し、getter（getNotesData）で注入される。
 * 従来の「reflectYearToNotes / revealNotesToggle フックへ実体を差し込む」
 * パターンをハンドル返却へ置き換えた。DOM 要素欠如時は warn を出して no-op
 * ハンドルへ縮退する（契約維持）。
 */
import {
  createNotesState,
  isNotesPanelHidden,
  notesAriaExpanded,
  type NotesData,
  type NotesEvent,
  notesForYear,
  notesHeadingFor,
  reduceNotesEvent,
} from "../notes.ts";
import type { UiDocument, UiKeydownSource } from "./dom.ts";

/** トグルボタンの最小形（HTMLButtonElement が満たす） */
interface ToggleElement {
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
}

/** パネル要素の最小形 */
interface PanelElement {
  hidden: boolean;
}

/** 見出し・まとめ要素の最小形 */
interface TextElement {
  textContent: string | null;
}

/** 箇条書き ul の最小形 */
interface PointsElement {
  replaceChildren(...nodes: unknown[]): void;
}

/** 箇条書き li の最小形（createElement の返り値を絞り込む） */
interface ListItemElement {
  textContent: string | null;
}

/**
 * setupNotesUI が返すハンドル。
 * - reflectYear: applyFn（最新要求のみ）から呼ばれ、確定した年の解説へ
 *   内容を差し替える（reflectYearToTimeline と同じタイミング保証）
 * - revealToggle: loadNotes 成功時にトグルボタンを表示する（欠如時は
 *   hidden のまま）
 */
export interface NotesUiHandle {
  reflectYear(year: number): void;
  revealToggle(): void;
}

/** setupNotesUI へ main.ts から注入する依存 */
export interface NotesUiDeps {
  doc: UiDocument & UiKeydownSource;
  /** 解説データの getter（所有は main.ts。取得失敗・未生成時は null） */
  getNotesData(): NotesData | null;
}

/** 要素欠如時の縮退用 no-op ハンドル */
const NOOP_NOTES_UI: NotesUiHandle = {
  reflectYear: () => {},
  revealToggle: () => {},
};

/** 年代解説パネルの DOM を配線し、表示ハンドルを返す */
export function setupNotesUI(deps: NotesUiDeps): NotesUiHandle {
  const { doc, getNotesData } = deps;
  const toggle = doc.getElementById("notes-toggle") as ToggleElement | null;
  const panel = doc.getElementById("notes-panel") as PanelElement | null;
  const heading = doc.getElementById("notes-heading") as TextElement | null;
  const points = doc.getElementById("notes-points") as PointsElement | null;
  const summary = doc.getElementById("notes-summary") as TextElement | null;
  if (!toggle || !panel || !heading || !points || !summary) {
    console.warn("解説 UI 要素が見つからないため配線をスキップします");
    return NOOP_NOTES_UI;
  }

  let state = createNotesState();
  let currentYear: number | null = null;

  /** 現在の状態を aria-expanded / hidden へ反映する */
  function render(): void {
    toggle!.setAttribute("aria-expanded", notesAriaExpanded(state));
    panel!.hidden = isNotesPanelHidden(state);
  }

  /**
   * 指定年の解説を見出し・箇条書き・まとめへ描画する。
   * その年の解説が欠落・不正形（notesForYear が null）の場合は箇条書きを
   * 空にして案内文だけ出す（データ契約上は全 20 年分あるため防御的措置）。
   */
  function renderContent(year: number): void {
    heading!.textContent = notesHeadingFor(year);
    const notesData = getNotesData();
    const entry = notesData === null ? null : notesForYear(notesData, year);
    if (entry === null) {
      points!.replaceChildren();
      summary!.textContent = "この年代の解説はまだありません。";
      return;
    }
    points!.replaceChildren(...entry.points.map((p) => {
      const li = doc.createElement("li") as ListItemElement;
      li.textContent = p;
      return li;
    }));
    summary!.textContent = entry.summary;
  }

  function dispatch(event: NotesEvent): void {
    state = reduceNotesEvent(state, event);
    render();
  }

  toggle.addEventListener("click", () => dispatch("toggle"));

  // Escape キーで折りたたむ（未展開時は何もしない）
  doc.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!state.expanded) return;
    dispatch("escape");
  });

  render();

  return {
    // AC #1: 年代切替の確定（applyFn。最新要求のみ到達）に追従して内容を
    // 差し替える。展開中でも即時に新しい年の解説へ切り替わる。
    reflectYear: (year) => {
      currentYear = year;
      renderContent(year);
    },
    // notes.json のロード成功時のみトグルを表示する。ロード前に年が確定して
    // いた場合（通常は Promise.all で先にロードが終わるため起きない）にも
    // 備えて内容を描き直す。
    revealToggle: () => {
      toggle.hidden = false;
      if (currentYear !== null) renderContent(currentYear);
    },
  };
}
