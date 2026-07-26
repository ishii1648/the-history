import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import type { Feature, FeatureCollection, Position } from "geojson";
import {
  applySuzerainOverrides,
  buildSuzerainExtent,
  createSuzerainExtentCache,
  EMPTY_SUZERAIN_OVERRIDES,
  extractSuzerainMembers,
  parseSuzerainOverrides,
  resolveSuzerainKey,
  suzerainExtentKey,
  type SuzerainOverrides,
} from "./suzerain_extent.ts";
import {
  CITY_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
  ITALY_FIEF_LAYER_ID,
  POWER_LAYER_ID,
  RIVERS_LAYER_ID,
} from "./picking.ts";

const HRE = "Holy Roman Empire";

/** テスト用の overrides を組み立てる */
function overrides(
  renames: Record<string, string> = {},
  suzerains: Record<string, string> = {},
): SuzerainOverrides {
  return { renames, suzerains };
}

/** テスト用の Feature を組み立てる（既定は単位正方形） */
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

/** 矩形リング（左下 x,y から幅 w 高さ h） */
function box(x: number, y: number, w = 1, h = 1): Position[] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
}

function collection(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

// ---- parseSuzerainOverrides ----

Deno.test("parseSuzerainOverrides は renames と suzerains を読む", () => {
  const parsed = parseSuzerainOverrides({
    renames: { Castilla: "Castile" },
    suzerains: { Britany: "France" },
  });
  assertEquals(parsed.renames, { Castilla: "Castile" });
  assertEquals(parsed.suzerains, { Britany: "France" });
});

Deno.test("parseSuzerainOverrides は欠落・不正な入力で空マップを返す", () => {
  assertEquals(parseSuzerainOverrides(null), EMPTY_SUZERAIN_OVERRIDES);
  assertEquals(parseSuzerainOverrides({}), EMPTY_SUZERAIN_OVERRIDES);
  assertEquals(
    parseSuzerainOverrides({ renames: "x", suzerains: 1 }),
    EMPTY_SUZERAIN_OVERRIDES,
  );
});

// ---- resolveSuzerainKey ----

Deno.test("resolveSuzerainKey は SUBJECTO を宗主キーとして返す", () => {
  assertEquals(
    resolveSuzerainKey(
      { NAME: "Kingdom of France", SUBJECTO: "France" },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    "France",
  );
});

Deno.test("resolveSuzerainKey は独立勢力（SUBJECTO が自己参照）で NAME を返す", () => {
  assertEquals(
    resolveSuzerainKey(
      { NAME: "Denmark", SUBJECTO: "Denmark" },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    "Denmark",
  );
});

Deno.test("resolveSuzerainKey は SUBJECTO を renames で正規化する", () => {
  // europe_1200 の Castile は SUBJECTO が綴りゆれ "Castilla"。正規化すると
  // NAME と一致するため独立勢力として扱われる
  assertEquals(
    resolveSuzerainKey(
      { NAME: "Castile", SUBJECTO: "Castilla" },
      overrides({ Castilla: "Castile" }),
    ),
    "Castile",
  );
});

Deno.test("resolveSuzerainKey は SUBJECTO 欠落時に NAME へフォールバックする", () => {
  // 仏諸侯領オーバーレイ（france_fiefs_flat_*）は SUBJECTO を持たない
  assertEquals(
    resolveSuzerainKey({ NAME: "Normandy" }, EMPTY_SUZERAIN_OVERRIDES),
    "Normandy",
  );
});

Deno.test("resolveSuzerainKey は宗主補正テーブルを SUBJECTO より優先する", () => {
  // base は Britany を独立勢力として持つが、史実ではフランス王の封土
  assertEquals(
    resolveSuzerainKey(
      { NAME: "Britany", SUBJECTO: "Britany" },
      overrides({}, { Britany: "France" }),
    ),
    "France",
  );
});

Deno.test("resolveSuzerainKey は補正適用後も冪等（SUBJECTO 書き換え済みでも同じ）", () => {
  assertEquals(
    resolveSuzerainKey(
      { NAME: "Britany", SUBJECTO: "France" },
      overrides({}, { Britany: "France" }),
    ),
    "France",
  );
});

Deno.test("resolveSuzerainKey は NAME を持たない feature で null", () => {
  assertEquals(resolveSuzerainKey(null, EMPTY_SUZERAIN_OVERRIDES), null);
  assertEquals(resolveSuzerainKey({}, EMPTY_SUZERAIN_OVERRIDES), null);
  assertEquals(
    resolveSuzerainKey({ NAME: "" }, EMPTY_SUZERAIN_OVERRIDES),
    null,
  );
});

// ---- suzerainExtentKey ----

Deno.test("suzerainExtentKey は powers レイヤーで宗主キーを返す", () => {
  assertEquals(
    suzerainExtentKey(
      POWER_LAYER_ID,
      { NAME: "Comté de Toulouse", SUBJECTO: "France" },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    "France",
  );
});

Deno.test("suzerainExtentKey は HRE 本体・従属勢力で Holy Roman Empire を返す", () => {
  assertEquals(
    suzerainExtentKey(
      POWER_LAYER_ID,
      { NAME: HRE, SUBJECTO: HRE },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    HRE,
  );
  assertEquals(
    suzerainExtentKey(
      POWER_LAYER_ID,
      { NAME: "Duchy of Swabia", SUBJECTO: HRE },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    HRE,
  );
});

Deno.test("suzerainExtentKey は hre-powers レイヤーの領邦で宗主キーを返す", () => {
  // 領邦オーバーレイは全 feature が SUBJECTO=Holy Roman Empire
  assertEquals(
    suzerainExtentKey(
      HRE_LAYER_ID,
      { NAME: "Bavaria", SUBJECTO: HRE },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    HRE,
  );
});

Deno.test("suzerainExtentKey は単独勢力で自分自身のキーを返す", () => {
  assertEquals(
    suzerainExtentKey(
      POWER_LAYER_ID,
      { NAME: "Denmark", SUBJECTO: "Denmark" },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    "Denmark",
  );
});

Deno.test("suzerainExtentKey は仏諸侯領・伊諸侯領・都市・河川・picking なしで null", () => {
  // 仏諸侯領は宗主プロパティを持たず、外枠の入力にもしない（TASK-94 の範囲仕様）
  assertEquals(
    suzerainExtentKey(
      FRANCE_FIEF_LAYER_ID,
      { NAME: "Normandy" },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    null,
  );
  // 伊諸侯領も同様（properties は NAME / ADMIN_LEVEL / OHM_RELATION_ID /
  // START_DATE / END_DATE / OHM_NAME で SUBJECTO を持たない。TASK-95/96）。
  // 帝国範囲の外枠は base（europe_<year>）の Holy Roman Empire から描かれ、
  // 伊諸侯領をホバーしても帝国全体が囲まれることはない。
  assertEquals(
    suzerainExtentKey(
      ITALY_FIEF_LAYER_ID,
      { NAME: "Republic of Florence" },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    null,
  );
  assertEquals(
    suzerainExtentKey(CITY_LAYER_ID, undefined, EMPTY_SUZERAIN_OVERRIDES),
    null,
  );
  assertEquals(
    suzerainExtentKey(
      RIVERS_LAYER_ID,
      { NAME: "Rhine" },
      EMPTY_SUZERAIN_OVERRIDES,
    ),
    null,
  );
  assertEquals(
    suzerainExtentKey(undefined, undefined, EMPTY_SUZERAIN_OVERRIDES),
    null,
  );
});

// ---- extractSuzerainMembers ----

const FRANCE = feature(
  { NAME: "Kingdom of France", SUBJECTO: "France" },
  box(0, 0),
);
const TOULOUSE = feature(
  { NAME: "Comté de Toulouse", SUBJECTO: "France" },
  box(1, 0),
);
const BRITANY = feature({ NAME: "Britany", SUBJECTO: "Britany" }, box(2, 0));
const ANGEVIN = feature(
  { NAME: "Angevin Empire", SUBJECTO: "Angevin Empire" },
  box(5, 5),
);
const DENMARK = feature({ NAME: "Denmark", SUBJECTO: "Denmark" }, box(9, 9));
const BASE = collection([FRANCE, TOULOUSE, BRITANY, ANGEVIN, DENMARK]);

Deno.test("extractSuzerainMembers は宗主に属する全 feature を返す", () => {
  const members = extractSuzerainMembers(
    BASE,
    "France",
    EMPTY_SUZERAIN_OVERRIDES,
  );
  assertEquals(members.map((f) => f.properties?.NAME), [
    "Kingdom of France",
    "Comté de Toulouse",
  ]);
});

Deno.test("extractSuzerainMembers は宗主補正された封臣も含める", () => {
  const members = extractSuzerainMembers(
    BASE,
    "France",
    overrides({}, { Britany: "France" }),
  );
  assertEquals(members.map((f) => f.properties?.NAME), [
    "Kingdom of France",
    "Comté de Toulouse",
    "Britany",
  ]);
});

Deno.test("extractSuzerainMembers は単独勢力で自分自身だけを返す（非波及）", () => {
  const members = extractSuzerainMembers(
    BASE,
    "Denmark",
    overrides({}, { Britany: "France" }),
  );
  assertEquals(members.map((f) => f.properties?.NAME), ["Denmark"]);
});

Deno.test("extractSuzerainMembers はアンジュー帝国をフランスへ含めない", () => {
  const france = extractSuzerainMembers(
    BASE,
    "France",
    overrides({}, { Britany: "France" }),
  );
  assert(!france.some((f) => f.properties?.NAME === "Angevin Empire"));
  const angevin = extractSuzerainMembers(
    BASE,
    "Angevin Empire",
    EMPTY_SUZERAIN_OVERRIDES,
  );
  assertEquals(angevin.map((f) => f.properties?.NAME), ["Angevin Empire"]);
});

Deno.test("extractSuzerainMembers は key が null・該当なしで空配列", () => {
  assertEquals(
    extractSuzerainMembers(BASE, null, EMPTY_SUZERAIN_OVERRIDES),
    [],
  );
  assertEquals(
    extractSuzerainMembers(BASE, "Aragón", EMPTY_SUZERAIN_OVERRIDES),
    [],
  );
});

// ---- buildSuzerainExtent ----

Deno.test("buildSuzerainExtent は隣接する構成 feature を 1 つの外縁へ融合する", () => {
  // 辺を共有する 2 枚（0..1 と 1..2）の union は 0..2 の 1 ポリゴンになり、
  // 内部の境界線（x=1）は外縁に残らない
  const extent = buildSuzerainExtent(BASE, "France", EMPTY_SUZERAIN_OVERRIDES);
  assertEquals(extent.features.length, 1);
  const geom = extent.features[0].geometry;
  assert(geom.type === "Polygon");
  const xs = geom.coordinates[0].map(([x]) => x);
  assertEquals(Math.min(...xs), 0);
  assertEquals(Math.max(...xs), 2);
});

Deno.test("buildSuzerainExtent は飛び地（非隣接）を MultiPolygon として保つ", () => {
  const detached = collection([
    feature({ NAME: "A", SUBJECTO: "S" }, box(0, 0)),
    feature({ NAME: "B", SUBJECTO: "S" }, box(10, 10)),
  ]);
  const extent = buildSuzerainExtent(detached, "S", EMPTY_SUZERAIN_OVERRIDES);
  assertEquals(extent.features.length, 1);
  assertEquals(extent.features[0].geometry.type, "MultiPolygon");
});

Deno.test("buildSuzerainExtent は宗主補正された封臣を外枠に含める", () => {
  // Britany（2..3）を含めると外縁は 0..3 まで伸びる
  const extent = buildSuzerainExtent(
    BASE,
    "France",
    overrides({}, { Britany: "France" }),
  );
  const geom = extent.features[0].geometry;
  assert(geom.type === "Polygon");
  const xs = geom.coordinates[0].map(([x]) => x);
  assertEquals(Math.max(...xs), 3);
});

Deno.test("buildSuzerainExtent は key が null で空 FeatureCollection", () => {
  const extent = buildSuzerainExtent(BASE, null, EMPTY_SUZERAIN_OVERRIDES);
  assertEquals(extent.features, []);
});

Deno.test("buildSuzerainExtent は宗主キーを外枠 feature の properties に残す", () => {
  const extent = buildSuzerainExtent(BASE, "France", EMPTY_SUZERAIN_OVERRIDES);
  assertEquals(extent.features[0].properties?.NAME, "France");
});

Deno.test("buildSuzerainExtent は単独勢力でそのポリゴンをそのまま外枠にする", () => {
  // union は 2 件未満を受け付けない。最も多いこのケースで例外・警告を出さない
  const extent = buildSuzerainExtent(BASE, "Denmark", EMPTY_SUZERAIN_OVERRIDES);
  assertEquals(extent.features.length, 1);
  assertStrictEquals(extent.features[0], DENMARK);
});

// ---- createSuzerainExtentCache ----

Deno.test("createSuzerainExtentCache は同じ入力で同一インスタンスを返す", () => {
  const cache = createSuzerainExtentCache();
  const a = cache(BASE, "France", EMPTY_SUZERAIN_OVERRIDES);
  const b = cache(BASE, "France", EMPTY_SUZERAIN_OVERRIDES);
  assertStrictEquals(a, b);
});

Deno.test("createSuzerainExtentCache はキーを跨いでも再計算結果を保持する", () => {
  const cache = createSuzerainExtentCache();
  const france = cache(BASE, "France", EMPTY_SUZERAIN_OVERRIDES);
  cache(BASE, "Denmark", EMPTY_SUZERAIN_OVERRIDES);
  assertStrictEquals(cache(BASE, "France", EMPTY_SUZERAIN_OVERRIDES), france);
});

Deno.test("createSuzerainExtentCache は base が変わればキャッシュを捨てる", () => {
  const cache = createSuzerainExtentCache();
  const first = cache(BASE, "Denmark", EMPTY_SUZERAIN_OVERRIDES);
  const other = collection([DENMARK]);
  const second = cache(other, "Denmark", EMPTY_SUZERAIN_OVERRIDES);
  assert(first !== second);
});

// ---- applySuzerainOverrides ----

Deno.test("applySuzerainOverrides は補正対象の SUBJECTO を書き換える", () => {
  const applied = applySuzerainOverrides(
    BASE,
    overrides({}, { Britany: "France" }),
  );
  const britany = applied.features.find((f) =>
    f.properties?.NAME === "Britany"
  );
  assertEquals(britany?.properties?.SUBJECTO, "France");
});

Deno.test("applySuzerainOverrides は無関係な feature の properties を変えない", () => {
  const applied = applySuzerainOverrides(
    BASE,
    overrides({}, { Britany: "France" }),
  );
  const denmark = applied.features.find((f) =>
    f.properties?.NAME === "Denmark"
  );
  assertStrictEquals(denmark, DENMARK);
});

Deno.test("applySuzerainOverrides は補正が効かないとき同一インスタンスを返す", () => {
  // deck.gl の差分更新（data 参照同値）を壊さないための参照安定性
  assertStrictEquals(
    applySuzerainOverrides(BASE, EMPTY_SUZERAIN_OVERRIDES),
    BASE,
  );
  assertStrictEquals(
    applySuzerainOverrides(
      BASE,
      overrides({}, { Aquitaine: "Angevin Empire" }),
    ),
    BASE,
  );
});
