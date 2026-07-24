/**
 * 標準スモークチェック（deno task verify:smoke で使用）。
 *
 * agent-loop の「マージ後の動作確認」フェーズで、無人で以下を確認する:
 *   1. アプリ起動（__getYear が使えるまで waitFor）
 *   2. 年代切替（__setYear → 反映を waitFor）
 *   3. 河川クリック（rivers.geojson の座標を地図中心に指定して画面中央をクリック）
 *   4. エラートースト非表示の確認
 *   5. スクリーンショット保存
 *
 * dev サーバの URL は `deno run -A scripts/verify/cdp.ts <url> scripts/verify/checks/smoke.ts`
 * の <url> 引数で渡す（deno.json の "verify:smoke" タスク参照）。
 */
import type { CdpApi } from "../cdp.ts";

const SCREENSHOT_PATH = "scripts/verify/checks/.smoke-screenshot.png";

// ライン川（Rhein）上の一点。URL の zoom/center クエリでこの座標を画面中央に
// 据えることで、rivers.geojson の実座標から画面ピクセル座標を手計算する
// 必要をなくす（Mercator 手計算はズレやすいため、地図側のクエリパラメータ
// 反映機構に投影を任せる）。
const RHEIN_POINT: [number, number] = [9.12754, 47.67068];
const CLICK_ZOOM = 7;

export async function run(api: CdpApi): Promise<void> {
  const results: Record<string, unknown> = {};

  // 1. アプリ起動確認
  await api.waitForAppReady(30000);
  await api.waitFor("window.__getYear && window.__getYear() === 1000", 15000);
  const yearInitial = await api.evaluate<number>("window.__getYear()");
  results.yearInitial = yearInitial;

  // 2. 年代切替
  await api.evaluate("window.__setYear(1500)");
  await api.waitFor("window.__getYear() === 1500", 15000);
  const yearAfterSwitch = await api.evaluate<number>("window.__getYear()");
  results.yearAfterSwitch = yearAfterSwitch;

  // 3. 河川クリック
  // ライン川を画面中央に据えた URL へ再 navigate し、canvas 中央をクリックする。
  const origin = await api.evaluate<string>("location.origin");
  await api.navigate(
    `${origin}/?year=1500&zoom=${CLICK_ZOOM}&center=${RHEIN_POINT[0]},${
      RHEIN_POINT[1]
    }`,
  );
  await api.waitForAppReady(30000);
  await api.waitFor("window.__getYear() === 1500", 15000);
  const center = await api.evaluate<[number, number]>(
    "(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.width / 2, r.height / 2]; })()",
  );
  results.clickPoint = center;
  await api.click(Math.round(center[0]), Math.round(center[1]));
  await new Promise((r) => setTimeout(r, 800));
  const infoPanelLabel = await api.evaluate<string | null>(
    "document.querySelector('.info-panel-label')?.textContent ?? null",
  );
  results.infoPanelLabel = infoPanelLabel;

  // 4. エラートースト非表示の確認
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

  // 5. スクリーンショット
  await api.screenshot(SCREENSHOT_PATH);
  results.screenshot = SCREENSHOT_PATH;

  const overallOk = Boolean(
    yearInitial === 1000 &&
      yearAfterSwitch === 1500 &&
      infoPanelLabel === "ライン川" &&
      errorToastOk,
  );
  results.overallOk = overallOk;

  console.log(JSON.stringify(results, null, 2));
  console.log(overallOk ? "\n[RESULT] PASS" : "\n[RESULT] FAIL");
  if (!overallOk) {
    throw new Error("smoke check failed: see JSON output above");
  }
}
