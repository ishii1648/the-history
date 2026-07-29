/**
 * info_panel.ts のユニットテスト（TASK-146）。
 *
 * 検証する契約:
 * - setupInfoUI がハンドル（showTooltip / hideTooltip / showInfoPanel）を返し、
 *   DOM 要素欠如時は warn（文言固定）を出して no-op ハンドルへ縮退すること
 * - ツールチップの配置が tooltipPlacement（純粋関数）+ 注入 viewport に
 *   一致すること
 * - クリックパネルの出典欄（TASK-109）が dl/dt/dd で描画され、出典 0 件では
 *   欄ごと畳まれること・href 有無でリンク/テキストが切り替わること
 */
import {
  assert,
  assertEquals,
  assertFalse,
  assertStrictEquals,
} from "@std/assert";
import { setupInfoUI } from "./info_panel.ts";
import { tooltipPlacement } from "../info.ts";
import { captureWarns, FakeDocument, type FakeElement } from "./fake_dom.ts";

/** fake 一式を組み立てて setupInfoUI を配線する */
function setup() {
  const doc = new FakeDocument();
  const tooltip = doc.addElement("info-tooltip");
  const panel = doc.addElement("info-panel");
  const panelLabel = doc.addElement("info-panel-label");
  const panelClose = doc.addElement("info-panel-close");
  const viewport = { width: 800, height: 600 };
  const handle = setupInfoUI({ doc, viewportSize: () => viewport });
  return { doc, tooltip, panel, panelLabel, panelClose, viewport, handle };
}

Deno.test("要素欠如時は warn を出して no-op ハンドルを返す（文言固定）", () => {
  const doc = new FakeDocument();
  const { value: handle, warns } = captureWarns(() =>
    setupInfoUI({ doc, viewportSize: () => ({ width: 800, height: 600 }) })
  );
  assertEquals(warns, [
    "情報表示 UI 要素が見つからないため配線をスキップします",
  ]);
  // no-op ハンドルは呼んでも例外を出さない
  handle.showTooltip("x", 0, 0);
  handle.hideTooltip();
  handle.showInfoPanel("x", []);
});

Deno.test("配線時に出典欄 dl を 1 度だけパネルへ追加し、初期は畳んでおく", () => {
  const { doc, panel } = setup();
  const dls = doc.created.filter((el) => el.tag === "dl");
  assertEquals(dls.length, 1);
  const source = dls[0];
  assertEquals(source.className, "info-panel-source");
  assert(source.hidden);
  assertStrictEquals(panel.children[0], source);
});

Deno.test("showTooltip は tooltipPlacement + viewport どおりに配置し表示する", () => {
  const { tooltip, viewport, handle } = setup();
  tooltip.rect = { width: 120, height: 40 };
  handle.showTooltip("フランス王国", 100, 200);
  assertEquals(tooltip.textContent, "フランス王国");
  assertFalse(tooltip.hidden);
  const expected = tooltipPlacement(
    { x: 100, y: 200 },
    { width: 120, height: 40 },
    viewport,
  );
  assertEquals(tooltip.style.left, `${expected.left}px`);
  assertEquals(tooltip.style.top, `${expected.top}px`);
});

Deno.test("showTooltip は viewport 右下端でフリップした座標を使う", () => {
  const { tooltip, viewport, handle } = setup();
  tooltip.rect = { width: 120, height: 40 };
  handle.showTooltip("端", 790, 590);
  const expected = tooltipPlacement(
    { x: 790, y: 590 },
    { width: 120, height: 40 },
    viewport,
  );
  assertEquals(tooltip.style.left, `${expected.left}px`);
  assertEquals(tooltip.style.top, `${expected.top}px`);
});

Deno.test("hideTooltip はツールチップを隠す", () => {
  const { tooltip, handle } = setup();
  handle.showTooltip("x", 0, 0);
  handle.hideTooltip();
  assert(tooltip.hidden);
});

Deno.test("showInfoPanel は名前と出典行（dt/dd）を描画してパネルを表示する", () => {
  const { doc, panel, panelLabel, handle } = setup();
  handle.showInfoPanel("フランス王国", [
    { key: "source", label: "出典", value: "SUBJECTO" },
    {
      key: "license",
      label: "ライセンス",
      value: "CC BY 4.0",
      href: "https://example.com/l",
    },
  ]);
  assertEquals(panelLabel.textContent, "フランス王国");
  assertFalse(panel.hidden);
  const source = doc.created.filter((el) => el.tag === "dl")[0];
  assertFalse(source.hidden);
  // dt + dd が出典行の数だけ並ぶ
  assertEquals(source.children.length, 4);
  const [dt1, dd1, dt2, dd2] = source.children as FakeElement[];
  assertEquals(dt1.tag, "dt");
  assertEquals(dt1.className, "info-panel-source-label");
  assertEquals(dt1.textContent, "出典");
  assertEquals(dd1.tag, "dd");
  assertEquals(dd1.className, "info-panel-source-value");
  // href なしはただのテキスト
  assertEquals(dd1.textContent, "SUBJECTO");
  assertEquals(dd1.children.length, 0);
  // href ありは新規タブで開く安全なリンク
  assertEquals(dt2.textContent, "ライセンス");
  const a = dd2.children[0] as FakeElement;
  assertEquals(a.tag, "a");
  assertEquals(a.href, "https://example.com/l");
  assertEquals(a.target, "_blank");
  assertEquals(a.rel, "noopener noreferrer");
  assertEquals(a.textContent, "CC BY 4.0");
});

Deno.test("showInfoPanel は出典 0 件で出典欄ごと畳む（1 行パネルへ戻す）", () => {
  const { doc, panel, handle } = setup();
  handle.showInfoPanel("ローヌ川", []);
  const source = doc.created.filter((el) => el.tag === "dl")[0];
  assert(source.hidden);
  assertEquals(source.children.length, 0);
  assertFalse(panel.hidden);
});

Deno.test("閉じるボタンでパネルを隠す", () => {
  const { panel, panelClose, handle } = setup();
  handle.showInfoPanel("x", []);
  panelClose.click();
  assert(panel.hidden);
});
