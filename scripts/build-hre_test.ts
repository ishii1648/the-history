import { assert, assertEquals } from "@std/assert";
import type { FeatureCollection } from "geojson";
import {
  applyRangeOverrides,
  buildBitstreamUrl,
  buildYearCollection,
  dedupById,
  HRE_BITSTREAM_UUIDS,
  HRE_NAME,
  HRE_OVERLAY_YEARS,
  HRE_RANGE_OVERRIDES,
  HRE_SIZE_LIMIT_BYTES,
  HRE_SOURCE_DOI,
  HRE_SOURCE_LICENSE,
  HRE_TERRITORIES,
  isActiveAtYear,
  resolveTerritoryName,
  selectMajorTerritories,
} from "./build-hre.ts";

/** テスト用に Roller データセット風の 1 feature を組み立てる */
function feature(properties: Record<string, unknown>) {
  return {
    type: "Feature" as const,
    properties,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[10, 48], [10, 49], [11, 49], [11, 48], [10, 48]]],
    },
  };
}

function collection(
  features: Array<ReturnType<typeof feature>>,
): FeatureCollection {
  return { type: "FeatureCollection", features };
}

Deno.test("HRE_OVERLAY_YEARS は表示側との契約どおり 1500/1530/1600/1650", () => {
  assertEquals([...HRE_OVERLAY_YEARS], [1500, 1530, 1600, 1650]);
});

Deno.test("出典メタデータ: DOI・ライセンス・bitstream UUID をピン留めする", () => {
  assertEquals(HRE_SOURCE_DOI, "10.3929/ethz-b-000472583");
  assertEquals(HRE_SOURCE_LICENSE, "CC BY-NC-SA 4.0");
  // territories_manual.shp / .dbf は取得に必須
  assertEquals(
    HRE_BITSTREAM_UUIDS.shp,
    "3291edf3-6d4c-4b18-a8af-420da09c6355",
  );
  assertEquals(
    HRE_BITSTREAM_UUIDS.dbf,
    "4a74aa26-c5f0-4829-89e6-9f64c0c5e0d6",
  );
  assert(
    buildBitstreamUrl(HRE_BITSTREAM_UUIDS.shp) ===
      "https://www.research-collection.ethz.ch/server/api/core/bitstreams/" +
        "3291edf3-6d4c-4b18-a8af-420da09c6355/content",
  );
});

Deno.test("HRE_SIZE_LIMIT_BYTES は 200KB", () => {
  assertEquals(HRE_SIZE_LIMIT_BYTES, 200 * 1000);
});

Deno.test("isActiveAtYear: start <= year < end の半開区間で判定する", () => {
  const props = { start: 1500, end: 1600 };
  assert(!isActiveAtYear(props, 1499));
  assert(isActiveAtYear(props, 1500)); // 開始年ちょうどは有効
  assert(isActiveAtYear(props, 1599));
  assert(!isActiveAtYear(props, 1600)); // 終了年ちょうどは無効（後継領邦側に譲る）
});

Deno.test("isActiveAtYear: start/end の欠損（null/undefined/NaN）は無期限として扱う", () => {
  // Österreich は start/end とも欠損（dbf ではアスタリスク埋め → パース後 null/NaN）
  assert(isActiveAtYear({ start: null, end: null }, 1500));
  assert(isActiveAtYear({}, 1650));
  assert(isActiveAtYear({ start: NaN, end: NaN }, 1600));
  // 片側のみ欠損（Kurmainz は start 欠損・end 1803）
  assert(isActiveAtYear({ start: null, end: 1803 }, 1500));
  assert(!isActiveAtYear({ start: null, end: 1803 }, 1803));
  assert(isActiveAtYear({ start: 1157, end: null }, 1650));
  assert(!isActiveAtYear({ start: 1157, end: null }, 1100));
});

Deno.test("applyRangeOverrides: 対象 id の start/end のみ上書きし他は保持する", () => {
  const fc = collection([
    feature({ id: "Bayern", name: "Bayern", start: 1506, end: 1623 }),
    feature({ id: "Kurpfalz", name: "Kurpfalz", start: 1356, end: 1777 }),
  ]);
  const out = applyRangeOverrides(fc, {
    Bayern: { start: 1500, end: 1806 },
  });
  assertEquals(out.features[0].properties?.start, 1500);
  assertEquals(out.features[0].properties?.end, 1806);
  assertEquals(out.features[0].properties?.name, "Bayern");
  // 対象外の feature は不変
  assertEquals(out.features[1].properties?.start, 1356);
  assertEquals(out.features[1].properties?.end, 1777);
  // 入力は破壊しない（純粋関数）
  assertEquals(fc.features[0].properties?.start, 1506);
});

