/**
 * notes.ts（src/ui/）のユニットテスト（TASK-146）。
 *
 * 検証する契約:
 * - setupNotesUI がハンドル（reflectYear / revealToggle）を返し、要素欠如時は
 *   warn（文言固定）を出して no-op ハンドルへ縮退すること
 * - 開閉が notes.ts の reducer どおり（toggle / Escape。outside-click では
 *   閉じない）に配線されること
 * - reflectYear が確定年の見出し・箇条書き・まとめを描画し、解説欠落時は
 *   案内文へ倒れること（TASK-33）
 * - notesData は getter 注入（所有は main.ts）で、revealToggle が確定済みの
 *   年を再描画すること
 */
import { assert, assertEquals, assertFalse } from "@std/assert";
import { setupNotesUI } from "./notes.ts";
import { type NotesData, notesHeadingFor } from "../notes.ts";
import { captureWarns, FakeDocument, type FakeElement } from "./fake_dom.ts";

const NOTES: NotesData = {
  years: {
    "1000": {
      points: ["カペー朝の成立", "神聖ローマ帝国の伸長"],
      summary: "西欧の再編期。",
    },
  },
};

function setup(getNotesData: () => NotesData | null = () => NOTES) {
  const doc = new FakeDocument();
  const toggle = doc.addElement("notes-toggle");
  toggle.hidden = true;
  const panel = doc.addElement("notes-panel");
  const heading = doc.addElement("notes-heading");
  const points = doc.addElement("notes-points");
  const summary = doc.addElement("notes-summary");
  const handle = setupNotesUI({ doc, getNotesData });
  return { doc, toggle, panel, heading, points, summary, handle };
}

Deno.test("要素欠如時は warn を出して no-op ハンドルを返す（文言固定）", () => {
  const doc = new FakeDocument();
  const { value: handle, warns } = captureWarns(() =>
    setupNotesUI({ doc, getNotesData: () => null })
  );
  assertEquals(warns, ["解説 UI 要素が見つからないため配線をスキップします"]);
  handle.reflectYear(1000);
  handle.revealToggle();
});

Deno.test("配線直後は折りたたみ状態（aria-expanded=false / hidden）", () => {
  const { toggle, panel } = setup();
  assertEquals(toggle.attributes.get("aria-expanded"), "false");
  assert(panel.hidden);
});

Deno.test("トグル click で開閉し、aria-expanded / hidden が同期する", () => {
  const { toggle, panel } = setup();
  toggle.click();
  assertEquals(toggle.attributes.get("aria-expanded"), "true");
  assertFalse(panel.hidden);
  toggle.click();
  assert(panel.hidden);
});

Deno.test("展開中の Escape で折りたたむ（未展開時は何もしない）", () => {
  const { doc, toggle, panel } = setup();
  doc.dispatchKeydown("Escape");
  assert(panel.hidden);
  toggle.click();
  doc.dispatchKeydown("Escape");
  assert(panel.hidden);
  assertEquals(toggle.attributes.get("aria-expanded"), "false");
});

Deno.test("展開中の outside-click では閉じない（地図操作で誤って閉じない）", () => {
  const { doc, toggle, panel } = setup();
  toggle.click();
  doc.dispatchClick("outside-node");
  assertFalse(panel.hidden);
});

Deno.test("reflectYear は確定年の見出し・箇条書き・まとめを描画する", () => {
  const { heading, points, summary, handle } = setup();
  handle.reflectYear(1000);
  assertEquals(heading.textContent, notesHeadingFor(1000));
  assertEquals(points.children.length, 2);
  const [p1, p2] = points.children as FakeElement[];
  assertEquals(p1.tag, "li");
  assertEquals(p1.textContent, "カペー朝の成立");
  assertEquals(p2.textContent, "神聖ローマ帝国の伸長");
  assertEquals(summary.textContent, "西欧の再編期。");
});

Deno.test("解説が無い年は箇条書きを空にして案内文へ倒す", () => {
  const { points, summary, handle } = setup();
  handle.reflectYear(1100);
  assertEquals(points.children.length, 0);
  assertEquals(summary.textContent, "この年代の解説はまだありません。");
});

Deno.test("notesData 未ロード（null）でも案内文で継続する", () => {
  const { summary, handle } = setup(() => null);
  handle.reflectYear(1000);
  assertEquals(summary.textContent, "この年代の解説はまだありません。");
});

Deno.test("revealToggle はトグルを表示し、確定済みの年を再描画する", () => {
  // ロード完了前に年が確定したケース: getter が null → データ有りへ変わる
  let data: NotesData | null = null;
  const { toggle, summary, handle } = setup(() => data);
  handle.reflectYear(1000);
  assertEquals(summary.textContent, "この年代の解説はまだありません。");
  data = NOTES;
  handle.revealToggle();
  assertFalse(toggle.hidden);
  assertEquals(summary.textContent, "西欧の再編期。");
});

Deno.test("revealToggle は年未確定なら表示だけ行う（描画はしない）", () => {
  const { toggle, heading, handle } = setup();
  handle.revealToggle();
  assertFalse(toggle.hidden);
  assertEquals(heading.textContent, "");
});
