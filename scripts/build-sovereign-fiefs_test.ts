/**
 * scripts/build-sovereign-fiefs.ts のテスト（#189）。
 * 前半は純粋関数のテストでネットワークに依存しない:
 * 取得対象が「リレーション ID の静的な許可リスト × 年 × 存続区間の包含判定 ×
 * base 重複年の除外」だけで決まることを、年ごとの期待 ID 集合を固定して検証する。
 * 後半は生成物 data/sovereign_fiefs_<year>.geojson そのものを検証する。
 */

import { assert, assertEquals, assertThrows } from "@std/assert";
import type { FeatureCollection } from "geojson";
import { SNAPSHOT_YEARS, SOVEREIGN_FIEF_OVERLAY_YEARS } from "../src/config.ts";
import type { OhmRelation } from "./build-france-fiefs.ts";
import { FRANCE_FIEF_NAMES } from "./build-france-fiefs.ts";
import { HRE_FIEF_NAMES } from "./build-hre-fiefs.ts";
import { ITALY_FIEF_NAMES } from "./build-italy-fiefs.ts";
import { BRITAIN_FIEF_ALLOWLIST } from "./build-britain-fiefs.ts";
import {
  buildYearCollection,
  parseTargetYears,
  selectSovereignFiefsForYear,
  SOVEREIGN_FIEF_ALLOWLIST,
  SOVEREIGN_FIEF_BBOX,
  SOVEREIGN_FIEF_EXCLUDED_IDS,
  SOVEREIGN_FIEF_EXCLUSIONS,
  SOVEREIGN_FIEF_SIZE_LIMIT_BYTES,
  SOVEREIGN_FIEF_YEARS,
  sovereignFiefExclusionReason,
  sovereignFiefIdsForYear,
} from "./build-sovereign-fiefs.ts";
import { selfIntersectionPoints } from "./clean-polygons.ts";

/** タグだけのリレーション（Overpass 相当） */
function relation(id: number, tags: Record<string, string>): OhmRelation {
  return { type: "relation", id, tags };
}

/** 1 パートの正方形ジオメトリを持つリレーション */
function withSquare(id: number, west: number, south: number): OhmRelation {
  const ring = [
    [west, south],
    [west + 1, south],
    [west + 1, south + 1],
    [west, south + 1],
    [west, south],
  ];
  return {
    type: "relation",
    id,
    tags: {},
    members: [{
      type: "way",
      ref: id * 10,
      role: "outer",
      geometry: ring.map(([lon, lat]) => ({ lon, lat })),
    }],
  };
}

/** 許可リストのエントリから tags だけのリレーションを合成する（テスト入力用） */
function relationFromAllowlist(id: number): OhmRelation {
  const entry = SOVEREIGN_FIEF_ALLOWLIST[id];
  return relation(id, {
    "name:en": entry.ohmName,
    admin_level: String(entry.adminLevel),
    start_date: entry.startDate,
    end_date: entry.endDate,
  });
}

// ---------------------------------------------------------------------------
// 設定値
// ---------------------------------------------------------------------------

Deno.test("取得範囲は実測に使った全欧 bbox をピン留めする", () => {
  assertEquals(SOVEREIGN_FIEF_BBOX, [34, -25, 72, 60]);
});

Deno.test("対象年は SNAPSHOT_YEARS の部分集合で 1200〜1900 の 14 年", () => {
  assertEquals([...SOVEREIGN_FIEF_YEARS], [
    1200,
    1400,
    1492,
    1500,
    1530,
    1600,
    1650,
    1700,
    1715,
    1783,
    1800,
    1815,
    1880,
    1900,
  ]);
  for (const year of SOVEREIGN_FIEF_YEARS) {
    assert(SNAPSHOT_YEARS.includes(year), `${year} が SNAPSHOT_YEARS に無い`);
  }
});

Deno.test("表示側 config の年集合と一致する（src → scripts 非依存の重複定義の同値性）", () => {
  assertEquals([...SOVEREIGN_FIEF_OVERLAY_YEARS], [...SOVEREIGN_FIEF_YEARS]);
});