Deno.test("applyRangeOverrides: 片側のみの上書きを許す", () => {
  const fc = collection([
    feature({ id: "X", start: null, end: null }),
  ]);
  const out = applyRangeOverrides(fc, { X: { start: 1572 } });
  assertEquals(out.features[0].properties?.start, 1572);
  assertEquals(out.features[0].properties?.end, null);
});

Deno.test("dedupById: 同一 id の宗派期間重複行は最初の 1 行のみ残す", () => {
  const fc = collection([
    feature({ id: "Böhmen", religion: "Roman-catholic" }),
    feature({ id: "Böhmen", religion: "lutheran" }),
    feature({ id: "Kurpfalz", religion: "Roman-catholic" }),
    feature({ id: "Böhmen", religion: "lutheran, catholic" }),
  ]);
  const out = dedupById(fc);
  assertEquals(out.features.length, 2);
  assertEquals(out.features[0].properties?.id, "Böhmen");
  assertEquals(out.features[0].properties?.religion, "Roman-catholic");
  assertEquals(out.features[1].properties?.id, "Kurpfalz");
});

Deno.test("HRE_TERRITORIES: 主要領邦の選定結果（ドイツ語 id → 称号付き英語表示名）を固定する", () => {
  assertEquals(HRE_TERRITORIES, {
    "Österreich": "Archduchy of Austria",
    "Kurbrandenburg": "Electorate of Brandenburg",
    "Böhmen": "Kingdom of Bohemia",
    // バイエルンは 1623 年の選帝侯昇格を境に称号が変わる（同一 id・同一領域）
    "Bayern": [
      { name: "Duchy of Bavaria" },
      { name: "Electorate of Bavaria", start: 1623 },
    ],
    "ernestinischesSachsenbis1547": "Electorate of Saxony",
    "albertinischesSachsenbis1547": "Duchy of Saxony",
    "albertinischesSachsennach1635": "Electorate of Saxony",
    "ernestinischesSachsennach1547": "Duchy of Saxony",
    "Kurpfalz": "Electorate of the Palatinate",
    "Kurmainz": "Archbishopric of Mainz",
    "Kurtrier": "Archbishopric of Trier",
    "KölnErzstift": "Archbishopric of Cologne",
    "Württemberg": "Duchy of Württemberg",
    "Hessen": "Landgraviate of Hesse",
    "HessenKassel": "Landgraviate of Hesse-Kassel",
    "HessenDarmstadt": "Landgraviate of Hesse-Darmstadt",
    "SalzburgErzstift": "Archbishopric of Salzburg",
  });
});

Deno.test("resolveTerritoryName: 固定名はそのまま返し、期間配列は年代で解決する", () => {
  assertEquals(
    resolveTerritoryName("Kingdom of Bohemia", 1500),
    "Kingdom of Bohemia",
  );
  const bavaria = HRE_TERRITORIES["Bayern"];
  assertEquals(resolveTerritoryName(bavaria, 1500), "Duchy of Bavaria");
  assertEquals(resolveTerritoryName(bavaria, 1530), "Duchy of Bavaria");
  assertEquals(resolveTerritoryName(bavaria, 1600), "Duchy of Bavaria");
  // 昇格前年までは公領、昇格年ちょうどから選帝侯領
  assertEquals(resolveTerritoryName(bavaria, 1622), "Duchy of Bavaria");
  assertEquals(resolveTerritoryName(bavaria, 1623), "Electorate of Bavaria");
  assertEquals(resolveTerritoryName(bavaria, 1650), "Electorate of Bavaria");
});

Deno.test("selectMajorTerritories: マップ掲載 id のみ残し、properties を最小限に間引く", () => {
  const fc = collection([
    feature({
      id: "Österreich",
      name: "Österreich",
      start: null,
      end: null,
      secular: "archduchy",
      religion: "Roman-catholic",
    }),
    feature({ id: "Aalen", name: "Aalen", start: 1360, end: 1803 }),
  ]);
  const out = selectMajorTerritories(fc, 1500, HRE_TERRITORIES);
  assertEquals(out.features.length, 1);
  assertEquals(out.features[0].properties, {
    NAME: "Archduchy of Austria",
    SUBJECTO: HRE_NAME,
    PARTOF: HRE_NAME,
  });
});

