import { assert, assertEquals, assertThrows } from "@std/assert";
import type { Feature, FeatureCollection, MultiPolygon } from "geojson";
import { SNAPSHOT_YEARS } from "../src/config.ts";
import {
  applyNameOverrides,
  buildIndex,
  buildSourceUrl,
  clipToBbox,
  EUROPE_BBOX,
  resolveName,
  shrinkToLimit,
  SIMPLIFY_TOLERANCES,
  SOURCE_COMMIT,
  SOURCE_LICENSE,
  SOURCE_REPO,
  YEARS,
} from "./build-data.ts";

/** テスト用に MultiPolygon の Feature を組み立てる（正方形リングの集合） */
function multiPolygonFeature(
  properties: Record<string, unknown>,
  squares: Array<[number, number, number, number]>,
): Feature<MultiPolygon> {
  const coordinates = squares.map((
    [minX, minY, maxX, maxY],
  ) => [[
    [minX, minY],
    [minX, maxY],
    [maxX, maxY],
    [maxX, minY],
    [minX, minY],
  ]]);
  return {
    type: "Feature",
    properties,
    geometry: { type: "MultiPolygon", coordinates },
  };
}

Deno.test("buildSourceUrl はピン留めコミットの raw URL を生成する", () => {
  assertEquals(
    buildSourceUrl(1492),
    `https://raw.githubusercontent.com/aourednik/historical-basemaps/${SOURCE_COMMIT}/geojson/world_1492.geojson`,
  );
});

Deno.test("定数は仕様どおりの出典情報を持つ", () => {
  assertEquals(SOURCE_REPO, "aourednik/historical-basemaps");
  assertEquals(SOURCE_LICENSE, "GPL-3.0");
  assertEquals(SOURCE_COMMIT.length, 40);
  assertEquals(EUROPE_BBOX, [-25, 34, 60, 72]);
  assertEquals(YEARS.length, 20);
  assertEquals(YEARS[0], 900);
  assertEquals(YEARS[YEARS.length - 1], 1914);
});

Deno.test("YEARS は src/config.ts の SNAPSHOT_YEARS と一致する（二重定義ドリフト防止）", () => {
  assertEquals(YEARS, [...SNAPSHOT_YEARS]);
});

Deno.test("clipToBbox は bbox 外の feature を除去し、空パートを残さない", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      // 完全に内側
      multiPolygonFeature({ NAME: "inside" }, [[2, 2, 8, 8]]),
      // 完全に外側 → 除去される
      multiPolygonFeature({ NAME: "outside" }, [[20, 20, 30, 30]]),
      // 一部が内側・一部が外側 → 内側パートのみ残る
      multiPolygonFeature({ NAME: "mixed" }, [[2, 2, 8, 8], [20, 20, 30, 30]]),
    ],
  };

  const clipped = clipToBbox(fc, [0, 0, 10, 10]);

  const names = clipped.features.map((f) => f.properties?.NAME);
  assertEquals(names.sort(), ["inside", "mixed"]);

  for (const feature of clipped.features) {
    const geometry = feature.geometry;
    assert(geometry !== null);
    if (geometry.type === "MultiPolygon") {
      for (const part of geometry.coordinates) {
        assert(part.length > 0, "空のポリゴンパートが残ってはいけない");
      }
      assert(geometry.coordinates.length > 0);
    }
  }
});

Deno.test("resolveName は NAME を優先しつつ null は ABBREVN→SUBJECTO→PARTOF で補完する", () => {
  const overrides = { renames: {} };
  assertEquals(
    resolveName({ NAME: "France", ABBREVN: "FR" }, overrides),
    "France",
  );
  assertEquals(
    resolveName(
      { NAME: null, ABBREVN: "HRE", SUBJECTO: "Empire" },
      overrides,
    ),
    "HRE",
  );
  assertEquals(
    resolveName(
      { NAME: null, ABBREVN: null, SUBJECTO: "Ottoman Empire" },
      overrides,
    ),
    "Ottoman Empire",
  );
  assertEquals(
    resolveName(
      {
        NAME: null,
        ABBREVN: null,
        SUBJECTO: null,
        PARTOF: "Latin Christendom",
      },
      overrides,
    ),
    "Latin Christendom",
  );
  assertEquals(
    resolveName({ NAME: null, ABBREVN: null }, overrides),
    null,
  );
});

