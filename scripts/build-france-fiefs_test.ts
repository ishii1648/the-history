import { assert, assertEquals } from "@std/assert";
import {
  assembleRings,
  buildGeometryQuery,
  buildPolygons,
  buildTagsQuery,
  buildYearCollection,
  FRANCE_BBOX,
  FRANCE_FIEF_ADMIN_LEVELS,
  FRANCE_FIEF_NAMES,
  FRANCE_FIEF_YEARS,
  isActiveAtYear,
  OHM_SOURCE_LICENSE,
  OHM_SOURCE_URL,
  type OhmRelation,
  parseOhmYear,
  relationGeometry,
  selectFiefsForYear,
  signedArea,
} from "./build-france-fiefs.ts";
import { SNAPSHOT_YEARS } from "../src/config.ts";

/** テスト用に OHM のリレーション要素（tags のみ）を組み立てる */
function rel(
  id: number,
  nameEn: string,
  adminLevel: string,
  start: string | undefined,
  end: string | undefined,
): OhmRelation {
  const tags: Record<string, string> = {
    "boundary": "administrative",
    "admin_level": adminLevel,
    "name:en": nameEn,
    "name": nameEn,
  };
  if (start !== undefined) tags["start_date"] = start;
  if (end !== undefined) tags["end_date"] = end;
  return { type: "relation", id, tags };
}

/** [lon, lat] の列を Overpass の member geometry 形式に変換する */
function geom(points: Array<[number, number]>) {
  return points.map(([lon, lat]) => ({ lat, lon }));
}

Deno.test("出典メタデータ: OHM の Overpass エンドポイントと CC0 ライセンス", () => {
  assertEquals(
    OHM_SOURCE_URL,
    "https://overpass-api.openhistoricalmap.org/api/interpreter",
  );
  assertEquals(OHM_SOURCE_LICENSE, "CC0-1.0");
  // 調査で件数を確認した bbox（south, west, north, east）をピン留めする
  assertEquals([...FRANCE_BBOX], [40.0, -6.5, 52.5, 10.5]);
});

Deno.test("対象年は既存スナップショット年の部分集合（中世 5 年代）", () => {
  assertEquals([...FRANCE_FIEF_YEARS], [1000, 1100, 1200, 1279, 1300]);
  for (const year of FRANCE_FIEF_YEARS) {
    assert(
      SNAPSHOT_YEARS.includes(year),
      `${year} は SNAPSHOT_YEARS に含まれない`,
    );
  }
});

Deno.test("parseOhmYear: 年のみ表記・年月日表記・欠損・紀元前", () => {
  // ゼロ埋め 4 桁の年のみ表記（OHM の中世データで最頻）
  assertEquals(parseOhmYear("0918"), 918);
  assertEquals(parseOhmYear("970"), 970);
  // 年月日表記
  assertEquals(parseOhmYear("1493-05-23"), 1493);
  assertEquals(parseOhmYear("1137-04-09"), 1137);
  // 年月表記
  assertEquals(parseOhmYear("1226-02"), 1226);
  // 前後の空白は許容
  assertEquals(parseOhmYear(" 1204 "), 1204);
  // 欠損は null（= 無期限）
  assertEquals(parseOhmYear(undefined), null);
  assertEquals(parseOhmYear(""), null);
  assertEquals(parseOhmYear("unknown"), null);
  // 紀元前（負符号付き）
  assertEquals(parseOhmYear("-0050-03-15"), -50);
});

Deno.test("isActiveAtYear: 境界年（start と同年・end と同年）を含む", () => {
  // County of Poitou 0934-1422 相当
  assert(isActiveAtYear("0934", "1422", 934), "start と同年は有効");
  assert(isActiveAtYear("0934", "1422", 1422), "end と同年は有効");
  assert(isActiveAtYear("0934", "1422", 1200), "期間内は有効");
  assert(!isActiveAtYear("0934", "1422", 933), "start の前年は無効");
  assert(!isActiveAtYear("0934", "1422", 1423), "end の翌年は無効");
});

