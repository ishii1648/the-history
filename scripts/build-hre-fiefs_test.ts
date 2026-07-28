import { assert, assertEquals } from "@std/assert";
import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import type { FeatureCollection, Polygon, Position } from "geojson";
import {
  MIN_PART_AREA_M2,
  polygonParts,
  selfIntersectionPoints,
} from "./clean-polygons.ts";
import {
  buildYearCollection,
  HRE_FIEF_ADMIN_LEVELS,
  HRE_FIEF_BBOX,
  HRE_FIEF_EXCLUSIONS,
  HRE_FIEF_NAME,
  HRE_FIEF_NAMES,
  HRE_FIEF_SIZE_LIMIT_BYTES,
  HRE_FIEF_YEAR_1200_NOTE,
  HRE_FIEF_YEARS,
  hreFiefExclusionReason,
  removePinchPoints,
  removePinchPointsFromCollection,
  selectHreFiefsForYear,
} from "./build-hre-fiefs.ts";
import { HRE_FIEF_OVERLAY_YEARS } from "../src/config.ts";
import {
  FRANCE_FIEF_NAMES,
  OHM_SOURCE_HOMEPAGE,
  OHM_SOURCE_LICENSE,
  type OhmRelation,
} from "./build-france-fiefs.ts";
import { HRE_OVERLAY_YEARS, SNAPSHOT_YEARS } from "../src/config.ts";

/** テスト用に OHM のリレーション要素（tags のみ）を組み立てる */
function rel(
  id: number,
  nameEn: string,
  adminLevel: string,
  start: string | undefined,
  end: string | undefined,
  nameLocal: string = nameEn,
): OhmRelation {
  const tags: Record<string, string> = {
    "boundary": "administrative",
    "admin_level": adminLevel,
    "name:en": nameEn,
    "name": nameLocal,
  };
  if (start !== undefined) tags["start_date"] = start;
  if (end !== undefined) tags["end_date"] = end;
  return { type: "relation", id, tags };
}

/** [lon, lat] の列を Overpass の member geometry 形式に変換する */
function geom(points: Array<[number, number]>) {
  return points.map(([lon, lat]) => ({ lat, lon }));
}

/** 単純な正方形リレーション（geom 付き）を組み立てる */
function square(
  id: number,
  nameEn: string,
  adminLevel: string,
  start: string | undefined,
  end: string | undefined,
  originLon = 10,
  originLat = 50,
): OhmRelation {
  const base = rel(id, nameEn, adminLevel, start, end);
  return {
    ...base,
    members: [{
      type: "way",
      ref: id * 10,
      role: "outer",
      geometry: geom([
        [originLon, originLat],
        [originLon + 1, originLat],
        [originLon + 1, originLat + 1],
        [originLon, originLat + 1],
        [originLon, originLat],
      ]),
    }],
  };
}

Deno.test("取得範囲は実測に使った帝国中核域 bbox をピン留めする", () => {
  // south, west, north, east（boundary=administrative 34,005 件を実測した範囲）
  assertEquals([...HRE_FIEF_BBOX], [45.5, 5.5, 55.0, 19.0]);
});

Deno.test("対象年は SNAPSHOT_YEARS の部分集合で中世 7 年代", () => {
  assertEquals([...HRE_FIEF_YEARS], [1000, 1100, 1200, 1279, 1300, 1400, 1492]);
  for (const year of HRE_FIEF_YEARS) {
    assert(
      SNAPSHOT_YEARS.includes(year),
      `${year} は SNAPSHOT_YEARS に含まれない`,
    );
  }
});

Deno.test("採用する admin_level は 4 / 5（2 = 主権国家・3 = 帝国構成王国は除く）", () => {
  assertEquals([...HRE_FIEF_ADMIN_LEVELS], [4, 5]);
});

