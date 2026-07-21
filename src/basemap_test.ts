import { assert, assertEquals } from "@std/assert";
import { layers, namedFlavor } from "@protomaps/basemaps";
import {
  BASEMAP_LAYER_IDS,
  buildBasemapStyle,
  filterBasemapLayers,
} from "./basemap.ts";
import { BASEMAP_PMTILES_URL, BASEMAP_SOURCE_ID } from "./config.ts";

/** @protomaps/basemaps ^5 の実レイヤー定義（light flavor・ラベルなし） */
const realLayers = layers(BASEMAP_SOURCE_ID, namedFlavor("light"));

Deno.test("BASEMAP_LAYER_IDS は地形・海岸線・河川系のみを含む", () => {
  assertEquals(BASEMAP_LAYER_IDS, [
    "background",
    "earth",
    "landcover",
    // 順序は @protomaps/basemaps の描画順（base_layers.ts の定義順）を維持
    "water",
    "water_stream",
    "water_river",
  ]);
});

Deno.test("filterBasemapLayers は採用レイヤーのみを残す", () => {
  const filtered = filterBasemapLayers(realLayers);
  assertEquals(
    filtered.map((l) => l.id),
    [...BASEMAP_LAYER_IDS],
  );
});

Deno.test("filterBasemapLayers は現代の国境・道路・地名等を除外する", () => {
  const filteredIds = new Set(filterBasemapLayers(realLayers).map((l) => l.id));
  // @protomaps/basemaps ^5.7.2 の base_layers.ts に実在する除外対象の代表
  const excluded = [
    "boundaries",
    "boundaries_country",
    "buildings",
    "landuse_park",
    "landuse_industrial",
    "roads_major",
    "roads_highway",
    "roads_rail",
  ];
  for (const id of excluded) {
    assert(
      realLayers.some((l) => l.id === id),
      `前提: 実レイヤー定義に ${id} が存在すること`,
    );
    assert(!filteredIds.has(id), `${id} は除外されるべき`);
  }
});

Deno.test("filterBasemapLayers はプレフィックス一致の別レイヤーを誤って残さない", () => {
  const input = [
    { id: "water" },
    { id: "water_label_ocean" },
    { id: "earth" },
    { id: "earth_label_islands" },
  ];
  assertEquals(
    filterBasemapLayers(input).map((l) => l.id),
    ["water", "earth"],
  );
});

Deno.test("buildBasemapStyle は version 8 の MapLibre スタイルを返す", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assertEquals(style.version, 8);
});

Deno.test("buildBasemapStyle は pmtiles:// スキームのベクタソースを定義する", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const source = style.sources[BASEMAP_SOURCE_ID];
  assert(source.type === "vector"); // 型の絞り込みを兼ねる
  assertEquals(source.url, `pmtiles://${BASEMAP_PMTILES_URL}`);
});

Deno.test("buildBasemapStyle のソースに OSM/Protomaps の attribution がある", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const attribution = style.sources[BASEMAP_SOURCE_ID].attribution ?? "";
  assert(attribution.includes("protomaps.com"));
  assert(attribution.includes("openstreetmap.org"));
});

Deno.test("buildBasemapStyle のレイヤーは採用レイヤー + rivers で構成される", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assertEquals(
    style.layers.map((l) => l.id),
    // rivers はベースマップの後（陸地・水域の上）に描画する
    [...BASEMAP_LAYER_IDS, "rivers"],
  );
});

Deno.test("buildBasemapStyle に symbol レイヤー（ラベル）が含まれない", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assert(style.layers.every((l) => l.type !== "symbol"));
});

// --- TASK-21: Natural Earth 主要河川オーバーレイ ---
// ベースマップの water_river は minzoom 9 だがアプリは MAX_ZOOM=8 のため
// 描画されない。低ズーム帯用に GeoJSON の河川ソース/レイヤーを追加する。

Deno.test("buildBasemapStyle は rivers の GeoJSON ソースを定義する", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const source = style.sources["rivers"];
  assert(source, "sources に rivers が存在すること");
  assert(source.type === "geojson"); // 型の絞り込みを兼ねる
  assertEquals(source.data, "/data/rivers.geojson");
});

Deno.test("rivers ソースに Natural Earth の attribution がある", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const attribution = style.sources["rivers"]?.attribution ?? "";
  assert(attribution.includes("naturalearthdata.com"));
});

Deno.test("buildBasemapStyle は rivers の line レイヤーを最後に定義する", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const rivers = style.layers.find((l) => l.id === "rivers");
  assert(rivers, "layers に id rivers が存在すること");
  assertEquals(rivers.type, "line");
  assertEquals(rivers.source, "rivers");
  // 陸地・水域の上に描画されるようレイヤー配列の末尾に置く
  assertEquals(style.layers[style.layers.length - 1].id, "rivers");
});

Deno.test("rivers レイヤーの色は light flavor の water 色と一致する", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const rivers = style.layers.find((l) => l.id === "rivers");
  assert(rivers);
  const paint = rivers.paint as { "line-color"?: unknown };
  assertEquals(paint["line-color"], namedFlavor("light").water);
});
