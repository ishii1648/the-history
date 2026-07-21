/**
 * ベースマップのフォールバック判定（DOM 非依存の純粋ロジック）。
 *
 * PMTiles の取得失敗（メタデータ取得失敗・タイル取得失敗）を検知したら
 * OpenFreeMap のスタイルへ一度だけ切り替える（docs/app-spec.md §2.2、
 * docs/map-rendering-research.md §2 のフォールバック戦略の簡易版）。
 */

/** MapLibre の error イベント相当の最小型 */
export interface BasemapErrorEvent {
  /** ソース起因のエラーの場合に付くソース ID */
  sourceId?: string;
  error?: { message?: string };
}

/** フォールバック状態機械の状態（immutable に扱う） */
export interface FallbackState {
  readonly fallenBack: boolean;
}

export function createFallbackState(): FallbackState {
  return { fallenBack: false };
}

/**
 * タイル/アーカイブ取得失敗を示すメッセージのパターン。
 * - pmtiles: pmtiles ライブラリが投げるエラー（ヘッダ/タイル取得失敗）
 * - fetch / network: ブラウザのネットワークエラー（CORS 拒否含む。
 *   Chrome: "Failed to fetch" / Firefox: "NetworkError ..."）
 * - HTTP ステータス系: MapLibre の AJAXError メッセージ（例 "Not Found (404)"）
 */
const FETCH_ERROR_PATTERN =
  /pmtiles|fetch|network|range request|\((?:4|5)\d{2}\)/i;

/**
 * ベースマップのタイル/メタデータ取得失敗エラーかを判定する純粋関数。
 * ソース ID が一致するエラーは内容を問わず該当とみなす（ベースマップ
 * ソースのエラーは取得失敗以外に実質存在しないため）。
 */
export function isBasemapFetchError(
  event: BasemapErrorEvent,
  basemapSourceId: string,
): boolean {
  if (event.sourceId === basemapSourceId) {
    return true;
  }
  const message = event.error?.message ?? "";
  return FETCH_ERROR_PATTERN.test(message);
}

/**
 * エラーイベントを受けてフォールバックすべきかを決める純粋関数。
 * 切り替えは一度きり（既にフォールバック済みなら常に false）。
 */
export function decideFallback(
  state: FallbackState,
  event: BasemapErrorEvent,
  basemapSourceId: string,
): { fallback: boolean; state: FallbackState } {
  if (state.fallenBack || !isBasemapFetchError(event, basemapSourceId)) {
    return { fallback: false, state };
  }
  return { fallback: true, state: { fallenBack: true } };
}