Deno.test("許可リストは昇順・重複なしで、実測した 98 件", () => {
  assertEquals(HRE_FIEF_NAMES.length, 98);
  assertEquals(new Set(HRE_FIEF_NAMES).size, HRE_FIEF_NAMES.length);
  assertEquals(
    [...HRE_FIEF_NAMES].sort((a, b) => a.localeCompare(b, "en")),
    [...HRE_FIEF_NAMES],
  );
  // 各分類の代表例が入っている
  assert(HRE_FIEF_NAMES.includes("Duchy of Bavaria"), "公領");
  assert(HRE_FIEF_NAMES.includes("March of Meissen"), "辺境伯領");
  assert(HRE_FIEF_NAMES.includes("County of Leiningen"), "伯領");
  assert(HRE_FIEF_NAMES.includes("Electorate of Cologne"), "選帝侯領");
  assert(HRE_FIEF_NAMES.includes("Prince-Bishopric of Würzburg"), "司教領");
  assert(HRE_FIEF_NAMES.includes("Imperial Abbey of Hersfeld"), "帝国修道院領");
  assert(HRE_FIEF_NAMES.includes("Landgraviate of Thurgau"), "方伯領");
});

Deno.test("許可リストに Free Imperial City は 1 件も含まない（AC2）", () => {
  for (const name of HRE_FIEF_NAMES) {
    assert(
      !name.includes("Free Imperial City"),
      `${name} は帝国都市なので許可リストに入れない`,
    );
    assert(
      !name.includes("Imperial City of"),
      `${name} は帝国都市なので許可リストに入れない`,
    );
    assert(
      !name.includes("Hanseatic City"),
      `${name} はハンザ都市なので許可リストに入れない`,
    );
  }
});

Deno.test("許可リストは bbox 外の行政区画（ハンガリー county・ポーランド voivodeship）を含まない（AC2）", () => {
  for (const name of HRE_FIEF_NAMES) {
    assert(!name.endsWith(" county"), `${name} はハンガリー王国の県`);
    assert(!name.endsWith(" County"), `${name} はハンガリー・クロアチアの県`);
    assert(!name.endsWith(" Voivodeship"), `${name} はポーランド王国の県`);
  }
});

Deno.test("許可リストは france_fiefs 側の諸侯領と重複しない（二重塗り防止）", () => {
  for (const name of FRANCE_FIEF_NAMES) {
    assert(
      !HRE_FIEF_NAMES.includes(name),
      `${name} は france_fiefs_<year>.geojson で収録済み`,
    );
  }
});

Deno.test("見送り理由が分類ごとに記録されている（AC3）", () => {
  // 帝国都市・近隣王国の行政区画・二重塗りになる包含関係・ザクセン部族地域
  const keys = Object.keys(HRE_FIEF_EXCLUSIONS);
  assert(keys.length >= 6, `分類が少なすぎる: ${keys.length}`);
  for (const [key, reason] of Object.entries(HRE_FIEF_EXCLUSIONS)) {
    assert(reason.length >= 10, `${key} の理由が短すぎる: ${reason}`);
  }
  assert("freeImperialCities" in HRE_FIEF_EXCLUSIONS);
  assert("hungarianCounties" in HRE_FIEF_EXCLUSIONS);
  assert("polishVoivodeships" in HRE_FIEF_EXCLUSIONS);
  assert("outOfSnapshotYears" in HRE_FIEF_EXCLUSIONS);
});

Deno.test("1200 年を収録する判断の根拠が記録されている（AC3）", () => {
  // 谷の実測値と、帝国中核が空白になることの両方を残す
  assert(HRE_FIEF_YEAR_1200_NOTE.includes("122,184"), HRE_FIEF_YEAR_1200_NOTE);
  assert(HRE_FIEF_YEAR_1200_NOTE.includes("110,706"), HRE_FIEF_YEAR_1200_NOTE);
  assert(HRE_FIEF_YEAR_1200_NOTE.includes("空白"), HRE_FIEF_YEAR_1200_NOTE);
  assert(HRE_FIEF_YEARS.includes(1200));
});

