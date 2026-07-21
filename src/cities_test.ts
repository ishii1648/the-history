import { assert, assertEquals } from "@std/assert";
import {
  buildCityLabelData,
  buildCityMarkerData,
  CITIES_DATA_URL,
  type CitiesData,
  CITY_LABEL_PRIORITY_MAX,
  CITY_LABEL_PRIORITY_MIN,
  cityDisplayName,
  cityEntriesForYear,
  type CityEntry,
} from "./cities.ts";
import { MAX_LABEL_PRIORITY, MIN_LABEL_PRIORITY } from "./labels.ts";

/** テスト用の都市エントリを組み立てる */
function city(
  name: string,
  population: number | null = null,
  lon = 2.35,
  lat = 48.85,
): CityEntry {
  return { name, lon, lat, population };
}

function data(years: Record<string, unknown>): CitiesData {
  return { years } as CitiesData;
}

// ---- cityEntriesForYear ----

Deno.test("cityEntriesForYear: 該当年の都市配列を返す", () => {
  const d = data({ "1500": [city("Paris", 200000)] });
  const entries = cityEntriesForYear(d, 1500);
  assertEquals(entries.length, 1);
  assertEquals(entries[0].name, "Paris");
  assertEquals(entries[0].population, 200000);
});

Deno.test("cityEntriesForYear: 年キーが無ければ空配列", () => {
  const d = data({ "1500": [city("Paris")] });
  assertEquals(cityEntriesForYear(d, 1600), []);
});

Deno.test("cityEntriesForYear: データ不正形（null / years 非オブジェクト）は空配列", () => {
  assertEquals(cityEntriesForYear(null as unknown as CitiesData, 1500), []);
  assertEquals(
    cityEntriesForYear({ years: "broken" } as unknown as CitiesData, 1500),
    [],
  );
  assertEquals(cityEntriesForYear({} as unknown as CitiesData, 1500), []);
});

Deno.test("cityEntriesForYear: 年の値が配列でなければ空配列", () => {
  const d = data({ "1500": { name: "Paris" } });
  assertEquals(cityEntriesForYear(d, 1500), []);
});

Deno.test("cityEntriesForYear: 型が不正なエントリは除外する", () => {
  const d = data({
    "1500": [
      city("Paris", 200000),
      null,
      "London",
      { name: 42, lon: 0, lat: 0, population: null },
      { name: "NoLon", lat: 0, population: null },
      { name: "BadLat", lon: 0, lat: Number.NaN, population: null },
    ],
  });
  const entries = cityEntriesForYear(d, 1500);
  assertEquals(entries.map((e) => e.name), ["Paris"]);
});

Deno.test("cityEntriesForYear: population 欠落・非数値は null に正規化する", () => {
  const d = data({
    "1500": [
      { name: "A", lon: 0, lat: 0 },
      { name: "B", lon: 0, lat: 0, population: "many" },
      { name: "C", lon: 0, lat: 0, population: 5000 },
    ],
  });
  const entries = cityEntriesForYear(d, 1500);
  assertEquals(entries.map((e) => e.population), [null, null, 5000]);
});

// ---- cityDisplayName ----

Deno.test("cityDisplayName: 通常は ja 適用・未登録は英語フォールバック", () => {
  assertEquals(cityDisplayName("Paris", { Paris: "パリ" }), "パリ");
  assertEquals(cityDisplayName("London", {}), "London");
});

Deno.test("cityDisplayName: 勢力名と衝突する都市はオーバーライド訳が勝つ", () => {
  // name-ja.json は勢力名と共有のフラットマップのため、Venice 等は
  // 「ヴェネツィア共和国」（勢力訳）になってしまう。都市表示では都市訳を使う。
  const ja = {
    Venice: "ヴェネツィア共和国",
    Milan: "ミラノ公国",
    Naples: "ナポリ王国",
    Granada: "グラナダ王国",
  };
  assertEquals(cityDisplayName("Venice", ja), "ヴェネツィア");
  assertEquals(cityDisplayName("Milan", ja), "ミラノ");
  assertEquals(cityDisplayName("Naples", ja), "ナポリ");
  assertEquals(cityDisplayName("Granada", ja), "グラナダ");
});