Deno.test("isActiveAtYear: 年月日表記の境界年も年単位で含む", () => {
  // Duchy of Aquitaine 1137-04-09 〜 1214-09-28
  assert(isActiveAtYear("1137-04-09", "1214-09-28", 1137));
  assert(isActiveAtYear("1137-04-09", "1214-09-28", 1214));
  assert(!isActiveAtYear("1137-04-09", "1214-09-28", 1136));
  assert(!isActiveAtYear("1137-04-09", "1214-09-28", 1215));
});

Deno.test("isActiveAtYear: end_date 欠損は無期限・start_date 欠損は最初期から", () => {
  assert(isActiveAtYear("1237", undefined, 1300));
  assert(isActiveAtYear("1237", undefined, 9999));
  assert(!isActiveAtYear("1237", undefined, 1236));
  assert(isActiveAtYear(undefined, "1300", 900));
  assert(!isActiveAtYear(undefined, "1300", 1301));
  assert(isActiveAtYear(undefined, undefined, 1200));
});

Deno.test("selectFiefsForYear: 許可リスト外・admin_level 対象外を落とす", () => {
  const elements: OhmRelation[] = [
    rel(1, "County of Poitou", "4", "0934", "1422"),
    // 許可リスト外（神聖ローマ帝国側の領邦）
    rel(2, "County of Leiningen", "4", "1093", "1797-10-17"),
    // admin_level 2 は主権国家レベル。1204 年のフランス王領併合後の
    // Duchy of Normandy がこれに当たるため、諸侯領としては採らない
    rel(3, "Duchy of Normandy", "2", "1204", "1290"),
  ];
  const selected = selectFiefsForYear(elements, 1279);
  assertEquals(selected.map((e) => e.id), [1]);
});

Deno.test("selectFiefsForYear: 年代フィルタが効く", () => {
  const elements: OhmRelation[] = [
    rel(1, "Duchy of Aquitaine", "3", "1137-04-09", "1214-09-28"),
    rel(2, "County of Flanders", "4", "1237", "1384-01-30"),
  ];
  assertEquals(selectFiefsForYear(elements, 1200).map((e) => e.id), [1]);
  assertEquals(selectFiefsForYear(elements, 1279).map((e) => e.id), [2]);
});

Deno.test("selectFiefsForYear: 同名の重複は admin_level 昇順→ID 昇順で 1 件に絞る", () => {
  // Duchy of Burgundy は admin_level 3 / 4 の 2 リレーションが同一期間で並存する
  const elements: OhmRelation[] = [
    rel(2893762, "Duchy of Burgundy", "4", "0918", "1361-11-21"),
    rel(2893764, "Duchy of Burgundy", "3", "0918", "1361-11-21"),
  ];
  const selected = selectFiefsForYear(elements, 1200);
  assertEquals(selected.map((e) => e.id), [2893764]);
});

Deno.test("selectFiefsForYear: 並び順は英語名の昇順で決定的", () => {
  const elements: OhmRelation[] = [
    rel(3, "Duchy of Brittany", "3", "0939-08-01", "1547-08-12"),
    rel(1, "County of Maine", "4", "0832", "1537"),
    rel(2, "County of Anjou", "4", "0861", "1360"),
  ];
  assertEquals(
    selectFiefsForYear(elements, 1200).map((e) => e.tags["name:en"]),
    ["County of Anjou", "County of Maine", "Duchy of Brittany"],
  );
});

Deno.test("FRANCE_FIEF_NAMES / FRANCE_FIEF_ADMIN_LEVELS の内容", () => {
  // 調査で 1000〜1300 年に有効と確認できた 14 領邦
  assertEquals(FRANCE_FIEF_NAMES.length, 14);
  assert(FRANCE_FIEF_NAMES.includes("Duchy of Brittany"));
  assert(FRANCE_FIEF_NAMES.includes("County of Ponthieu"));
  // 昇順ソート済み（重複なし）
  assertEquals([...FRANCE_FIEF_NAMES].sort(), [...FRANCE_FIEF_NAMES]);
  assertEquals(new Set(FRANCE_FIEF_NAMES).size, FRANCE_FIEF_NAMES.length);
  // Ponthieu は admin_level 5 なので 3〜5 を採る
  assertEquals([...FRANCE_FIEF_ADMIN_LEVELS], [3, 4, 5]);
});

