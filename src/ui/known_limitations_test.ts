/**
 * known_limitations.ts（src/ui/）のユニットテスト（TASK-146）。
 *
 * 検証する契約:
 * - setupKnownLimitationsUI がハンドル（reveal / reflectYear）を返し、
 *   要素欠如時は warn（文言固定）を出して no-op ハンドルへ縮退すること
 * - reveal はロード成功（1 件以上）のときだけトグルを表示すること（TASK-46）
 * - reflectYear で全件表示のまま現在年代の該当項目だけ強調 + バッジ付与
 *   されること（TASK-52）
 * - 折りたたみが wireCollapsiblePanel（TASK-53）へ配線されていること
 */
import { assert, assertEquals, assertFalse } from "@std/assert";
import { setupKnownLimitationsUI } from "./known_limitations.ts";
import type { KnownLimitation } from "../known_limitations.ts";
import { captureWarns, FakeDocument, type FakeElement } from "./fake_dom.ts";

const LIMITATIONS: KnownLimitation[] = [
  { id: "always", text: "全年代で共通の制限" },
  { id: "medieval", years: { from: 1000, to: 1300 }, text: "中世のみの制限" },
];

function setup() {
  const doc = new FakeDocument();
  const container = doc.addElement("known-limitations");
  const toggle = doc.addElement("known-limitations-toggle");
  toggle.hidden = true;
  const content = doc.addElement("known-limitations-content");
  const list = doc.addElement("known-limitations-list");
  const handle = setupKnownLimitationsUI({ doc });
  return { doc, container, toggle, content, list, handle };
}

Deno.test("要素欠如時は warn を出して no-op ハンドルを返す（文言固定）", () => {
  const doc = new FakeDocument();
  const { value: handle, warns } = captureWarns(() =>
    setupKnownLimitationsUI({ doc })
  );
  assertEquals(warns, [
    "既知の制限 UI 要素が見つからないため配線をスキップします",
  ]);
  handle.reveal(LIMITATIONS);
  handle.reflectYear(1000);
});

Deno.test("reveal は空配列ではトグルを表示しない（縮退時は従来表示のまま）", () => {
  const { toggle, handle } = setup();
  handle.reveal([]);
  assert(toggle.hidden);
});

Deno.test("reveal はトグルを表示する（年未確定の間は一覧を描かない）", () => {
  const { toggle, list, handle } = setup();
  handle.reveal(LIMITATIONS);
  assertFalse(toggle.hidden);
  assertEquals(list.children.length, 0);
});

Deno.test("reflectYear で全件表示 + 該当項目の強調とバッジ付与", () => {
  const { list, handle } = setup();
  handle.reveal(LIMITATIONS);
  handle.reflectYear(1200);
  assertEquals(list.children.length, 2);
  const [always, medieval] = list.children as FakeElement[];
  assertEquals(always.tag, "li");
  assertEquals(always.textContent, "全年代で共通の制限");
  assert(always.classes.has("known-limitations-item--active"));
  assertEquals(medieval.textContent, "中世のみの制限");
  assert(medieval.classes.has("known-limitations-item--active"));
  // バッジは active な項目にだけ付く（" " 区切りで append）
  const badge = medieval.children[1] as FakeElement;
  assertEquals(badge.tag, "span");
  assertEquals(badge.className, "known-limitations-badge");
  assertEquals(badge.textContent, "この年代に該当");
});

Deno.test("reflectYear は非該当年で強調を外す（バッジも付かない）", () => {
  const { list, handle } = setup();
  handle.reveal(LIMITATIONS);
  handle.reflectYear(1500);
  const [, medieval] = list.children as FakeElement[];
  assertFalse(medieval.classes.has("known-limitations-item--active"));
  assertEquals(medieval.children.length, 0);
});

Deno.test("reveal 前の reflectYear では一覧を描かない（防御的措置）", () => {
  const { list, handle } = setup();
  handle.reflectYear(1000);
  assertEquals(list.children.length, 0);
});

Deno.test("折りたたみが配線されている（トグル click で展開）", () => {
  const { toggle, content } = setup();
  assertEquals(toggle.attributes.get("aria-expanded"), "false");
  assert(content.hidden);
  toggle.click();
  assertEquals(toggle.attributes.get("aria-expanded"), "true");
  assertFalse(content.hidden);
});