Deno.test("サイズ上限は既存パイプラインと同じ 200 KB", () => {
  assertEquals(SOVEREIGN_FIEF_SIZE_LIMIT_BYTES, 200 * 1000);
});

// ---------------------------------------------------------------------------
// 静的許可リスト
// ---------------------------------------------------------------------------

Deno.test("許可リストは実測した 16 リレーションをピン留めする", () => {
  const ids = Object.keys(SOVEREIGN_FIEF_ALLOWLIST).map(Number).sort((a, b) =>
    a - b
  );
  assertEquals(ids, [
    2692586, // Cretan State
    2694163, // Principality of Moldavia
    2696816, // Grand Duchy of Finland
    2747433, // Transylvania (1711-1732)
    2827696, // United States of the Ionian Islands
    2829140, // Kingdom of Hungary (1779-1848)
    2830352, // Republic of Ragusa
    2835765, // Eyalet of Crete
    2836150, // Grand Principality of Serbia
    2849499, // Crimean Khanate (1475-1774)
    2854743, // Eastern Rumelia
    2857706, // Prince-Bishopric of Montenegro
    2878295, // Transylvania (1765-1851)
    2890623, // Grand Principality of Moscow (1392-1478)
    2929115, // Wallachia (1420-1538)
    2929116, // Wallachia (1538-1829)
  ]);
});

Deno.test("許可リストの全件がいずれかの対象年で有効（死んだエントリが無い）", () => {
  const active = new Set<number>();
  for (const year of SOVEREIGN_FIEF_YEARS) {
    for (const id of sovereignFiefIdsForYear(year)) active.add(id);
  }
  const dead = Object.keys(SOVEREIGN_FIEF_ALLOWLIST).map(Number).filter((id) =>
    !active.has(id)
  );
  assertEquals(dead, []);
});

Deno.test("許可リストは除外対象と交差しない", () => {
  for (const id of Object.keys(SOVEREIGN_FIEF_EXCLUDED_IDS).map(Number)) {
    assert(
      SOVEREIGN_FIEF_ALLOWLIST[id] === undefined,
      `${id} が許可リストと除外リストの両方にある`,
    );
  }
});

Deno.test("除外の分類キーはすべて根拠文を持ち、未使用の分類が無い", () => {
  const used = new Set(Object.values(SOVEREIGN_FIEF_EXCLUDED_IDS));
  // ID に紐づかない分類（区間内の base 重複年の除外・OHM 側の欠落）は
  // 許可リスト側の設計判断の記録として存在する
  used.add("baseCoveredYearsExcluded");
  used.add("upstreamGapsRecorded");
  for (const key of used) {
    assert(
      typeof SOVEREIGN_FIEF_EXCLUSIONS[key] === "string" &&
        SOVEREIGN_FIEF_EXCLUSIONS[key].length > 0,
      `${key} の根拠が無い`,
    );
  }
  for (const key of Object.keys(SOVEREIGN_FIEF_EXCLUSIONS)) {
    assert(used.has(key), `分類 ${key} がどの除外にも使われていない`);
  }
});

Deno.test("許可リストの excludedYears は存続区間内のスナップショット年に限る", () => {
  for (const [id, entry] of Object.entries(SOVEREIGN_FIEF_ALLOWLIST)) {
    for (const year of entry.excludedYears ?? []) {
      assert(
        SNAPSHOT_YEARS.includes(year),
        `${id} の excludedYears ${year} が SNAPSHOT_YEARS に無い`,
      );
    }
  }
});

Deno.test("許可リストの名前は仏・独・伊・ブリテンの許可リストと重複しない（二重塗り防止）", () => {
  const others = new Set([
    ...FRANCE_FIEF_NAMES,
    ...HRE_FIEF_NAMES,
    ...ITALY_FIEF_NAMES,
    ...Object.values(BRITAIN_FIEF_ALLOWLIST).map((entry) => entry.name),
  ]);
  for (const entry of Object.values(SOVEREIGN_FIEF_ALLOWLIST)) {
    assert(
      !others.has(entry.name),
      `${entry.name} が他系統の許可リストと重複している`,
    );
  }
});

