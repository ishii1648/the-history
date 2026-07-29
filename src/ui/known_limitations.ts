/**
 * データの既知の制限一覧 UI の配線（TASK-46/52。TASK-146 で main.ts から抽出）。
 *
 * 折りたたみは attribution フッターと同一の操作性（トグル click /
 * コンテナ外 click / Escape）なので、reducer（footer.ts）ごと共通配線
 * wireCollapsiblePanel（collapsible.ts、TASK-53）を再利用する。
 * ここでは一覧の描画とハンドル（reveal / reflectYear）の提供だけを行う。
 *
 * decision-29 の方針どおり module-scope の可変状態は持たない。従来の
 * 「revealKnownLimitations / reflectYearToKnownLimitations フックへ実体を
 * 差し込む」パターンをハンドル返却へ置き換えた（limitations / currentYear は
 * setup クロージャ内の状態）。DOM 要素欠如時は warn を出して no-op ハンドル
 * へ縮退する（契約維持）。
 *
 * TASK-52: 全件表示は維持したまま、knownLimitationEntries で現在年代の
 * 該当判定（active）を付与し、該当項目だけ視覚強調する（削除ではなく配線）。
 */
import {
  type KnownLimitation,
  knownLimitationEntries,
} from "../known_limitations.ts";
import {
  type CollapsibleContent,
  type CollapsibleEventSource,
  wireCollapsiblePanel,
} from "../collapsible.ts";
import type { UiDocument } from "./dom.ts";

/** コンテナ root の最小形（HTMLElement が満たす。root 内判定に使う） */
interface ContainerElement {
  contains(target: Node | null): boolean;
}

/** トグルボタンの最小形（HTMLButtonElement が満たす。表示切替も行う） */
interface ToggleElement {
  hidden: boolean;
  setAttribute(name: string, value: string): void;
  addEventListener(type: "click", listener: () => void): void;
}

/** 一覧 ul の最小形 */
interface ListElement {
  replaceChildren(...nodes: unknown[]): void;
}

/** 一覧項目 li / バッジ span の最小形（createElement の返り値を絞り込む） */
interface ListItemElement {
  className: string;
  textContent: string | null;
  classList: { toggle(name: string, force?: boolean): boolean };
  append(...items: unknown[]): void;
}

/**
 * setupKnownLimitationsUI が返すハンドル。
 * - reveal: loadKnownLimitations 成功時にトグルボタンを表示し一覧を描画する
 *   （notes.json と同じ「未生成時はトグルごと非表示で従来表示を維持」方針）
 * - reflectYear: 年代切替の確定（applyFn。最新要求のみ到達）に追従して
 *   一覧の該当年代表示を更新する（reflectYearToNotes と同じタイミング保証。
 *   TASK-52）
 */
export interface KnownLimitationsUiHandle {
  reveal(limitations: KnownLimitation[]): void;
  reflectYear(year: number): void;
}

/** setupKnownLimitationsUI へ main.ts から注入する依存 */
export interface KnownLimitationsUiDeps {
  doc: UiDocument & CollapsibleEventSource;
}

/** 要素欠如時の縮退用 no-op ハンドル */
const NOOP_KNOWN_LIMITATIONS_UI: KnownLimitationsUiHandle = {
  reveal: () => {},
  reflectYear: () => {},
};

/** データの既知の制限一覧 UI を配線し、表示ハンドルを返す */
export function setupKnownLimitationsUI(
  deps: KnownLimitationsUiDeps,
): KnownLimitationsUiHandle {
  const { doc } = deps;
  const container = doc.getElementById(
    "known-limitations",
  ) as ContainerElement | null;
  const toggle = doc.getElementById(
    "known-limitations-toggle",
  ) as ToggleElement | null;
  const content = doc.getElementById(
    "known-limitations-content",
  ) as CollapsibleContent | null;
  const list = doc.getElementById(
    "known-limitations-list",
  ) as ListElement | null;
  if (!container || !toggle || !content || !list) {
    console.warn(
      "既知の制限 UI 要素が見つからないため配線をスキップします",
    );
    return NOOP_KNOWN_LIMITATIONS_UI;
  }

  let limitations: KnownLimitation[] = [];
  let currentYear: number | null = null;

  /**
   * 現在の limitations / currentYear を元に一覧を再描画する。
   * currentYear が未確定（switchYear 未完了）の間は年代非依存として
   * 全件 active 扱いにはせず、そもそも呼ばれない想定だが、防御的に
   * limitations が空・currentYear が null のときは何もしない。
   */
  function renderList(): void {
    if (limitations.length === 0 || currentYear === null) return;
    const entries = knownLimitationEntries(limitations, currentYear);
    list!.replaceChildren(...entries.map((entry) => {
      const li = doc.createElement("li") as ListItemElement;
      li.textContent = entry.text;
      li.classList.toggle("known-limitations-item--active", entry.active);
      if (entry.active) {
        const badge = doc.createElement("span") as ListItemElement;
        badge.className = "known-limitations-badge";
        badge.textContent = "この年代に該当";
        li.append(" ", badge);
      }
      return li;
    }));
  }

  // 折りたたみの配線（トグル / コンテナ外 click / Escape / 属性同期）は
  // attribution と同じ共通配線に委譲する（TASK-53）。Node の存在確認は
  // footer.ts（src/ui/）と同じく Deno のユニットテスト実行時の防御で、
  // ブラウザでは常に成立し従来と同一挙動になる。
  wireCollapsiblePanel({
    toggle,
    content,
    containsTarget: (target) =>
      typeof Node !== "undefined" && target instanceof Node &&
      container.contains(target),
    eventSource: doc,
  });

  return {
    // known-limitations.json のロード成功時のみトグルを表示し、一覧を描画する
    // （AC #3: 制限事項の追加はデータ編集のみで可能。全件表示は維持したまま、
    // TASK-52 で現在年代の該当項目を視覚強調する）
    reveal: (loaded) => {
      if (loaded.length === 0) return;
      limitations = loaded;
      renderList();
      toggle.hidden = false;
    },
    // AC 相当: 年代切替の確定（applyFn。最新要求のみ到達）に追従して
    // 一覧の該当年代表示を更新する。パネルの開閉状態に関わらず内容を
    // 最新化しておくことで、次回展開時は常に現在年代の判定を表示する。
    reflectYear: (year) => {
      currentYear = year;
      renderList();
    },
  };
}
