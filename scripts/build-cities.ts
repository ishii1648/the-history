/**
 * 主要都市データパイプラインスクリプト（TASK-27）。
 * - Historical Urban Population データセット（Chandler 系列）の chandler.csv を
 *   GitHub ミラーから取得（コミット固定）
 * - ヨーロッパ bbox（EUROPE_BBOX）内の都市に絞る
 * - スナップショット年ごとに「過去 50 年〜未来 25 年の最近傍の人口記録」を対応付け、
 *   人口上位 CITIES_PER_YEAR 件を採用する
 * - data/cities.json（年 → 都市マーカー配列）を生成する
 *
 * データソース選定の経緯:
 * - 第一候補の Reba, Reitsma & Seto (2016) "Spatializing 6,000 years of global
 *   urbanization from 3700 BC to AD 2000"（Sci. Data 3:160034, DOI
 *   10.7927/H4ZG6QBX, CC BY 4.0）を採用した。原本ホストの NASA SEDAC は
 *   Earthdata ログイン必須で匿名の安定 URL が得られないため、同データの入力
 *   CSV（Chandler のデジタル化）を含む GitHub ミラー
 *   fasiha/Historical-Urban-Population-Growth-Data をコミット固定で参照する。
 * - 検証結果: 欧州 bbox 内で人口記録を持つ都市は 680 件。各スナップショット年の
 *   対応付け窓内の候補は 900 年で 24 件、1500 年で 183 件、1914 年で 500 件超と、
 *   全 20 年代で 15〜25 件の要件を満たすカバレッジがある。
 *
 * 対応付け・整形ルール:
 * - 記録年は飛び飛びのため、各スナップショット年に対し過去 PAST_WINDOW_YEARS 年・
 *   未来 FUTURE_WINDOW_YEARS 年の窓内で年差最小の記録を採用する（同差なら過去优
 *   先）。未来側を狭くするのは、産業革命以降の急成長期に未来の記録を割り当てる
 *   と人口を大きく過大評価するため（例: Samara の 1950 年記録を 1900 年に採用
 *   すると 7 倍以上の過大評価になる）。
 * - 既知のデータ異常は EXCLUDED_CITY_NAMES / EXCLUDED_RECORDS で除外する
 *   （根拠は各定数の doc コメント参照）。
 * - 都市名は英語の慣用名へ CITY_RENAMES で正規化する（Istanbul→Constantinople 等）。
 *   日本語表記は data/name-ja.json 側で付与する。
 *
 * ロジックは純粋関数として export しテスト対象にする（scripts/build-cities_test.ts）。
 */

import type { BBox } from "geojson";
import { parse } from "@std/csv/parse";
import { SNAPSHOT_YEARS } from "../src/config.ts";
import { EUROPE_BBOX } from "./build-data.ts";

/** 取得元リポジトリ（Reba et al. 2016 の入力 CSV を含むミラー） */
export const CITIES_SOURCE_REPO =
  "fasiha/Historical-Urban-Population-Growth-Data";
/** 取得元のピン留めコミット。元データ更新で選定結果が勝手に変わらないよう固定する */
export const CITIES_SOURCE_COMMIT = "808ff2b4a279013f58621a3696cb9c28058c6af1";
/** 取得元ファイル。Chandler "Four Thousand Years of Urban Growth" のデジタル化 */
export const CITIES_SOURCE_FILE = "chandler.csv";
/** 元データセットのライセンス（NASA SEDAC 配布時のライセンス） */
export const CITIES_SOURCE_LICENSE =
  "CC BY 4.0 (Historical Urban Population, v1; Reba, Reitsma & Seto 2016)";

/** 対応付け窓: スナップショット年から過去方向に許容する年数 */
export const PAST_WINDOW_YEARS = 50;
/**
 * 対応付け窓: 未来方向に許容する年数。過去より狭いのは、急成長期（19 世紀以降）
 * に未来の記録を使うと人口を大きく過大評価するため。
 */
export const FUTURE_WINDOW_YEARS = 25;

/** 各年で採用する都市数（人口上位から） */
export const CITIES_PER_YEAR = 20;

