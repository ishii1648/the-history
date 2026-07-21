/**
 * 主要都市マーカー/ラベルの DOM/deck.gl 非依存な純粋ロジック（TASK-27）。
 * - cities.json（年 → 都市配列）から表示年の都市エントリを取り出す検証付き変換
 * - ScatterplotLayer（マーカー）用・TextLayer（ラベル）用データへの変換
 * - CollisionFilterExtension 用の人口由来ラベル優先度の算出
 *
 * cities.json はデータ生成スクリプトの成果物で、取得失敗・未生成時は
 * main.ts 側が warn + 空データで「都市なし」のまま継続する契約。
 */

import type { LabelDatum } from "./labels.ts";

/** 主要都市 JSON の配信 URL（scripts/build.ts のコピー先と一致させる契約） */
export const CITIES_DATA_URL = "/data/cities.json";

/** cities.json の都市 1 件分（都市名は英語。表示時に name-ja.json で日本語化） */
export interface CityEntry {
  name: string;
  lon: number;
  lat: number;
  /** 当時の推定人口。不明は null */
  population: number | null;
}

/** cities.json 全体の形（years: 年文字列 → 都市配列） */
export interface CitiesData {
  years: Record<string, CityEntry[]>;
  source?: unknown;
}

/** ScatterplotLayer（都市マーカー）に渡す 1 件分のデータ */
export interface CityMarkerDatum {
  /** 英語の都市名（picking 時のツールチップ/パネル表示で ja 適用する） */
  name: string;
  /** マーカー座標 [lon, lat] */
  position: [number, number];
}

/**
 * 都市ラベル priority の下限（人口不明・人口 ≦ 1 の都市）。
 *
 * 設計根拠: 国名ラベル（labels.ts labelPriorityFor）は面積由来
 * 100 * log10(deg²) で実測 -400〜300 程度に散らばる。cities.json に載る
 * 時点で「その年代の主要都市」なので、小勢力ラベル（負値〜0 近辺）よりは
 * 常に優先しつつ、大国ラベル（200〜300 付近）には譲る中位帯 150〜220 に
 * 固定する。これで国名の骨格表示を壊さずに都市名が空きへ入る。
 */
export const CITY_LABEL_PRIORITY_MIN = 150;

/** 都市ラベル priority の上限（バンド設計は CITY_LABEL_PRIORITY_MIN を参照） */
export const CITY_LABEL_PRIORITY_MAX = 220;

/** 有限数値なら number、それ以外は null */
function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * unknown 値を CityEntry として検証・正規化する（純粋関数）。
 * name 非文字列・lon/lat 非有限数値は不正として null。
 * population は有限数値以外（欠落・文字列等）を null に正規化する。
 */
function normalizeCityEntry(value: unknown): CityEntry | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.name !== "string") return null;
  const lon = finiteNumber(v.lon);
  const lat = finiteNumber(v.lat);
  if (lon === null || lat === null) return null;
  return { name: v.name, lon, lat, population: finiteNumber(v.population) };
}

/**
 * 表示年の都市エントリ一覧を返す（純粋関数）。
 * データ不正形（null・years 非オブジェクト・年の値が非配列）・年キー欠落は
 * 空配列にし、fetch 失敗と同様「都市なし」で継続できるようにする。
 * 配列内の不正エントリは 1 件単位で除外する。
 */
export function cityEntriesForYear(
  data: CitiesData,
  year: number,
): CityEntry[] {
  const years = (data as unknown as Record<string, unknown> | null)?.years;
  if (typeof years !== "object" || years === null) return [];
  const list = (years as Record<string, unknown>)[String(year)];
  if (!Array.isArray(list)) return [];
  const entries: CityEntry[] = [];
  for (const item of list) {
    const entry = normalizeCityEntry(item);
    if (entry !== null) entries.push(entry);
  }
  return entries;
}

/**
 * 人口由来の都市ラベル優先度（純粋関数）。人口が多い都市ほど高優先。
 * 100 * log10 だと人口（1e3〜1e6 人）でバンド幅 300 を食い潰すため、
 * 10 * log10(population) の緩い傾斜でバンド内（150〜220）に収める。
 * 人口不明（null）・0 以下はバンド下限。
 */
function cityLabelPriority(population: number | null): number {
  if (population === null || population <= 1) return CITY_LABEL_PRIORITY_MIN;
  const priority = CITY_LABEL_PRIORITY_MIN +
    Math.round(10 * Math.log10(population));
  return Math.min(CITY_LABEL_PRIORITY_MAX, priority);
}

/**
 * 都市エントリを TextLayer 用ラベルデータへ変換する（純粋関数）。
 * - text は ja（name-ja.json）適用。未登録の都市名は英語のまま
 * - name 空のエントリは除外（ラベル・picking 表示のどちらも成立しない）
 * - priority は人口由来の都市固定バンド（CITY_LABEL_PRIORITY_MIN..MAX）
 */
export function buildCityLabelData(
  entries: readonly CityEntry[],
  ja: Record<string, string> = {},
): LabelDatum[] {
  const data: LabelDatum[] = [];
  for (const entry of entries) {
    if (entry.name === "") continue;
    data.push({
      text: ja[entry.name] ?? entry.name,
      position: [entry.lon, entry.lat],
      priority: cityLabelPriority(entry.population),
    });
  }
  return data;
}

/**
 * 都市エントリを ScatterplotLayer 用マーカーデータへ変換する（純粋関数）。
 * name はホバー/クリック時の表示（ja 適用）に使うため保持する。
 * name 空のエントリはラベル同様に除外する。
 */
export function buildCityMarkerData(
  entries: readonly CityEntry[],
): CityMarkerDatum[] {
  const data: CityMarkerDatum[] = [];
  for (const entry of entries) {
    if (entry.name === "") continue;
    data.push({ name: entry.name, position: [entry.lon, entry.lat] });
  }
  return data;
}
