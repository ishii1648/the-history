/**
 * アプリ全体で共有する純粋データ定数。
 * 値の出典: docs/app-spec.md §5.2（地図インタラクション）・§2.1（年代スナップショット）
 */

/** 地図の初期中心座標 [経度, 緯度] */
export const INITIAL_CENTER: readonly [number, number] = [15, 50];

/** 地図の初期ズームレベル */
export const INITIAL_ZOOM = 4;

/**
 * 地図の最小ズームレベル。
 * TASK-22 でヨーロッパ全域がちょうど一望できる z4 に引き上げた（z3 では
 * ヨーロッパが画面の一部にしか映らないほど引けてしまう）。なお MAP_MAX_BOUNDS
 * 併用時、MapLibre は bounds 全体が収まるよう viewport 幅に応じて実効最小
 * ズームをさらに制限するため、広い画面ではこの値より寄った表示が下限になる。
 */
export const MIN_ZOOM = 4;

/** 地図の最大ズームレベル */
export const MAX_ZOOM = 8;

/**
 * 地図のパン・ズームを制限するヨーロッパ域の境界 [[西, 南], [東, 北]]。
 * MapLibre の LngLatBoundsLike 互換タプルで、Map の `maxBounds` にそのまま渡す。
 * データパイプライン側 scripts/build-data.ts の EUROPE_BBOX ([-25, 34, 60, 72])
 * と同値（src → scripts の import は行わない規約のため値を重複定義し、
 * 同値性は config_test.ts で担保する）。
 */
export const MAP_MAX_BOUNDS: [[number, number], [number, number]] = [
  [-25, 34],
  [60, 72],
];

/** タイムラインスライダーの初期年代 */
export const INITIAL_YEAR = 1000;

/**
 * ベースマップの PMTiles URL（同一オリジン配信の相対パス）。
 * 開発時は `deno task extract-pmtiles` で data/europe.pmtiles を生成すると、
 * scripts/build.ts が dist/europe.pmtiles にコピーして同一オリジンで配信する
 * （CORS 制約なし）。本番は Cloudflare R2 の絶対 URL に差し替える（TASK-10）。
 * 差し替えはこの定数 1 箇所で完結させること。
 */
export const BASEMAP_PMTILES_URL = "/europe.pmtiles";

/** MapLibre スタイル内でベースマップのベクタソースに付ける ID */
export const BASEMAP_SOURCE_ID = "basemap";

/**
 * 地形 DEM（terrarium エンコーディング・zoom 0〜8・EUROPE_BBOX 域）の
 * PMTiles URL（同一オリジン配信の相対パス）。TASK-34 の hillshade 表現に使う。
 * DEM アーカイブは任意生成: `deno task extract-dem` 等で data/europe-dem.pmtiles
 * を生成した場合のみ dist 直下へコピーされ配信される。存在しない環境では
 * 取得エラーになるが、hillshade なしの従来表示で継続する（フォールバックは
 * 発動しない。src/fallback.ts 参照）。
 */
export const DEM_PMTILES_URL = "/europe-dem.pmtiles";

/** MapLibre スタイル内で DEM（raster-dem）ソースに付ける ID */
export const DEM_SOURCE_ID = "dem";

/**
 * PMTiles 取得失敗時のフォールバック先スタイル URL（OpenFreeMap Liberty）。
 * API キー不要・無料。docs/map-rendering-research.md §2 参照。
 */
export const FALLBACK_STYLE_URL =
  "https://tiles.openfreemap.org/styles/liberty";

/**
 * 神聖ローマ帝国の主要領邦オーバーレイ（hre_<year>.geojson）が存在する年代（昇順）。
 * 出典の ETH Zürich Roller データセット（doi:10.3929/ethz-b-000472583）が
 * カバーするのは 1500 前後〜1650 のスナップショットのみで、SNAPSHOT_YEARS の
 * うちこの 4 年だけにオーバーレイを配信する。他の年代にはファイル自体が無い。
 */
export const HRE_OVERLAY_YEARS: readonly number[] = [1500, 1530, 1600, 1650];

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
