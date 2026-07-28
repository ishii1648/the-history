import { assert, assertEquals, assertThrows } from "@std/assert";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import { SNAPSHOT_YEARS } from "../src/config.ts";
import { colorKeyFor } from "../src/powers.ts";
import {
  applyNameOverrides,
  applyPropertyFixes,
  BASE_FIEF_SPLITS,
  buildIndex,
  buildSourceUrl,
  clipToBbox,
  EUROPE_BBOX,
  normalizeSubjectProps,
  resolveName,
  shrinkToLimit,
  SIMPLIFY_TOLERANCES,
  SOURCE_COMMIT,
  SOURCE_LICENSE,
  SOURCE_REPO,
  splitFiefFromBase,
  unionByName,
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
  assertEquals(YEARS.length, 19);
  assertEquals(YEARS[0], 1000);
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

Deno.test("applyPropertyFixes は該当年の同名 feature を全て上書きする（TASK-102）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiPolygonFeature(
        { NAME: "Lombardy", SUBJECTO: "3", BORDERPRECISION: 0 },
        [[0, 0, 1, 1]],
      ),
      multiPolygonFeature(
        { NAME: "Lombardy", SUBJECTO: "3", BORDERPRECISION: 0 },
        [[2, 2, 3, 3]],
      ),
      multiPolygonFeature({ NAME: "Venice", SUBJECTO: "Venice" }, [[
        4,
        4,
        5,
        5,
      ]]),
    ],
  };
  const fixes = [{
    years: [1783],
    name: "Lombardy",
    set: { SUBJECTO: "Lombardy", BORDERPRECISION: 3 },
  }];

  const result = applyPropertyFixes(fc, 1783, fixes);

  for (const index of [0, 1]) {
    assertEquals(result.features[index].properties?.SUBJECTO, "Lombardy");
    assertEquals(result.features[index].properties?.BORDERPRECISION, 3);
  }
  // 対象外の feature は素通しする
  assertEquals(result.features[2].properties?.SUBJECTO, "Venice");
});

Deno.test("applyPropertyFixes は対象年以外に適用しない（TASK-102）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiPolygonFeature({ NAME: "Lombardy", SUBJECTO: "3" }, [[0, 0, 1, 1]]),
    ],
  };
  const fixes = [{
    years: [1783],
    name: "Lombardy",
    set: { SUBJECTO: "Lombardy" },
  }];

  assertEquals(
    applyPropertyFixes(fc, 1800, fixes).features[0].properties?.SUBJECTO,
    "3",
  );
});

Deno.test("applyPropertyFixes は当たらなかった上書きを警告する（TASK-102）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [multiPolygonFeature({ NAME: "Venice" }, [[0, 0, 1, 1]])],
  };
  const warnings: string[] = [];

  applyPropertyFixes(
    fc,
    1783,
    [{ years: [1783], name: "Lombardy", set: { SUBJECTO: "Lombardy" } }],
    (message) => warnings.push(message),
  );

  assertEquals(warnings.length, 1);
  assert(warnings[0].includes("Lombardy"));
});

Deno.test("normalizeSubjectProps は空の SUBJECTO / PARTOF を NAME で埋める（TASK-102）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiPolygonFeature({ NAME: "Sweden", SUBJECTO: "", PARTOF: null }, [[
        0,
        0,
        1,
        1,
      ]]),
      multiPolygonFeature(
        { NAME: "Britany", SUBJECTO: "France", PARTOF: "France" },
        [[2, 2, 3, 3]],
      ),
      // NAME が無い feature（上流がどの勢力にも帰属させていない土地）は対象外
      multiPolygonFeature({ NAME: null, SUBJECTO: null, PARTOF: null }, [[
        4,
        4,
        5,
        5,
      ]]),
    ],
  };

  const result = normalizeSubjectProps(fc);

  assertEquals(result.features[0].properties?.SUBJECTO, "Sweden");
  assertEquals(result.features[0].properties?.PARTOF, "Sweden");
  assertEquals(result.features[1].properties?.SUBJECTO, "France");
  assertEquals(result.features[2].properties?.SUBJECTO, null);
  assertEquals(result.features[2].properties?.NAME, null);
});

