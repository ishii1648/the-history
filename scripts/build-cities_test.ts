import { assert, assertEquals } from "@std/assert";
import {
  buildCitiesData,
  buildCitiesSourceUrl,
  CITIES_PER_YEAR,
  CITIES_SOURCE_COMMIT,
  CITIES_SOURCE_FILE,
  CITIES_SOURCE_REPO,
  type CitiesData,
  type CityRow,
  filterCitiesToBbox,
  parseChandlerCsv,
  pickNearestRecord,
  selectCitiesForYear,
  validateCitiesData,
} from "./build-cities.ts";
import { SNAPSHOT_YEARS } from "../src/config.ts";
import { EUROPE_BBOX } from "./build-data.ts";
// CI の `deno test` は権限なしで実行されるため、生成物はファイル読み込みではなく
// static import で検証する（scripts/name-ja_test.ts と同じ方式）。
import citiesJson from "../data/cities.json" with { type: "json" };

// ---------------------------------------------------------------------------
// buildCitiesSourceUrl
// ---------------------------------------------------------------------------

Deno.test("buildCitiesSourceUrl はピン留めコミットの raw URL を返す", () => {
  const url = buildCitiesSourceUrl();
  assertEquals(
    url,
    `https://raw.githubusercontent.com/${CITIES_SOURCE_REPO}/${CITIES_SOURCE_COMMIT}/${CITIES_SOURCE_FILE}`,
  );
});

// ---------------------------------------------------------------------------
// parseChandlerCsv
// ---------------------------------------------------------------------------

const FIXTURE_CSV = [
  "City,OtherName,Country,Latitude,Longitude,Certainty,BC_200,AD_900,AD_950,AD_1000",
  'Istanbul,"Constantinople, Byzantium",Turkey,41.01,28.96,1,,300000,,300000',
  "Rome,,Italy,41.89,12.48,1,100000,40000,,35000",
  "NoCoords,,Nowhere,,,1,,100,,",
  "NoRecords,,Italy,45.0,9.0,1,,,,",
  "Cairo,,Egypt,30.04,31.24,1,,150000,,135000",
].join("\n");

Deno.test("parseChandlerCsv は City/座標/年別人口を CityRow に変換する", () => {
  const rows = parseChandlerCsv(FIXTURE_CSV);
  const istanbul = rows.find((r) => r.name === "Istanbul");
  assert(istanbul !== undefined);
  assertEquals(istanbul.lat, 41.01);
  assertEquals(istanbul.lon, 28.96);
  assertEquals(istanbul.records, { 900: 300000, 1000: 300000 });
});

Deno.test("parseChandlerCsv は BC_ 列を負の年として読む", () => {
  const rows = parseChandlerCsv(FIXTURE_CSV);
  const rome = rows.find((r) => r.name === "Rome");
  assert(rome !== undefined);
  assertEquals(rome.records[-200], 100000);
});

Deno.test("parseChandlerCsv は引用符付き OtherName（カンマ入り）を壊さない", () => {
  const rows = parseChandlerCsv(FIXTURE_CSV);
  // "Constantinople, Byzantium" のカンマで列がずれると座標が NaN になり行が落ちる
  assert(rows.some((r) => r.name === "Istanbul"));
});

Deno.test("parseChandlerCsv は座標欠損・人口記録なしの行を除外する", () => {
  const rows = parseChandlerCsv(FIXTURE_CSV);
  const names = rows.map((r) => r.name);
  assert(!names.includes("NoCoords"));
  assert(!names.includes("NoRecords"));
});

// ---------------------------------------------------------------------------
// filterCitiesToBbox
// ---------------------------------------------------------------------------

Deno.test("filterCitiesToBbox は bbox 外の都市を除外する", () => {
  const rows = filterCitiesToBbox(parseChandlerCsv(FIXTURE_CSV), EUROPE_BBOX);
  const names = rows.map((r) => r.name);
  assert(names.includes("Istanbul"));
  assert(names.includes("Rome"));
  // Cairo は lat 30.04 < 34 で bbox 外
  assert(!names.includes("Cairo"));
});

// ---------------------------------------------------------------------------
// pickNearestRecord
// ---------------------------------------------------------------------------

Deno.test("pickNearestRecord はスナップショット年ちょうどの記録を最優先する", () => {
  const picked = pickNearestRecord({ 880: 10, 900: 20, 910: 30 }, 900);
  assertEquals(picked, { year: 900, population: 20 });
});

Deno.test("pickNearestRecord は年差が最小の記録を選ぶ", () => {
  const picked = pickNearestRecord({ 860: 10, 895: 20 }, 900);
  assertEquals(picked, { year: 895, population: 20 });
});

Deno.test("pickNearestRecord は年差が同じなら過去の記録を優先する", () => {
  const picked = pickNearestRecord({ 890: 10, 910: 20 }, 900);
  assertEquals(picked, { year: 890, population: 10 });
});