Deno.test("removePinchPointsFromCollection: くびれのある feature だけ作り直す", () => {
  const pinched: Polygon = {
    type: "Polygon",
    coordinates: [[
      [0, 0],
      [5, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ], [[5, 0], [7, 3], [5, 5], [3, 3], [5, 0]]],
  };
  const clean: Polygon = {
    type: "Polygon",
    coordinates: [[[20, 20], [21, 20], [21, 21], [20, 21], [20, 20]]],
  };
  const { fc, removed, droppedFeatures } = removePinchPointsFromCollection({
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { NAME: "pinched" }, geometry: pinched },
      { type: "Feature", properties: { NAME: "clean" }, geometry: clean },
    ],
  });
  assertEquals(removed, 1);
  assertEquals(droppedFeatures, []);
  assertEquals(fc.features.length, 2);
  // properties と並びは保つ
  assertEquals(fc.features.map((f) => f.properties?.NAME), [
    "pinched",
    "clean",
  ]);
  // くびれの無い feature はジオメトリを作り直さない（同一参照）
  assertEquals(fc.features[1].geometry, clean);
  for (const feature of fc.features) {
    assertEquals(
      selfIntersectionPoints(feature.geometry as Polygon).length,
      0,
      String(feature.properties?.NAME),
    );
  }
});

Deno.test("hreFiefExclusionReason: 許可リストに紛れ込んでも帝国都市等を落とす", () => {
  // 許可リストの編集ミスに対する二重の防波堤（AC2）
  assert(
    hreFiefExclusionReason(
      "Free Imperial City of Ulm",
      "Freie Reichsstadt Ulm",
    ) !==
      null,
  );
  assert(
    hreFiefExclusionReason("Imperial City of Goslar", "Reichsstadt Goslar") !==
      null,
  );
  assert(
    hreFiefExclusionReason(
      "Free and Hanseatic City of Lübeck",
      "Freie und Hansestadt Lübeck",
    ) !== null,
  );
  assert(hreFiefExclusionReason("Sopron county", "Sopron vármegy") !== null);
  assert(
    hreFiefExclusionReason("Varasdin County", "Varaždinska županija") !== null,
  );
  assert(
    hreFiefExclusionReason("Kraków Voivodeship", "Województwo Krakowskie") !==
      null,
  );
  // ローカル名が vármegye で終わるハンガリー県も落とす
  assert(hreFiefExclusionReason("Bars county", "Bars vármegye") !== null);
  // 領邦は通す
  assertEquals(
    hreFiefExclusionReason("Duchy of Bavaria", "Herzogtum Bayern"),
    null,
  );
  assertEquals(
    hreFiefExclusionReason("Prince-Bishopric of Worms", "Hochstift Worms"),
    null,
  );
});

Deno.test("selectHreFiefsForYear: 許可リスト外・admin_level 対象外・期間外を落とす", () => {
  const elements: OhmRelation[] = [
    rel(1, "Duchy of Bavaria", "4", "0962", "1100"),
    // admin_level 2 は主権国家レベル（帝国そのもの）
    rel(2, "Holy Roman Empire", "2", "0983", "1002"),
    // admin_level 3 は帝国構成王国（配下の領邦と二重に塗られる）
    rel(3, "Kingdom of Burgundy", "3", "1032", "1167"),
    // 許可リスト外（帝国都市）
    rel(4, "Free Imperial City of Worms", "4", "1074", "1803-02-27"),
    // 期間外
    rel(5, "Duchy of Austria", "4", "1254-04-03", "1390"),
  ];
  assertEquals(selectHreFiefsForYear(elements, 1000).map((e) => e.id), [1]);
});

Deno.test("selectHreFiefsForYear: 同名の重複は admin_level 昇順→ID 昇順で 1 件に絞る", () => {
  // County of Tecklenburg は同名 4 リレーションが期間を分けて存在する
  const elements: OhmRelation[] = [
    rel(200, "County of Tecklenburg", "5", "1262", "1400"),
    rel(100, "County of Tecklenburg", "5", "1262", "1400"),
  ];
  assertEquals(
    selectHreFiefsForYear(elements, 1300).map((e) => e.id),
    [100],
  );
});

