import { assert, assertEquals } from "@std/assert";
import { layers, namedFlavor } from "@protomaps/basemaps";
import {
  BASEMAP_LAYER_IDS,
  buildBasemapStyle,
  filterBasemapLayers,
  HILLSHADE_LAYER_ID,
  PARCHMENT_FLAVOR_OVERRIDES,
  PARCHMENT_LANDCOVER_COLORS,
  parchmentFlavor,
} from "./basemap.ts";
import {
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  DEM_PMTILES_URL,
  DEM_SOURCE_ID,
} from "./config.ts";

/** @protomaps/basemaps ^5 の実レイヤー定義（light flavor・ラベルなし） */
const realLayers = layers(BASEMAP_SOURCE_ID, namedFlavor("light"));

Deno.test("BASEMAP_LAYER_IDS は地形・海岸線系のみを含む（河川ラインは TASK-44 で除外）", () => {
  assertEquals(BASEMAP_LAYER_IDS, [
    "background",
    "earth",
    "landcover",
    // 順序は @protomaps/basemaps の描画順（base_layers.ts の定義順）を維持
    "water",
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

// --- TASK-44: ベースマップ河川ラインのデコイ化を解消 ---
// deck.gl の pickable 河川（NE50m, src/rivers.ts + main.ts）と、ベースマップ
// （Protomaps）の water_river / water_stream の経路が一致せず、ユーザーが
// クリックする川筋で河川を選択できなくなっていた。河川表示は deck オーバー
// レイへ一本化し、ベースマップ側の川ラインは採用しない。

Deno.test("BASEMAP_LAYER_IDS は water_river / water_stream を含まない（河川表示は deck オーバーレイに一本化, TASK-44）", () => {
  assert(!BASEMAP_LAYER_IDS.includes("water_river"));
  assert(!BASEMAP_LAYER_IDS.includes("water_stream"));
});

// --- TASK-73: 羊皮紙/古地図トーンへの配色統一 ---
// 地図外 UI（app.css の --parchment #f4ecd7 / --parchment-shade #e7d9b2 /
// --ink #3a2712 等、TASK-40）と地図本体の乖離を解消するため、protomaps の
// light flavor を羊皮紙系の色で上書きする。

/** "#rrggbb" → [r,g,b]（テスト用の素朴なパーサ） */
function hex(color: string): [number, number, number] {
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/** "rgba(r, g, b, a)" → [r,g,b]（テスト用の素朴なパーサ） */
function rgba(color: string): [number, number, number] {
  const m = /^rgba\((\d+),\s*(\d+),\s*(\d+)/.exec(color);
  assert(m !== null, `${color} は rgba(...) 形式のはず`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

/** HSV 相当の彩度（0..1）。0 に近いほど無彩色 */
function saturation([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

Deno.test("PARCHMENT_FLAVOR_OVERRIDES は承認済みの羊皮紙系の色を定義する", () => {
  assertEquals(PARCHMENT_FLAVOR_OVERRIDES.background, "#e7d9b2");
  assertEquals(PARCHMENT_FLAVOR_OVERRIDES.earth, "#f0e6cd");
  assertEquals(PARCHMENT_FLAVOR_OVERRIDES.water, "#c7d2d0");
  assertEquals(PARCHMENT_FLAVOR_OVERRIDES.glacier, "#f4efe2");
  assertEquals(PARCHMENT_FLAVOR_OVERRIDES.sand, "#e8dcc0");
});

Deno.test("羊皮紙系の陸地・背景色は暖色（R >= G > B）で明るい", () => {
  for (
    const key of ["background", "earth", "glacier", "sand", "beach"] as const
  ) {
    const value = PARCHMENT_FLAVOR_OVERRIDES[key];
    const [r, g, b] = hex(value);
    assert(r >= g && g > b, `${key}=${value} は暖色のはず`);
    assert(r >= 200, `${key}=${value} は明るい下地のはず`);
  }
});

Deno.test("water はシアンではなくくすんだ青灰（低彩度・寒色寄り）", () => {
  const water = hex(PARCHMENT_FLAVOR_OVERRIDES.water);
  // light flavor の #80deea（シアン）は彩度 0.45 超。羊皮紙下地では大幅に落とす
  assert(
    saturation(water) < 0.2,
    `water=${PARCHMENT_FLAVOR_OVERRIDES.water} は低彩度のはず`,
  );
  // 陸（暖色）と区別できるよう、赤より青が強い（または同等）寒色寄りにする
  assert(water[2] >= water[0], "water は青が赤以上（寒色寄り）のはず");
});

Deno.test("PARCHMENT_LANDCOVER_COLORS は light flavor の緑系を彩度の低いオリーブへ置き換える", () => {
  const keys = [
    "grassland",
    "barren",
    "urban_area",
    "farmland",
    "glacier",
    "scrub",
    "forest",
  ] as const;
  const base = namedFlavor("light").landcover as unknown as Record<
    string,
    string
  >;
  for (const key of keys) {
    const color = PARCHMENT_LANDCOVER_COLORS[key];
    assert(color !== undefined, `${key} の色が定義されていること`);
    assert(color !== base[key], `${key} は light flavor から変更されること`);
    const c = rgba(color);
    assert(saturation(c) < 0.3, `landcover.${key}=${color} は低彩度のはず`);
    // 緑被覆も含めて暖色（オリーブ）側に寄せる: 青が最も弱い
    assert(
      c[2] <= c[0] && c[2] <= c[1],
      `landcover.${key}=${color} は青が最も弱い（オリーブ/羊皮紙寄り）はず`,
    );
  }
});

Deno.test("parchmentFlavor は light flavor の上書きで、未指定キーは維持する", () => {
  const base = namedFlavor("light");
  const flavor = parchmentFlavor();
  assertEquals(flavor.background, PARCHMENT_FLAVOR_OVERRIDES.background);
  assertEquals(flavor.earth, PARCHMENT_FLAVOR_OVERRIDES.earth);
  assertEquals(flavor.water, PARCHMENT_FLAVOR_OVERRIDES.water);
  assertEquals(flavor.landcover, PARCHMENT_LANDCOVER_COLORS);
  // 採用しないレイヤー（建物・道路等）の色は light flavor のまま
  assertEquals(flavor.buildings, base.buildings);
  assertEquals(flavor.highway, base.highway);
});

Deno.test("parchmentFlavor は namedFlavor('light') を破壊的に変更しない", () => {
  parchmentFlavor();
  const base = namedFlavor("light");
  assertEquals(base.earth, "#e2dfda");
  assertEquals(base.water, "#80deea");
});

Deno.test("buildBasemapStyle の background / earth / water に羊皮紙色が反映される", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const byId = new Map(style.layers.map((l) => [l.id, l]));
  const paintOf = (id: string): Record<string, unknown> => {
    const layer = byId.get(id);
    assert(layer !== undefined, `${id} レイヤーが存在すること`);
    return layer.paint as Record<string, unknown>;
  };
  assertEquals(
    paintOf("background")["background-color"],
    PARCHMENT_FLAVOR_OVERRIDES.background,
  );
  assertEquals(
    paintOf("earth")["fill-color"],
    PARCHMENT_FLAVOR_OVERRIDES.earth,
  );
  assertEquals(
    paintOf("water")["fill-color"],
    PARCHMENT_FLAVOR_OVERRIDES.water,
  );
});

Deno.test("buildBasemapStyle の landcover に羊皮紙系のオリーブが反映され、light flavor の緑が残らない", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const landcover = style.layers.find((l) => l.id === "landcover");
  assert(landcover !== undefined);
  const paint = landcover.paint as Record<string, unknown>;
  const serialized = JSON.stringify(paint["fill-color"]);
  for (const color of Object.values(PARCHMENT_LANDCOVER_COLORS)) {
    assert(
      serialized.includes(color),
      `landcover の fill-color に ${color} が含まれること`,
    );
  }
  const baseLandcover = namedFlavor("light").landcover as unknown as Record<
    string,
    string
  >;
  for (const color of Object.values(baseLandcover)) {
    assert(
      !serialized.includes(color),
      `light flavor の landcover 色 ${color} は残らないこと`,
    );
  }
});

Deno.test("buildBasemapStyle に light flavor の現代的な色（シアンの海・グレー背景）が残らない", () => {
  const style = buildBasemapStyle(BASEMAP_PMTILES_URL);
  const serialized = JSON.stringify(style.layers);
  for (const legacy of ["#80deea", "#e2dfda", "#cccccc", "#e7e7e7"]) {
    assert(!serialized.includes(legacy), `${legacy} は残らないこと`);
  }
});
