import { assert, assertEquals } from "@std/assert";
import {
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  FALLBACK_STYLE_URL,
  INITIAL_CENTER,
  INITIAL_YEAR,
  INITIAL_ZOOM,
  MAP_MAX_BOUNDS,
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

Deno.test("MIN_ZOOM は 4、MAX_ZOOM は 8 である", () => {
  // TASK-22: ヨーロッパ全域が一望できる下限に引き上げ（z3 は圏外まで見えすぎる）
  assertEquals(MIN_ZOOM, 4);
  assertEquals(MAX_ZOOM, 8);
});

Deno.test("MAP_MAX_BOUNDS はヨーロッパ域 [[-25, 34], [60, 72]] である", () => {
  // scripts/build-data.ts の EUROPE_BBOX ([-25, 34, 60, 72]) と同値であること
  assertEquals(MAP_MAX_BOUNDS, [[-25, 34], [60, 72]]);
});

Deno.test("MAP_MAX_BOUNDS は南西・北東の順で矛盾がない", () => {
  const [[west, south], [east, north]] = MAP_MAX_BOUNDS;
  assert(west < east);
  assert(south < north);
});

Deno.test("INITIAL_CENTER は MAP_MAX_BOUNDS の内側にある", () => {
  const [[west, south], [east, north]] = MAP_MAX_BOUNDS;
  const [lon, lat] = INITIAL_CENTER;
  assert(west <= lon && lon <= east);
  assert(south <= lat && lat <= north);
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

Deno.test("BASEMAP_PMTILES_URL は同一オリジン配信の .pmtiles パスである", () => {
  // 開発時は dist/ 直下に配置した europe.pmtiles を同一オリジンで配信する。
  // 本番 R2 の絶対 URL への差し替えは TASK-10。
  assert(BASEMAP_PMTILES_URL.startsWith("/"));
  assert(BASEMAP_PMTILES_URL.endsWith(".pmtiles"));
});

Deno.test("FALLBACK_STYLE_URL は OpenFreeMap のスタイル URL である", () => {
  assert(FALLBACK_STYLE_URL.startsWith("https://tiles.openfreemap.org/"));
});

Deno.test("BASEMAP_SOURCE_ID は非空文字列である", () => {
  assert(BASEMAP_SOURCE_ID.length > 0);
});