// ---------------------------------------------------------------------------
// 年ごとの包含判定（静的許可リスト × 存続区間 × base 重複年の除外だけで決まる）
// ---------------------------------------------------------------------------

Deno.test("sovereignFiefIdsForYear: 年ごとの対象 ID 集合が実測どおりに固定される", () => {
  const expected: Record<number, number[]> = {
    1200: [2836150],
    1400: [2890623],
    1492: [2929115],
    1500: [2929115],
    1530: [2929115],
    1600: [2929116],
    1650: [2849499, 2929116],
    1700: [2830352, 2849499, 2929116],
    1715: [2747433, 2830352, 2849499, 2929116],
    1783: [2829140, 2830352, 2878295, 2929116],
    1800: [2829140, 2830352, 2857706, 2878295, 2929116],
    1815: [2694163, 2696816, 2827696, 2829140, 2857706, 2878295, 2929116],
    1880: [2696816, 2835765, 2854743],
    1900: [2692586, 2696816],
  };
  for (const year of SOVEREIGN_FIEF_YEARS) {
    assertEquals(sovereignFiefIdsForYear(year), expected[year], String(year));
  }
});

Deno.test("sovereignFiefIdsForYear: 全対象年に収録対象がある", () => {
  for (const year of SOVEREIGN_FIEF_YEARS) {
    assert(sovereignFiefIdsForYear(year).length > 0, `${year} が空`);
  }
});

Deno.test("1530/1600/1650 年のハンガリー王国は面が組めず収録できない（AC1 の実測結果）", () => {
  // OHM の 1401〜1751 年の Kingdom of Hungary（2829404 / 2750054 / 2829139 /
  // 2829520）は label ノードのみで境界 way を持たない（2026-07 実測）。
  // 許可リストに紛れても geometryUnbuildable で落ちることを固定する。
  for (const id of [2829404, 2750054, 2829139, 2829520]) {
    assert(
      sovereignFiefExclusionReason(id) !== null,
      `${id} が除外されていない`,
    );
  }
  for (const year of [1530, 1600, 1650, 1700, 1715]) {
    assert(
      !sovereignFiefIdsForYear(year).includes(2750054) &&
        !sovereignFiefIdsForYear(year).includes(2829139),
      `面が組めないハンガリー王国が ${year} 年に混入`,
    );
  }
});

Deno.test("1783/1800/1815 年にハンガリー王国（ハプスブルク AL3）が含まれる", () => {
  for (const year of [1783, 1800, 1815]) {
    assert(
      sovereignFiefIdsForYear(year).includes(2829140),
      `Kingdom of Hungary が ${year} 年に無い`,
    );
  }
});

Deno.test("1715〜1815 年にトランシルヴァニアが含まれる", () => {
  assert(sovereignFiefIdsForYear(1715).includes(2747433));
  for (const year of [1783, 1800, 1815]) {
    assert(
      sovereignFiefIdsForYear(year).includes(2878295),
      `Transylvania が ${year} 年に無い`,
    );
  }
});

Deno.test("1650〜1715 年にクリミア・ハン国が含まれる（AC2）", () => {
  for (const year of [1650, 1700, 1715]) {
    assert(
      sovereignFiefIdsForYear(year).includes(2849499),
      `Crimean Khanate が ${year} 年に無い`,
    );
  }
});

Deno.test("1400 年にモスクワ大公国が含まれる（AC3）", () => {
  assert(sovereignFiefIdsForYear(1400).includes(2890623));
});

Deno.test("1815/1880/1900 年にフィンランド大公国が含まれる（AC4）", () => {
  for (const year of [1815, 1880, 1900]) {
    assert(
      sovereignFiefIdsForYear(year).includes(2696816),
      `Grand Duchy of Finland が ${year} 年に無い`,
    );
  }
});