/**
 * HRE（神聖ローマ帝国）域内を近似する bbox（[west, south, east, north]）。
 * 独語圏を中心とした簡易領域で、正確な帝国境界（data/hre_*.geojson）とは
 * 別物。都市表示の地域偏り是正（TASK-55）のための選定用しきい値であり、
 * Cologne/Nuremberg/Prague/Vienna/Hamburg を含み、Paris/Venice/Milan/Rome
 * は含まない。
 */
export const HRE_REGION_BBOX: BBox = [5.5, 45.5, 17, 55];

/**
 * HRE 域内（HRE_REGION_BBOX）で最低限採用する都市数（TASK-55）。
 * 人口上位 CITIES_PER_YEAR 件のみの選定では地中海・ビザンツ/オスマン圏が
 * 優位で、900〜1700 年の HRE 域内採用数は 0〜1 件だった（調査値。域内候補
 * プールは 1200 年以降で常に 19 件以上ある）。総数 CITIES_PER_YEAR は変えず、
 * 域内候補を人口順に 6 件まで確保し、その分だけ域外の人口最下位を明け渡す。
 * 6 は「総数の 3 割・候補プールが下限を安定して満たせる値」として採用した。
 * 域内候補が 6 件未満の年（900 年: 2 件、1100 年: 4 件）は無理に埋めず
 * 候補全件を採用する。
 */
export const HRE_REGION_MIN_CITIES = 6;

/** 検証: 各年の都市数の下限（A/B 契約の「15〜25 都市程度」） */
export const MIN_CITIES_PER_YEAR = 15;
/** 検証: 各年の都市数の上限 */
export const MAX_CITIES_PER_YEAR = 25;

/** 出力先パス */
export const CITIES_OUTPUT_PATH = "data/cities.json";

/**
 * 都市単位で除外する既知のデータ異常。
 * - Gelibolu: 全記録が Istanbul と同値の重複行（1000 年に 300,000 は明らかな誤り）
 * - Qum: Qom と同一都市の別表記重複（Qom 行を採用）
 * - Ruhr: 都市ではなく工業地帯の集計値（単一マーカーとして表示できない）
 */
export const EXCLUDED_CITY_NAMES: ReadonlySet<string> = new Set([
  "Gelibolu",
  "Qum",
  "Ruhr",
]);

/**
 * 記録単位で除外する既知のデータ異常（都市自体は他の年で有効）。
 * - Algiers 1925: 2,220,000 は桁誤り（同時期の実人口は約 220,000）
 * - Iznik 1800: 125,000 は誤記録（19 世紀のイズニクは数千人規模の小邑）
 */
export const EXCLUDED_RECORDS: ReadonlyArray<{ name: string; year: number }> = [
  { name: "Algiers", year: 1925 },
  { name: "Iznik", year: 1800 },
];

/**
 * 英語の慣用名への正規化マップ。
 * - Istanbul→Constantinople: 公式改名は 1930 年で、本アプリの全スナップショット年
 *   （900〜1914）では英語圏の慣用名は Constantinople
 * - その他は元データの現地語綴りを英語の慣用綴りへ（Genova→Genoa 等）
 * - Augsberg は元データの誤綴り（正: Augsburg）、Nurnberg は英語慣用綴りの
 *   Nuremberg へ（TASK-55 で HRE 域内都市が採用されるようになったため追加）
 */
export const CITY_RENAMES: Readonly<Record<string, string>> = {
  Istanbul: "Constantinople",
  Genova: "Genoa",
  Brussel: "Brussels",
  Gent: "Ghent",
  Brugge: "Bruges",
  Augsberg: "Augsburg",
  Nurnberg: "Nuremberg",
};

/** chandler.csv の 1 行（人口記録を 1 つ以上持つ都市） */
export interface CityRow {
  name: string;
  lon: number;
  lat: number;
  /** 年（BC は負値）→ 人口 */
  records: Record<number, number>;
}

/** 出力 JSON の都市マーカー（A/B 契約の形式） */
export interface CityMarker {
  name: string;
  lon: number;
  lat: number;
  population: number | null;
}