Deno.test("selectHreFiefsForYear: 並び順は英語名の昇順で決定的", () => {
  const elements: OhmRelation[] = [
    rel(3, "Moravia", "4", "1182", "1742-07-28"),
    rel(1, "Duchy of Swabia", "4", "0922", "1268-10-28"),
    rel(2, "County of Hohnstein", "4", "1182", "1593"),
  ];
  assertEquals(
    selectHreFiefsForYear(elements, 1200).map((e) => e.tags["name:en"]),
    ["County of Hohnstein", "Duchy of Swabia", "Moravia"],
  );
});

Deno.test("buildYearCollection: properties は既存 hre_<year>.geojson と互換の上位集合", () => {
  const tagged = [rel(1, "Duchy of Bavaria", "4", "0962", "1100")];
  const geometries = new Map([[
    1,
    square(1, "Duchy of Bavaria", "4", "0962", "1100"),
  ]]);
  const { fc } = buildYearCollection(tagged, geometries, 1000);
  assertEquals(fc.features.length, 1);
  const props = fc.features[0].properties ?? {};
  // 既存 hre_<year>.geojson の 3 プロパティ（表示側の互換性）
  assertEquals(props.NAME, "Duchy of Bavaria");
  assertEquals(props.SUBJECTO, HRE_FIEF_NAME);
  assertEquals(props.PARTOF, HRE_FIEF_NAME);
  // OHM 由来の出典情報（france_fiefs_<year>.geojson と同じ追加プロパティ）
  assertEquals(props.ADMIN_LEVEL, 4);
  assertEquals(props.OHM_RELATION_ID, 1);
  assertEquals(props.START_DATE, "0962");
  assertEquals(props.END_DATE, "1100");
  assertEquals(fc.features[0].geometry.type, "MultiPolygon");
});

Deno.test("buildYearCollection: メタデータに出典・ライセンス・欠損を記録する（AC4）", () => {
  const tagged = [
    rel(1, "Duchy of Bavaria", "4", "0962", "1100"),
    // geom クエリの結果に無いリレーション
    rel(2, "Duchy of Saxony", "4", "0804", "1180"),
  ];
  const geometries = new Map([[
    1,
    square(1, "Duchy of Bavaria", "4", "0962", "1100"),
  ]]);
  const { metadata } = buildYearCollection(tagged, geometries, 1000);
  assertEquals(metadata.source, "OpenHistoricalMap");
  assertEquals(metadata.sourceUrl, OHM_SOURCE_HOMEPAGE);
  assertEquals(metadata.license, OHM_SOURCE_LICENSE);
  assertEquals(metadata.year, 1000);
  assertEquals(metadata.featureCount, 1);
  assertEquals(metadata.relationsWithoutGeometry, [2]);
  assertEquals(metadata.missingWays, {});
});

Deno.test("buildYearCollection: 帝国都市が許可リストに紛れても除外される（AC2）", () => {
  const tagged = [
    rel(1, "Free Imperial City of Ulm", "4", "1181", "1803-02-27"),
  ];
  const geometries = new Map([[
    1,
    square(1, "Free Imperial City of Ulm", "4", "1181", "1803-02-27"),
  ]]);
  const { fc } = buildYearCollection(
    tagged,
    geometries,
    1300,
    // 許可リストを誤って帝国都市入りにしても通らない
    ["Free Imperial City of Ulm"],
  );
  assertEquals(fc.features.length, 0);
});

Deno.test("サイズ上限は既存パイプラインと同じ 200 KB", () => {
  assertEquals(HRE_FIEF_SIZE_LIMIT_BYTES, 200 * 1000);
});

Deno.test("removePinchPoints: 1 点で自分に触れるリングを単純なリングに直す", () => {
  // 座標丸めで 2 頂点が同一座標へ潰れ、外環が P で自分自身に触れた状態
  // （P → L1 → P → L2 → P）。P の 2 回目以降の訪問を落として単純化する
  const pinched: Position[] = [
    [0, 0],
    [2, 0],
    [1, 1], // P（1 回目）
    [2, 2],
    [0, 2],
    [1, 1], // P（2 回目・丸めで潰れて生じた重複）
    [0, 0],
  ];
  const { geometry, removed } = removePinchPoints({
    type: "Polygon",
    coordinates: [pinched],
  });
  assertEquals(removed, 1);
  assert(geometry !== null);
  const ring = (geometry as { coordinates: Position[][] }).coordinates[0];
  // 重複頂点が 1 つ減り、閉じたリングのまま
  assertEquals(ring.length, pinched.length - 1);
  assertEquals(ring[0], ring[ring.length - 1]);
  // 開いたリングに同一座標の重複が無い
  const keys = ring.slice(0, -1).map((p) => p.join(","));
  assertEquals(new Set(keys).size, keys.length);
  // 自己交差が解消している
  assertEquals(selfIntersectionPoints(geometry).length, 0);
});