Deno.test("normalizeSubjectProps は色キーを変えない（TASK-102）", () => {
  // 空 → 自己参照は表示上の意味を変えない、が normalizeSubjectProps の前提。
  const empty = { NAME: "Sweden", SUBJECTO: "", PARTOF: null };
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [multiPolygonFeature(empty, [[0, 0, 1, 1]])],
  };

  assertEquals(
    colorKeyFor(normalizeSubjectProps(fc).features[0].properties),
    colorKeyFor(empty),
  );
});

Deno.test("buildIndex は年一覧と出典メタを返す", () => {
  const source = { repo: "r", commit: "c", license: "GPL-3.0" };
  assertEquals(buildIndex([1000, 1100], source), {
    years: [1000, 1100],
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

// --- TASK-101: 半独立の封土を base から切り出す ---

/** 正方形 1 枚の Polygon feature */
function squareFeature(
  properties: Record<string, unknown>,
  [minX, minY, maxX, maxY]: [number, number, number, number],
): Feature<Polygon> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[
        [minX, minY],
        [minX, maxY],
        [maxX, maxY],
        [maxX, minY],
        [minX, minY],
      ]],
    },
  };
}

const NORMANDY_SPLIT = BASE_FIEF_SPLITS[0];

Deno.test("unionByName は同名 feature を 1 つに統合し、該当が無ければ null", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      squareFeature({ NAME: "a" }, [0, 0, 1, 1]),
      squareFeature({ NAME: "a" }, [1, 0, 2, 1]),
      squareFeature({ NAME: "b" }, [5, 5, 6, 6]),
    ],
  };
  const merged = unionByName(fc, "a");
  assert(merged !== null);
  assert(booleanPointInPolygon([0.5, 0.5], merged));
  assert(booleanPointInPolygon([1.5, 0.5], merged));
  assertEquals(unionByName(fc, "z"), null);
});

Deno.test("splitFiefFromBase は封土を切り出して独立 feature を立てる", () => {
  const base: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      squareFeature({ NAME: "Kingdom of France", SUBJECTO: "France" }, [
        0,
        0,
        10,
        10,
      ]),
      squareFeature({ NAME: "England", SUBJECTO: "England" }, [
        -5,
        12,
        -1,
        16,
      ]),
    ],
  };
  // base をはみ出す区画（北へ 2 度はみ出す）を渡し、交差だけが使われることを見る
  const fief = squareFeature({ NAME: "Duchy of Normandy" }, [1, 8, 4, 12]);
  const result = splitFiefFromBase(base, fief, NORMANDY_SPLIT);

  const normandy = result.features.find((f) =>
    f.properties?.NAME === "Duchy of Normandy"
  );
  assert(normandy !== undefined, "封土の feature が立っていない");
  // 独立勢力として扱う（SUBJECTO が NAME 自身）
  assertEquals(normandy.properties?.SUBJECTO, "Duchy of Normandy");
  assert(booleanPointInPolygon([2, 9], normandy as Feature<Polygon>));
  // base の外へははみ出さない
  assert(!booleanPointInPolygon([2, 11], normandy as Feature<Polygon>));

  const france = result.features.find((f) =>
    f.properties?.NAME === "Kingdom of France"
  );
  assert(france !== undefined);
  assert(
    !booleanPointInPolygon([2, 9], france as Feature<Polygon>),
    "王国側から封土が差し引かれていない",
  );
  assert(
    booleanPointInPolygon([8, 9], france as Feature<Polygon>),
    "王国の残りの領域が失われている",
  );

  // 他勢力は一切変えない
  assertEquals(
    result.features.find((f) => f.properties?.NAME === "England"),
    base.features[1],
  );
  // 封土は切り出し元の直後（決定的な並び）
  assertEquals(result.features.map((f) => f.properties?.NAME), [
    "Kingdom of France",
    "Duchy of Normandy",
    "England",
  ]);
});