/** 出力 JSON 全体（A/B 契約の形式） */
export interface CitiesData {
  years: Record<string, CityMarker[]>;
  source: {
    description: string;
    license: string;
    [key: string]: unknown;
  };
}

/** ピン留めコミットの raw CSV URL を生成する（純粋関数） */
export function buildCitiesSourceUrl(): string {
  return `https://raw.githubusercontent.com/${CITIES_SOURCE_REPO}/${CITIES_SOURCE_COMMIT}/${CITIES_SOURCE_FILE}`;
}

/**
 * chandler.csv をパースして CityRow の配列にする（純粋関数）。
 * - ヘッダの AD_YYYY / BC_YYYY 列を年（BC は負値）として読む
 * - 座標が数値でない行・人口記録が 1 つもない行は除外する
 * - 人口は整数へ丸める（元データに少数の小数値がある）
 */
export function parseChandlerCsv(text: string): CityRow[] {
  const table = parse(text);
  if (table.length === 0) return [];
  const header = table[0];
  const yearCols: Array<{ index: number; year: number }> = [];
  for (let i = 0; i < header.length; i++) {
    const h = header[i];
    if (h.startsWith("AD_")) {
      yearCols.push({ index: i, year: Number(h.slice(3)) });
    } else if (h.startsWith("BC_")) {
      yearCols.push({ index: i, year: -Number(h.slice(3)) });
    }
  }
  const rows: CityRow[] = [];
  for (const record of table.slice(1)) {
    const name = record[0];
    const lat = Number.parseFloat(record[3]);
    const lon = Number.parseFloat(record[4]);
    if (name === "" || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      continue;
    }
    const records: Record<number, number> = {};
    for (const { index, year } of yearCols) {
      const value = index < record.length ? record[index].trim() : "";
      if (value === "") continue;
      const population = Number.parseFloat(value);
      if (Number.isFinite(population) && population > 0) {
        records[year] = Math.round(population);
      }
    }
    if (Object.keys(records).length === 0) continue;
    rows.push({ name, lon, lat, records });
  }
  return rows;
}

/** bbox（[west, south, east, north]）内の都市のみ残す（純粋関数） */
export function filterCitiesToBbox(rows: CityRow[], bbox: BBox): CityRow[] {
  const [west, south, east, north] = bbox;
  return rows.filter(
    (row) =>
      row.lon >= west && row.lon <= east && row.lat >= south &&
      row.lat <= north,
  );
}

/**
 * スナップショット年に対応する最近傍の人口記録を選ぶ（純粋関数）。
 * 過去 pastWindow 年・未来 futureWindow 年の窓内で年差最小の記録を返す。
 * 年差が同じ場合は過去の記録を優先する（未来の記録は過大評価しやすいため）。
 * 窓内に記録がなければ null。
 */
export function pickNearestRecord(
  records: Record<number, number>,
  targetYear: number,
  pastWindow: number = PAST_WINDOW_YEARS,
  futureWindow: number = FUTURE_WINDOW_YEARS,
): { year: number; population: number } | null {
  let best: { year: number; population: number } | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestIsFuture = true;
  for (const key of Object.keys(records)) {
    const year = Number(key);
    const delta = year - targetYear;
    if (delta < -pastWindow || delta > futureWindow) continue;
    const distance = Math.abs(delta);
    const isFuture = delta > 0;
    if (
      distance < bestDistance ||
      (distance === bestDistance && bestIsFuture && !isFuture)
    ) {
      best = { year, population: records[year] };
      bestDistance = distance;
      bestIsFuture = isFuture;
    }
  }
  return best;
}

/** 座標が bbox（[west, south, east, north]）内かどうか（純粋関数） */
function isInBbox(lon: number, lat: number, bbox: BBox): boolean {
  const [west, south, east, north] = bbox;
  return lon >= west && lon <= east && lat >= south && lat <= north;
}