Deno.test("pickNearestRecord は過去 50 年・未来 25 年の窓の外を無視する", () => {
  // 過去 51 年 → 窓外、過去 50 年 → 窓内
  assertEquals(pickNearestRecord({ 849: 10 }, 900), null);
  assertEquals(pickNearestRecord({ 850: 10 }, 900), {
    year: 850,
    population: 10,
  });
  // 未来 26 年 → 窓外、未来 25 年 → 窓内
  assertEquals(pickNearestRecord({ 926: 10 }, 900), null);
  assertEquals(pickNearestRecord({ 925: 10 }, 900), {
    year: 925,
    population: 10,
  });
});

// ---------------------------------------------------------------------------
// selectCitiesForYear
// ---------------------------------------------------------------------------

function row(
  name: string,
  lon: number,
  lat: number,
  records: Record<number, number>,
): CityRow {
  return { name, lon, lat, records };
}

Deno.test("selectCitiesForYear は人口降順・同数なら name 昇順で並べる", () => {
  const rows = [
    row("Small", 10, 50, { 1500: 1000 }),
    row("Big", 11, 51, { 1500: 9000 }),
    row("B-Tie", 12, 52, { 1500: 5000 }),
    row("A-Tie", 13, 53, { 1500: 5000 }),
  ];
  const markers = selectCitiesForYear(rows, 1500);
  assertEquals(markers.map((m) => m.name), ["Big", "A-Tie", "B-Tie", "Small"]);
  assertEquals(markers[0], { name: "Big", lon: 11, lat: 51, population: 9000 });
});

Deno.test("selectCitiesForYear は CITIES_PER_YEAR 件に切り詰める", () => {
  const rows = Array.from(
    { length: CITIES_PER_YEAR + 10 },
    (_, i) =>
      row(`City${String(i).padStart(2, "0")}`, 10, 50, { 1500: 1000 + i }),
  );
  const markers = selectCitiesForYear(rows, 1500);
  assertEquals(markers.length, CITIES_PER_YEAR);
  // 人口の大きい方から採用される
  assertEquals(markers[0].population, 1000 + CITIES_PER_YEAR + 9);
});

Deno.test("selectCitiesForYear は既知の重複・非都市エントリ（Gelibolu/Qum/Ruhr）を除外する", () => {
  const rows = [
    row("Gelibolu", 26.7, 40.4, { 1000: 300000 }),
    row("Qum", 50.9, 34.6, { 1000: 60000 }),
    row("Ruhr", 7.2, 51.5, { 1000: 700000 }),
    row("Rome", 12.48, 41.89, { 1000: 35000 }),
  ];
  const markers = selectCitiesForYear(rows, 1000);
  assertEquals(markers.map((m) => m.name), ["Rome"]);
});

Deno.test("selectCitiesForYear は既知の誤記録（Algiers 1925 等）を無視する", () => {
  const rows = [
    row("Algiers", 3.06, 36.77, { 1700: 85000, 1925: 2220000 }),
  ];
  // 1914 のスナップショットで 1925 の誤記録（2,220,000）を拾ってはいけない
  const markers = selectCitiesForYear(rows, 1914);
  assertEquals(markers, []);
  // 1700 の正しい記録はそのまま使われる
  const markers1700 = selectCitiesForYear(rows, 1700);
  assertEquals(markers1700.map((m) => m.population), [85000]);
});

Deno.test("selectCitiesForYear は Istanbul を Constantinople へ改名する", () => {
  const rows = [row("Istanbul", 28.96, 41.01, { 900: 300000 })];
  const markers = selectCitiesForYear(rows, 900);
  assertEquals(markers.map((m) => m.name), ["Constantinople"]);
});

Deno.test("selectCitiesForYear は同名都市（Brest 仏/白露等）を人口最大の 1 件に統合する", () => {
  const rows = [
    row("Brest", -4.49, 48.39, { 1800: 30000 }),
    row("Brest", 23.7, 52.1, { 1800: 10000 }),
  ];
  const markers = selectCitiesForYear(rows, 1800);
  assertEquals(markers.length, 1);
  assertEquals(markers[0].lon, -4.49);
  assertEquals(markers[0].population, 30000);
});

// ---------------------------------------------------------------------------
// buildCitiesData / validateCitiesData
// ---------------------------------------------------------------------------

Deno.test("buildCitiesData は SNAPSHOT_YEARS 全てを年キーに持つ", () => {
  const rows = [row("Rome", 12.48, 41.89, { 900: 40000, 1914: 500000 })];
  const data = buildCitiesData(rows, SNAPSHOT_YEARS);
  assertEquals(
    Object.keys(data.years),
    SNAPSHOT_YEARS.map((y) => String(y)),
  );
  assert(typeof data.source.description === "string");
  assert(typeof data.source.license === "string");
});