// ---- buildCityLabelData ----

Deno.test("buildCityLabelData: ja 適用と英語フォールバック", () => {
  const entries = [city("Paris", 200000), city("London", 50000)];
  const ja = { Paris: "パリ" };
  const labels = buildCityLabelData(entries, ja);
  assertEquals(labels.map((l) => l.text), ["パリ", "London"]);
  assertEquals(labels[0].position, [2.35, 48.85]);
});

Deno.test("buildCityLabelData: 勢力名と衝突する都市名はオーバーライド訳で表示する", () => {
  const labels = buildCityLabelData(
    [city("Venice", 100000)],
    { Venice: "ヴェネツィア共和国" },
  );
  assertEquals(labels.map((l) => l.text), ["ヴェネツィア"]);
});

Deno.test("buildCityLabelData: name 空のエントリは除外する", () => {
  const labels = buildCityLabelData([city(""), city("Paris")], {});
  assertEquals(labels.map((l) => l.text), ["Paris"]);
});

Deno.test("buildCityLabelData: priority は都市固定バンド内に収まる", () => {
  const entries = [
    city("None", null),
    city("Zero", 0),
    city("Small", 1000),
    city("Big", 500000),
    city("Huge", 100_000_000),
  ];
  for (const l of buildCityLabelData(entries, {})) {
    assert(
      l.priority >= CITY_LABEL_PRIORITY_MIN &&
        l.priority <= CITY_LABEL_PRIORITY_MAX,
      `priority ${l.priority} がバンド外`,
    );
  }
});

Deno.test("buildCityLabelData: priority は人口に対して単調非減少", () => {
  const [small, mid, big] = buildCityLabelData(
    [city("S", 1000), city("M", 100000), city("B", 1_000_000)],
    {},
  );
  assert(small.priority <= mid.priority);
  assert(mid.priority <= big.priority);
  assert(small.priority < big.priority, "人口差 1000 倍で優先度が上がること");
});

Deno.test("buildCityLabelData: population null はバンド下限の priority", () => {
  const [l] = buildCityLabelData([city("Unknown", null)], {});
  assertEquals(l.priority, CITY_LABEL_PRIORITY_MIN);
});

Deno.test("都市 priority バンドは CollisionFilterExtension の許容レンジ内の中位帯", () => {
  // 国名ラベルの面積由来 priority（実測 -400〜300 程度）と競る中位帯であること
  assert(CITY_LABEL_PRIORITY_MIN >= MIN_LABEL_PRIORITY);
  assert(CITY_LABEL_PRIORITY_MAX <= MAX_LABEL_PRIORITY);
  assert(CITY_LABEL_PRIORITY_MIN > 0, "小勢力ラベル（負値）には勝つこと");
  assert(CITY_LABEL_PRIORITY_MAX < 300, "大国ラベル（300 付近）には負けること");
});

// ---- buildCityMarkerData ----

Deno.test("buildCityMarkerData: name と position [lon, lat] へ変換する", () => {
  const markers = buildCityMarkerData([city("Paris", 200000, 2.35, 48.85)]);
  assertEquals(markers, [{ name: "Paris", position: [2.35, 48.85] }]);
});

Deno.test("buildCityMarkerData: name 空のエントリは除外する", () => {
  const markers = buildCityMarkerData([city(""), city("Rome")]);
  assertEquals(markers.map((m) => m.name), ["Rome"]);
});

// ---- 契約 ----

Deno.test("CITIES_DATA_URL は /data/cities.json（build 成果物の配信パス契約）", () => {
  assertEquals(CITIES_DATA_URL, "/data/cities.json");
});