Deno.test("1880 年のクレタはオスマン領クレタ、1900 年はクレタ国（AC5）", () => {
  assert(sovereignFiefIdsForYear(1880).includes(2835765));
  assert(!sovereignFiefIdsForYear(1880).includes(2692586));
  assert(sovereignFiefIdsForYear(1900).includes(2692586));
  assert(!sovereignFiefIdsForYear(1900).includes(2835765));
});

Deno.test("base が同じ政体を収録する年は存続区間内でも除外される（excludedYears）", () => {
  // クリミア・ハン国（1475..1774）: base は 1492〜1600 年に Crimean Khanate を
  // 個別収録しており、その間は重複になるため除外。1650 年から収録。
  for (const year of [1492, 1500, 1530, 1600]) {
    assert(
      !sovereignFiefIdsForYear(year).includes(2849499),
      `Crimean Khanate が ${year} 年に混入`,
    );
  }
  // セルビア大公国（1000..1216）: base は 1000 / 1100 年に Serbia を収録。
  // 1200 年だけ Bulgar Khanate へ誤帰属するため 1200 年のみ収録。
  for (const year of [1000, 1100]) {
    assert(
      !sovereignFiefIdsForYear(year).includes(2836150),
      `Grand Principality of Serbia が ${year} 年に混入`,
    );
  }
  // オスマン領クレタ（1667..1898）: base は 1700〜1815 年にクレタ島を
  // Ottoman Empire として正しく塗るため、誤帰属（Bulgaria）の 1880 年のみ収録。
  for (const year of [1700, 1715, 1783, 1800, 1815]) {
    assert(
      !sovereignFiefIdsForYear(year).includes(2835765),
      `Eyalet of Crete が ${year} 年に混入`,
    );
  }
  // フィンランド大公国（1809..1917）: base は 1914 年に Finland を収録。
  assert(!sovereignFiefIdsForYear(1914).includes(2696816));
});

Deno.test("存続区間は年単位の閉区間（開始年・終了年の両端を含む）", () => {
  // Wallachia (1538..1829-09-14) は 1829 に含まれ 1830 には含まれない
  assert(sovereignFiefIdsForYear(1829).includes(2929116));
  assert(!sovereignFiefIdsForYear(1830).includes(2929116));
  // United States of the Ionian Islands は 1815-11-20 開始でも 1815 年に含む
  assert(sovereignFiefIdsForYear(1815).includes(2827696));
  // Republic of Ragusa (1699-01-25..1808-01-30) は 1815 年に含まれない
  assert(!sovereignFiefIdsForYear(1815).includes(2830352));
});

// ---------------------------------------------------------------------------
// リレーションの選択（純粋関数・ネットワーク非依存）
// ---------------------------------------------------------------------------

Deno.test("selectSovereignFiefsForYear: 許可リスト外・期間外の ID を落とす", () => {
  const elements = [
    relationFromAllowlist(2929116), // Wallachia 1538..1829
    relationFromAllowlist(2694163), // Principality of Moldavia 1812..1856（1600 年は期間外）
    // 許可リスト外（base が担う中世ハンガリー王国）
    relation(2836151, {
      "name:en": "Kingdom of Hungary",
      admin_level: "2",
      start_date: "1102",
      end_date: "1400",
    }),
  ];
  assertEquals(
    selectSovereignFiefsForYear(elements, 1600).map((e) => e.id),
    [2929116],
  );
});

Deno.test("selectSovereignFiefsForYear: 判定は静的な存続区間で決まりタグに依存しない", () => {
  const bareTags = relation(2929116, { "name:en": "Wallachia" });
  assertEquals(
    selectSovereignFiefsForYear([bareTags], 1600).map((e) => e.id),
    [2929116],
  );
  const driftedTags = relation(2929116, {
    "name:en": "Wallachia",
    start_date: "1850",
    end_date: "1860",
  });
  assertEquals(
    selectSovereignFiefsForYear([driftedTags], 1600).map((e) => e.id),
    [2929116],
  );
});

