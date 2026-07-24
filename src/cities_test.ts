import { assert, assertEquals } from "@std/assert";
import {
  buildCityLabelData,
  buildCityMarkerData,
  CITIES_DATA_URL,
  type CitiesData,
  CITY_LABEL_PRIORITY_MAX,
  CITY_LABEL_PRIORITY_MIN,
  CITY_NAME_JA_OVERRIDES,
  cityDisplayName,
  cityEntriesForYear,
  type CityEntry,
} from "./cities.ts";
import { MAX_LABEL_PRIORITY, MIN_LABEL_PRIORITY } from "./labels.ts";
// data/cities.json は .json 拡張子なので `with { type: "json" }` の静的 import
// はモジュール解決の一部として扱われ、`deno test`（CI は --allow-read なしで
// 実行、scripts/name-ja_test.ts と同じ前提）でも読み取り可能。一方
// data/europe_*.geojson・data/hre_*.geojson（勢力名の出典）は .geojson 拡張子で
// あり、Deno は `type: "json"` 属性を付けても "Expected a Json module, but
// identified a Unknown module" として拒否する（拡張子ベースの media type
// 判定のため、権限とは無関係の技術的制約。動作確認済み）。そのため
// 「都市名 × 勢力名の綴り衝突」の判定は cities.json 側のみ実データ、
// 勢力名側は KNOWN_CITY_POWER_NAME_COLLISIONS の静的リスト
// （scripts/name-ja_test.ts の EXPECTED_NAMES と同じ「定数列挙 + 再生成
// コマンド明記」方式）で行う（TASK-47）。
import citiesData from "../data/cities.json" with { type: "json" };

/**
 * data/cities.json の都市名のうち、data/europe_*.geojson / data/hre_*.geojson
 * の NAME/SUBJECTO（勢力名）と綴りが衝突するもの一覧（TASK-47 時点）。
 * 再生成コマンド（リポジトリルートで実行、cities.json 由来分を除外した
 * 勢力名+河川名との積集合を取る）:
 *   python3 -c "import json,glob; s=set(); [s.update(v for f2 in [json.load(open(f))] for ft in f2['features'] for k in ('NAME','SUBJECTO') if (v:=ft['properties'].get(k))) for f in glob.glob('data/europe_*.geojson')+glob.glob('data/hre_*.geojson')]; s.update(v for ft in json.load(open('data/rivers.geojson'))['features'] if (v:=ft['properties'].get('name'))); c=json.load(open('data/cities.json')); names=set(x['name'] for cs in c['years'].values() for x in cs); print(json.dumps(sorted(names & s),ensure_ascii=False,indent=2))"
 */
const KNOWN_CITY_POWER_NAME_COLLISIONS: string[] = [
  "Algiers",
  "Florence",
  "Genoa",
  "Granada",
  "Hamburg",
  "Milan",
  "Naples",
  "Tunis",
  "Venice",
];

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

Deno.test("cityDisplayName: TASK-47 で追加した都市名/勢力名衝突（Algiers/Florence/Genoa/Hamburg/Tunis）もオーバーライド訳が勝つ", () => {
  // name-ja.json 側が将来「勢力名」形（例: フィレンツェ公国）に変わっても
  // 都市表示が壊れないよう、都市訳を明示的に固定する（Venice 等と同じ意図）。
  const ja = {
    Algiers: "アルジェ首長国",
    Florence: "フィレンツェ公国",
    Genoa: "ジェノヴァ共和国",
    Hamburg: "ハンブルク自由市",
    Tunis: "チュニス太守国",
  };
  assertEquals(cityDisplayName("Algiers", ja), "アルジェ");
  assertEquals(cityDisplayName("Florence", ja), "フィレンツェ");
  assertEquals(cityDisplayName("Genoa", ja), "ジェノヴァ");
  assertEquals(cityDisplayName("Hamburg", ja), "ハンブルク");
  assertEquals(cityDisplayName("Tunis", ja), "チュニス");
});

Deno.test("CITY_NAME_JA_OVERRIDES: 既知の都市名×勢力名衝突は全て登録済み", () => {
  const missing = KNOWN_CITY_POWER_NAME_COLLISIONS.filter(
    (name) => !(name in CITY_NAME_JA_OVERRIDES),
  );
  assertEquals(
    missing,
    [],
    `衝突するが CITY_NAME_JA_OVERRIDES 未登録: ${missing.join(", ")}`,
  );
});

Deno.test("KNOWN_CITY_POWER_NAME_COLLISIONS: 実データ（data/cities.json）に存在しない名前が残っていない（リスト陳腐化の検出）", () => {
  const cities = citiesData as { years: Record<string, { name: string }[]> };
  const cityNames = new Set<string>();
  for (const entries of Object.values(cities.years)) {
    for (const entry of entries) cityNames.add(entry.name);
  }
  const stale = KNOWN_CITY_POWER_NAME_COLLISIONS.filter(
    (name) => !cityNames.has(name),
  );
  assertEquals(
    stale,
    [],
    `data/cities.json に存在しなくなった衝突名（リスト更新が必要）: ${
      stale.join(", ")
    }`,
  );
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
