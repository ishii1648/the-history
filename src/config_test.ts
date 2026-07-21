import { assert, assertEquals } from "@std/assert";
import {
  INITIAL_CENTER,
  INITIAL_YEAR,
  INITIAL_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  SNAPSHOT_YEARS,
} from "./config.ts";

Deno.test("INITIAL_CENTER はヨーロッパ中心付近の [15, 50] である", () => {
  assertEquals(INITIAL_CENTER, [15, 50]);
});

Deno.test("INITIAL_ZOOM は 4 である", () => {
  assertEquals(INITIAL_ZOOM, 4);
});

Deno.test("MIN_ZOOM は MAX_ZOOM より小さい", () => {
  assert(MIN_ZOOM < MAX_ZOOM);
});

Deno.test("MIN_ZOOM は 3、MAX_ZOOM は 8 である", () => {
  assertEquals(MIN_ZOOM, 3);
  assertEquals(MAX_ZOOM, 8);
});

Deno.test("SNAPSHOT_YEARS は昇順である", () => {
  const sorted = [...SNAPSHOT_YEARS].sort((a, b) => a - b);
  assertEquals(SNAPSHOT_YEARS, sorted);
});

Deno.test("SNAPSHOT_YEARS に重複がない", () => {
  const unique = new Set(SNAPSHOT_YEARS);
  assertEquals(unique.size, SNAPSHOT_YEARS.length);
});

Deno.test("SNAPSHOT_YEARS は仕様書どおりの 20 件である", () => {
  assertEquals(SNAPSHOT_YEARS, [
    900,
    1000,
    1100,
    1200,
    1279,
    1300,
    1400,
    1492,
    1500,
    1530,
    1600,
    1650,
    1700,
    1715,
    1783,
    1800,
    1815,
    1880,
    1900,
    1914,
  ]);
});

Deno.test("INITIAL_YEAR は 1000 である", () => {
  assertEquals(INITIAL_YEAR, 1000);
});

Deno.test("INITIAL_YEAR は SNAPSHOT_YEARS に含まれる", () => {
  assert(SNAPSHOT_YEARS.includes(INITIAL_YEAR));
});