/** 人口降順・同数なら name 昇順の比較関数（選定順序の唯一の定義） */
function byPopulationDescThenName(a: CityMarker, b: CityMarker): number {
  return (b.population ?? 0) - (a.population ?? 0) ||
    (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/**
 * 1 つのスナップショット年の都市マーカーを選定する（純粋関数）。
 * 1. 既知異常（EXCLUDED_CITY_NAMES / EXCLUDED_RECORDS）を除外
 * 2. 最近傍記録の対応付け（窓外の都市は落とす）
 * 3. CITY_RENAMES で英語慣用名へ正規化
 * 4. 同名都市は人口最大の 1 件へ統合（Brest 仏/白露のような同名別都市の重複防止）
 * 5. 人口降順（同数なら name 昇順）で CITIES_PER_YEAR 件に切り詰め
 * 6. HRE 域内（HRE_REGION_BBOX）の採用数が HRE_REGION_MIN_CITIES に満たない
 *    場合、域内候補を人口順に補い、その分だけ域外の人口最下位の枠を明け渡す
 *    （総数は CITIES_PER_YEAR のまま。TASK-55: 地域偏り是正）
 */
export function selectCitiesForYear(
  rows: CityRow[],
  year: number,
): CityMarker[] {
  const byName = new Map<string, CityMarker>();
  for (const row of rows) {
    if (EXCLUDED_CITY_NAMES.has(row.name)) continue;
    const records = { ...row.records };
    for (const excluded of EXCLUDED_RECORDS) {
      if (excluded.name === row.name) delete records[excluded.year];
    }
    const picked = pickNearestRecord(records, year);
    if (picked === null) continue;
    const name = CITY_RENAMES[row.name] ?? row.name;
    const existing = byName.get(name);
    if (
      existing === undefined ||
      (existing.population ?? 0) < picked.population
    ) {
      byName.set(name, {
        name,
        lon: row.lon,
        lat: row.lat,
        population: picked.population,
      });
    }
  }
  const sorted = [...byName.values()].sort(byPopulationDescThenName);
  const selected = sorted.slice(0, CITIES_PER_YEAR);

  // HRE 域内の下限確保（TASK-55）: 域内候補の人口上位 HRE_REGION_MIN_CITIES 件
  // を「保護対象」とし、選外の保護対象がある限り、域外（非保護）の人口最下位と
  // 入れ替える。候補が下限未満の年は候補全件が保護対象になるだけで埋め合わせは
  // しない。
  const protectedCities = sorted
    .filter((m) => isInBbox(m.lon, m.lat, HRE_REGION_BBOX))
    .slice(0, HRE_REGION_MIN_CITIES);
  const protectedNames = new Set(protectedCities.map((m) => m.name));
  const selectedNames = new Set(selected.map((m) => m.name));
  const toAdd = protectedCities.filter((m) => !selectedNames.has(m.name));
  for (const candidate of toAdd) {
    // 末尾（人口最下位）から保護対象でないものを探して明け渡す
    for (let i = selected.length - 1; i >= 0; i--) {
      if (!protectedNames.has(selected[i].name)) {
        selected.splice(i, 1);
        selected.push(candidate);
        break;
      }
    }
  }
  return selected.sort(byPopulationDescThenName);
}

/** 全スナップショット年の出力データを組み立てる（純粋関数） */
export function buildCitiesData(
  rows: CityRow[],
  years: readonly number[],
): CitiesData {
  const byYear: Record<string, CityMarker[]> = {};
  for (const year of years) {
    byYear[String(year)] = selectCitiesForYear(rows, year);
  }
  return {
    years: byYear,
    source: {
      description: "Major European cities per snapshot year (top " +
        `${CITIES_PER_YEAR} by population, nearest record within ` +
        `-${PAST_WINDOW_YEARS}/+${FUTURE_WINDOW_YEARS} years, with at least ` +
        `${HRE_REGION_MIN_CITIES} cities from the Holy Roman Empire region ` +
        "when available), derived from " +
        "the Historical Urban Population dataset (Chandler, digitized by " +
        "Reba, Reitsma & Seto 2016, DOI 10.7927/H4ZG6QBX)",
      license: CITIES_SOURCE_LICENSE,
      repo: CITIES_SOURCE_REPO,
      commit: CITIES_SOURCE_COMMIT,
      file: CITIES_SOURCE_FILE,
      url: buildCitiesSourceUrl(),
    },
  };
}

/**
 * 出力データが A/B 契約を満たすか検証する（純粋関数）。
 * 違反メッセージの配列を返す（空配列なら合格）。
 * - 年キーが years と過不足なく一致
 * - 各年の都市数が MIN_CITIES_PER_YEAR〜MAX_CITIES_PER_YEAR 件
 * - 全マーカーが bbox 内・name 非空・年内で name 重複なし
 * - population は null か正の有限数
 */
export function validateCitiesData(
  data: CitiesData,
  years: readonly number[],
  bbox: BBox,
): string[] {
  const errors: string[] = [];
  const expectedKeys = years.map((year) => String(year));
  const actualKeys = Object.keys(data.years);
  for (const key of expectedKeys) {
    if (!actualKeys.includes(key)) errors.push(`年キー ${key} が存在しない`);
  }
  for (const key of actualKeys) {
    if (!expectedKeys.includes(key)) {
      errors.push(`SNAPSHOT_YEARS にない年キー ${key} がある`);
    }
  }
  const [west, south, east, north] = bbox;
  for (const [year, markers] of Object.entries(data.years)) {
    if (
      markers.length < MIN_CITIES_PER_YEAR ||
      markers.length > MAX_CITIES_PER_YEAR
    ) {
      errors.push(
        `${year} 年の都市数 ${markers.length} が ${MIN_CITIES_PER_YEAR}〜${MAX_CITIES_PER_YEAR} 件の範囲外`,
      );
    }
    const seen = new Set<string>();
    for (const marker of markers) {
      if (marker.name === "") errors.push(`${year} 年に空の name がある`);
      if (seen.has(marker.name)) {
        errors.push(`${year} 年に name 重複: ${marker.name}`);
      }
      seen.add(marker.name);
      if (
        !Number.isFinite(marker.lon) || !Number.isFinite(marker.lat) ||
        marker.lon < west || marker.lon > east || marker.lat < south ||
        marker.lat > north
      ) {
        errors.push(
          `${year} 年の ${marker.name} が bbox 外: [${marker.lon}, ${marker.lat}]`,
        );
      }
      if (
        marker.population !== null &&
        (!Number.isFinite(marker.population) || marker.population <= 0)
      ) {
        errors.push(
          `${year} 年の ${marker.name} の population が不正: ${marker.population}`,
        );
      }
    }
  }
  return errors;
}

/** ピン留め URL から CSV テキストを取得する（Latin-1 エンコーディング） */
async function fetchCsvText(): Promise<string> {
  const url = buildCitiesSourceUrl();
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`${url} の取得に失敗しました (status ${res.status})`);
  }
  // 元 CSV は Latin-1（OtherName 列に非 UTF-8 バイトを含む）。
  // 採用する City 列は ASCII のみであることをパイプライン検証で確認済み。
  const buffer = await res.arrayBuffer();
  return new TextDecoder("iso-8859-1").decode(buffer);
}

async function main(): Promise<void> {
  const csvText = await fetchCsvText();
  const rows = filterCitiesToBbox(parseChandlerCsv(csvText), EUROPE_BBOX);
  const data = buildCitiesData(rows, SNAPSHOT_YEARS);
  const errors = validateCitiesData(data, SNAPSHOT_YEARS, EUROPE_BBOX);
  if (errors.length > 0) {
    throw new Error(`検証エラー:\n${errors.join("\n")}`);
  }
  await Deno.writeTextFile(
    CITIES_OUTPUT_PATH,
    `${JSON.stringify(data, null, 2)}\n`,
  );
  const counts = Object.entries(data.years)
    .map(([year, markers]) => `${year}:${markers.length}`)
    .join(" ");
  console.log(`${CITIES_OUTPUT_PATH} を生成しました（${counts}）`);
}

if (import.meta.main) {
  await main();
}