Deno.test("splitFiefFromBase は丸ごと封土になった飛び地を落とす", () => {
  const base: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      squareFeature({ NAME: "Kingdom of France" }, [0, 0, 2, 2]),
      squareFeature({ NAME: "Kingdom of France" }, [5, 5, 7, 7]),
    ],
  };
  const fief = squareFeature({ NAME: "Duchy of Normandy" }, [4, 4, 8, 8]);
  const result = splitFiefFromBase(base, fief, NORMANDY_SPLIT);
  assertEquals(result.features.map((f) => f.properties?.NAME), [
    "Kingdom of France",
    "Duchy of Normandy",
  ]);
});

Deno.test("splitFiefFromBase は切り出せないとき警告して base をそのまま返す", () => {
  const base: FeatureCollection = {
    type: "FeatureCollection",
    features: [squareFeature({ NAME: "Kingdom of France" }, [0, 0, 2, 2])],
  };
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(message);

  // 交差しない区画
  const apart = squareFeature({ NAME: "Duchy of Normandy" }, [20, 20, 21, 21]);
  assertEquals(splitFiefFromBase(base, apart, NORMANDY_SPLIT, warn), base);

  // 切り出し元が存在しない
  const other: FeatureCollection = {
    type: "FeatureCollection",
    features: [squareFeature({ NAME: "England" }, [0, 0, 2, 2])],
  };
  const fief = squareFeature({ NAME: "Duchy of Normandy" }, [0, 0, 1, 1]);
  assertEquals(splitFiefFromBase(other, fief, NORMANDY_SPLIT, warn), other);
  assertEquals(warnings.length, 2);
});

Deno.test("BASE_FIEF_SPLITS は 1000/1100 のノルマンディーを独立勢力として切り出す", () => {
  const normandy = BASE_FIEF_SPLITS.filter(
    (s) => s.fiefName === "Duchy of Normandy",
  );
  assertEquals(normandy.map((s) => s.year), [1000, 1100]);
  for (const split of normandy) {
    assertEquals(split.fromName, "Kingdom of France");
    // 独立勢力（自己参照）。名目上の宗主をフランス王とする補正は行わない
    assertEquals(split.subjecto, split.fiefName);
    assertEquals(
      split.fiefPath,
      `data/france_fiefs_flat_${split.year}.geojson`,
    );
  }
});

Deno.test("BASE_FIEF_SPLITS は 1279/1300 の帝国塗り封土を正しい宗主で切り出す（TASK-124）", () => {
  // 上流 base が Holy Roman Empire の単一ポリゴンに含めて塗っている
  // 仏封土（Artois / Saint-Pol / Flanders）とリミニを切り出す。宗主の確定は
  // propertyFixes（data/name-overrides.json）が後段で行うが、切り出し直後から
  // 正しい宗主を持つよう subjecto にも同じ値を宣言する。
  const carved = BASE_FIEF_SPLITS.filter(
    (s) => s.fromName === "Holy Roman Empire",
  );
  const expected: Array<[number, string, string, string]> = [
    [
      1279,
      "Counts of Saint-Pol",
      "France",
      "data/france_fiefs_flat_1279.geojson",
    ],
    [1279, "County of Artois", "France", "data/france_fiefs_flat_1279.geojson"],
    [
      1279,
      "County of Flanders",
      "France",
      "data/france_fiefs_flat_1279.geojson",
    ],
    [
      1300,
      "Counts of Saint-Pol",
      "France",
      "data/france_fiefs_flat_1300.geojson",
    ],
    [1300, "County of Artois", "France", "data/france_fiefs_flat_1300.geojson"],
    [
      1300,
      "County of Flanders",
      "France",
      "data/france_fiefs_flat_1300.geojson",
    ],
    [
      1300,
      "Lordship of Rimini",
      "Papal States",
      "data/italy_fiefs_flat_1300.geojson",
    ],
  ];
  assertEquals(
    carved
      .map((
        s,
      ): [number, string, string, string] => [
        s.year,
        s.fiefName,
        s.subjecto,
        s.fiefPath,
      ])
      .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], "en")),
    expected,
  );
});

