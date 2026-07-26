import { assert, assertEquals } from "@std/assert";
import {
  BASE_OUTLINE_YEARS,
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  FALLBACK_STYLE_URL,
  FRANCE_FIEF_OVERLAY_YEARS,
  HRE_ALL_OVERLAY_YEARS,
  HRE_FIEF_OVERLAY_YEARS,
  HRE_OVERLAY_YEARS,
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

Deno.test("HRE_OVERLAY_YEARS は 1700 を含む（1650 境界の外挿。TASK-68）", () => {
  assertEquals([...HRE_OVERLAY_YEARS], [1500, 1530, 1600, 1650, 1700]);
});

Deno.test("HRE_OVERLAY_YEARS は 1715 以降のスナップショット年を含まない（ベースマップのドイツ諸邦個別収録との二重表示回避）", () => {
  for (const year of HRE_OVERLAY_YEARS) {
    assert(year < 1715, `${year} は 1715 以降（二重表示になる）`);
    assert(SNAPSHOT_YEARS.includes(year), `${year} は SNAPSHOT_YEARS に無い`);
  }
});

Deno.test("FRANCE_FIEF_OVERLAY_YEARS は中世 5 年代である（TASK-71）", () => {
  assertEquals([...FRANCE_FIEF_OVERLAY_YEARS], [1000, 1100, 1200, 1279, 1300]);
});

Deno.test("FRANCE_FIEF_OVERLAY_YEARS は昇順・重複なしで SNAPSHOT_YEARS の部分集合（TASK-71）", () => {
  const sorted = [...FRANCE_FIEF_OVERLAY_YEARS].sort((a, b) => a - b);
  assertEquals([...FRANCE_FIEF_OVERLAY_YEARS], sorted);
  assertEquals(
    new Set(FRANCE_FIEF_OVERLAY_YEARS).size,
    FRANCE_FIEF_OVERLAY_YEARS.length,
  );
  for (const year of FRANCE_FIEF_OVERLAY_YEARS) {
    assert(SNAPSHOT_YEARS.includes(year), `${year} は SNAPSHOT_YEARS に無い`);
  }
});

Deno.test("FRANCE_FIEF_OVERLAY_YEARS は近世以降（1400 年以降）を含まない（ベースマップ勢力表示との二重表示回避。TASK-71 AC #4）", () => {
  for (const year of FRANCE_FIEF_OVERLAY_YEARS) {
    assert(year <= 1300, `${year} は中世の対象年ではない（二重表示になる）`);
  }
  for (const year of SNAPSHOT_YEARS) {
    if (year >= 1400) {
      assert(
        !FRANCE_FIEF_OVERLAY_YEARS.includes(year),
        `${year} でフランス諸侯オーバーレイが出てはいけない`,
      );
    }
  }
});

Deno.test("FRANCE_FIEF_OVERLAY_YEARS と HRE_OVERLAY_YEARS は互いに素（Roller 由来の近世領邦と中世仏諸侯領は同時表示年を持たない。TASK-71）", () => {
  const overlap = FRANCE_FIEF_OVERLAY_YEARS.filter((y) =>
    HRE_OVERLAY_YEARS.includes(y)
  );
  assertEquals(overlap, []);
});

Deno.test("HRE_FIEF_OVERLAY_YEARS は中世 7 年代である（TASK-86）", () => {
  assertEquals([...HRE_FIEF_OVERLAY_YEARS], [
    1000,
    1100,
    1200,
    1279,
    1300,
    1400,
    1492,
  ]);
});

Deno.test("HRE_FIEF_OVERLAY_YEARS は昇順・重複なしで SNAPSHOT_YEARS の部分集合（TASK-86）", () => {
  const sorted = [...HRE_FIEF_OVERLAY_YEARS].sort((a, b) => a - b);
  assertEquals([...HRE_FIEF_OVERLAY_YEARS], sorted);
  assertEquals(
    new Set(HRE_FIEF_OVERLAY_YEARS).size,
    HRE_FIEF_OVERLAY_YEARS.length,
  );
  for (const year of HRE_FIEF_OVERLAY_YEARS) {
    assert(SNAPSHOT_YEARS.includes(year), `${year} は SNAPSHOT_YEARS に無い`);
  }
});

Deno.test("HRE_FIEF_OVERLAY_YEARS は 900 を含まず、Roller 由来の HRE_OVERLAY_YEARS とも互いに素（TASK-86）", () => {
  assert(!HRE_FIEF_OVERLAY_YEARS.includes(900));
  const overlap = HRE_FIEF_OVERLAY_YEARS.filter((y) =>
    HRE_OVERLAY_YEARS.includes(y)
  );
  assertEquals(overlap, []);
});

Deno.test("HRE_ALL_OVERLAY_YEARS は中世 OHM 年代と近世 Roller 年代の和で昇順・重複なし（TASK-86）", () => {
  assertEquals([...HRE_ALL_OVERLAY_YEARS], [
    ...HRE_FIEF_OVERLAY_YEARS,
    ...HRE_OVERLAY_YEARS,
  ]);
  const sorted = [...HRE_ALL_OVERLAY_YEARS].sort((a, b) => a - b);
  assertEquals([...HRE_ALL_OVERLAY_YEARS], sorted);
  assertEquals(
    new Set(HRE_ALL_OVERLAY_YEARS).size,
    HRE_ALL_OVERLAY_YEARS.length,
  );
});

Deno.test("HRE_ALL_OVERLAY_YEARS は 1492 と 1500 を連続して含む（1492↔1500 の切替で表示が途切れない。TASK-86 AC #5）", () => {
  assert(HRE_ALL_OVERLAY_YEARS.includes(1492));
  assert(HRE_ALL_OVERLAY_YEARS.includes(1500));
});

Deno.test("BASE_OUTLINE_YEARS は仏諸侯領年代と HRE 領邦年代の和集合で昇順・重複なし（TASK-86）", () => {
  const expected = [
    ...new Set([...FRANCE_FIEF_OVERLAY_YEARS, ...HRE_FIEF_OVERLAY_YEARS]),
  ].sort((a, b) => a - b);
  assertEquals([...BASE_OUTLINE_YEARS], expected);
  for (const year of BASE_OUTLINE_YEARS) {
    assert(SNAPSHOT_YEARS.includes(year), `${year} は SNAPSHOT_YEARS に無い`);
  }
});
