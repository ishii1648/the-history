/**
 * スピナーとエラートースト（TASK-9, docs/app-spec.md §5.4）の DOM 配線
 * （TASK-146 で main.ts から抽出）。
 *
 * 表示可否は loading_state の状態機械から導出し、このモジュールは描画に
 * 徹する。
 * - スピナー: 進行中のロードが 1 つ以上ある間だけ表示（キャッシュヒットでは
 *   出ない）
 * - トースト: 失敗した年代があれば表示し、「再試行」で失敗年代を再取得、
 *   「閉じる」で消す
 *
 * decision-29 の方針どおり module-scope の可変状態は持たない。ロード状態
 * （loadingState）の所有と遷移は main.ts に残し、再試行 / 閉じるの動作は
 * コールバック注入（onRetry / onClose。switchYear への循環 import 回避）、
 * 反映は返却ハンドルの render(state) で受ける。従来の「renderLoadingUI
 * フックへ実体を差し込む」パターンの置き換え。DOM 要素欠如時は warn を
 * 出して no-op ハンドルへ縮退する（契約維持）。
 */
import {
  failedYears,
  hasError,
  isSpinnerVisible,
  type LoadingState,
} from "../loading_state.ts";
import type { UiDocument } from "./dom.ts";

/** スピナー / トースト要素の最小形（HTMLElement が満たす） */
interface HidableElement {
  hidden: boolean;
}

/** トースト本文の最小形 */
interface MessageElement {
  textContent: string | null;
}

/** 再試行 / 閉じるボタンの最小形（HTMLButtonElement が満たす） */
interface ButtonElement {
  addEventListener(type: "click", listener: () => void): void;
}

/** setupLoadingUI が返すハンドル。main.ts が最新のロード状態を反映する */
export interface LoadingUiHandle {
  render(state: LoadingState): void;
}

/** setupLoadingUI へ main.ts から注入する依存 */
export interface LoadingUiDeps {
  doc: UiDocument;
  /** 配線直後に描画する初期状態（main.ts 所有の loadingState） */
  initialState: LoadingState;
  /**
   * AC #3: 失敗した年代を再取得する（main.ts は failedYears を switchYear
   * へ流す）。成功すれば hasError が false になりトーストが消える。
   */
  onRetry(): void;
  /** ユーザーが明示的に閉じたら失敗集合をクリアする（再試行はしない） */
  onClose(): void;
}

/** 要素欠如時の縮退用 no-op ハンドル */
const NOOP_LOADING_UI: LoadingUiHandle = {
  render: () => {},
};

/** スピナーとエラートーストの DOM を配線し、描画ハンドルを返す */
export function setupLoadingUI(deps: LoadingUiDeps): LoadingUiHandle {
  const { doc } = deps;
  const spinner = doc.getElementById(
    "loading-spinner",
  ) as HidableElement | null;
  const toast = doc.getElementById("error-toast") as HidableElement | null;
  const toastMessage = doc.getElementById(
    "error-toast-message",
  ) as MessageElement | null;
  const retryBtn = doc.getElementById(
    "error-toast-retry",
  ) as ButtonElement | null;
  const closeBtn = doc.getElementById(
    "error-toast-close",
  ) as ButtonElement | null;
  if (!spinner || !toast || !toastMessage || !retryBtn || !closeBtn) {
    console.warn(
      "ローディング/エラー UI 要素が見つからないため配線をスキップします",
    );
    return NOOP_LOADING_UI;
  }

  const render = (state: LoadingState): void => {
    spinner.hidden = !isSpinnerVisible(state);
    if (hasError(state)) {
      const years = failedYears(state);
      toastMessage.textContent = `${
        years.join("・")
      } 年の地図データ取得に失敗しました`;
      toast.hidden = false;
    } else {
      toast.hidden = true;
    }
  };

  retryBtn.addEventListener("click", deps.onRetry);
  closeBtn.addEventListener("click", deps.onClose);

  render(deps.initialState);

  return { render };
}