/** ノルマンディー公領の内陸点（簡略化後も内側に残る位置を選ぶ） */
const NORMANDY_POINTS: Array<[string, [number, number]]> = [
  ["ルーアン", [1.10, 49.44]],
  ["カーン", [-0.37, 49.18]],
  ["バイユー", [-0.70, 49.28]],
  ["リジュー", [0.23, 49.15]],
];

/** フランス王領（ノルマンディー外）の点 */
const FRANCE_POINTS: Array<[string, [number, number]]> = [
  ["パリ", [2.35, 48.85]],
  ["オルレアン", [1.90, 47.90]],
  ["ブールジュ", [2.40, 47.08]],
];

/** イングランドの点 */
const ENGLAND_POINTS: Array<[string, [number, number]]> = [
  ["ロンドン", [-0.12, 51.51]],
  ["ヨーク", [-1.08, 53.96]],
];

function readBase(year: number): FeatureCollection {
  return JSON.parse(
    Deno.readTextFileSync(`data/europe_${year}.geojson`),
  ) as FeatureCollection;
}

function namesAt(
  fc: FeatureCollection,
  point: [number, number],
): string[] {
  return fc.features
    .filter((f) =>
      f.geometry !== null &&
      (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") &&
      booleanPointInPolygon(point, f as Feature<Polygon | MultiPolygon>)
    )
    .map((f) => String(f.properties?.NAME));
}

for (const year of [1000, 1100]) {
  Deno.test(`${year} 年の base はノルマンディーをフランス王国領に含めない`, () => {
    const base = readBase(year);
    for (const [label, point] of NORMANDY_POINTS) {
      const names = namesAt(base, point);
      assert(
        !names.includes("Kingdom of France"),
        `${label} が Kingdom of France に含まれている: ${names.join(", ")}`,
      );
      assert(
        names.includes("Duchy of Normandy"),
        `${label} が Duchy of Normandy に含まれていない: ${names.join(", ")}`,
      );
    }
  });

  Deno.test(`${year} 年の base のノルマンディーは独立勢力として立っている`, () => {
    const base = readBase(year);
    const normandy = base.features.filter((f) =>
      f.properties?.NAME === "Duchy of Normandy"
    );
    assertEquals(normandy.length, 1);
    assertEquals(normandy[0].properties?.SUBJECTO, "Duchy of Normandy");
  });

  Deno.test(`${year} 年の base はフランス王国とイングランドの他領域を保つ`, () => {
    const base = readBase(year);
    for (const [label, point] of FRANCE_POINTS) {
      const names = namesAt(base, point);
      assert(
        names.includes("Kingdom of France"),
        `${label} が Kingdom of France から失われた: ${names.join(", ")}`,
      );
    }
    for (const [label, point] of ENGLAND_POINTS) {
      const names = namesAt(base, point);
      assert(
        names.includes("England"),
        `${label} が England から失われた: ${names.join(", ")}`,
      );
      assert(
        !names.includes("Duchy of Normandy"),
        `${label} に Duchy of Normandy が及んでいる: ${names.join(", ")}`,
      );
    }
  });
}

Deno.test("切り出しの対象外年（1200）の base には Duchy of Normandy を作らない", () => {
  const base = readBase(1200);
  assertEquals(
    base.features.filter((f) => f.properties?.NAME === "Duchy of Normandy")
      .length,
    0,
  );
});
