import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection } from "geojson";
import {
  auditAll,
  bboxOf,
  colorKeyDrift,
  danglingSuzerains,
  type PowerRecord,
  presenceGaps,
  recordsOf,
  shapeCarriedRenames,
  singleYearNames,
  suzerainShifts,
  YEARS,
} from "./audit-attribution.ts";

/** 矩形ポリゴンの feature を組み立てる（bbox = [x0,y0,x1,y1]） */
function rect(
  props: Record<string, unknown>,
  [x0, y0, x1, y1]: [number, number, number, number],
): Feature {
  return {
    type: "Feature",
    properties: props,
    geometry: {
      type: "Polygon",
      coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
    },
  };
}

function fc(...features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

/** レコードを直接組み立てる（検出器の単体テスト用） */
function rec(
  name: string,
  subjecto: string,
  bbox: [number, number, number, number] = [0, 0, 1, 1],
): PowerRecord {
  return {
    name,
    subjecto,
    colorKey: subjecto === "" || subjecto === name
      ? name
      : `${name}|${subjecto}`,
    bbox,
  };
}

Deno.test("bboxOf は Polygon / MultiPolygon の外接矩形を返し、点は null", () => {
  assertEquals(
    bboxOf(rect({}, [1, 2, 3, 4]).geometry),
    [1, 2, 3, 4],
  );
  assertEquals(
    bboxOf({
      type: "MultiPolygon",
      coordinates: [
        [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
        [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]],
      ],
    }),
    [0, 0, 6, 6],
  );
  assertEquals(bboxOf({ type: "Point", coordinates: [0, 0] }), null);
});

Deno.test("recordsOf は NAME 無しを除外し renames で正規化する", () => {
  const records = recordsOf(
    fc(
      rect({ NAME: "Castilla", SUBJECTO: "Castilla" }, [0, 0, 1, 1]),
      rect({ SUBJECTO: "" }, [2, 2, 3, 3]),
      rect({ NAME: "Armenia", SUBJECTO: "Byzantine Empire" }, [4, 4, 5, 5]),
    ),
    { Castilla: "Castile" },
  );
  assertEquals(records.length, 2);
  assertEquals(records[0].name, "Castile");
  assertEquals(records[0].colorKey, "Castile");
  assertEquals(records[1].colorKey, "Armenia|Byzantine Empire");
});

Deno.test("suzerainShifts は独立と従属が年代で入れ替わる勢力を拾う", () => {
  const shifts = suzerainShifts(
    new Map([
      [1279, [rec("Novgorod", "Mongol Empire"), rec("Sweden", "Sweden")]],
      [1300, [rec("Novgorod", "Novgorod"), rec("Sweden", "Sweden")]],
      [1400, [rec("Novgorod", "Mongol Empire"), rec("Sweden", "")]],
    ]),
  );
  assertEquals(shifts.length, 1);
  assertEquals(shifts[0].name, "Novgorod");
  assertEquals(shifts[0].byYear.get(1300), [""]);
  assertEquals(shifts[0].byYear.get(1400), ["Mongol Empire"]);
});

Deno.test("suzerainShifts は SUBJECTO の空文字と自己参照を同じ『独立』として扱う", () => {
  const shifts = suzerainShifts(
    new Map([
      [1000, [rec("Sweden", "Sweden")]],
      [1100, [rec("Sweden", "")]],
    ]),
  );
  assertEquals(shifts, []);
});

Deno.test("singleYearNames は 1 年代にしか現れない NAME を年代順に返す", () => {
  const found = singleYearNames(
    new Map([
      [1000, [rec("Pomerania", ""), rec("Poland", "")]],
      [1100, [rec("Poland", "")]],
      [1200, [rec("Angevin Empire", "")]],
    ]),
  );
  assertEquals(found, [
    { name: "Pomerania", year: 1000 },
    { name: "Angevin Empire", year: 1200 },
  ]);
});

Deno.test("presenceGaps は出現 → 不在 → 再出現だけを拾い、末尾の消滅は拾わない", () => {
  const gaps = presenceGaps(
    new Map([
      [1000, [rec("Ryazan", ""), rec("Poland", "")]],
      [1100, [rec("Poland", "")]],
      [1200, [rec("Ryazan", "")]],
    ]),
    [1000, 1100, 1200],
  );
  assertEquals(gaps.length, 1);
  assertEquals(gaps[0].name, "Ryazan");
  assertEquals(gaps[0].missing, [1100]);
});

Deno.test("danglingSuzerains は同年代に存在しない宗主を封臣ごとにまとめる", () => {
  const dangling = danglingSuzerains(
    new Map([
      [1400, [
        rec("Novgorod", "Mongol Empire"),
        rec("Blue Horde", "Mongol Empire"),
        rec("Bulgar Khanate", "Ottoman Empire"),
        rec("Ottoman Empire", "Ottoman Empire"),
      ]],
    ]),
  );
  assertEquals(dangling.length, 1);
  assertEquals(dangling[0].suzerain, "Mongol Empire");
  assertEquals(dangling[0].vassals, ["Blue Horde", "Novgorod"]);
});

Deno.test("shapeCarriedRenames は隣接年代の bbox 一致・異名を拾い、同名は除く", () => {
  const renamed = shapeCarriedRenames(
    new Map([
      [1279, [rec("Serbia", "", [16.64, 41.76, 21.68, 44.94])]],
      [1300, [
        rec("Raška", "", [16.64, 41.76, 21.68, 44.94]),
        rec("Sweden", "", [11, 56, 27, 63]),
      ]],
      [1400, [rec("Sweden", "", [11, 56, 27, 63])]],
    ]),
    [1279, 1300, 1400],
  );
  assertEquals(renamed.length, 1);
  assertEquals(renamed[0].fromName, "Serbia");
  assertEquals(renamed[0].toName, "Raška");
});

Deno.test("colorKeyDrift は同一 NAME の色キーが年代で変わる勢力を拾う", () => {
  const drift = colorKeyDrift(
    new Map([
      [1880, [rec("Iceland", "Denmark"), rec("Sweden", "Sweden")]],
      [1900, [rec("Iceland", "Iceland"), rec("Sweden", "Sweden")]],
    ]),
  );
  assertEquals(drift.length, 1);
  assertEquals(drift[0].name, "Iceland");
  assertEquals(drift[0].keys, ["Iceland", "Iceland|Denmark"]);
});

/** 生成物 data/europe_<year>.geojson（テストからの相対 URL で読む） */
async function loadYear(year: number): Promise<FeatureCollection> {
  const url = new URL(`../data/europe_${year}.geojson`, import.meta.url);
  return JSON.parse(await Deno.readTextFile(url)) as FeatureCollection;
}

Deno.test("実データ: 検出結果は監査対象の 19 年代をすべて含み、宗主は自己参照を含まない", async () => {
  assertEquals(YEARS.length, 19);
  const records = new Map<number, readonly PowerRecord[]>();
  for (const year of YEARS) {
    records.set(year, recordsOf(await loadYear(year)));
  }
  const report = auditAll(records);
  assertEquals(report.years, YEARS);
  // 検出器の不変条件: 宙に浮いた宗主は自分自身を宗主にしていない
  for (const d of report.danglingSuzerains) {
    assert(!d.vassals.includes(d.suzerain));
  }
  // 存続の途切れは必ず出現年代の内側にある
  for (const gap of report.presenceGaps) {
    for (const y of gap.missing) {
      assert(y > gap.present[0] && y < gap.present[gap.present.length - 1]);
    }
  }
});