Deno.test("selectMajorTerritories: 同一表示名が重複したら最初の 1 件のみ残す", () => {
  const fc = collection([
    feature({ id: "ernestinischesSachsenbis1547" }),
    feature({ id: "albertinischesSachsennach1635" }), // 同じ "Electorate of Saxony"
  ]);
  const out = selectMajorTerritories(fc, 1500, HRE_TERRITORIES);
  assertEquals(out.features.length, 1);
  assertEquals(out.features[0].properties?.NAME, "Electorate of Saxony");
});

Deno.test("HRE_RANGE_OVERRIDES: データ欠損・断絶の補正を固定する", () => {
  // Bayern: データは 1506（再統合）〜1623（選帝侯昇格）のみ。前後もバイエルンとして継続
  assertEquals(HRE_RANGE_OVERRIDES["Bayern"], { start: 1500, end: 1806 });
  // albertinisches Sachsen (nach 1635): start/end が dbf 上欠損 + 1572〜1635 の行が無い
  assertEquals(HRE_RANGE_OVERRIDES["albertinischesSachsennach1635"], {
    start: 1572,
    end: 1806,
  });
});

Deno.test("buildYearCollection: 各対象年に主要領邦が揃い、表示名は一意になる", () => {
  // 実データの id と start/end を模した最小フィクスチャ
  const fc = collection([
    feature({ id: "Österreich", start: null, end: null }),
    feature({ id: "Österreich", start: null, end: null }), // 宗派期間の重複行
    feature({ id: "Kurbrandenburg", start: 1157, end: 1806 }),
    feature({ id: "Böhmen", start: 1198, end: 1806 }),
    feature({ id: "Bayern", start: 1506, end: 1623 }),
    feature({ id: "ernestinischesSachsenbis1547", start: 1485, end: 1547 }),
    feature({ id: "albertinischesSachsenbis1547", start: 1485, end: 1547 }),
    feature({ id: "albertinischesSachsennach1635", start: null, end: null }),
    feature({ id: "ernestinischesSachsennach1547", start: 1547, end: 1806 }),
    feature({ id: "Aalen", start: 1360, end: 1803 }), // 主要領邦ではない
  ]);
  for (const year of HRE_OVERLAY_YEARS) {
    const out = buildYearCollection(fc, year);
    const names = out.features.map((f) => f.properties?.NAME);
    // 表示名は一意（同一年に選帝侯領ザクセンが 2 つ出たりしない）
    assertEquals(new Set(names).size, names.length);
    for (
      const required of [
        "Archduchy of Austria",
        "Electorate of Brandenburg",
        "Kingdom of Bohemia",
      ]
    ) {
      assert(names.includes(required), `${year}: ${required} が無い`);
    }
    // ザクセン系（選帝侯領・公領）が必ず含まれる
    assert(
      names.includes("Electorate of Saxony") &&
        names.includes("Duchy of Saxony"),
      `${year}: ザクセン系が無い`,
    );
    // 主要領邦以外は含まれない
    assert(!names.includes("Aalen"));
    // SUBJECTO / PARTOF は全て HRE
    for (const f of out.features) {
      assertEquals(f.properties?.SUBJECTO, HRE_NAME);
      assertEquals(f.properties?.PARTOF, HRE_NAME);
    }
  }
  // 1500/1530 はヴェッティン分割前の名分け、1600/1650 は後継 id が採用される
  const y1500 = buildYearCollection(fc, 1500).features.map(
    (f) => f.properties?.NAME,
  );
  assert(!y1500.includes("Landgraviate of Hesse-Kassel"));
  // Bayern override（1500 でも公領バイエルンが出る）
  assert(y1500.includes("Duchy of Bavaria"));
  // バイエルンは 1623 年選帝侯昇格を境に NAME が切り替わる（1600 まで公領・1650 は選帝侯領）
  for (const year of [1530, 1600]) {
    const names = buildYearCollection(fc, year).features.map(
      (f) => f.properties?.NAME,
    );
    assert(names.includes("Duchy of Bavaria"), `${year}: 公領バイエルンが無い`);
    assert(!names.includes("Electorate of Bavaria"));
  }
  const y1650 = buildYearCollection(fc, 1650).features.map(
    (f) => f.properties?.NAME,
  );
  assert(y1650.includes("Electorate of Bavaria")); // override end=1806 + 1623 昇格
  assert(!y1650.includes("Duchy of Bavaria"));
});
