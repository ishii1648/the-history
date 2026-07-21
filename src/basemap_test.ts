import { assert, assertEquals } from "@std/assert";
import { layers, namedFlavor } from "@protomaps/basemaps";
import {
  BASEMAP_LAYER_IDS,
  buildBasemapStyle,
  filterBasemapLayers,
  HILLSHADE_LAYER_ID,
} from "./basemap.ts";
import {
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  DEM_PMTILES_URL,
  DEM_SOURCE_ID,
} from "./config.ts";

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

Deno.test("buildBasemapStyle のレイヤーは採用レイヤー + hillshade で構成される", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  // TASK-34: hillshade は landcover の後・water の前に挿入する
  assertEquals(
    style.layers.map((l) => l.id),
    [
      "background",
      "earth",
      "landcover",
      HILLSHADE_LAYER_ID,
      "water",
      "water_stream",
      "water_river",
    ],
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
  assertEquals(Object.keys(style.sources), [BASEMAP_SOURCE_ID, DEM_SOURCE_ID]);
});

Deno.test("buildBasemapStyle に rivers レイヤーが含まれない", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  assert(style.layers.every((l) => l.id !== "rivers"));
});

// --- TASK-34: 地形（hillshade）表現 ---
// DEM（terrarium PMTiles）を raster-dem ソースとして追加し、hillshade レイヤー
// で起伏を表現する。DEM アーカイブは任意生成（dist に無い環境もある）。

Deno.test("buildBasemapStyle は terrarium エンコーディングの raster-dem ソースを定義する", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const dem = style.sources[DEM_SOURCE_ID];
  assert(dem !== undefined, "dem ソースが存在すること");
  assert(dem.type === "raster-dem"); // 型の絞り込みを兼ねる
  assertEquals(dem.url, `pmtiles://${DEM_PMTILES_URL}`);
  assertEquals(dem.encoding, "terrarium");
  // terrarium（AWS Terrain Tiles）は 256px タイル
  assertEquals(dem.tileSize, 256);
});

Deno.test("dem ソースに Terrain Tiles の attribution がある", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const attribution = style.sources[DEM_SOURCE_ID].attribution ?? "";
  assert(attribution.includes("Terrain Tiles"));
  assert(attribution.includes("registry.opendata.aws/terrain-tiles"));
});

Deno.test("hillshade レイヤーは dem ソースを参照する type: hillshade", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const hillshade = style.layers.find((l) => l.id === HILLSHADE_LAYER_ID);
  assert(hillshade !== undefined, "hillshade レイヤーが存在すること");
  assertEquals(hillshade.type, "hillshade");
  assertEquals(hillshade.source, DEM_SOURCE_ID);
});

Deno.test("hillshade は landcover の後・water の前に挿入される", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const ids = style.layers.map((l) => l.id);
  const hillshadeIdx = ids.indexOf(HILLSHADE_LAYER_ID);
  const landcoverIdx = ids.indexOf("landcover");
  const waterIdx = ids.indexOf("water");
  assert(hillshadeIdx > landcoverIdx, "hillshade は landcover より上");
  assert(hillshadeIdx < waterIdx, "hillshade は water より下");
});

Deno.test("hillshade 追加後もベースマップレイヤーの相対順序は不変", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const idsWithoutHillshade = style.layers
    .map((l) => l.id)
    .filter((id) => id !== HILLSHADE_LAYER_ID);
  assertEquals(idsWithoutHillshade, [...BASEMAP_LAYER_IDS]);
});
