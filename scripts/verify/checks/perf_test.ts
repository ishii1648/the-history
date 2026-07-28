import { assertEquals, assertMatch } from "@std/assert";
import { SNAPSHOT_YEARS } from "../../../src/config.ts";
import {
  averageYearSwitch,
  resolveOutPath,
  summarizeResources,
  yearsToCycle,
} from "./perf.ts";

// ---- summarizeResources ----

Deno.test("summarizeResources: transferSize/encodedBodySize/decodedBodySize を合算する", () => {
  assertEquals(
    summarizeResources([
      { transferSize: 100, encodedBodySize: 80, decodedBodySize: 200 },
      { transferSize: 50, encodedBodySize: 40, decodedBodySize: 90 },
    ]),
    {
      count: 2,
      transferBytes: 150,
      encodedBodyBytes: 120,
      decodedBodyBytes: 290,
    },
  );
});

Deno.test("summarizeResources: 欠損フィールドは 0 として扱う", () => {
  assertEquals(summarizeResources([{}]), {
    count: 1,
    transferBytes: 0,
    encodedBodyBytes: 0,
    decodedBodyBytes: 0,
  });
});

Deno.test("summarizeResources: 空配列なら全て 0", () => {
  assertEquals(summarizeResources([]), {
    count: 0,
    transferBytes: 0,
    encodedBodyBytes: 0,
    decodedBodyBytes: 0,
  });
});

// ---- yearsToCycle ----

Deno.test("yearsToCycle: 初期年代を除いた全スナップショット年代を順に返す", () => {
  assertEquals(yearsToCycle([900, 1000, 1100], 1000), [900, 1100]);
});

Deno.test("yearsToCycle: SNAPSHOT_YEARS 全年代から初期年代だけが除かれる", () => {
  const years = yearsToCycle(SNAPSHOT_YEARS, 1000);
  assertEquals(years.length, SNAPSHOT_YEARS.length - 1);
  assertEquals(years.includes(1000), false);
});

// ---- averageYearSwitch ----

Deno.test("averageYearSwitch: 所要時間と転送量の平均を返す", () => {
  assertEquals(
    averageYearSwitch([
      { durationMs: 100, transferBytes: 1000, decodedBodyBytes: 3000 },
      { durationMs: 300, transferBytes: 2000, decodedBodyBytes: 5000 },
    ]),
    { durationMs: 200, transferBytes: 1500, decodedBodyBytes: 4000 },
  );
});

Deno.test("averageYearSwitch: 空配列なら null", () => {
  assertEquals(averageYearSwitch([]), null);
});

// ---- resolveOutPath ----

Deno.test("resolveOutPath: 既定は gitignore 済みの .perf-*.json パターンに一致するパス", () => {
  const path = resolveOutPath(
    () => undefined,
    new Date("2026-07-29T12:34:56Z"),
  );
  assertMatch(path, /^scripts\/verify\/checks\/\.perf-[0-9TZ-]+\.json$/);
  assertEquals(path, "scripts/verify/checks/.perf-20260729T123456Z.json");
});

Deno.test("resolveOutPath: 環境変数 PERF_OUT で出力先を上書きできる", () => {
  const path = resolveOutPath(
    (key: string) =>
      key === "PERF_OUT"
        ? "scripts/verify/checks/.perf-before.json"
        : undefined,
    new Date(),
  );
  assertEquals(path, "scripts/verify/checks/.perf-before.json");
});