function validData(): CitiesData {
  const years: CitiesData["years"] = {};
  for (const year of SNAPSHOT_YEARS) {
    years[String(year)] = Array.from({ length: 15 }, (_, i) => ({
      name: `City${String(i).padStart(2, "0")}`,
      lon: 10,
      lat: 50,
      population: 1000 * (15 - i),
    }));
  }
  return {
    years,
    source: { description: "test", license: "test" },
  };
}

Deno.test("validateCitiesData は正しいデータで空配列を返す", () => {
  assertEquals(
    validateCitiesData(validData(), SNAPSHOT_YEARS, EUROPE_BBOX),
    [],
  );
});

Deno.test("validateCitiesData は年キーの過不足を検出する", () => {
  const missing = validData();
  delete missing.years["900"];
  assert(
    validateCitiesData(missing, SNAPSHOT_YEARS, EUROPE_BBOX).length > 0,
  );
  const extra = validData();
  extra.years["1850"] = extra.years["1800"];
  assert(validateCitiesData(extra, SNAPSHOT_YEARS, EUROPE_BBOX).length > 0);
});

Deno.test("validateCitiesData は都市数が 15〜25 件の範囲外を検出する", () => {
  const tooFew = validData();
  tooFew.years["900"] = tooFew.years["900"].slice(0, 14);
  assert(validateCitiesData(tooFew, SNAPSHOT_YEARS, EUROPE_BBOX).length > 0);
  const tooMany = validData();
  tooMany.years["900"] = Array.from({ length: 26 }, (_, i) => ({
    name: `X${i}`,
    lon: 10,
    lat: 50,
    population: 100,
  }));
  assert(validateCitiesData(tooMany, SNAPSHOT_YEARS, EUROPE_BBOX).length > 0);
});

Deno.test("validateCitiesData は bbox 外の座標を検出する", () => {
  const data = validData();
  data.years["900"][0] = { ...data.years["900"][0], lat: 30 };
  assert(validateCitiesData(data, SNAPSHOT_YEARS, EUROPE_BBOX).length > 0);
});

Deno.test("validateCitiesData は年内の name 重複を検出する", () => {
  const data = validData();
  data.years["900"][1] = { ...data.years["900"][1], name: "City00" };
  assert(validateCitiesData(data, SNAPSHOT_YEARS, EUROPE_BBOX).length > 0);
});

Deno.test("validateCitiesData は population が正整数でも null でもない値を検出する", () => {
  const zero = validData();
  zero.years["900"][0] = { ...zero.years["900"][0], population: 0 };
  assert(validateCitiesData(zero, SNAPSHOT_YEARS, EUROPE_BBOX).length > 0);
  const nullable = validData();
  nullable.years["900"][0] = { ...nullable.years["900"][0], population: null };
  assertEquals(
    validateCitiesData(nullable, SNAPSHOT_YEARS, EUROPE_BBOX),
    [],
  );
});

// ---------------------------------------------------------------------------
// 生成物 data/cities.json の検証（static import・権限不要）
// ---------------------------------------------------------------------------

const generated = citiesJson as unknown as CitiesData;

Deno.test("data/cities.json は validateCitiesData を全て満たす", () => {
  assertEquals(validateCitiesData(generated, SNAPSHOT_YEARS, EUROPE_BBOX), []);
});

Deno.test("data/cities.json の各年は人口降順に並んでいる", () => {
  for (const [year, markers] of Object.entries(generated.years)) {
    for (let i = 1; i < markers.length; i++) {
      const prev = markers[i - 1].population;
      const curr = markers[i].population;
      if (prev === null || curr === null) continue;
      assert(prev >= curr, `${year} 年の並びが人口降順でない (index ${i})`);
    }
  }
});

Deno.test("data/cities.json は代表都市を含む（900/1500: Constantinople、1500: Paris/Venice、1914: London/Berlin）", () => {
  const names = (year: number) =>
    generated.years[String(year)].map((m) => m.name);
  assert(names(900).includes("Constantinople"));
  assert(names(1500).includes("Constantinople"));
  assert(names(1500).includes("Paris"));
  assert(names(1500).includes("Venice"));
  assert(names(1914).includes("London"));
  assert(names(1914).includes("Berlin"));
  assert(names(1914).includes("Paris"));
});

Deno.test("data/cities.json に除外対象（Istanbul/Gelibolu/Ruhr/Qum）が現れない", () => {
  const banned = new Set(["Istanbul", "Gelibolu", "Ruhr", "Qum"]);
  for (const markers of Object.values(generated.years)) {
    for (const marker of markers) {
      assert(!banned.has(marker.name), `${marker.name} が出力に含まれている`);
    }
  }
});

Deno.test("data/cities.json の source は出典・ライセンス（CC BY 4.0）を明記する", () => {
  assert(generated.source.license.includes("CC BY 4.0"));
  assert(generated.source.description.length > 0);
});