Deno.test("removePinchPoints: 外環に接する穴は穴側の頂点を落として離す", () => {
  // Prince-Bishopric of Passau と同じ形: 穴の始点が外環の頂点と同一座標
  const shared: Position = [5, 0];
  const outer: Position[] = [
    [0, 0],
    shared,
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ];
  const hole: Position[] = [shared, [7, 3], [5, 5], [3, 3], shared];
  const { geometry, removed } = removePinchPoints({
    type: "Polygon",
    coordinates: [outer, hole],
  });
  assertEquals(removed, 1);
  assert(geometry !== null);
  const coordinates = (geometry as Polygon).coordinates;
  // 外環は無傷で、穴だけが共有頂点を失って三角形になる
  assertEquals(coordinates[0], outer);
  assertEquals(coordinates[1], [[7, 3], [5, 5], [3, 3], [7, 3]]);
  assertEquals(selfIntersectionPoints(geometry).length, 0);
});

Deno.test("removePinchPoints: 重複が無いリングは同一参照でそのまま返す", () => {
  const geometry: Polygon = {
    type: "Polygon",
    coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
  };
  const result = removePinchPoints(geometry);
  assertEquals(result.removed, 0);
  assertEquals(result.geometry, geometry);
});

Deno.test("removePinchPoints: 3 頂点未満に潰れたリングは落とす", () => {
  // 全頂点が同一座標に潰れたパート
  const { geometry, removed } = removePinchPoints({
    type: "Polygon",
    coordinates: [[[1, 1], [1, 1], [1, 1], [1, 1]]],
  });
  // 閉じるための末尾を除いた 3 頂点のうち 2 つが重複として落ち、1 頂点だけ残る
  assertEquals(removed, 2);
  assertEquals(geometry, null);
});

/**
 * 以下は生成物（data/hre_fiefs_<year>.geojson）そのものを検証する。
 * ネットワークには触らず、コミット済みのファイルを読むだけ（deno task test の
 * --allow-read=data の範囲内）。
 */

/** 生成物を読み込む。metadata は GeoJSON の foreign member */
async function readGenerated(year: number): Promise<
  FeatureCollection & { metadata?: Record<string, unknown> }
> {
  const text = await Deno.readTextFile(`data/hre_fiefs_${year}.geojson`);
  return JSON.parse(text) as FeatureCollection & {
    metadata?: Record<string, unknown>;
  };
}

Deno.test("生成物: 対象年ごとにファイルがあり feature を持つ（AC1）", async () => {
  // 生成時の実測件数。減っていたら許可リストか OHM 側の変化を疑う
  const expected: Record<number, number> = {
    1000: 19,
    1100: 23,
    1200: 26,
    1279: 40,
    1300: 52,
    1400: 63,
    1492: 73,
  };
  for (const year of HRE_FIEF_YEARS) {
    const fc = await readGenerated(year);
    assertEquals(fc.type, "FeatureCollection");
    assertEquals(fc.features.length, expected[year], `${year} の feature 数`);
  }
});

Deno.test("生成物: 帝国都市・帝国外の行政区画が 1 件も入っていない（AC2）", async () => {
  for (const year of HRE_FIEF_YEARS) {
    const fc = await readGenerated(year);
    for (const feature of fc.features) {
      const name = String(feature.properties?.NAME);
      assertEquals(
        hreFiefExclusionReason(name, name),
        null,
        `${year}: ${name} は除外対象`,
      );
      assert(
        HRE_FIEF_NAMES.includes(name),
        `${year}: ${name} は許可リスト外`,
      );
    }
  }
});

