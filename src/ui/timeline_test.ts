/**
 * timeline.ts（src/ui/）のユニットテスト（TASK-146）。
 *
 * 検証する契約:
 * - setupTimeline がハンドル（reflectYear）を返し、要素欠如時は warn
 *   （文言固定）を出して no-op ハンドルへ縮退すること
 * - 目盛り（datalist）と range の index 空間が years どおりに組まれること
 * - スライダー / 前後ボタン / キーボードの要求が UI 即時反映 +
 *   onRequestYear（switchYear のコールバック注入）へ委譲されること
 * - スライダー自身へのフォーカス時はキーボードで二重発火しないこと
 * - reflectYear（applyFn からの権威ある反映）は要求を発火せず UI だけ揃えること
 */
import { assert, assertEquals, assertFalse } from "@std/assert";
import { setupTimeline } from "./timeline.ts";
import { captureWarns, FakeDocument, type FakeElement } from "./fake_dom.ts";

const YEARS = [1000, 1100, 1200] as const;

function setup(initialYear = 1000) {
  const doc = new FakeDocument();
  const root = doc.addElement("timeline");
  const yearEl = doc.addElement("timeline-year");
  const slider = doc.addElement("timeline-slider");
  const prevBtn = doc.addElement("timeline-prev");
  const nextBtn = doc.addElement("timeline-next");
  const marks = doc.addElement("timeline-marks");
  const requested: number[] = [];
  const handle = setupTimeline({
    doc,
    years: YEARS,
    initialYear,
    onRequestYear: (year) => requested.push(year),
  });
  return {
    doc,
    root,
    yearEl,
    slider,
    prevBtn,
    nextBtn,
    marks,
    requested,
    handle,
  };
}

Deno.test("要素欠如時は warn を出して no-op ハンドルを返す（文言固定）", () => {
  const doc = new FakeDocument();
  const { value: handle, warns } = captureWarns(() =>
    setupTimeline({
      doc,
      years: YEARS,
      initialYear: 1000,
      onRequestYear: () => {},
    })
  );
  assertEquals(warns, [
    "タイムライン UI 要素が見つからないため配線をスキップします",
  ]);
  handle.reflectYear(1100);
});

Deno.test("range の index 空間と datalist 目盛りを years どおりに組む", () => {
  const { slider, marks } = setup();
  assertEquals(slider.min, "0");
  assertEquals(slider.max, "2");
  assertEquals(slider.step, "1");
  assertEquals(marks.children.length, 3);
  const opts = marks.children as FakeElement[];
  assertEquals(opts[0].tag, "option");
  assertEquals(opts[0].value, "0");
  assertEquals(opts[0].label, "1000");
  assertEquals(opts[2].value, "2");
  assertEquals(opts[2].label, "1200");
});

Deno.test("初期表示を復元年に合わせる（要求は発火しない）", () => {
  const { yearEl, slider, prevBtn, nextBtn, requested } = setup(1000);
  assertEquals(yearEl.textContent, "1000");
  assertEquals(slider.value, "0");
  assert(prevBtn.disabled);
  assertFalse(nextBtn.disabled);
  assertEquals(requested, []);
});

Deno.test("スライダー input で UI 即時反映 + onRequestYear へ委譲する", () => {
  const { yearEl, slider, requested } = setup();
  slider.value = "1";
  slider.dispatch("input");
  assertEquals(requested, [1100]);
  assertEquals(yearEl.textContent, "1100");
});

Deno.test("前後ボタンで 1 段ずつ移動し、端では disabled になる", () => {
  const { slider, prevBtn, nextBtn, requested } = setup();
  nextBtn.click();
  assertEquals(requested, [1100]);
  assertEquals(slider.value, "1");
  nextBtn.click();
  assertEquals(requested, [1100, 1200]);
  assert(nextBtn.disabled);
  assertFalse(prevBtn.disabled);
  prevBtn.click();
  assertEquals(requested, [1100, 1200, 1100]);
});

Deno.test("キーボード ← → / ↑ ↓ で移動し preventDefault する", () => {
  const { doc, requested } = setup();
  const right = doc.dispatchKeydown("ArrowRight");
  assert(right.prevented);
  assertEquals(requested, [1100]);
  const up = doc.dispatchKeydown("ArrowUp");
  assert(up.prevented);
  assertEquals(requested, [1100, 1000]);
});

Deno.test("対象外キーは無視する（preventDefault もしない）", () => {
  const { doc, requested } = setup();
  const event = doc.dispatchKeydown("Enter");
  assertFalse(event.prevented);
  assertEquals(requested, []);
});

Deno.test("スライダー自身がフォーカス中の keydown は無視する（二重発火防止）", () => {
  const { doc, slider, requested } = setup();
  const event = doc.dispatchKeydown("ArrowRight", slider);
  assertFalse(event.prevented);
  assertEquals(requested, []);
});

Deno.test("reflectYear は要求を発火せず UI だけを権威ある年へ揃える", () => {
  const { yearEl, slider, prevBtn, nextBtn, requested, handle } = setup();
  handle.reflectYear(1200);
  assertEquals(requested, []);
  assertEquals(yearEl.textContent, "1200");
  assertEquals(slider.value, "2");
  assert(nextBtn.disabled);
  assertFalse(prevBtn.disabled);
});