Deno.test("selectSovereignFiefsForYear: 並びは表示名の昇順で入力順に依存しない", () => {
  const elements = [
    relationFromAllowlist(2929116), // Principality of Wallachia
    relationFromAllowlist(2857706), // Montenegro
    relationFromAllowlist(2696816), // Grand Duchy of Finland
  ];
  const ids = (list: OhmRelation[]) =>
    selectSovereignFiefsForYear(list, 1815).map((e) => e.id);
  assertEquals(ids(elements), [2696816, 2857706, 2929116]);
  assertEquals(ids([...elements].reverse()), [2696816, 2857706, 2929116]);
});

Deno.test("sovereignFiefExclusionReason: 除外 ID は許可リストに紛れても落ちる", () => {
  // base が収録する中世ハンガリー王国のリレーション連鎖
  assert(sovereignFiefExclusionReason(2836151) !== null);
  assert(sovereignFiefExclusionReason(2829404) !== null);
  // ロシア併合年（1783）のクリミア・ハン国
  assert(sovereignFiefExclusionReason(2849498) !== null);
  // base が 1880/1900 年に収録するセルビア
  assert(sovereignFiefExclusionReason(2692353) !== null);
  assert(sovereignFiefExclusionReason(2692716) !== null);
  // 収録対象
  assertEquals(sovereignFiefExclusionReason(2829140), null);
  assertEquals(sovereignFiefExclusionReason(2696816), null);
});

// ---------------------------------------------------------------------------
// FeatureCollection の組み立て（純粋関数）
// ---------------------------------------------------------------------------

Deno.test("buildYearCollection: properties は既存オーバーレイと同じ形", () => {
  const tagged = [relationFromAllowlist(2929116)];
  const geometries = new Map([[2929116, withSquare(2929116, 25.0, 44.5)]]);
  const { fc } = buildYearCollection(tagged, geometries, 1600);
  assertEquals(fc.features.length, 1);
  assertEquals(fc.features[0].properties, {
    NAME: "Principality of Wallachia",
    ADMIN_LEVEL: 4,
    OHM_RELATION_ID: 2929116,
    START_DATE: "1538",
    END_DATE: "1829-09-14",
  });
});

Deno.test("buildYearCollection: メタデータに出典・欠損を記録する", () => {
  const tagged = [
    relationFromAllowlist(2849499),
    relationFromAllowlist(2929116), // ジオメトリ未取得
  ];
  const geometries = new Map([[2849499, withSquare(2849499, 34.0, 45.0)]]);
  const { metadata } = buildYearCollection(tagged, geometries, 1650);
  assertEquals(metadata.source, "OpenHistoricalMap");
  assertEquals(metadata.license, "CC0-1.0");
  assertEquals(metadata.year, 1650);
  assertEquals(metadata.featureCount, 1);
  assertEquals(metadata.relationsWithoutGeometry, [2929116]);
});

Deno.test("buildYearCollection: 表示名を OHM 名から変えたエントリは drift 扱いにしない", () => {
  // Grand Duchy of Moscow の OHM 名は "Grand Principality of Moscow
  // (1392-1478)"。表示名（base の呼称に合わせた NAME）との差は意図した設計で
  // あり、drift は実測した ohmName と現在のタグの差だけを見る。
  const tagged = [relationFromAllowlist(2890623)];
  const geometries = new Map([[2890623, withSquare(2890623, 37.0, 55.0)]]);
  const { fc, metadata } = buildYearCollection(tagged, geometries, 1400);
  assertEquals(fc.features[0].properties?.NAME, "Grand Duchy of Moscow");
  assertEquals(metadata.tagDrift, {});
});

