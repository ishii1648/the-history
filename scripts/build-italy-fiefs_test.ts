/**
 * scripts/build-italy-fiefs.ts のテスト（TASK-95）。
 * 前半は純粋関数のテストでネットワークに依存しない（AC1）。
 * 後半は生成物 data/italy_fiefs_<year>.geojson そのものを検証する。
 */

import { assert, assertEquals } from "@std/assert";
import type {
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import { SNAPSHOT_YEARS } from "../src/config.ts";
import type { OhmRelation } from "./build-france-fiefs.ts";
import { FRANCE_FIEF_NAMES } from "./build-france-fiefs.ts";
import { HRE_FIEF_NAMES } from "./build-hre-fiefs.ts";
import {
  buildYearCollection,
  ITALY_FIEF_ADMIN_LEVELS,
  ITALY_FIEF_BBOX,
  ITALY_FIEF_DISPLAY_NAME_OVERRIDES,
  ITALY_FIEF_EXCLUDED_NAMES,
  ITALY_FIEF_EXCLUSIONS,
  ITALY_FIEF_NAMES,
  ITALY_FIEF_SIZE_LIMIT_BYTES,
  ITALY_FIEF_YEARS,
  italyFiefDisplayName,
  italyFiefExclusionReason,
  relationName,
  restrictPartsToBbox,
  selectItalyFiefsForYear,
} from "./build-italy-fiefs.ts";
import { MIN_PART_AREA_M2, polygonParts } from "./clean-polygons.ts";
import area from "@turf/area";

/** リングの面積（m²） */
function ringAreaM2(ring: Position[]): number {
  return area({ type: "Polygon", coordinates: [ring] });
}

/** 正方形の外環（[west, south] を左下とする一辺 size 度の四角形） */
function square(west: number, south: number, size = 1): number[][] {
  return [
    [west, south],
    [west + size, south],
    [west + size, south + size],
    [west, south + size],
    [west, south],
  ];
}

/** タグだけのリレーション（Overpass の 1 段目相当） */
function relation(
  id: number,
  tags: Record<string, string>,
): OhmRelation {
  return { type: "relation", id, tags };
}

/** 1 パートだけの MultiPolygon を持つリレーション（Overpass の 2 段目相当） */
function withSquare(
  id: number,
  west: number,
  south: number,
  size = 1,
): OhmRelation {
  return {
    type: "relation",
    id,
    tags: {},
    members: [{
      type: "way",
      ref: id * 10,
      role: "outer",
      geometry: square(west, south, size).map(([lon, lat]) => ({ lon, lat })),
    }],
  };
}

// ---------------------------------------------------------------------------
// 設定値
// ---------------------------------------------------------------------------

Deno.test("取得範囲は実測に使った北・中部イタリアの bbox をピン留めする", () => {
  assertEquals(ITALY_FIEF_BBOX, [42.0, 6.5, 46.6, 14.2]);
});

Deno.test("対象年は SNAPSHOT_YEARS の部分集合", () => {
  for (const year of ITALY_FIEF_YEARS) {
    assert(
      SNAPSHOT_YEARS.includes(year),
      `${year} が SNAPSHOT_YEARS に無い`,
    );
  }
  assertEquals([...ITALY_FIEF_YEARS].sort((a, b) => a - b), [
    ...ITALY_FIEF_YEARS,
  ]);
});

Deno.test("採用する admin_level は 3 / 4 / 6（2 = 主権国家は除く）", () => {
  assertEquals(ITALY_FIEF_ADMIN_LEVELS, [3, 4, 6]);
});

Deno.test("サイズ上限は既存パイプラインと同じ 200 KB", () => {
  assertEquals(ITALY_FIEF_SIZE_LIMIT_BYTES, 200 * 1000);
});

Deno.test("許可リストは昇順・重複なし", () => {
  const sorted = [...ITALY_FIEF_NAMES].sort((a, b) => a.localeCompare(b, "en"));
  assertEquals([...ITALY_FIEF_NAMES], sorted);
  assertEquals(new Set(ITALY_FIEF_NAMES).size, ITALY_FIEF_NAMES.length);
});

Deno.test("許可リストは除外対象と交差しない", () => {
  const allowed = new Set(ITALY_FIEF_NAMES);
  for (const name of Object.keys(ITALY_FIEF_EXCLUDED_NAMES)) {
    assert(!allowed.has(name), `${name} が許可リストと除外リストの両方にある`);
  }
});

Deno.test("除外の分類キーはすべて根拠文を持ち、未使用の分類が無い（AC6）", () => {
  const used = new Set(Object.values(ITALY_FIEF_EXCLUDED_NAMES));
  for (const key of used) {
    assert(
      typeof ITALY_FIEF_EXCLUSIONS[key] === "string" &&
        ITALY_FIEF_EXCLUSIONS[key].length > 0,
      `${key} の根拠が無い`,
    );
  }
  for (const key of Object.keys(ITALY_FIEF_EXCLUSIONS)) {
    assert(used.has(key), `分類 ${key} がどの除外にも使われていない`);
  }
});

Deno.test("許可リストは hre_fiefs / france_fiefs と重複しない（二重塗り防止）", () => {
  const others = new Set([...HRE_FIEF_NAMES, ...FRANCE_FIEF_NAMES]);
  for (const name of ITALY_FIEF_NAMES) {
    assert(!others.has(name), `${name} が他系統の許可リストと重複している`);
  }
});

// ---------------------------------------------------------------------------
// 名前の解決と表示名の上書き（AC4）
// ---------------------------------------------------------------------------

Deno.test("relationName: name:en が無いリレーションは name にフォールバックする", () => {
  // OHM のイタリア系は name:en を持たず name が英語のものがある
  // （County of Asti / Republic of Ancona / Republic of Siena 1350-1555 など）
  assertEquals(
    relationName({ "name:en": "Republic of Genoa", name: "Repùbrica de Zêna" }),
    "Republic of Genoa",
  );
  assertEquals(relationName({ name: "County of Asti" }), "County of Asti");
  assertEquals(relationName({}), null);
});

Deno.test("italyFiefDisplayName: 期間つき曖昧性解消を表示名から外す（AC4）", () => {
  assertEquals(
    italyFiefDisplayName("Republic of Pisa (1399-1406)"),
    "Republic of Pisa",
  );
  assertEquals(
    italyFiefDisplayName("Lordship of Oneglia (1298-1488)"),
    "Lordship of Oneglia",
  );
  assertEquals(
    italyFiefDisplayName("Duchy of Ferrara (1471-1597)"),
    "Duchy of Ferrara",
  );
  // 期間でない括弧は残す
  assertEquals(italyFiefDisplayName("Republic of Genoa"), "Republic of Genoa");
  assertEquals(
    italyFiefDisplayName("Electorate of Saxony(-Wittenberg)"),
    "Electorate of Saxony(-Wittenberg)",
  );
});

Deno.test("表示名の上書き表は許可リストの名前だけを対象にする", () => {
  const allowed = new Set(ITALY_FIEF_NAMES);
  for (const raw of Object.keys(ITALY_FIEF_DISPLAY_NAME_OVERRIDES)) {
    assert(allowed.has(raw), `${raw} が許可リストに無い`);
    assert(
      allowed.has(ITALY_FIEF_DISPLAY_NAME_OVERRIDES[raw]) === false ||
        ITALY_FIEF_DISPLAY_NAME_OVERRIDES[raw] !== raw,
      `${raw} の上書き先が自分自身`,
    );
  }
});

// ---------------------------------------------------------------------------
// 除外規則
// ---------------------------------------------------------------------------

Deno.test("italyFiefExclusionReason: 許可リストに紛れ込んでも他系統・帝国外を落とす", () => {
  // hre_fiefs 側で収録済み
  assert(italyFiefExclusionReason("Duchy of Milan") !== null);
  assert(italyFiefExclusionReason("March of Verona") !== null);
  // 南イタリア（シチリア王国）の州
  assert(italyFiefExclusionReason("Aprutium beyond the Pescara") !== null);
  // ジオメトリが label ノードだけで面にならない
  assert(italyFiefExclusionReason("Lordship of Milan") !== null);
  // 親リレーションに含まれる島
  assert(italyFiefExclusionReason("Genoese Corsica") !== null);
  // 収録するもの
  assertEquals(italyFiefExclusionReason("Republic of Florence"), null);
  assertEquals(italyFiefExclusionReason("Duchy of Spoleto"), null);
});

// ---------------------------------------------------------------------------
// 年ごとの選択（AC3: 同名リレーションの選択規則）
// ---------------------------------------------------------------------------

Deno.test("selectItalyFiefsForYear: 許可リスト外・admin_level 対象外・期間外を落とす", () => {
  const elements = [
    relation(1, {
      "name:en": "Republic of Florence",
      admin_level: "4",
      start_date: "1115",
      end_date: "1405",
    }),
    // 許可リスト外
    relation(2, {
      "name:en": "Duchy of Swabia",
      admin_level: "4",
      start_date: "0922",
      end_date: "1268",
    }),
    // admin_level 2（主権国家）
    relation(3, {
      "name:en": "Republic of Venice",
      admin_level: "2",
      start_date: "1204",
      end_date: "1300",
    }),
    // 期間外
    relation(4, {
      "name:en": "Duchy of Florence",
      admin_level: "4",
      start_date: "1406",
      end_date: "1555",
    }),
  ];
  assertEquals(selectItalyFiefsForYear(elements, 1200).map((e) => e.id), [1]);
});

Deno.test("selectItalyFiefsForYear: 同名は有効期間の短いリレーションを採る（AC3）", () => {
  // 実データの Republic of Pisa。2750719 は 1081〜1406 の包括リレーションで
  // 本土のみ、2853298 は 1184〜1207 の年代スナップショットで本土＋コルシカ。
  const elements = [
    relation(2750719, {
      "name:en": "Republic of Pisa (1399-1406)",
      admin_level: "4",
      start_date: "1081",
      end_date: "1406",
    }),
    relation(2853298, {
      "name:en": "Republic of Pisa (1399-1406)",
      admin_level: "4",
      start_date: "1184",
      end_date: "1207",
    }),
  ];
  assertEquals(
    selectItalyFiefsForYear(elements, 1200).map((e) => e.id),
    [2853298],
  );
  // 入力順を変えても結果は同じ（決定的）
  assertEquals(
    selectItalyFiefsForYear([...elements].reverse(), 1200).map((e) => e.id),
    [2853298],
  );
});

Deno.test("selectItalyFiefsForYear: 表示名が同じなら 1 件に絞る", () => {
  const elements = [
    relation(10, {
      "name:en": "Republic of Pisa (1399-1406)",
      admin_level: "4",
      start_date: "1081",
      end_date: "1406",
    }),
    relation(11, {
      "name:en": "Republic of Pisa",
      admin_level: "4",
      start_date: "1000",
      end_date: "1500",
    }),
  ];
  assertEquals(selectItalyFiefsForYear(elements, 1200).length, 1);
});

Deno.test("selectItalyFiefsForYear: 並び順は表示名の昇順で決定的", () => {
  const elements = [
    relation(1, {
      "name:en": "Republic of Siena",
      admin_level: "4",
      start_date: "1125",
      end_date: "1250",
    }),
    relation(2, {
      "name:en": "Duchy of Spoleto",
      admin_level: "4",
      start_date: "0831",
      end_date: "1201",
    }),
    relation(3, {
      name: "County of Asti",
      admin_level: "4",
      start_date: "1095",
    }),
  ];
  assertEquals(
    selectItalyFiefsForYear(elements, 1200).map((e) => e.id),
    [3, 2, 1],
  );
});

// ---------------------------------------------------------------------------
// bbox 外パートの除去
// ---------------------------------------------------------------------------

Deno.test("restrictPartsToBbox: bbox に掛からないパートだけを落とす", () => {
  const geometry: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [
      // 本土（bbox 内）
      [square(10.5, 43.5)],
      // クリミアのジェノヴァ植民地（bbox の東外）
      [square(35.0, 44.5)],
      // サルデーニャ（bbox の南外）
      [square(9.0, 40.0)],
    ],
  };
  const { geometry: kept, droppedParts } = restrictPartsToBbox(
    geometry,
    ITALY_FIEF_BBOX,
  );
  assertEquals(droppedParts, 2);
  assert(kept !== null);
  assertEquals(polygonParts(kept).length, 1);
  assertEquals(polygonParts(kept)[0][0][0], [10.5, 43.5]);
});

