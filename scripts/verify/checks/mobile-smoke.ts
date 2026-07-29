/**
 * モバイル条件のスモークチェック（TASK-131、deno task verify:smoke:mobile で使用）。
 *
 * CDP エミュレーション（幅 375 / 高さ 812 / DPR 3 / mobile / タッチ有効。
 * cdp.ts の MOBILE_PRESET）で以下を無人確認する:
 *   1. エミュレーションの反映（innerWidth / devicePixelRatio / maxTouchPoints）
 *   2. 地図描画（canvas がビューポート相当のサイズで存在）とアプリ起動
 *   3. 年代切替（__setYear → 反映を waitFor）
 *   4. タップ相当入力（Input.dispatchTouchEvent）でポリゴン picking →
 *      情報パネル表示
 *   5. 主要 UI（タイムライン・情報パネル・トグル群）の重なり計測（報告のみ。
 *      レイアウト調整は TASK-132 の範囲のため、重なりがあってもこのチェックは
 *      失敗にしない）
 *   6. スクリーンショット保存（.outputs/claude/task131/。目視確認用）
 *
 * 使い方:
 *   deno task build && deno task serve --port 8131 &
 *   deno task verify:smoke:mobile http://localhost:8131/
 *   （直接起動する場合は
 *    `deno run -A scripts/verify/cdp.ts --device=mobile http://localhost:8131/ \
 *       scripts/verify/checks/mobile-smoke.ts`）
 */
import type { CdpApi } from "../cdp.ts";
// cdp.ts からではなく emulation.ts から import する（cdp.ts の CLI は
// top-level await 中にこのモジュールを dynamic import するため、cdp.ts への
// value import は循環参照でデッドロックする）。
import { MOBILE_PRESET } from "../emulation.ts";