Deno.test("生成物: 出典・ライセンスが metadata に記録されている（AC4）", async () => {
  for (const year of HRE_FIEF_YEARS) {
    const fc = await readGenerated(year);
    const metadata = fc.metadata ?? {};
    assertEquals(metadata.source, "OpenHistoricalMap");
    assertEquals(metadata.sourceUrl, OHM_SOURCE_HOMEPAGE);
    assertEquals(metadata.license, OHM_SOURCE_LICENSE);
    assertEquals(metadata.year, year);
    assertEquals(metadata.featureCount, fc.features.length);
  }
});

Deno.test("生成物: サイズ上限内で微小破片・退化リングが残っていない（AC5）", async () => {
  for (const year of HRE_FIEF_YEARS) {
    const text = await Deno.readTextFile(`data/hre_fiefs_${year}.geojson`);
    // 領邦名に多バイト文字があるので UTF-8 のバイト数で判定する
    const bytes = new TextEncoder().encode(text).length;
    assert(
      bytes <= HRE_FIEF_SIZE_LIMIT_BYTES,
      `${year}: ${bytes} バイトは上限超え`,
    );
    const fc = JSON.parse(text) as FeatureCollection;
    for (const feature of fc.features) {
      const geometry = feature.geometry;
      assert(
        geometry.type === "Polygon" || geometry.type === "MultiPolygon",
        `${year}: ${feature.properties?.NAME} は面ではない`,
      );
      for (const part of polygonParts(geometry)) {
        // 3 頂点未満に潰れたリングが残っていない
        for (const ring of part) {
          assert(
            ring.length >= 4,
            `${year}: ${feature.properties?.NAME} に ${ring.length} 頂点のリング`,
          );
        }
        // 外環は MIN_PART_AREA_M2（1 km²）以上（飛び地の微小破片が残らない）
        const outer = area(turfPolygon([part[0]]));
        assert(
          outer >= MIN_PART_AREA_M2,
          `${year}: ${feature.properties?.NAME} に ${
            (outer / 1e6).toFixed(3)
          } km² の破片`,
        );
      }
    }
  }
});

Deno.test("生成物: 許可リストの全 98 件がどこかの年代に現れる（死んだエントリが無い）", async () => {
  const used = new Set<string>();
  for (const year of HRE_FIEF_YEARS) {
    const fc = await readGenerated(year);
    for (const feature of fc.features) {
      used.add(String(feature.properties?.NAME));
    }
  }
  const unused = HRE_FIEF_NAMES.filter((name) => !used.has(name));
  assertEquals(
    unused,
    [],
    `生成物に現れない許可リスト項目: ${unused.join(", ")}`,
  );
});

Deno.test("生成物: Roller 由来 hre_<year>.geojson と年代が重ならない", async () => {
  for (const year of HRE_OVERLAY_YEARS) {
    assert(
      !HRE_FIEF_YEARS.includes(year),
      `${year} は Roller 側と重複する`,
    );
  }
  // properties は既存 hre_<year>.geojson の 3 プロパティを含む上位集合
  const roller = JSON.parse(
    await Deno.readTextFile("data/hre_1500.geojson"),
  ) as FeatureCollection;
  const rollerKeys = Object.keys(roller.features[0].properties ?? {});
  const ohm = await readGenerated(1492);
  const ohmKeys = Object.keys(ohm.features[0].properties ?? {});
  for (const key of rollerKeys) {
    assert(ohmKeys.includes(key), `${key} が OHM 側の properties に無い`);
  }
});

Deno.test("HRE_FIEF_YEARS は src/config.ts の HRE_FIEF_OVERLAY_YEARS と同値（TASK-86）", () => {
  // ランタイム側は src → scripts を import しない規約のため値を重複定義している。
  // 片方だけ増減すると「生成されていない年を fetch する」「生成したのに表示
  // されない」が起きるので、同値性をここで固定する（FRANCE_FIEF_YEARS と同方針）。
  assertEquals([...HRE_FIEF_YEARS], [...HRE_FIEF_OVERLAY_YEARS]);
});
