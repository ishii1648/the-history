import { assertEquals } from "@std/assert";
import { SNAPSHOT_YEARS } from "./config.ts";
import {
  clampIndex,
  indexOfYear,
  keyToStep,
  stepYear,
  yearAtIndex,
} from "./timeline.ts";

const YEARS = [900, 1000, 1100, 1200] as const;

Deno.test("clampIndex は範囲内の index をそのまま返す", () => {
  assertEquals(clampIndex(2, 4), 2);
});

Deno.test("clampIndex は下限未満を 0 にクランプする", () => {
  assertEquals(clampIndex(-3, 4), 0);
});

Deno.test("clampIndex は上限超過を length-1 にクランプする", () => {
  assertEquals(clampIndex(9, 4), 3);
});

Deno.test("clampIndex は小数を切り捨てる", () => {
  assertEquals(clampIndex(2.9, 4), 2);
});

Deno.test("clampIndex は length が 0 なら 0 を返す", () => {
  assertEquals(clampIndex(5, 0), 0);
});

Deno.test("yearAtIndex は index に対応する年を返す", () => {
  assertEquals(yearAtIndex(YEARS, 0), 900);
  assertEquals(yearAtIndex(YEARS, 3), 1200);
});

Deno.test("yearAtIndex は範囲外 index を端の年にクランプする", () => {
  assertEquals(yearAtIndex(YEARS, -1), 900);
  assertEquals(yearAtIndex(YEARS, 99), 1200);
});

Deno.test("indexOfYear は実在年の index を返す", () => {
  assertEquals(indexOfYear(YEARS, 1100), 2);
});

Deno.test("indexOfYear は実在しない年（間の年）で -1 を返す", () => {
  assertEquals(indexOfYear(YEARS, 1050), -1);
});

Deno.test("stepYear は中間で前後の年へ移動する", () => {
  assertEquals(stepYear(YEARS, 1000, 1), 1100);
  assertEquals(stepYear(YEARS, 1000, -1), 900);
});

Deno.test("stepYear は先頭で -1 しても先頭のまま停止する", () => {
  assertEquals(stepYear(YEARS, 900, -1), 900);
});

Deno.test("stepYear は末尾で +1 しても末尾のまま停止する", () => {
  assertEquals(stepYear(YEARS, 1200, 1), 1200);
});

Deno.test("stepYear は実在しない年ではそのまま返す", () => {
  assertEquals(stepYear(YEARS, 1050, 1), 1050);
});

Deno.test("keyToStep は ArrowLeft を -1 に写す", () => {
  assertEquals(keyToStep("ArrowLeft"), -1);
});

Deno.test("keyToStep は ArrowRight を +1 に写す", () => {
  assertEquals(keyToStep("ArrowRight"), 1);
});

// TASK-25: 縦タイムライン（上=古い/下=新しい）に合わせ ↑↓ でも移動できる
Deno.test("keyToStep は ArrowUp を -1（古い方向）に写す", () => {
  assertEquals(keyToStep("ArrowUp"), -1);
});

Deno.test("keyToStep は ArrowDown を +1（新しい方向）に写す", () => {
  assertEquals(keyToStep("ArrowDown"), 1);
});

Deno.test("keyToStep は矢印以外を 0 に写す", () => {
  assertEquals(keyToStep("a"), 0);
  assertEquals(keyToStep("Enter"), 0);
  assertEquals(keyToStep("PageUp"), 0);
  assertEquals(keyToStep("Home"), 0);
});

Deno.test("SNAPSHOT_YEARS 全域で stepYear が端まで進める（20 年代・離散）", () => {
  let year = SNAPSHOT_YEARS[0];
  for (let i = 0; i < SNAPSHOT_YEARS.length + 5; i++) {
    year = stepYear(SNAPSHOT_YEARS, year, 1);
  }
  assertEquals(year, SNAPSHOT_YEARS[SNAPSHOT_YEARS.length - 1]);
});