Deno.test("buildTagsQuery / buildGeometryQuery: 決定的な Overpass QL を返す", () => {
  const tagsQuery = buildTagsQuery(FRANCE_BBOX);
  assert(tagsQuery.includes("(40,-6.5,52.5,10.5)"), tagsQuery);
  assert(tagsQuery.includes("out tags;"), tagsQuery);
  // ID は昇順に正規化し、重複を除く（呼び出し順に依存しない）
  assertEquals(
    buildGeometryQuery([30, 10, 20, 10]),
    "[out:json][timeout:180];\nrelation(id:10,20,30);\nout geom;\n",
  );
});

Deno.test("assembleRings: 分割された way を端点で連結し閉じる", () => {
  const { rings, unclosedRings } = assembleRings([
    geom([[0, 0], [1, 0]]),
    geom([[1, 0], [1, 1]]),
    // 逆向きの way も端点一致で連結できる
    geom([[0, 0], [0, 1]]),
    geom([[1, 1], [0, 1]]),
  ]);
  assertEquals(unclosedRings, 0);
  assertEquals(rings.length, 1);
  assertEquals(rings[0][0], rings[0][rings[0].length - 1]);
  assertEquals(rings[0].length, 5);
});

Deno.test("assembleRings: 閉じない環は始点を追加して閉じ、件数を記録する", () => {
  // way が 1 本欠損して開いたままのリング
  const { rings, unclosedRings } = assembleRings([
    geom([[0, 0], [1, 0]]),
    geom([[1, 0], [1, 1]]),
    geom([[1, 1], [0, 1]]),
  ]);
  assertEquals(unclosedRings, 1);
  assertEquals(rings.length, 1);
  assertEquals(rings[0][0], rings[0][rings[0].length - 1]);
});

Deno.test("assembleRings: 独立した複数リングを分離する", () => {
  const { rings } = assembleRings([
    geom([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]),
    geom([[10, 10], [11, 10], [11, 11], [10, 10]]),
  ]);
  assertEquals(rings.length, 2);
});

Deno.test("signedArea: 反時計回りが正・時計回りが負", () => {
  const ccw: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
  assert(signedArea(ccw) > 0);
  assert(signedArea([...ccw].reverse()) < 0);
});

Deno.test("buildPolygons: 内環を包含する外環に割り当てる", () => {
  const outer: Array<Array<[number, number]>> = [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
    [[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]],
  ];
  const inner: Array<Array<[number, number]>> = [
    [[22, 22], [28, 22], [28, 28], [22, 28], [22, 22]],
  ];
  const { polygons, droppedInnerRings } = buildPolygons(outer, inner);
  assertEquals(droppedInnerRings, 0);
  assertEquals(polygons.length, 2);
  assertEquals(polygons[0].length, 1);
  assertEquals(polygons[1].length, 2);
  // 外環は反時計回り・内環は時計回りに正規化する（RFC 7946）
  assert(signedArea(polygons[1][0]) > 0);
  assert(signedArea(polygons[1][1]) < 0);
});

