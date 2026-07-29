/**
 * タイムラインスライダー（app-spec §5.1）の DOM 配線（TASK-146 で main.ts
 * から抽出）。
 *
 * 離散スライダーの実体は `input[type=range]`（0..19 の index）で、値→年は
 * yearAtIndex。datalist で 20 目盛りを提示し、間の年は index 化できないため
 * 選べない（AC #1）。
 *
 * UI 反映の方針:
 * - ユーザー操作（要求）時は syncUI で即時に UI を更新し、操作追従性を確保する。
 * - 加えて applyFn（最新要求のみ到達）からハンドルの reflectYear 経由でも
 *   syncUI を呼ぶ。どちらの経路も「最後にユーザーが要求した年」へ収束し、
 *   遅延解決した古い要求で UI が巻き戻ることはない（switchYear のトークン
 *   ガードが古い反映を破棄するため）。
 *
 * キーボード二重発火対策:
 * - keydown は document で受けるが、フォーカスがスライダー自身の場合は何もしない。
 *   range は矢印キーで値が変わり input イベントを発火するので、そちらの経路で 1 回
 *   だけ切り替わる。二重に stepYear すると 1 打鍵で 2 年代進む不具合になるため防ぐ。
 *   TASK-25: keyToStep が ↑↓ も返すようになったが、対象キー判定は keyToStep に
 *   集約されているためこのガードはそのまま ↑↓ にも効く（縦 range の native な
 *   ↑↓ 操作とも二重にならない）。
 *
 * decision-29 の方針どおり module-scope の可変状態は持たない。年代切替の
 * 実体（switchYear。キャッシュ + 最新要求ガード）は main.ts に残し、
 * コールバック注入（onRequestYear。循環 import 回避）で受ける。従来の
 * 「reflectYearToTimeline フックへ実体を差し込む」パターンをハンドル返却へ
 * 置き換えた。DOM 要素欠如時は warn を出して no-op ハンドルへ縮退する
 * （契約維持）。
 */
import { indexOfYear, keyToStep, stepYear, yearAtIndex } from "../timeline.ts";
import type { UiDocument, UiKeydownSource } from "./dom.ts";

/** 年表示要素の最小形 */
interface YearElement {
  textContent: string | null;
}

/** range スライダーの最小形（HTMLInputElement が満たす） */
interface SliderElement {
  min: string;
  max: string;
  step: string;
  value: string;
  addEventListener(type: "input", listener: () => void): void;
}

/** 前後ボタンの最小形（HTMLButtonElement が満たす） */
interface StepButtonElement {
  disabled: boolean;
  addEventListener(type: "click", listener: () => void): void;
}

/** datalist の最小形 */
interface MarksElement {
  replaceChildren(...nodes: unknown[]): void;
}

/** 目盛り option の最小形（createElement の返り値を絞り込む） */
interface OptionElement {
  value: string;
  label: string;
}

/**
 * setupTimeline が返すハンドル。reflectYear は applyFn（最新要求のみ）からの
 * 権威ある反映で、古い要求で年表示・スライダーが巻き戻らないことを担保する
 * （TASK-6 の UI 反映タイミング）。
 */
export interface TimelineUiHandle {
  reflectYear(year: number): void;
}

/** setupTimeline へ main.ts から注入する依存 */
export interface TimelineUiDeps {
  doc: UiDocument & UiKeydownSource;
  /** スナップショット年の一覧（main.ts は SNAPSHOT_YEARS を渡す） */
  years: readonly number[];
  /** 初期表示の年（URL 復元値または INITIAL_YEAR。実データ反映は map load 後） */
  initialYear: number;
  /** 年の要求先（main.ts は `void switchYear(year)` を渡す） */
  onRequestYear(year: number): void;
}

/** 要素欠如時の縮退用 no-op ハンドル */
const NOOP_TIMELINE_UI: TimelineUiHandle = {
  reflectYear: () => {},
};

/** タイムラインスライダーを組み立てて配線し、反映ハンドルを返す */
export function setupTimeline(deps: TimelineUiDeps): TimelineUiHandle {
  const { doc, years } = deps;
  const root = doc.getElementById("timeline");
  const yearEl = doc.getElementById("timeline-year") as YearElement | null;
  const slider = doc.getElementById(
    "timeline-slider",
  ) as SliderElement | null;
  const prevBtn = doc.getElementById(
    "timeline-prev",
  ) as StepButtonElement | null;
  const nextBtn = doc.getElementById(
    "timeline-next",
  ) as StepButtonElement | null;
  const marks = doc.getElementById("timeline-marks") as MarksElement | null;
  if (!root || !yearEl || !slider || !prevBtn || !nextBtn || !marks) {
    console.warn("タイムライン UI 要素が見つからないため配線をスキップします");
    return NOOP_TIMELINE_UI;
  }

  const lastIndex = years.length - 1;

  // 20 目盛りを datalist に展開し、range の上限を index 空間に合わせる（AC #1）。
  slider.min = "0";
  slider.max = String(lastIndex);
  slider.step = "1";
  marks.replaceChildren(
    ...years.map((year, i) => {
      const opt = doc.createElement("option") as OptionElement;
      opt.value = String(i);
      opt.label = String(year);
      return opt;
    }),
  );

  /** 年に合わせて年表示・スライダー位置・端ボタン活性を揃える（要求/反映の共通経路） */
  function syncUI(year: number): void {
    const idx = indexOfYear(years, year);
    yearEl!.textContent = String(year);
    if (idx >= 0) slider!.value = String(idx);
    prevBtn!.disabled = idx <= 0;
    nextBtn!.disabled = idx >= lastIndex;
  }

  /** スライダーの現在 index から現在年を得る */
  function currentYear(): number {
    return yearAtIndex(years, Number(slider!.value));
  }

  /** 年を要求する: UI を即時反映し、switchYear（キャッシュ + 最新要求ガード）へ委譲 */
  function requestYear(year: number): void {
    syncUI(year);
    deps.onRequestYear(year);
  }

  // AC #2: ドラッグ / 目盛りクリック → range の input イベント
  slider.addEventListener("input", () => {
    requestYear(yearAtIndex(years, Number(slider.value)));
  });

  // AC #2: 前後ボタン（端では stepYear が停止し、ボタンも disabled になる）
  prevBtn.addEventListener("click", () => {
    requestYear(stepYear(years, currentYear(), -1));
  });
  nextBtn.addEventListener("click", () => {
    requestYear(stepYear(years, currentYear(), 1));
  });

  // AC #2: キーボード ← → / ↑ ↓（↑=古い方向・↓=新しい方向。縦レイアウトの
  // 上=古い並びと一致させる。スライダー自身にフォーカスがある時は native + input に委ねる）
  doc.addEventListener("keydown", (e) => {
    const step = keyToStep(e.key);
    if (step === 0) return;
    if (e.target === slider) return; // 二重発火防止（range の input が処理する）
    e.preventDefault();
    requestYear(stepYear(years, currentYear(), step));
  });

  // 初期表示を復元年（URL または INITIAL_YEAR）に合わせる（実データ反映は
  // map load 後の switchYear）
  syncUI(deps.initialYear);

  // applyFn（最新要求のみ）からの権威ある反映をこの UI に差し込む
  return { reflectYear: syncUI };
}
