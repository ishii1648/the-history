import { assert, assertEquals } from "@std/assert";
import {
  coverageFor,
  EMPTY_FIEF_DEDUPE_TABLE,
  FIEF_COVERAGE_SUPPRESS_THRESHOLD,
  FIEF_DEDUPE_DATA_URL,
  parseFiefDedupeTable,
  suppressedPowerNames,
} from "./fief_dedupe.ts";

Deno.test("FIEF_DEDUPE_DATA_URL は data/ 配下の対応表を指す", () => {
  assertEquals(FIEF_DEDUPE_DATA_URL, "/data/fief-dedupe.json");
});

Deno.test("parseFiefDedupeTable は year → 勢力名 → 被覆率のネストを取り出す", () => {
  const table = parseFiefDedupeTable({
    metadata: { generatedBy: "scripts/build-fief-dedupe.ts" },
    years: {
      "1200": { "Britany": 1, "Kingdom of France": 0.41 },
      "1300": { "Britany": 1 },
    },
  });
  assertEquals(coverageFor(table, 1200, "Britany"), 1);
  assertEquals(coverageFor(table, 1200, "Kingdom of France"), 0.41);
  assertEquals(coverageFor(table, 1300, "Britany"), 1);
});

Deno.test("parseFiefDedupeTable は不正な入力で空表を返す（従来表示を維持）", () => {
  for (const input of [null, undefined, 42, "x", [], {}, { years: 1 }]) {
    assertEquals(parseFiefDedupeTable(input), EMPTY_FIEF_DEDUPE_TABLE);
  }
});

Deno.test("parseFiefDedupeTable は数値でない被覆率と壊れた年エントリを捨てる", () => {
  const table = parseFiefDedupeTable({
    years: {
      "1200": { "Britany": 1, "Broken": "1", "NaN": Number.NaN },
      "1300": [1, 2],
    },
  });
  assertEquals(coverageFor(table, 1200, "Britany"), 1);
  assertEquals(coverageFor(table, 1200, "Broken"), 0);
  assertEquals(coverageFor(table, 1200, "NaN"), 0);
  assertEquals(coverageFor(table, 1300, "Britany"), 0);
});

Deno.test("coverageFor は未登録の年・勢力に 0 を返す", () => {
  const table = parseFiefDedupeTable({ years: { "1200": { "Britany": 1 } } });
  assertEquals(coverageFor(table, 1100, "Britany"), 0);
  assertEquals(coverageFor(table, 1200, "Bohemia"), 0);
});

Deno.test("FIEF_COVERAGE_SUPPRESS_THRESHOLD は完全内包（1.0）と部分重複（実測最大 0.51）の間にある", () => {
  assert(FIEF_COVERAGE_SUPPRESS_THRESHOLD > 0.52);
  assert(FIEF_COVERAGE_SUPPRESS_THRESHOLD < 1);
});

Deno.test("suppressedPowerNames は閾値以上の被覆率の勢力だけを返す", () => {
  const table = parseFiefDedupeTable({
    years: {
      "1200": {
        "Britany": 1,
        "Angevin Empire": 0.5126,
        "Kingdom of France": 0.41,
      },
    },
  });
  const suppressed = suppressedPowerNames(table, 1200);
  assert(suppressed.has("Britany"));
  assert(!suppressed.has("Angevin Empire"));
  assert(!suppressed.has("Kingdom of France"));
  assertEquals(suppressed.size, 1);
});

Deno.test("suppressedPowerNames は閾値ちょうどを抑制対象に含める", () => {
  const table = parseFiefDedupeTable({
    years: { "1200": { "Exact": FIEF_COVERAGE_SUPPRESS_THRESHOLD } },
  });
  assert(suppressedPowerNames(table, 1200).has("Exact"));
});

Deno.test("suppressedPowerNames は対象外の年（1400 以降）で空集合を返す", () => {
  const table = parseFiefDedupeTable({ years: { "1200": { "Britany": 1 } } });
  for (const year of [1400, 1492, 1914]) {
    assertEquals(suppressedPowerNames(table, year).size, 0);
  }
});

Deno.test("suppressedPowerNames は閾値を引数で上書きできる", () => {
  const table = parseFiefDedupeTable({ years: { "1200": { "Half": 0.5 } } });
  assert(suppressedPowerNames(table, 1200, 0.4).has("Half"));
  assert(!suppressedPowerNames(table, 1200, 0.6).has("Half"));
});
