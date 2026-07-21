import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Position } from "geojson";
import {
  extractHreExtent,
  HRE_NAME,
  isHreFeature,
  shouldHighlightHre,
} from "./hre_extent.ts";
import {
  CITY_LAYER_ID,
  HRE_LAYER_ID,
  POWER_LAYER_ID,
  RIVERS_LAYER_ID,
} from "./picking.ts";

/** テスト用の Feature を組み立てる */
function feature(
  properties: Feature["properties"],
  ring: Position[] = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]],
): Feature {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

// ---- isHreFeature ----

Deno.test("isHreFeature は NAME が Holy Roman Empire なら true", () => {
  assert(isHreFeature({ NAME: HRE_NAME, SUBJECTO: HRE_NAME }, {}));
});

Deno.test("isHreFeature は SUBJECTO が Holy Roman Empire の領邦で true", () => {
  // base データの HRE 従属勢力（例: europe_1000 の Duchy of Swabia）
  assert(isHreFeature({ NAME: "Duchy of Swabia", SUBJECTO: HRE_NAME }, {}));
});

Deno.test("isHreFeature は renames 正規化後の SUBJECTO でも判定する", () => {
  // SUBJECTO 生値の綴りゆれを name-overrides.json の renames で正規化してから比較
  assert(
    isHreFeature(
      { NAME: "Bavaria", SUBJECTO: "Holy Roman Emp." },
      { "Holy Roman Emp.": HRE_NAME },
    ),
  );
});

Deno.test("isHreFeature は HRE と無関係な勢力で false", () => {
  // 独立勢力は SUBJECTO が自己参照（NAME と同じ）になっている
  assert(!isHreFeature({ NAME: "France", SUBJECTO: "France" }, {}));
  assert(!isHreFeature({ NAME: "Granada", SUBJECTO: "Castille" }, {}));
});

Deno.test("isHreFeature は properties 欠落・NAME/SUBJECTO 無しで false", () => {
  assert(!isHreFeature(null, {}));
  assert(!isHreFeature({}, {}));
  assert(!isHreFeature({ NAME: "", SUBJECTO: "" }, {}));
});

// ---- extractHreExtent ----

Deno.test("extractHreExtent は NAME=Holy Roman Empire の feature だけを返す", () => {
  const hre = feature({ NAME: HRE_NAME, SUBJECTO: HRE_NAME });
  const france = feature({ NAME: "France", SUBJECTO: "France" });
  // SUBJECTO=HRE の領邦は帝国「本体」の範囲ではないため含めない
  const vassal = feature({ NAME: "Duchy of Swabia", SUBJECTO: HRE_NAME });
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [france, hre, vassal],
  };
  const extent = extractHreExtent(fc);
  assertEquals(extent.type, "FeatureCollection");
  assertEquals(extent.features, [hre]);
});

Deno.test("extractHreExtent は複数の HRE feature を全て保持する", () => {
  // europe_1530 / europe_1600 のように HRE 本体が複数 feature の年代がある
  const hre1 = feature({ NAME: HRE_NAME, SUBJECTO: HRE_NAME });
  const hre2 = feature(
    { NAME: HRE_NAME, SUBJECTO: HRE_NAME },
    [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]],
  );
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [hre1, hre2],
  };
  assertEquals(extractHreExtent(fc).features.length, 2);
});

Deno.test("extractHreExtent は HRE が無ければ空 FeatureCollection を返す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [feature({ NAME: "France", SUBJECTO: "France" })],
  };
  assertEquals(extractHreExtent(fc).features, []);
});

// ---- shouldHighlightHre ----

Deno.test("shouldHighlightHre は powers レイヤーの HRE 本体で true", () => {
  assert(
    shouldHighlightHre(
      POWER_LAYER_ID,
      { NAME: HRE_NAME, SUBJECTO: HRE_NAME },
      {},
    ),
  );
});

Deno.test("shouldHighlightHre は powers レイヤーの HRE 従属勢力でも true", () => {
  assert(
    shouldHighlightHre(
      POWER_LAYER_ID,
      { NAME: "Duchy of Swabia", SUBJECTO: HRE_NAME },
      {},
    ),
  );
});

Deno.test("shouldHighlightHre は hre-powers レイヤーの任意 feature で true", () => {
  // hre_* の領邦は SUBJECTO=Holy Roman Empire だが、レイヤー ID だけで足りる
  assert(shouldHighlightHre(HRE_LAYER_ID, { NAME: "Bavaria" }, {}));
  assert(shouldHighlightHre(HRE_LAYER_ID, undefined, {}));
});

Deno.test("shouldHighlightHre は powers レイヤーの非 HRE 勢力で false", () => {
  assert(
    !shouldHighlightHre(
      POWER_LAYER_ID,
      { NAME: "France", SUBJECTO: "France" },
      {},
    ),
  );
});

Deno.test("shouldHighlightHre は都市・河川レイヤーで false", () => {
  assert(!shouldHighlightHre(CITY_LAYER_ID, undefined, {}));
  assert(
    !shouldHighlightHre(RIVERS_LAYER_ID, { NAME: HRE_NAME }, {}),
  );
});

Deno.test("shouldHighlightHre は picking なし（layerId 無し）で false", () => {
  assert(!shouldHighlightHre(undefined, undefined, {}));
});