Deno.test("restrictPartsToBbox: bbox に一部でも掛かるパートは残す（コルシカ）", () => {
  const geometry: MultiPolygon = {
    type: "MultiPolygon",
    // 緯度 41.3〜43.0 のコルシカは bbox の南限 42.0 に掛かる
    coordinates: [[[
      [8.5, 41.3],
      [9.6, 41.3],
      [9.6, 43.0],
      [8.5, 43.0],
      [8.5, 41.3],
    ]]],
  };
  const { geometry: kept, droppedParts } = restrictPartsToBbox(
    geometry,
    ITALY_FIEF_BBOX,
  );
  assertEquals(droppedParts, 0);
  assertEquals(kept, geometry);
});

Deno.test("restrictPartsToBbox: 全パートが bbox 外なら null", () => {
  const geometry: MultiPolygon = {
    type: "MultiPolygon",
    coordinates: [[square(35.0, 44.5)]],
  };
  const { geometry: kept, droppedParts } = restrictPartsToBbox(
    geometry,
    ITALY_FIEF_BBOX,
  );
  assertEquals(kept, null);
  assertEquals(droppedParts, 1);
});

// ---------------------------------------------------------------------------
// FeatureCollection の組み立て
// ---------------------------------------------------------------------------

Deno.test("buildYearCollection: properties は france_fiefs と互換で表示名を上書きする（AC4）", () => {
  const tagged = [
    relation(2853298, {
      "name:en": "Republic of Pisa (1399-1406)",
      admin_level: "4",
      start_date: "1184",
      end_date: "1207",
    }),
  ];
  const geometries = new Map([[2853298, withSquare(2853298, 10.5, 43.5)]]);
  const { fc } = buildYearCollection(tagged, geometries, 1200);
  assertEquals(fc.features.length, 1);
  assertEquals(fc.features[0].properties, {
    NAME: "Republic of Pisa",
    OHM_NAME: "Republic of Pisa (1399-1406)",
    ADMIN_LEVEL: 4,
    OHM_RELATION_ID: 2853298,
    START_DATE: "1184",
    END_DATE: "1207",
  });
});

