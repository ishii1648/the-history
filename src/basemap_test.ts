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

Deno.test("buildBasemapStyle のレイヤーは採用レイヤーのみで構成される", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assertEquals(
    style.layers.map((l) => l.id),
    [...BASEMAP_LAYER_IDS],
  );
});

Deno.test("buildBasemapStyle に symbol レイヤー（ラベル）が含まれない", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assert(style.layers.every((l) => l.type !== "symbol"));
});

// --- TASK-24: 主要河川オーバーレイの deck.gl 移行 ---
// TASK-21 で MapLibre style に置いていた rivers ソース/レイヤーは、クリック/
// ホバー可能にするため deck.gl の GeoJsonLayer（rivers.ts + main.ts）へ移行し、
// style には含めない。

Deno.test("buildBasemapStyle に rivers ソースが含まれない", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assertEquals(Object.keys(style.sources), [BASEMAP_SOURCE_ID]);
});

Deno.test("buildBasemapStyle に rivers レイヤーが含まれない", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assert(style.layers.every((l) => l.id !== "rivers"));
});