Deno.test("buildYearCollection: OHM 側の存続区間が実測から動いたら記録する", () => {
  const drifted = relation(2929116, {
    "name:en": "Wallachia",
    admin_level: "4",
    start_date: "1538",
    end_date: "1900", // 実測は 1829-09-14
  });
  const geometries = new Map([[2929116, withSquare(2929116, 25.0, 44.5)]]);
  const { metadata } = buildYearCollection([drifted], geometries, 1600);
  assert(
    Object.keys(metadata.tagDrift).includes("2929116"),
    JSON.stringify(metadata.tagDrift),
  );
});

// ---------------------------------------------------------------------------
// CLI 引数（#188 と同じ年指定方式。既存年の生成物バイト不変の構造的保証）
// ---------------------------------------------------------------------------

Deno.test("parseTargetYears: 引数なしは全対象年", () => {
  assertEquals(parseTargetYears([]), [...SOVEREIGN_FIEF_YEARS]);
});

Deno.test("parseTargetYears: 年を並べるとその年だけ（昇順・重複除去）", () => {
  assertEquals(parseTargetYears(["1880", "1815", "1880"]), [1815, 1880]);
});

Deno.test("parseTargetYears: 対象外の年はエラー", () => {
  assertThrows(() => parseTargetYears(["1914"]));
  assertThrows(() => parseTargetYears(["1100"]));
});

// ---------------------------------------------------------------------------
// 生成物（data/sovereign_fiefs_<year>.geojson）
// ---------------------------------------------------------------------------

async function readSovereignFiefs(year: number): Promise<
  FeatureCollection & { metadata?: Record<string, unknown> }
> {
  return JSON.parse(
    await Deno.readTextFile(`data/sovereign_fiefs_${year}.geojson`),
  );
}

Deno.test("生成物: 対象年ごとにファイルがあり期待 ID 集合と一致する", async () => {
  for (const year of SOVEREIGN_FIEF_YEARS) {
    const fc = await readSovereignFiefs(year);
    assertEquals(fc.type, "FeatureCollection");
    const ids = fc.features.map((f) => Number(f.properties?.OHM_RELATION_ID))
      .sort((a, b) => a - b);
    assertEquals(ids, sovereignFiefIdsForYear(year), String(year));
    for (const feature of fc.features) {
      assert(typeof feature.properties?.NAME === "string");
      assert(
        feature.geometry.type === "Polygon" ||
          feature.geometry.type === "MultiPolygon",
        `${year} の ${feature.properties?.NAME} がポリゴンでない`,
      );
    }
  }
});

Deno.test("生成物: サイズ上限内・自己交差なし・出典メタデータを持つ", async () => {
  for (const year of SOVEREIGN_FIEF_YEARS) {
    const text = await Deno.readTextFile(
      `data/sovereign_fiefs_${year}.geojson`,
    );
    assert(
      new TextEncoder().encode(text).length <= SOVEREIGN_FIEF_SIZE_LIMIT_BYTES,
      `${year} がサイズ上限超過`,
    );
    const fc = JSON.parse(text) as FeatureCollection & {
      metadata?: { source?: string; license?: string };
    };
    assertEquals(fc.metadata?.source, "OpenHistoricalMap");
    assertEquals(fc.metadata?.license, "CC0-1.0");
    for (const feature of fc.features) {
      if (
        feature.geometry.type !== "Polygon" &&
        feature.geometry.type !== "MultiPolygon"
      ) continue;
      assertEquals(
        selfIntersectionPoints(feature.geometry).length,
        0,
        `${year} の ${feature.properties?.NAME} に自己交差`,
      );
    }
  }
});

Deno.test("生成物（flat）: 対象年ごとにファイルがあり重なりが解消されている", async () => {
  for (const year of SOVEREIGN_FIEF_YEARS) {
    const fc = JSON.parse(
      await Deno.readTextFile(`data/sovereign_fiefs_flat_${year}.geojson`),
    ) as FeatureCollection;
    assertEquals(
      fc.features.length,
      sovereignFiefIdsForYear(year).length,
      String(year),
    );
  }
});