Deno.test("buildYearCollection: メタデータに出典・ライセンス・欠損を記録する（AC7）", () => {
  const tagged = [
    relation(2800634, {
      "name:en": "Republic of Florence",
      admin_level: "4",
      start_date: "1115",
      end_date: "1405",
    }),
    relation(2853272, {
      "name:en": "Republic of Lucca",
      admin_level: "4",
      start_date: "1160",
      end_date: "1399",
    }),
  ];
  // Lucca はジオメトリ未取得
  const geometries = new Map([[2800634, withSquare(2800634, 11.0, 43.5)]]);
  const { metadata } = buildYearCollection(tagged, geometries, 1200);
  assertEquals(metadata.source, "OpenHistoricalMap");
  assertEquals(metadata.license, "CC0-1.0");
  assertEquals(metadata.year, 1200);
  assertEquals(metadata.featureCount, 1);
  assertEquals(metadata.relationsWithoutGeometry, [2853272]);
});

Deno.test("buildYearCollection: bbox 外のパートを落として件数を記録する", () => {
  const tagged = [
    relation(2851376, {
      "name:en": "Republic of Genoa",
      admin_level: "4",
      start_date: "1354",
      end_date: "1453",
    }),
  ];
  const genoa: OhmRelation = {
    type: "relation",
    id: 2851376,
    tags: {},
    members: [
      {
        type: "way",
        ref: 1,
        role: "outer",
        geometry: square(8.5, 44.0).map(([lon, lat]) => ({ lon, lat })),
      },
      {
        // カッファ（クリミア）の植民地
        type: "way",
        ref: 2,
        role: "outer",
        geometry: square(35.0, 44.5).map(([lon, lat]) => ({ lon, lat })),
      },
    ],
  };
  const { fc, metadata } = buildYearCollection(
    tagged,
    new Map([[2851376, genoa]]),
    1400,
  );
  assertEquals(fc.features.length, 1);
  assertEquals(
    polygonParts(fc.features[0].geometry as MultiPolygon).length,
    1,
  );
  assertEquals(metadata.droppedPartsOutsideBbox, { "2851376": 1 });
});