Deno.test("resolveName は renames マップで表記ゆれを補正する", () => {
  const overrides = { renames: { "Byzantine Empire": "Byzantium" } };
  assertEquals(
    resolveName({ NAME: "Byzantine Empire" }, overrides),
    "Byzantium",
  );
  // フォールバックで得た名前にも rename が適用される
  assertEquals(
    resolveName({ NAME: null, ABBREVN: "Byzantine Empire" }, overrides),
    "Byzantium",
  );
});

Deno.test("applyNameOverrides は全 feature の NAME を解決して書き換える", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiPolygonFeature({ NAME: "Kingdom of France" }, [[0, 0, 1, 1]]),
      multiPolygonFeature(
        { NAME: null, SUBJECTO: "Holy Roman Empire" },
        [[1, 1, 2, 2]],
      ),
    ],
  };
  const overrides = { renames: { "Kingdom of France": "France" } };

  const result = applyNameOverrides(fc, overrides);

  assertEquals(result.features[0].properties?.NAME, "France");
  assertEquals(result.features[1].properties?.NAME, "Holy Roman Empire");
  // 元の SUBJECTO などは保持される
  assertEquals(
    result.features[1].properties?.SUBJECTO,
    "Holy Roman Empire",
  );
});

Deno.test("buildIndex は年一覧と出典メタを返す", () => {
  const source = { repo: "r", commit: "c", license: "GPL-3.0" };
  assertEquals(buildIndex([900, 1000], source), {
    years: [900, 1000],
    source: { repo: "r", commit: "c", license: "GPL-3.0" },
  });
});

Deno.test("shrinkToLimit は limit 以下になる最小トレランスの結果を返す", () => {
  // ぎざぎざの多点ポリゴンを作る
  const ring: number[][] = [];
  for (let i = 0; i <= 200; i++) {
    const x = i * 0.01;
    const y = (i % 2 === 0 ? 0 : 0.001) + Math.sin(i) * 0.0001;
    ring.push([x, y]);
  }
  ring.push([2, -1]);
  ring.push([0, -1]);
  ring.push([0, 0]);
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { NAME: "jagged" },
      geometry: { type: "Polygon", coordinates: [ring] },
    }],
  };

  const large = shrinkToLimit(fc, 1_000_000);
  assertEquals(large.tolerance, SIMPLIFY_TOLERANCES[0]);
  assert(large.size <= 1_000_000);
  assert(
    new TextEncoder().encode(JSON.stringify(large.fc)).length <= 1_000_000,
  );

  // 現実的な小さめ limit ではより大きいトレランスが選ばれ、なお limit 以下
  const small = shrinkToLimit(fc, 3_000);
  assert(small.size <= 3_000);
  assert(SIMPLIFY_TOLERANCES.includes(small.tolerance));
});

Deno.test("shrinkToLimit は座標を小数5桁に丸める", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { NAME: "precise" },
      geometry: {
        type: "Polygon",
        coordinates: [[
          [1.123456789, 2.987654321],
          [3.111111111, 4.0],
          [5.0, 6.222222222],
          [1.123456789, 2.987654321],
        ]],
      },
    }],
  };
  const result = shrinkToLimit(fc, 1_000_000);
  const serialized = JSON.stringify(result.fc);
  assert(serialized.includes("1.12346"), serialized);
  assert(!serialized.includes("1.123456789"), serialized);
});

Deno.test("shrinkToLimit はどのトレランスでも収まらなければ例外を投げる", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { NAME: "x" },
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
      },
    }],
  };
  assertThrows(() => shrinkToLimit(fc, 5));
});
