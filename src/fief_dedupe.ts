/**
 * 諸侯領オーバーレイと base 勢力の重複（二重ラベル）を解消する純粋ロジック
 * （TASK-78）。DOM / deck.gl 非依存。
 *
 * 扱うのは「被覆率表（data/fief-dedupe.json、scripts/build-fief-dedupe.ts が
 * 生成）を読んで、どの base 勢力のラベルを抑制するか」だけ。境界線側の重複は
 * 線を幾何的に切り出した data/base_outline_<year>.geojson（同スクリプトが生成、
 * ローダは powers.ts の createBaseOutlineLoader）で解決しており、こちらの
 * 表とは独立に効く。
 *
 * 被覆率 = 「その base 勢力の面積のうち、諸侯領 union に覆われている割合」。
 * 1.0 に近い勢力は諸侯領オーバーレイで同じ土地が完全に描き直されているため、
 * base 側のラベルは諸侯領ラベルと同一実体の二重表示になる（1200 年の
 * 「ブルターニュ」と「ブルターニュ公領」）。
 */

import type { Feature, FeatureCollection } from "geojson";

/** 被覆率表の配信 URL（同一オリジン） */
export const FIEF_DEDUPE_DATA_URL = "/data/fief-dedupe.json";

/** 年 → 勢力 NAME → 被覆率（0..1）の対応表 */
export interface FiefDedupeTable {
  years: Record<string, Record<string, number>>;
}

/**
 * 取得失敗・未生成・不正形のときに使う空表。この場合は抑制が一切起きず、
 * 従来どおり base ラベルが全件出る（表示を壊さない縮退。colors.json 等と同方針）。
 * 同一参照を返し続けることでメモ化のキーとしても安定する。
 */
export const EMPTY_FIEF_DEDUPE_TABLE: FiefDedupeTable = { years: {} };

/**
 * ラベルを抑制する被覆率の閾値（この値以上で抑制）。
 *
 * 実データ（scripts/build-fief-dedupe.ts の出力、1000〜1300 の 5 年分）では
 * 分布が二極化しており、完全内包は Britany の 1.0000 のみ、部分重複の最大は
 * 1200 年の Angevin Empire 0.5126（次に Kingdom of France 0.41・France 0.2940）
 * で、0.52〜1.00 の間には 1 件も無い。0.9 はこの空白帯の中で「ほぼ完全内包」
 * 側に寄せた値で、
 * - 部分重複の勢力（フランス王国・アンジュー帝国など、諸侯領の外にも領域を
 *   持ちラベルが必要な勢力）を巻き込まない
 * - 諸侯領データの解像度差で数 % の非被覆が残る勢力（将来 OHM 側の境界が
 *   更新された場合）でも抑制が外れない
 * の両方を満たす。閾値の境界挙動は fief_dedupe_test.ts で固定している。
 */
export const FIEF_COVERAGE_SUPPRESS_THRESHOLD = 0.9;

/** 値が普通のオブジェクト（配列・null を除く）か */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * fetch した JSON を被覆率表へ正規化する（純粋関数）。
 * 形が壊れている入力（null・配列・years 欠落）は空表にし、年エントリ単位・
 * 値単位でも不正なもの（非オブジェクト・非有限数）を捨てる。metadata などの
 * 追加キーは無視する。
 */
export function parseFiefDedupeTable(json: unknown): FiefDedupeTable {
  if (!isRecord(json) || !isRecord(json.years)) return EMPTY_FIEF_DEDUPE_TABLE;
  const years: Record<string, Record<string, number>> = {};
  for (const [year, entry] of Object.entries(json.years)) {
    if (!isRecord(entry)) continue;
    const coverage: Record<string, number> = {};
    for (const [name, ratio] of Object.entries(entry)) {
      if (typeof ratio === "number" && Number.isFinite(ratio)) {
        coverage[name] = ratio;
      }
    }
    years[year] = coverage;
  }
  return { years };
}

/**
 * 指定年・勢力の被覆率を返す（純粋関数）。未登録の年・勢力は 0
 * （= 諸侯領と重ならない、または諸侯領オーバーレイ対象外の年）。
 */
export function coverageFor(
  table: FiefDedupeTable,
  year: number,
  name: string,
): number {
  return table.years[String(year)]?.[name] ?? 0;
}

/**
 * 指定年でラベルを抑制する base 勢力 NAME の集合を返す（純粋関数）。
 * 諸侯領オーバーレイ対象外の年（900・1400 以降）は表にエントリが無いため
 * 常に空集合になり、見た目は従来から変わらない（AC #3）。
 */
export function suppressedPowerNames(
  table: FiefDedupeTable,
  year: number,
  threshold: number = FIEF_COVERAGE_SUPPRESS_THRESHOLD,
): ReadonlySet<string> {
  const coverage = table.years[String(year)];
  if (coverage === undefined) return new Set();
  const names = new Set<string>();
  for (const [name, ratio] of Object.entries(coverage)) {
    if (ratio >= threshold) names.add(name);
  }
  return names;
}

/** properties.NAME を取り出す。空文字・非文字列は null */
function nameOf(feature: Feature): string | null {
  const value = feature.properties?.NAME;
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * 抑制対象 NAME の feature を除いた FeatureCollection を返す（純粋関数）。
 * 除く対象が無ければ入力と同一参照を返す: 呼び出し側（main.ts の
 * memoizedPowerLabelData）は引数の参照同値でラベルデータをキャッシュするため、
 * 毎回新しい配列を作ると polylabel の再計算が走ってしまう（TASK-50 の方針）。
 *
 * 抑制するのはラベル生成用の feature だけで、勢力ポリゴンの塗り・picking に
 * 使う FeatureCollection には適用しない（base の塗りとホバー/クリックは維持する）。
 */
export function excludeSuppressedFeatures(
  fc: FeatureCollection,
  suppressed: ReadonlySet<string>,
): FeatureCollection {
  if (suppressed.size === 0) return fc;
  const kept = fc.features.filter((feature) => {
    const name = nameOf(feature);
    return name === null || !suppressed.has(name);
  });
  if (kept.length === fc.features.length) return fc;
  return { ...fc, features: kept };
}