Deno.test("buildYearCollection: 除外対象は許可リストに紛れても落ちる", () => {
  const tagged = [
    relation(2750055, {
      "name:en": "Duchy of Milan",
      admin_level: "4",
      start_date: "1395-05-11",
      end_date: "1404",
    }),
  ];
  const geometries = new Map([[2750055, withSquare(2750055, 9.0, 45.0)]]);
  const { fc } = buildYearCollection(
    tagged,
    geometries,
    1400,
    [...ITALY_FIEF_NAMES, "Duchy of Milan"],
  );
  assertEquals(fc.features.length, 0);
});

// ---------------------------------------------------------------------------
// 生成物（data/italy_fiefs_<year>.geojson）
// ---------------------------------------------------------------------------

async function readItalyFiefs(year: number): Promise<
  FeatureCollection & { metadata?: Record<string, unknown> }
> {
  return JSON.parse(
    await Deno.readTextFile(`data/italy_fiefs_${year}.geojson`),
  );
}

Deno.test("生成物: 対象年ごとにファイルがあり feature を持つ（AC1）", async () => {
  for (const year of ITALY_FIEF_YEARS) {
    const fc = await readItalyFiefs(year);
    assertEquals(fc.type, "FeatureCollection");
    assert(fc.features.length > 0, `${year} の feature が 0 件`);
    for (const feature of fc.features) {
      assert(typeof feature.properties?.NAME === "string");
      assert(
        feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon",
      );
    }
  }
});

