import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  createNotesState,
  isNotesPanelHidden,
  notesAriaExpanded,
  type NotesData,
  type NotesEvent,
  notesForYear,
  notesHeadingFor,
  type NotesState,
  parseNotesData,
  reduceNotesEvent,
} from "./notes.ts";

// ---- parseNotesData: fetch した JSON の受け入れ判定（AC: 欠如時はトグルごと非表示）----

Deno.test("parseNotesData は years を持つオブジェクトを受け入れる", () => {
  const json: unknown = {
    years: { "1500": { points: ["a"], summary: "s" } },
    source: { name: "x" },
  };
  const data = parseNotesData(json);
  assert(data !== null);
  assertEquals(Object.keys(data.years), ["1500"]);
});

Deno.test("parseNotesData は years が無い JSON を null にする", () => {
  assertEquals(parseNotesData({ source: {} }), null);
});

Deno.test("parseNotesData は years が object でない JSON を null にする", () => {
  assertEquals(parseNotesData({ years: "broken" }), null);
  assertEquals(parseNotesData({ years: null }), null);
});

Deno.test("parseNotesData はオブジェクト以外（null / 配列 / 文字列）を null にする", () => {
  assertEquals(parseNotesData(null), null);
  assertEquals(parseNotesData([]), null);
  assertEquals(parseNotesData("{}"), null);
});

Deno.test("parseNotesData は years が空でも受け入れない（表示する解説が無い）", () => {
  assertEquals(parseNotesData({ years: {} }), null);
});

// ---- notesForYear: 年キーの解決と不正形の扱い ----

/** テスト用の正常データ */
function validData(): NotesData {
  return {
    years: {
      "1500": {
        points: ["イタリア戦争", "スペイン統一"],
        summary: "近世の幕開け。",
      },
    },
  };
}

Deno.test("notesForYear は年に対応する points / summary を返す", () => {
  const entry = notesForYear(validData(), 1500);
  assert(entry !== null);
  assertEquals(entry.points, ["イタリア戦争", "スペイン統一"]);
  assertEquals(entry.summary, "近世の幕開け。");
});

Deno.test("notesForYear は年キーが無ければ null を返す", () => {
  assertEquals(notesForYear(validData(), 1600), null);
});

Deno.test("notesForYear はエントリがオブジェクトでなければ null を返す", () => {
  const data: NotesData = { years: { "1500": "broken" } };
  assertEquals(notesForYear(data, 1500), null);
});

Deno.test("notesForYear は points が配列でなければ null を返す", () => {
  const data: NotesData = {
    years: { "1500": { points: "not-array", summary: "s" } },
  };
  assertEquals(notesForYear(data, 1500), null);
});

Deno.test("notesForYear は summary が文字列でなければ null を返す", () => {
  const data: NotesData = {
    years: { "1500": { points: ["a"], summary: 42 } },
  };
  assertEquals(notesForYear(data, 1500), null);
});

Deno.test("notesForYear は points の非文字列要素を 1 件単位で除外する", () => {
  const data: NotesData = {
    years: { "1500": { points: ["a", 1, null, "b"], summary: "s" } },
  };
  const entry = notesForYear(data, 1500);
  assert(entry !== null);
  assertEquals(entry.points, ["a", "b"]);
});

// ---- notesHeadingFor: パネル見出し ----

Deno.test("notesHeadingFor は「1500 年」形式の見出しを返す", () => {
  assertEquals(notesHeadingFor(1500), "1500 年");
  assertEquals(notesHeadingFor(900), "900 年");
});

// ---- 折りたたみ状態 reducer（toggle / escape のみ。outside-click は非採用）----

Deno.test("createNotesState は折りたたみ状態で始まる", () => {
  assertFalse(createNotesState().expanded);
});

Deno.test("toggle は expanded を反転する（折りたたみ→展開）", () => {
  const s = reduceNotesEvent(createNotesState(), "toggle");
  assert(s.expanded);
});

Deno.test("toggle は expanded を反転する（展開→折りたたみ）", () => {
  const expanded: NotesState = { expanded: true };
  assertFalse(reduceNotesEvent(expanded, "toggle").expanded);
});

Deno.test("escape は展開時に折りたたむ", () => {
  const expanded: NotesState = { expanded: true };
  assertFalse(reduceNotesEvent(expanded, "escape").expanded);
});

Deno.test("escape は未展開時には状態を変えない", () => {
  const collapsed = createNotesState();
  assertFalse(reduceNotesEvent(collapsed, "escape").expanded);
});

Deno.test("NotesEvent は toggle / escape のみ（outside-click 非採用の型検証）", () => {
  // 地図クリック操作の多いアプリで誤閉じしないよう outside-click イベントは
  // 存在しない。型が広がったらこの網羅 Record がコンパイルエラーになる。
  const events: Record<NotesEvent, true> = { toggle: true, escape: true };
  assertEquals(Object.keys(events).length, 2);
});

Deno.test("reduceNotesEvent は元の state を破壊しない（純粋関数）", () => {
  const before: NotesState = { expanded: true };
  reduceNotesEvent(before, "toggle");
  assert(before.expanded);
});

// ---- aria-expanded / hidden の導出 ----

Deno.test("notesAriaExpanded は展開状態から 'true'/'false' を導出する", () => {
  assertEquals(notesAriaExpanded({ expanded: true }), "true");
  assertEquals(notesAriaExpanded({ expanded: false }), "false");
});

Deno.test("isNotesPanelHidden は未展開時 true・展開時 false", () => {
  assert(isNotesPanelHidden({ expanded: false }));
  assertFalse(isNotesPanelHidden({ expanded: true }));
});
