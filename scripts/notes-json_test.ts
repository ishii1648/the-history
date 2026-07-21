import { assert, assertEquals } from "@std/assert";
import notes from "../data/notes.json" with { type: "json" };
import { SNAPSHOT_YEARS } from "../src/config.ts";

// data/notes.json（TASK-33: 年代ごとの歴史解説パネル）の静的検証。
// CI の `deno test` は権限なしで実行されるためファイルを実行時に読まず、
// static import（name-ja_test.ts と同方式）で内容を検証する。

const years = notes.years as Record<
  string,
  { points: string[]; summary: string }
>;

Deno.test("notes.json は全 20 スナップショット年を過不足なくカバーする", () => {
  const actual = Object.keys(years).map(Number).sort((a, b) => a - b);
  assertEquals(actual, [...SNAPSHOT_YEARS]);
});

Deno.test("各年の points は 3〜5 個で全て非空文字列", () => {
  for (const [year, entry] of Object.entries(years)) {
    assert(Array.isArray(entry.points), `${year} の points が配列でない`);
    assert(
      entry.points.length >= 3 && entry.points.length <= 5,
      `${year} の points が ${entry.points.length} 個（3〜5 個が必須）`,
    );
    for (const point of entry.points) {
      assertEquals(
        typeof point,
        "string",
        `${year} の points に文字列でない要素がある`,
      );
      assert(point.trim().length > 0, `${year} の points に空文字列がある`);
    }
  }
});

Deno.test("各年の summary は非空文字列", () => {
  for (const [year, entry] of Object.entries(years)) {
    assertEquals(
      typeof entry.summary,
      "string",
      `${year} の summary が文字列でない`,
    );
    assert(entry.summary.trim().length > 0, `${year} の summary が空`);
  }
});

Deno.test("source.description は非空文字列", () => {
  assertEquals(typeof notes.source.description, "string");
  assert(notes.source.description.trim().length > 0);
});