Deno.test("buildPolygons: どの外環にも含まれない内環は破棄して記録する", () => {
  const outer: Array<Array<[number, number]>> = [
    [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
  ];
  const inner: Array<Array<[number, number]>> = [
    [[50, 50], [51, 50], [51, 51], [50, 50]],
  ];
  const { polygons, droppedInnerRings } = buildPolygons(outer, inner);
  assertEquals(droppedInnerRings, 1);
  assertEquals(polygons.length, 1);
  assertEquals(polygons[0].length, 1);
});

Deno.test("relationGeometry: way 以外のメンバー（label ノード・subarea リレーション）は無視する", () => {
  const relation: OhmRelation = {
    type: "relation",
    id: 42,
    tags: { "name:en": "County of Bar" },
    members: [
      {
        type: "way",
        ref: 1,
        role: "outer",
        geometry: geom([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]),
      },
      { type: "node", ref: 2, role: "label" },
      { type: "relation", ref: 3, role: "subarea" },
    ],
  };
  const result = relationGeometry(relation);
  assertEquals(result.missingWays, []);
  assertEquals(result.unsupportedMembers, 2);
  assertEquals(result.geometry?.type, "MultiPolygon");
  assertEquals(result.geometry?.coordinates.length, 1);
});

Deno.test("relationGeometry: ジオメトリ欠損の way は記録され、生成は失敗しない", () => {
  const relation: OhmRelation = {
    type: "relation",
    id: 42,
    tags: { "name:en": "County of Bar" },
    members: [
      {
        type: "way",
        ref: 1,
        role: "outer",
        geometry: geom([[0, 0], [10, 0], [10, 10]]),
      },
      // ジオメトリを取得できなかった way（ID は昇順で記録する）
      { type: "way", ref: 9, role: "outer" },
      { type: "way", ref: 5, role: "outer" },
    ],
  };
  const result = relationGeometry(relation);
  assertEquals(result.missingWays, [5, 9]);
  assertEquals(result.unclosedRings, 1);
  assert(result.geometry !== null);
});

Deno.test("relationGeometry: role 省略の way は outer として扱う", () => {
  const relation: OhmRelation = {
    type: "relation",
    id: 43,
    tags: {},
    members: [
      {
        type: "way",
        ref: 1,
        geometry: geom([[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]),
      },
    ],
  };
  assertEquals(relationGeometry(relation).geometry?.type, "MultiPolygon");
});

Deno.test("buildYearCollection: properties は名称・admin_level・OHM ID・start/end", () => {
  const tagged: OhmRelation[] = [
    rel(2892575, "County of Poitou", "4", "0934", "1422"),
    rel(2830908, "County of Artois", "4", "1237", undefined),
  ];
  const square = geom([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]);
  const geometries = new Map<number, OhmRelation>([
    [2892575, {
      type: "relation",
      id: 2892575,
      tags: {},
      members: [{ type: "way", ref: 1, role: "outer", geometry: square }],
    }],
    [2830908, {
      type: "relation",
      id: 2830908,
      tags: {},
      members: [{ type: "way", ref: 2, role: "outer", geometry: square }],
    }],
  ]);
  const { fc, metadata } = buildYearCollection(tagged, geometries, 1279);
  assertEquals(fc.type, "FeatureCollection");
  // 英語名の昇順（Artois → Poitou）
  assertEquals(fc.features.map((f) => f.properties?.NAME), [
    "County of Artois",
    "County of Poitou",
  ]);
  assertEquals(fc.features[0].properties, {
    NAME: "County of Artois",
    ADMIN_LEVEL: 4,
    OHM_RELATION_ID: 2830908,
    START_DATE: "1237",
    // end_date 欠損は null（無期限）
    END_DATE: null,
  });
  assertEquals(metadata.year, 1279);
  assertEquals(metadata.featureCount, 2);
  assertEquals(metadata.license, OHM_SOURCE_LICENSE);
  assertEquals(metadata.missingWays, {});
});

Deno.test("buildYearCollection: 欠損 way はメタデータにリレーション ID 単位で記録する", () => {
  const tagged: OhmRelation[] = [
    rel(2815090, "County of Bar", "4", "1033", "1354"),
  ];
  const geometries = new Map<number, OhmRelation>([
    [2815090, {
      type: "relation",
      id: 2815090,
      tags: {},
      members: [
        {
          type: "way",
          ref: 1,
          role: "outer",
          geometry: geom([[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]),
        },
        { type: "way", ref: 7, role: "outer" },
      ],
    }],
  ]);
  const { fc, metadata } = buildYearCollection(tagged, geometries, 1200);
  assertEquals(fc.features.length, 1);
  assertEquals(metadata.missingWays, { "2815090": [7] });
});

Deno.test("buildYearCollection: ジオメトリ未取得のリレーションは feature 化せず記録する", () => {
  const tagged: OhmRelation[] = [
    rel(2892575, "County of Poitou", "4", "0934", "1422"),
  ];
  const { fc, metadata } = buildYearCollection(
    tagged,
    new Map<number, OhmRelation>(),
    1200,
  );
  assertEquals(fc.features.length, 0);
  assertEquals(metadata.relationsWithoutGeometry, [2892575]);
});
