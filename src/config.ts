/**
 * アプリ全体で共有する純粋データ定数。
 * 値の出典: docs/app-spec.md §5.2（地図インタラクション）・§2.1（年代スナップショット）
 */

/** 地図の初期中心座標 [経度, 緯度] */
export const INITIAL_CENTER: readonly [number, number] = [15, 50];

/** 地図の初期ズームレベル */
export const INITIAL_ZOOM = 4;

/** 地図の最小ズームレベル */
export const MIN_ZOOM = 3;

/** 地図の最大ズームレベル */
export const MAX_ZOOM = 8;

/** タイムラインスライダーの初期年代 */
export const INITIAL_YEAR = 1000;

/**
 * ベースマップの PMTiles URL。
 * 開発段階では Protomaps の公開デモバケット（最新 v4 planet ビルドの
 * エイリアス）を使う。本番では Cloudflare R2 上の europe.pmtiles に
 * 差し替える（TASK-10）。差し替えはこの定数 1 箇所で完結させること。
 *
 * 注意: demo-bucket の CORS 許可オリジンは限定されており、ローカル開発では
 * http://localhost:5173 のみ許可されている（`deno task serve` は 5173 で起動）。
 */
export const BASEMAP_PMTILES_URL =
  "https://demo-bucket.protomaps.com/v4.pmtiles";

/** MapLibre スタイル内でベースマップのベクタソースに付ける ID */
export const BASEMAP_SOURCE_ID = "basemap";

/**
 * PMTiles 取得失敗時のフォールバック先スタイル URL（OpenFreeMap Liberty）。
 * API キー不要・無料。docs/map-rendering-research.md §2 参照。
 */
export const FALLBACK_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/** 歴史的国境ポリゴンが存在する年代スナップショット一覧（昇順） */
export const SNAPSHOT_YEARS: readonly number[] = [
  900,
  1000,
  1100,
  1200,
  1279,
  1300,
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
  1914,
];
