/**
 * URL 状態共有（app-spec §5.3 / map-rendering-research §5 の worldmonitor パターン）の
 * DOM・履歴 API に依存しない純粋ロジック。
 * - encodeState: 表示状態 → `?year=...&zoom=...&center=lon,lat` クエリ文字列
 * - decodeState: クエリ文字列 → 検証済みの表示状態（パラメータ単位でフォールバック）
 * - createReplaceStateUpdater: 同一 state での重複更新を抑止する薄いラッパ
 *
 * 検証はここに集約し、main.ts 側は location.search / history.replaceState との
 * 配線のみを担うことで、URL エンコード・デコードをユニットテスト対象に最大化する
 * （development-style §1 の重点テスト対象）。
 */

/** 地図の表示状態。center は [経度, 緯度]（maplibre の lng, lat に一致）。 */
export interface AppState {
  year: number;
  zoom: number;
  center: [number, number];
}

/** decodeState の検証境界。緯度経度の範囲は省略時に Web メルカトル相当の既定へ。 */
export interface StateBounds {
  /** 許可する実在年（この配列に含まれる年のみ year として受理する） */
  years: readonly number[];
  minZoom: number;
  maxZoom: number;
  minLon?: number;
  maxLon?: number;
  minLat?: number;
  maxLat?: number;
}

const DEFAULT_MIN_LON = -180;
const DEFAULT_MAX_LON = 180;
// 緯度は Web メルカトルの実用上限（maplibre 既定と同等）に合わせる。
const DEFAULT_MIN_LAT = -85;
const DEFAULT_MAX_LAT = 85;

/** 小数 1 桁の固定表記（仕様例 zoom=4.5 / center=15.0,50.0 に合わせる）。 */
function round1(n: number): string {
  return n.toFixed(1);
}

/** 表示状態を仕様例の形式のクエリ文字列（先頭 ? 付き）に直列化する。 */
export function encodeState(state: AppState): string {
  const [lon, lat] = state.center;
  // center のカンマは可読性のため URL エンコードせず生のまま出力する
  // （sub-delim として有効。URLSearchParams だと %2C になり仕様例と乖離する）。
  return `?year=${state.year}&zoom=${round1(state.zoom)}&center=${
    round1(lon)
  },${round1(lat)}`;
}

/** 空文字・空白のみを NaN として弾く数値パース（Number("") === 0 対策）。 */
function parseNumber(raw: string): number {
  if (raw.trim() === "") return Number.NaN;
  return Number(raw);
}

function clamp(n: number, min: number, max: number): number {
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

/** 実在年のみ受理。非数値・小数・非実在年はデフォルトへフォールバック。 */
function decodeYear(
  raw: string | null,
  fallback: number,
  years: readonly number[],
): number {
  if (raw === null) return fallback;
  const n = parseNumber(raw);
  if (!Number.isInteger(n)) return fallback;
  return years.includes(n) ? n : fallback;
}

/** 範囲外は [min, max] にクランプ。非数値はデフォルトへフォールバック。 */
function decodeZoom(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === null) return fallback;
  const n = parseNumber(raw);
  if (!Number.isFinite(n)) return fallback;
  return clamp(n, min, max);
}

/** `lon,lat` を検証。形式不正・非数値・範囲外はデフォルトへフォールバック。 */
function decodeCenter(
  raw: string | null,
  fallback: [number, number],
  bounds: StateBounds,
): [number, number] {
  if (raw === null) return fallback;
  const parts = raw.split(",");
  if (parts.length !== 2) return fallback;
  const lon = parseNumber(parts[0]);
  const lat = parseNumber(parts[1]);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return fallback;
  const minLon = bounds.minLon ?? DEFAULT_MIN_LON;
  const maxLon = bounds.maxLon ?? DEFAULT_MAX_LON;
  const minLat = bounds.minLat ?? DEFAULT_MIN_LAT;
  const maxLat = bounds.maxLat ?? DEFAULT_MAX_LAT;
  if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
    return fallback;
  }
  return [lon, lat];
}

/**
 * クエリ文字列を検証済み表示状態へ復元する。
 * 各パラメータは独立に検証し、不正なものだけ defaults へフォールバックする
 * （正しい値は活かす）。search は先頭 `?` の有無どちらでも解釈する。
 */
export function decodeState(
  search: string,
  defaults: AppState,
  bounds: StateBounds,
): AppState {
  const params = new URLSearchParams(search);
  return {
    year: decodeYear(params.get("year"), defaults.year, bounds.years),
    zoom: decodeZoom(
      params.get("zoom"),
      defaults.zoom,
      bounds.minZoom,
      bounds.maxZoom,
    ),
    center: decodeCenter(params.get("center"), defaults.center, bounds),
  };
}

/**
 * 直前に書き出したクエリと同一なら replace を呼ばない更新関数を作る。
 * moveend など高頻度イベントから呼んでも、実効クエリが変わらなければ
 * history.replaceState を無駄に呼ばない（重複抑止）。
 */
export function createReplaceStateUpdater(
  replace: (query: string) => void,
): (state: AppState) => void {
  let last: string | null = null;
  return (state) => {
    const query = encodeState(state);
    if (query === last) return;
    last = query;
    replace(query);
  };
}