Deno.test("生成物: 1100 年に March of Tuscany が含まれる（AC2）", async () => {
  const names = (await readItalyFiefs(1100)).features.map((f) =>
    String(f.properties?.NAME)
  );
  assert(names.includes("March of Tuscany"), names.join(", "));
});

Deno.test("生成物: 1200 年に主要な都市共和国と Duchy of Spoleto が含まれる（AC2）", async () => {
  const names = new Set(
    (await readItalyFiefs(1200)).features.map((f) =>
      String(f.properties?.NAME)
    ),
  );
  for (
    const expected of [
      "Republic of Florence",
      "Republic of Genoa",
      "Republic of Pisa",
      "Republic of Siena",
      "Republic of Lucca",
      "Duchy of Spoleto",
    ]
  ) {
    assert(names.has(expected), `1200 年に ${expected} が無い`);
  }
});

Deno.test("生成物: 表示名に期間つき曖昧性解消が残っていない（AC4）", async () => {
  for (const year of ITALY_FIEF_YEARS) {
    for (const feature of (await readItalyFiefs(year)).features) {
      const name = String(feature.properties?.NAME);
      assert(
        !/\(\d{3,4}-\d{3,4}\)/.test(name),
        `${year} の ${name} に期間つきの名前が残っている`,
      );
    }
  }
});

Deno.test("生成物: 除外対象が 1 件も入っていない", async () => {
  for (const year of ITALY_FIEF_YEARS) {
    for (const feature of (await readItalyFiefs(year)).features) {
      const name = String(feature.properties?.NAME);
      assertEquals(
        italyFiefExclusionReason(name),
        null,
        `${year} に除外対象 ${name} が入っている`,
      );
      assert(
        ITALY_FIEF_NAMES.includes(String(feature.properties?.OHM_NAME)),
        `${year} の ${name} が許可リスト外`,
      );
    }
  }
});

Deno.test("生成物: 出典・ライセンスが metadata に記録されている（AC7）", async () => {
  for (const year of ITALY_FIEF_YEARS) {
    const fc = await readItalyFiefs(year);
    assertEquals(fc.metadata?.source, "OpenHistoricalMap");
    assertEquals(fc.metadata?.license, "CC0-1.0");
    assertEquals(fc.metadata?.year, year);
  }
});

Deno.test("生成物: サイズ上限内で微小破片が残っていない（AC5）", async () => {
  for (const year of ITALY_FIEF_YEARS) {
    const path = `data/italy_fiefs_${year}.geojson`;
    const text = await Deno.readTextFile(path);
    const bytes = new TextEncoder().encode(text).length;
    assert(
      bytes <= ITALY_FIEF_SIZE_LIMIT_BYTES,
      `${path} が ${bytes} バイトで上限超過`,
    );
    for (const feature of (JSON.parse(text) as FeatureCollection).features) {
      const geometry = feature.geometry as Polygon | MultiPolygon;
      for (const part of polygonParts(geometry)) {
        assert(
          ringAreaM2(part[0]) >= MIN_PART_AREA_M2,
          `${path} の ${String(feature.properties?.NAME)} に微小破片`,
        );
      }
    }
  }
});

Deno.test("生成物: 許可リストの全件がどこかの年代に現れる（死んだエントリが無い）", async () => {
  const seen = new Set<string>();
  for (const year of ITALY_FIEF_YEARS) {
    for (const feature of (await readItalyFiefs(year)).features) {
      seen.add(String(feature.properties?.OHM_NAME));
    }
  }
  const dead = ITALY_FIEF_NAMES.filter((name) => !seen.has(name));
  assertEquals(dead, []);
});

Deno.test("生成物: hre_fiefs / france_fiefs と同じ勢力が二重に出ない", async () => {
  for (const year of ITALY_FIEF_YEARS) {
    const italy = new Set(
      (await readItalyFiefs(year)).features.map((f) =>
        String(f.properties?.NAME)
      ),
    );
    const other: FeatureCollection = JSON.parse(
      await Deno.readTextFile(`data/hre_fiefs_${year}.geojson`),
    );
    for (const feature of other.features) {
      const name = String(feature.properties?.NAME);
      assert(!italy.has(name), `${year} の ${name} が両系統に存在する`);
    }
  }
});