/** スクリーンショット出力先ディレクトリ（gitignore 済みの .outputs/ 配下） */
export const SCREENSHOT_DIR = ".outputs/claude/task131";
/** 初期表示（年代切替後）のスクリーンショット */
export const MOBILE_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/mobile-smoke.png`;
/** タップで情報パネルを開いた状態のスクリーンショット */
export const MOBILE_TAP_SCREENSHOT_PATH = `${SCREENSHOT_DIR}/mobile-tap.png`;

// ---- 重なり計測の純ロジック（mobile-smoke_test.ts でユニットテストする） ----

/** getBoundingClientRect 相当の矩形（viewport 基準）。 */
export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** セレクタと、その要素の viewport 基準矩形。 */
export interface UiRect {
  readonly selector: string;
  readonly rect: Rect;
}

/** 重なりと見なす交差面積の下限（px^2）。角が触れる程度の微小交差を除外する。 */
export const OVERLAP_MIN_AREA_PX = 4;

/** 2 矩形の交差面積を返す（交差しなければ 0）。 */
export function rectOverlapArea(a: Rect, b: Rect): number {
  const width = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const height = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (width <= 0 || height <= 0) return 0;
  return width * height;
}

/**
 * 可視 UI 要素の矩形群から、交差面積が閾値以上のペアを列挙する純粋関数。
 * モバイル幅で UI 同士が重なって操作不能になる箇所の検出材料にする
 * （報告のみ。修正は TASK-132）。
 */
export function findOverlaps(
  rects: readonly UiRect[],
  minAreaPx: number = OVERLAP_MIN_AREA_PX,
): Array<{ a: string; b: string; area: number }> {
  const overlaps: Array<{ a: string; b: string; area: number }> = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const area = rectOverlapArea(rects[i].rect, rects[j].rect);
      if (area >= minAreaPx) {
        overlaps.push({
          a: rects[i].selector,
          b: rects[j].selector,
          area,
        });
      }
    }
  }
  return overlaps;
}

/**
 * モバイル幅で地図面を占有・相互干渉しうる主要 UI のセレクタ。
 * 非表示（hidden・display:none 等）の要素は計測時に除外する。
 */
export const UI_OVERLAP_SELECTORS: readonly string[] = [
  ".timeline",
  ".info-panel",
  ".footer-toggle",
  ".known-limitations-toggle",
  ".notes-toggle",
  ".notes-panel",
];

/** ブラウザ内で可視 UI 要素の矩形を収集する評価式を組み立てる。 */
export function buildUiRectsExpr(selectors: readonly string[]): string {
  return `(() => {
  const selectors = ${JSON.stringify(selectors)};
  const rects = [];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const style = window.getComputedStyle(el);
    if (
      el.hidden || style.display === "none" || style.visibility === "hidden"
    ) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    rects.push({
      selector,
      rect: { left: r.left, top: r.top, right: r.right, bottom: r.bottom },
    });
  }
  return rects;
})()`;
}

// smoke.ts と同じライン川（Rhein）上の一点。URL の zoom/center クエリで
// この座標を画面中央に据え、canvas 中央へのタップで picking を検証する。
const RHEIN_POINT: [number, number] = [9.12754, 47.67068];
const TAP_ZOOM = 7;

const CANVAS_CENTER_EXPR =
  "(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()";

export async function run(api: CdpApi): Promise<void> {
  const results: Record<string, unknown> = {};
  await Deno.mkdir(SCREENSHOT_DIR, { recursive: true });

  // 1. エミュレーションの反映確認
  await api.waitForAppReady(30000);
  const viewport = await api.evaluate<{
    innerWidth: number;
    innerHeight: number;
    devicePixelRatio: number;
    maxTouchPoints: number;
  }>(
    `({
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      maxTouchPoints: navigator.maxTouchPoints,
    })`,
  );
  results.viewport = viewport;
  const emulationOk = viewport.innerWidth === MOBILE_PRESET.width &&
    viewport.devicePixelRatio === MOBILE_PRESET.deviceScaleFactor &&
    viewport.maxTouchPoints > 0;
  results.emulationOk = emulationOk;

  // 2. 地図描画（canvas がビューポート幅相当で存在）
  await api.waitFor("window.__getYear && window.__getYear() === 1000", 15000);
  const canvas = await api.evaluate<
    { width: number; height: number } | null
  >(
    `(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { width: r.width, height: r.height };
    })()`,
  );
  results.canvas = canvas;
  const canvasOk = canvas !== null && canvas.width > 0 && canvas.height > 0;
  results.canvasOk = canvasOk;

  // 3. 年代切替
  await api.evaluate("window.__setYear(1500)");
  await api.waitFor("window.__getYear() === 1500", 15000);
  const yearAfterSwitch = await api.evaluate<number>("window.__getYear()");
  results.yearAfterSwitch = yearAfterSwitch;
  await api.screenshot(MOBILE_SCREENSHOT_PATH);
  results.screenshot = MOBILE_SCREENSHOT_PATH;

  // 4. タップで picking → 情報パネル表示
  // ライン川を画面中央に据えた URL へ再 navigate し、canvas 中央をタップする。
  const origin = await api.evaluate<string>("location.origin");
  await api.navigate(
    `${origin}/?year=1500&zoom=${TAP_ZOOM}&center=${RHEIN_POINT[0]},${
      RHEIN_POINT[1]
    }`,
  );
  await api.waitForAppReady(30000);
  await api.waitFor("window.__getYear() === 1500", 15000);
  const center = await api.evaluate<[number, number]>(CANVAS_CENTER_EXPR);
  results.tapPoint = center;
  await api.tap(Math.round(center[0]), Math.round(center[1]));
  await new Promise((r) => setTimeout(r, 800));
  const infoPanelLabel = await api.evaluate<string | null>(
    "document.querySelector('.info-panel-label')?.textContent ?? null",
  );
  results.infoPanelLabel = infoPanelLabel;
  await api.screenshot(MOBILE_TAP_SCREENSHOT_PATH);
  results.tapScreenshot = MOBILE_TAP_SCREENSHOT_PATH;

  // 5. UI の重なり計測（報告のみ。修正は TASK-132 の範囲）
  const uiRects = await api.evaluate<UiRect[]>(
    buildUiRectsExpr(UI_OVERLAP_SELECTORS),
  );
  results.uiRects = uiRects;
  const overlaps = findOverlaps(uiRects);
  results.overlaps = overlaps;

  // 6. エラートースト非表示の確認
  const errorToast = await api.evaluate<
    { present: boolean; visible: boolean; text: string | null }
  >(
    `(() => {
      const el = document.querySelector('.error-toast');
      if (!el) return { present: false, visible: false, text: null };
      const style = window.getComputedStyle(el);
      const visible = style.display !== 'none' &&
        style.visibility !== 'hidden' && el.offsetParent !== null;
      return { present: true, visible, text: el.textContent };
    })()`,
  );
  results.errorToast = errorToast;
  const errorToastOk = !errorToast.present || !errorToast.visible;
  results.errorToastOk = errorToastOk;

  const overallOk = Boolean(
    emulationOk &&
      canvasOk &&
      yearAfterSwitch === 1500 &&
      infoPanelLabel === "ライン川" &&
      errorToastOk,
  );
  results.overallOk = overallOk;

  console.log(JSON.stringify(results, null, 2));
  if (overlaps.length > 0) {
    console.log(
      `\n[OVERLAP] モバイル幅で UI の重なりを ${overlaps.length} 件検出` +
        "（レイアウト調整は TASK-132 の範囲。上の overlaps を参照）",
    );
  }
  console.log(overallOk ? "\n[RESULT] PASS" : "\n[RESULT] FAIL");
  if (!overallOk) {
    throw new Error("mobile smoke check failed: see JSON output above");
  }
}
