import maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  GeoJSONSourceSpecification,
  LayerSpecification,
  StyleSpecification,
} from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { CollisionFilterExtensionProps } from "@deck.gl/extensions";
import type { Feature, FeatureCollection } from "geojson";
import { buildBasemapStyle, WATER_LAYER_ID } from "./basemap.ts";
import {
  approximateBorderBeforeId,
  approximateBorderStackIsValid,
  CITY_LABEL_LAYER_ID,
  LABEL_LAYER_ID,
  MOUNTAIN_LABEL_LAYER_ID,
  overlaySplitIsValid,
  PEAK_LABEL_LAYER_ID,
  politicalFillGroupId,
  RIVER_LABEL_LAYER_ID,
  underWaterBeforeId,
  waterStackIsValid,
} from "./layer_stack.ts";
import {
  APPROXIMATE_BORDER_LAYER_IDS,
  APPROXIMATE_BORDER_SOURCE_ID,
  approximateBorderLayerSpecs,
  approximateBorderSourceSpec,
  buildApproximateBorderData,
  EMPTY_APPROXIMATE_BORDER_DATA,
  MAX_SEGMENT_KM_PROPERTY,
  TIER_PROPERTY,
} from "./approximate_borders.ts";
import {
  type BasemapErrorEvent,
  createFallbackState,
  decideFallback,
} from "./fallback.ts";
import {
  colorKeyFor,
  createBaseFillLoader,
  createBaseOutlineLoader,
  createCliopatriaFiefOverlayLoader,
  createCombinedYearLoader,
  createFranceFiefOverlayLoader,
  createHreOverlayLoader,
  createItalyFiefOverlayLoader,
  createYearDataLoader,
  createYearSwitcher,
  EMPTY_FEATURE_COLLECTION,
  hasCliopatriaFiefOverlay,
  hasFranceFiefOverlay,
  hasHreOverlay,
  hasItalyFiefOverlay,
  LINE_COLOR,
  LINE_WIDTH_PX,
  powerFillDataFor,
  type Rgba,
  type YearDataLoader,
} from "./powers.ts";
import {
  displayLabel,
  type SourceLine,
  sourceLines,
  tooltipPlacement,
} from "./info.ts";
import {
  EMPTY_FIEF_DEDUPE_TABLE,
  FIEF_DEDUPE_DATA_URL,
  type FiefDedupeTable,
  parseFiefDedupeTable,
  suppressedPowerNames,
} from "./fief_dedupe.ts";
import {
  buildLabelData,
  characterSetFrom,
  CITY_LABEL_COLOR,
  CITY_LABEL_SIZE_PX,
  COLLISION_SIZE_SCALE,
  FIEF_LABEL_COLOR,
  fiefLabelsVisibleAt,
  filterPowerLabelsByZoom,
  isHreSuzerainFeature,
  type LabelDatum,
  labelTextStyleProps,
  MOUNTAIN_LABEL_COLOR,
  MOUNTAIN_LABEL_SIZE_PX,
  partitionFiefsBySuzerain,
  POWER_LABEL_SIZE_PX,
  RIVER_LABEL_COLOR,
  RIVER_LABEL_SIZE_PX,
} from "./labels.ts";
import { labelCollisionExtensions } from "./label_collision.ts";
import {
  createSuzerainExtentCache,
  EMPTY_SUZERAIN_OVERRIDES,
  extractSuzerainMembers,
  parseSuzerainOverrides,
  suzerainExtentKey,
  type SuzerainOverrides,
  withSuzerainOverrides,
} from "./suzerain_extent.ts";
import { memoizeLatest } from "./memo.ts";
import {
  filterVisibleMountainLabels,
  MOUNTAIN_HIT_FILL_COLOR,
  MOUNTAIN_HIT_RADIUS_PX,
  MOUNTAIN_OUTLINE_LAYER_ID,
  mountainHitData,
  mountainLabelAnchors,
  type MountainLabelDatum,
  mountainOutlineColor,
  mountainOutlineWidth,
  mountainPickLabel,
  MOUNTAINS_DATA_URL,
  toggleMountainSelection,
} from "./mountains.ts";
import {
  buildPeakLabelData,
  buildPeakMarkerData,
  filterVisiblePeaks,
  PEAK_HIT_FILL_COLOR,
  PEAK_HIT_RADIUS_PX,
  PEAK_LABEL_PIXEL_OFFSET,
  PEAK_MARKER_CHARACTER_SET,
  PEAK_MARKER_GLYPH,
  peakEntries,
  type PeakEntry,
  type PeakLabelDatum,
  peakLabelText,
  peakLabelTexts,
  peakMarkerColor,
  type PeakMarkerDatum,
  peakMarkerSize,
  peakPickLabel,
  PEAKS_DATA_URL,
  togglePeakSelection,
} from "./peaks.ts";
import {
  filterVisibleRiverLabels,
  RIVER_HIT_LINE_COLOR,
  RIVER_HIT_LINE_WIDTH_PX,
  riverLabelAnchors,
  riverLineColor,
  riverLineWidth,
  riverNameFor,
  RIVERS_DATA_URL,
  toggleRiverSelection,
} from "./rivers.ts";
import {
  buildCityLabelData,
  buildCityMarkerData,
  CITIES_DATA_URL,
  type CitiesData,
  CITY_HIT_FILL_COLOR,
  CITY_HIT_RADIUS_PX,
  CITY_MARKER_RADIUS_PX,
  cityDisplayName,
  cityEntriesForYear,
  type CityEntry,
  type CityMarkerDatum,
  filterCitiesByZoom,
  visibleCityRankLimit,
} from "./cities.ts";
import {
  clearErrors,
  createLoadingState,
  failedYears,
  failLoading,
  hasError,
  isSpinnerVisible,
  type LoadingState,
  startLoading,
  succeedLoading,
} from "./loading_state.ts";
import {
  BASE_OUTLINE_YEARS,
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  CLIOPATRIA_FIEF_OVERLAY_YEARS,
  DEM_PMTILES_URL,
  FALLBACK_STYLE_URL,
  FRANCE_FIEF_OVERLAY_YEARS,
  HRE_ALL_OVERLAY_YEARS,
  HRE_FIEF_OVERLAY_YEARS,
  INITIAL_CENTER,
  INITIAL_YEAR,
  INITIAL_ZOOM,
  ITALY_FIEF_OVERLAY_YEARS,
  MAP_MAX_BOUNDS,
  MAX_ZOOM,
  MIN_ZOOM,
  SNAPSHOT_YEARS,
} from "./config.ts";
import { indexOfYear, keyToStep, stepYear, yearAtIndex } from "./timeline.ts";
import {
  type AppState,
  createReplaceStateUpdater,
  decodeState,
} from "./url_state.ts";
import { wireCollapsiblePanel } from "./collapsible.ts";
import {
  createNotesState,
  isNotesPanelHidden,
  NOTES_DATA_URL,
  notesAriaExpanded,
  type NotesData,
  type NotesEvent,
  notesForYear,
  notesHeadingFor,
  parseNotesData,
  reduceNotesEvent,
} from "./notes.ts";
import {
  KNOWN_LIMITATIONS_DATA_URL,
  type KnownLimitation,
  knownLimitationEntries,
  parseKnownLimitations,
} from "./known_limitations.ts";
import {
  CITY_HIT_LAYER_ID,
  CITY_LAYER_ID,
  CLIOPATRIA_FIEF_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
  isCityPickLayerId,
  isDirectPickFinal,
  isMountainPickLayerId,
  isPeakPickLayerId,
  isRiversPickLayerId,
  ITALY_FIEF_LAYER_ID,
  layerOrderMatchesPickingPriority,
  MOUNTAIN_HIT_LAYER_ID,
  PEAK_HIT_LAYER_ID,
  PEAK_LAYER_ID,
  PICKING_PRIORITY,
  PICKING_RADIUS_PX,
  POWER_LAYER_ID,
  renderOrderFromPickingPriority,
  resolveClickPick,
  RIVERS_HIT_LAYER_ID,
  RIVERS_LAYER_ID,
} from "./picking.ts";
import {
  ACTIVE_FILL_COLOR,
  createPowerHighlightStore,
  HIGHLIGHT_FILL_TRANSITION_MS,
  isPowerActive,
  powerFillColor,
  powerHighlightKey,
  powerLabelColor,
  YEAR_FILL_TRANSITION_MS,
} from "./power_highlight.ts";

const mapContainer = document.getElementById("map");
if (!mapContainer) {
  throw new Error("#map 要素が見つかりません");
}

// AC #2/#3: 起動時に URL クエリから表示状態を復元する（パース不能値はパラメータ
// 単位でデフォルトへフォールバック、範囲外の zoom / center はヨーロッパ域
// MAP_MAX_BOUNDS・MIN_ZOOM〜MAX_ZOOM 内へクランプ）。地図の初期 center/zoom と
// 初期年代はこの値を使う（TASK-22: 範囲外 URL でも表示が制限範囲内に収まる）。
const initialState = decodeState(
  globalThis.location.search,
  { year: INITIAL_YEAR, zoom: INITIAL_ZOOM, center: [...INITIAL_CENTER] },
  {
    years: SNAPSHOT_YEARS,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    minLon: MAP_MAX_BOUNDS[0][0],
    minLat: MAP_MAX_BOUNDS[0][1],
    maxLon: MAP_MAX_BOUNDS[1][0],
    maxLat: MAP_MAX_BOUNDS[1][1],
  },
);
const initialYear = initialState.year;

// PMTiles プロトコルを MapLibre に登録（1 回だけ）
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// アーカイブを登録しておくと pmtiles:// の解決とヘッダ取得を共有できる
const archive = new PMTiles(BASEMAP_PMTILES_URL);
protocol.add(archive);

// TASK-34: 地形 DEM（hillshade 用）の PMTiles アーカイブも登録する。
// DEM は任意生成のため存在しない環境があり、その場合ヘッダ取得が失敗するが、
// 握りつぶして hillshade なしの従来表示で継続する（basemap と違いフォール
// バックはしない。dem ソースのタイル取得エラーも fallback.ts の判定が
// sourceId で除外する）。
const demArchive = new PMTiles(DEM_PMTILES_URL);
protocol.add(demArchive);
demArchive.getHeader().catch((error: unknown) => {
  console.warn(
    `DEM PMTiles が利用できないため hillshade なしで継続します: ${
      String(error)
    }`,
  );
});

const map = new maplibregl.Map({
  container: mapContainer,
  style: buildBasemapStyle(BASEMAP_PMTILES_URL) as StyleSpecification,
  center: initialState.center,
  zoom: initialState.zoom,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
  // TASK-22: パン・ズームアウトをヨーロッパ域内に制限する（圏外へは出られない）
  maxBounds: MAP_MAX_BOUNDS,
});

// TASK-22: コンストラクタの maxBounds は初期カメラに制約を適用しないことがあり、
// 境界ちょうどへクランプされた center（範囲外 URL 由来）だとビューポート下半分が
// 圏外を映したまま初期表示される。setMaxBounds を明示的に呼ぶと現在のカメラへ
// 即時に制約が適用され、初期表示から表示範囲が bounds 内に収まる。
map.setMaxBounds(MAP_MAX_BOUNDS);

let fallbackState = createFallbackState();

/** フォールバック判定を通し、必要なら OpenFreeMap スタイルへ一度だけ切り替える */
function handleBasemapError(event: BasemapErrorEvent, context: string): void {
  const decision = decideFallback(fallbackState, event, BASEMAP_SOURCE_ID);
  fallbackState = decision.state;
  if (decision.fallback) {
    console.warn(
      `ベースマップの取得に失敗（${context}）: ${
        event.error?.message ?? "unknown"
      }。OpenFreeMap にフォールバックします`,
    );
    map.setStyle(FALLBACK_STYLE_URL);
    // TASK-77: 新スタイルの水面レイヤー有無で beforeId が変わるため、読み込み
    // 完了後に一度だけレイヤーを組み直す（水面が無いスタイルでも beforeId なし
    // の従来描画順で描かれるようにする）。styledata の常時購読はレイヤー追加で
    // 自身が再発火するため、フォールバック時の once に限定する。
    map.once("styledata", () => renderLayers());
  }
}

// AC #3: PMTiles メタデータ（ヘッダ）取得失敗の検知
archive.getHeader().catch((error: unknown) => {
  handleBasemapError(
    { error: { message: `pmtiles: ${String(error)}` } },
    "メタデータ取得",
  );
});

// AC #3: タイル取得失敗の検知（MapLibre の error イベント経由）
map.on("error", (event) => {
  handleBasemapError(event as unknown as BasemapErrorEvent, "タイル取得");
});

// TASK-80: 概略境界（MapLibre の line レイヤー）はスタイル側の状態なので、
// スタイルが変わるたびに「存在するか・重ね順が正しいか」を確認して追いつかせる。
// 具体的には (1) 起動時のスタイル読み込み、(2) OpenFreeMap へのフォールバック
// （setStyle で source ごと消える）、(3) deck.gl が interleaved のレイヤー
// グループを追加し直したとき（概略境界が塗りの下へ潜る）を拾う。
// このハンドラ自身の addSource / addLayer も styledata を再発火させるが、
// syncApproximateBorders は「すでに正しい」状態では何も変更しないため数回で
// 収束する（概略境界を無条件に moveLayer で引き上げる実装にすると、deck.gl が
// styledata でレイヤーグループを再挿入するのと無限に競合する。詳細は
// layer_stack.ts の underWaterBeforeId）。
map.on("styledata", syncApproximateBorders);

// ---- 勢力圏ポリゴンレイヤー（TASK-5, docs/app-spec.md §3.3, §4.3）----

// pickable なレイヤーの ID（powers / hre-powers / cities / cities-hit /
// rivers / rivers-hit）は
// picking.ts に集約した（TASK-29）。picking の優先順位（PICKING_PRIORITY）と
// 描画順の対応を 1 箇所で管理するため。各レイヤーとも年代切替・選択変更で
// 同一 ID を保ち、data 差し替えのみで deck.gl の差分更新に任せる方針は不変。

// ラベル 3 層（power-labels / river-labels / city-labels）の ID は TASK-77 で
// layer_stack.ts へ移した。beforeId によるレイヤーグループ分割と衝突フィルタの
// 両立のため、この 3 層だけを overlaid オーバーレイに載せる分配ルールと同じ
// 場所で管理する。

/**
 * 勢力圏の外枠オーバーレイ（GeoJsonLayer）のレイヤー ID（TASK-30 / TASK-94）。
 * pickable: false のため PICKING_PRIORITY には含めない（picking 非関与）。
 * ID は "hre-extent" のまま据え置く（TASK-94 で対象を全勢力へ広げたが、
 * レイヤー順・overlaid 分配（layer_stack.ts）の既存の扱いを変えないため）。
 */
const HRE_EXTENT_LAYER_ID = "hre-extent";

/**
 * 勢力圏の外枠の色（TASK-30 AC #2）。HRE 領邦ラベルの臙脂
 * （labels.ts HRE_LABEL_COLOR）と同系色で「帝国系」の記号を揃える。
 * 外縁線は不透明、塗りはごく薄くして下の勢力塗り・領邦境界を隠さない。
 * TASK-94 で対象を全勢力へ広げた際も、この見た目は据え置く（AC #2）。
 */
const HRE_EXTENT_LINE_COLOR: [number, number, number, number] = [
  140,
  30,
  30,
  255,
];
const HRE_EXTENT_FILL_COLOR: [number, number, number, number] = [
  140,
  30,
  30,
  30,
];

/** 勢力圏の外枠の線の太さ（px）。通常の勢力境界（1px 白）より明確に太くする */
const HRE_EXTENT_LINE_WIDTH_PX = 3;

/** colors.json（NAME / "NAME|SUBJECTO" → HEX のフラットマップ） */
let colors: Record<string, string> = {};

/**
 * name-overrides.json の内容（renames = SUBJECTO 生値 → 正規化名、
 * suzerains = 宗主補正）。ラベル整形と勢力圏の外枠（TASK-94）で使う。
 */
let overrides: SuzerainOverrides = EMPTY_SUZERAIN_OVERRIDES;

/**
 * name-ja.json（英語 NAME → 日本語名のフラットマップ）。ツールチップ・パネル・
 * 地図上ラベルの表示だけを日本語化する（TASK-23）。未登録名は英語のまま。
 */
let nameJa: Record<string, string> = {};

// 年代 GeoJSON のローダ（fetch は本番のもの）。base（europe_*）・HRE 領邦
// オーバーレイ・中世フランス諸侯領オーバーレイ（france_fiefs_*、1000〜1300。
// TASK-71）を複合ローダで束ね、並行ロードして全て揃ってから反映する。
// オーバーレイの取得失敗は powers.ts 側で warn + 空扱いになり、base の表示・
// ローディング/エラー UI（failLoading）は base 失敗時のみ動く。非対象年の
// オーバーレイは fetch されず空 FC になるため、ベースマップの勢力ポリゴンと
// 二重表示になることはない。
// TASK-86: HRE 領邦は 1000〜1492（OHM 由来 hre_fiefs_flat_*）と 1500〜1700
// （Roller 由来 hre_*）の 2 系統を 1 本のローダ・1 枚のレイヤー（hre-powers）で
// 扱う。年代→ファイルの解決だけ hreDataUrlFor に閉じ込めてあるため、以降の
// 色・ラベル・帝国範囲強調・picking は年代分岐なしで一貫する。
// TASK-78/86: base 境界線オーバーレイ（base_outline_*）も同じ複合ローダに載せる。
// オーバーレイのある全年（BASE_OUTLINE_YEARS = 1000〜1492）の派生データで、
// 揃ってから同時に反映しないと「輪郭層がまだ来ていない」1 フレームが出るため。
// TASK-94: 取得した全レイヤーへ宗主補正（name-overrides.json suzerains）を
// 一度だけ適用する。SUBJECTO を補正後の宗主名へ書き換えることで、外枠
// （suzerain_extent.ts）だけでなく色キー（powers.ts colorKeyFor）・表示ラベル
// （info.ts displayLabel）も同じ封建関係を反映する。補正が 1 件も効かない年は
// 入力インスタンスがそのまま返り、deck.gl の差分更新は従来どおり効く。
const withOverrides = (loader: YearDataLoader) =>
  withSuzerainOverrides(loader, () => overrides);

const dataLoader = createCombinedYearLoader(
  withOverrides(createYearDataLoader((url) => fetch(url))),
  withOverrides(createHreOverlayLoader(
    (url) => fetch(url),
    HRE_ALL_OVERLAY_YEARS,
    console.warn,
    HRE_FIEF_OVERLAY_YEARS,
  )),
  withOverrides(
    createFranceFiefOverlayLoader(
      (url) => fetch(url),
      FRANCE_FIEF_OVERLAY_YEARS,
    ),
  ),
  withOverrides(
    createBaseOutlineLoader((url) => fetch(url), BASE_OUTLINE_YEARS),
  ),
  // TASK-92: 諸侯領の下地になる base 塗りを差し引いた派生 base。輪郭
  // （base_outline_*）と同じ union から作られるので、年集合も同一。
  withOverrides(createBaseFillLoader((url) => fetch(url), BASE_OUTLINE_YEARS)),
  // TASK-96: 中世イタリア諸侯領（italy_fiefs_flat_*、1000〜1492）。仏諸侯領・
  // HRE 領邦と同じ機構に載せ、非対象年は fetch せず空 FC になる。
  withOverrides(
    createItalyFiefOverlayLoader((url) => fetch(url), ITALY_FIEF_OVERLAY_YEARS),
  ),
  // TASK-110: Cliopatria 由来の領邦（cliopatria_fiefs_flat_*、1000〜1492）。
  // OHM に該当リレーションが無い領邦だけを収録する補完データで、既存 3 系統と
  // 同じ機構に載せる。ファイル未生成・取得失敗は warn + 空 FC に落ちるため、
  // データ側の生成前でもアプリは従来どおり動く（縮退契約）。
  withOverrides(
    createCliopatriaFiefOverlayLoader(
      (url) => fetch(url),
      CLIOPATRIA_FIEF_OVERLAY_YEARS,
    ),
  ),
);

/**
 * 諸侯領による base 勢力の被覆率表（/data/fief-dedupe.json、TASK-78）。
 * 取得失敗・未生成時は空表のままで、ラベル抑制が起きず従来表示になる。
 */
let fiefDedupe: FiefDedupeTable = EMPTY_FIEF_DEDUPE_TABLE;

/** 主要河川 GeoJSON（起動時に 1 度ロード。失敗時は空のまま河川なしで継続） */
let riversData: FeatureCollection = EMPTY_FEATURE_COLLECTION;

/**
 * 主要山脈 GeoJSON（TASK-97。年代非依存なので起動時に 1 度ロード）。
 * 失敗・未生成時は空のまま山脈ラベルなしで継続する（河川と同じ縮退方針）。
 */
let mountainsData: FeatureCollection = EMPTY_FEATURE_COLLECTION;

/**
 * 主要山峰 GeoJSON（TASK-99。山脈と同じく年代非依存なので起動時に 1 度ロード）。
 * 失敗・未生成時は空のまま山峰なしで継続する（河川・山脈と同じ縮退方針）。
 */
let peaksData: FeatureCollection = EMPTY_FEATURE_COLLECTION;

/**
 * 主要都市データ（TASK-27。起動時に 1 度ロード）。
 * 取得失敗・未生成時は空のまま都市なしで継続する（colors.json 等と同様）。
 */
let citiesData: CitiesData = { years: {} };

/**
 * ズーム別の表示制御に使う現在の整数ズーム段（TASK-66 AC #2、TASK-97）。
 * renderLayers はズーム変化では呼ばれないため、map の zoom イベントで
 * この値を監視し「整数段が変わった時のみ」レイヤーを再構築する
 * （applyRiverHover と同じ変化検知パターン。小数ズームの連続変化
 * = 毎フレームの再構築を避ける。TASK-50 の無駄な再構築回避方針）。
 * 表示件数の段階は都市が cities.ts の visibleCityRankLimit、山脈名が
 * mountains.ts の mountainLabelMinZoom、山峰が peaks.ts の peakMinZoom で
 * 決める（同じ整数段を共有する）。
 */
let zoomStep = Math.floor(initialState.zoom);

/** クリックで選択（強調）中の河川名。null は未選択（TASK-24 AC #2） */
let selectedRiverName: string | null = null;

/**
 * ホバー中の河川名。null はホバーなし（TASK-42）。選択とは独立に管理し、
 * riverLineColor/riverLineWidth で選択 > ホバー > 通常の優先度で強調へ変換する。
 */
let hoveredRiverName: string | null = null;

/**
 * クリックで選択（強調）中の山脈名・山峰名（英語の元名。null は未選択）
 * （TASK-100 AC #4）。河川と同じく「選択」と「ホバー」を独立に持ち、
 * mountains.ts / peaks.ts の純粋関数で色・線幅・記号サイズへ変換する。
 *
 * 山脈と山峰を別々の状態にするのは、両者が別レイヤー（面の輪郭 / 点の記号）
 * で別の強調表現を持つため。同時に強調されることはあり得る（モンブランを
 * ホバーしたままアルプス山脈を選択している等）が、それぞれの表現が独立して
 * いるので混乱しない。年代非依存なので年代切替では解除しない（AC #5）。
 */
let selectedMountainName: string | null = null;
let hoveredMountainName: string | null = null;
let selectedPeakName: string | null = null;
let hoveredPeakName: string | null = null;

/**
 * ホバー/クリック中の勢力の「宗主キー」（TASK-94。null は外枠なし）。
 * この宗主に属する全 feature（本体 + 従属）の union が勢力圏の外枠として
 * 描かれる。判定は suzerain_extent.ts の suzerainExtentKey に委ねる。
 * TASK-30 の HRE 専用状態（hreHighlighted）を一般化したもの。
 */
let extentKey: string | null = null;

/**
 * 宗主キーごとの外枠（union）のメモ化キャッシュ（TASK-94）。base の参照が
 * 変われば内部で捨てられるため、年代切替をまたいで古い形が残ることはない。
 */
const suzerainExtent = createSuzerainExtentCache();

/**
 * 政治ポリゴン（powers / hre-powers / france-fiefs）のアクティブ強調状態
 * （TASK-90）。ホバー/クリックした勢力・領邦の塗りをアクティブ色
 * （power_highlight.ts ACTIVE_FILL_COLOR）へ変え、飛び地を含む同一勢力キーの
 * 全ポリゴンを同時に光らせて国土の広がりを示す。
 *
 * onChange は「値が変わったときだけ」呼ばれる（変化検知はストア側。TASK-50 の
 * 規律を維持し、mousemove ごとの全レイヤー再構築を避ける）。再構築時の塗りの
 * 遷移は年代フェード（400ms）ではなく強調用の短い遷移を使う。
 */
const powerHighlight = createPowerHighlightStore(() => {
  // 年代切替による解除は直後の renderLayers() にまとめる（下の applyFn 参照）
  if (suppressPowerHighlightRender) return;
  renderWithFillTransition(HIGHLIGHT_FILL_TRANSITION_MS);
});

/**
 * 年代切替の適用中だけ true。powerHighlight.clear() による再構築を抑止し、
 * 直後に呼ばれる renderLayers()（年代フェード付き）に 1 本化する。
 */
let suppressPowerHighlightRender = false;

/**
 * 次の renderLayers() で使う政治ポリゴンの getFillColor 遷移時間（ms）。
 * 既定は年代切替のフェード（400ms、docs/app-spec.md §5.1）。強調の変化だけは
 * renderWithFillTransition が一時的に短い値へ差し替える（TASK-90）。
 */
let fillTransitionMs: number = YEAR_FILL_TRANSITION_MS;

/** 塗りの遷移時間を一時的に差し替えてレイヤーを再構築する（TASK-90） */
function renderWithFillTransition(durationMs: number): void {
  const previous = fillTransitionMs;
  fillTransitionMs = durationMs;
  try {
    renderLayers();
  } finally {
    fillTransitionMs = previous;
  }
}

/** 直近に反映された年代のデータ。選択変更時のレイヤー再構築で使う */
let currentView:
  | {
    year: number;
    base: FeatureCollection;
    hre: FeatureCollection;
    fiefs: FeatureCollection;
    /** TASK-78: 諸侯領の内側を除いた base 輪郭（空なら powers の stroke で描く） */
    outlines: FeatureCollection;
    /**
     * TASK-92: 諸侯領 union を差し引いた派生 base（空なら base をそのまま塗る）。
     * 使うのは powers レイヤーの塗りだけで、ラベル・帝国範囲強調・picking の
     * 入力は base のまま。
     */
    baseFill: FeatureCollection;
    /** TASK-96: 中世イタリア諸侯領（非対象年・取得失敗時は空 FC） */
    italyFiefs: FeatureCollection;
    /**
     * TASK-110: Cliopatria 由来の領邦（非対象年・取得失敗・未生成時は空 FC）
     */
    cliopatriaFiefs: FeatureCollection;
  }
  | null = null;

// AC #1: MapboxOverlay（interleaved）で deck.gl を MapLibre に統合する。
// overlay と GeoJsonLayer はここで 1 度だけ生成し、年代切替では data を差し替えるのみ。
//
// TASK-24: ホバー/クリックは per-layer コールバックではなく Deck レベルの
// onHover/onClick に集約する。deck.gl は「前回ホバーしていたレイヤーの leave」
// と「新しくホバーしたレイヤーの enter」を別々の per-layer コールバックで
// 呼ぶため、rivers（上）と powers（下）へ分けて書くとツールチップの
// 表示/非表示が発火順に依存してしまう。Deck レベルの onHover/onClick は
// 最前面の picking 結果 1 件（何も無ければ layer: null）で 1 回だけ呼ばれる
// （@deck.gl/core deck.js の _applyHoverCallbacks / _dispatchPickingEvent で
// 確認）ので、順序レースなしに河川と勢力の表示を出し分けられる。
// pickingRadius で細い河川ラインもクリック/ホバーしやすくする。
//
// TASK-36: 上記の pickingRadius は「カーソル直下に何も無い場合」の近傍探索
// にしか効かない。本アプリは全面を powers（GeoJsonLayer）が覆うため、河川
// ライン（描画幅 2px）の外側では常に距離 0 の powers が picking に勝ち、
// カーソルが河川の中心線から数 px ずれるだけで河川を拾えなくなる（実測:
// |d|≤2px 命中 / |d|≥4px ミス）。これを解消するため、クリック時のみ
// handlePickClick 内で overlay.pickMultipleObjects により半径内の複数候補を
// 取得し、picking.ts の resolveClickPick（PICKING_PRIORITY 準拠）で選び直す。
// ホバー（handlePickHover）の picking 方式自体は変更しない: pickMultipleObjects
// は mousemove 毎に呼ぶには高コストなため、ホバーは従来どおり Deck onHover の
// 単一結果に委ねる（河川優先の picking 補正はクリックに限定する設計判断）。
// TASK-42: 単一結果が rivers であればその河川名を hoveredRiverName とし、
// 中間強調（riverLineColor/riverLineWidth の hovered 引数）に反映する。
//
// TASK-82: 上の「ホバーは直下 pick のみ」という設計は維持したまま、都市の
// ホバー判定範囲だけを cities-hit（透明・半径 CITY_HIT_RADIUS_PX の
// ScatterplotLayer）で広げる。ホバー経路に pickMultipleObjects を足さずに
// 判定範囲を広げられるため TASK-36 のコスト設計と両立し、クリック側の実効
// 範囲（cities.ts CITY_PICK_TOLERANCE_PX）とも一致する。
const overlay = new MapboxOverlay({
  interleaved: true,
  layers: [],
  pickingRadius: PICKING_RADIUS_PX,
  onHover: handlePickHover,
  onClick: handlePickClick,
});

/**
 * ラベル専用のオーバーレイ（TASK-77）。地図 canvas の上に重ねる deck 専用
 * canvas（overlaid モード）で、コンテナは pointer-events: none のため地図の
 * ドラッグ・ズーム操作を妨げない。
 *
 * interleaved にしない理由: 勢力ポリゴンを水面より下へ回す beforeId により
 * interleaved のレイヤーグループが 2 つに分かれると、先に描画されるグループの
 * パスが CollisionFilterExtension の衝突マップをラベル抜きで描き直し、ラベルが
 * 全滅する（詳細と検証結果は layer_stack.ts の OVERLAID_LAYER_IDS）。
 *
 * picking・イベント処理はこのオーバーレイに一切持たせない（ラベル 3 層は
 * pickable: false で PICKING_PRIORITY にも含まれないため、ホバー/クリックの
 * 挙動は overlay 側だけで従来どおり完結する）。
 */
const labelOverlay = new MapboxOverlay({
  interleaved: false,
  layers: [],
});

/**
 * 中世フランス諸侯領オーバーレイの境界線色（TASK-71 AC #1）。ラベル文字色
 * （labels.ts FIEF_LABEL_COLOR）と同系の藍紫。base 勢力ポリゴンの白境界
 * （powers.ts LINE_COLOR）と明確に異なる色にすることで、「フランス王国の内側に
 * 重なった諸侯領の区画」であることが塗り分けとは独立に読み取れる。塗り自体は
 * base と同じ colors.json 由来（諸侯ごとに決定的な独立色）で、alpha も共通の
 * FILL_ALPHA のため、下のベースマップ・France ポリゴンが透けて見える。
 */
const FIEF_LINE_COLOR: Rgba = [
  FIEF_LABEL_COLOR[0],
  FIEF_LABEL_COLOR[1],
  FIEF_LABEL_COLOR[2],
  220,
];

/** 諸侯領境界線の太さ（px）。base の勢力境界（1px）より少し太く、区画を際立たせる */
const FIEF_LINE_WIDTH_PX = 1.5;

/**
 * 現在の MapLibre スタイルのレイヤー ID 列を返す（TASK-77）。
 *
 * beforeId は実在するレイヤー ID でなければならない（存在しない ID を渡すと
 * MapLibre は例外ではなく error イベントを出してレイヤー追加を諦め、対象の
 * deck レイヤーが無言で描画されなくなる。詳細は layer_stack.ts）。判定は
 * 「起動時にビルドしたスタイル」ではなく常に現在のスタイルに対して行い、
 * OpenFreeMap へのフォールバック後（handleBasemapError）でも実態に追従させる。
 * スタイル未読込・差し替え中は空配列を返し、beforeId なしの従来描画順にする。
 *
 * TASK-80: getStyle().layers ではなく getLayersOrder() を使う。getStyle() は
 * スタイル仕様として直列化できるレイヤーだけを返すため、deck.gl（interleaved）が
 * 追加する custom レイヤー（powers / france-fiefs / hre-powers …）が現れず、
 * 「概略境界が政治ポリゴンの塗りより上に居るか」を判定できない
 * （ヘッドレス確認で powers が getStyle().layers に出ないことを実測）。
 * getLayersOrder() は custom を含む実際の描画順を返す（maplibre-gl 4.7.1）。
 */
function currentStyleLayerIds(): string[] {
  try {
    return map.getLayersOrder?.() ??
      map.getStyle()?.layers?.map((layer) => layer.id) ?? [];
  } catch {
    return [];
  }
}

/**
 * 指定年代の FeatureCollection から GeoJsonLayer を 1 枚生成する。
 * data 以外のプロパティは全年代で不変。updateTriggers に year を渡し、
 * 色関数の再評価を促す（colors 読み込み前後でも齟齬が出ないようにする）。
 * powers / hre-powers / france-fiefs の 3 枚で共用し、id と境界線の見た目
 * （lineColor / lineWidth）以外は同一の挙動にする（TASK-19、TASK-71）。
 *
 * TASK-77: 3 枚とも beforeId（underWaterBeforeId）でベースマップの水面
 * ポリゴンの下へ差し込み、海岸線の解像度差による海上へのはみ出しを水面に
 * 覆わせて隠す。水面より上に残す河川・都市・ラベルはこの builder を通らない
 * ため、対象は構造的に政治ポリゴンの 3 枚だけになる。
 */
function buildPowerLayer(
  id: string,
  year: number,
  data: FeatureCollection,
  // TASK-110: 定数だけでなく feature 単位のアクセサも受ける。Cliopatria 由来の
  // レイヤーは仏諸侯領と帝国領邦を同居させるため、境界線の記号（藍紫 = 諸侯領の
  // 区画 / 白 = base と同じ線）を feature ごとに選ぶ必要がある。
  lineColor: Rgba | ((feature: Feature) => Rgba) = LINE_COLOR,
  lineWidth: number = LINE_WIDTH_PX,
  stroked: boolean = true,
): GeoJsonLayer {
  return new GeoJsonLayer({
    id,
    data,
    // TASK-77: 水面ポリゴンの直下へ差し込む（interleaved 前提。水面レイヤーが
    // 無いスタイルでは undefined = 従来どおり最前面グループへフォールバック）
    beforeId: underWaterBeforeId(id, currentStyleLayerIds()),
    // AC #3: ホバー/クリックを有効化（ツールチップ UI は TASK-7）
    pickable: true,
    // TASK-78: powers は諸侯領オーバーレイ対象年のみ stroke を止め、境界線を
    // base-outlines 層（諸侯領の内側を除いた輪郭）に委ねる。塗り・picking は不変。
    stroked,
    filled: true,
    // AC #2: 塗り色は colors.json 参照・opacity 0.5 相当（alpha はカラーに内包）
    // TASK-90: ホバー/クリック中の勢力キー（飛び地含む全 feature）だけは
    // アクティブ色へ差し替える（判定は power_highlight.ts の純粋関数）
    getFillColor: (f: Feature) =>
      powerFillColor(
        f.properties,
        colors,
        powerHighlight.selected(),
        powerHighlight.hovered(),
      ),
    // AC #2: 白系の境界線（TASK-71: フランス諸侯領のみ藍紫の少し太い線）
    getLineColor: lineColor,
    lineWidthUnits: "pixels",
    getLineWidth: lineWidth,
    // 塗りの alpha はカラー側で表現するため、レイヤー opacity は等倍にする
    opacity: 1,
    // TASK-90: 強調キー（選択・ホバー）も accessor の入力なので trigger に足す。
    // 足さないと deck.gl が getFillColor を再評価せず、色が変わらない。
    updateTriggers: {
      getFillColor: [
        year,
        powerHighlight.selected(),
        powerHighlight.hovered(),
      ],
    },
    // AC #5: 年代切替時に塗り色を数百 ms かけて補間し、ポリゴンをフェードさせる。
    // 同一 layer id を保つため deck.gl が差分更新し、getFillColor の遷移が発火する。
    // TASK-90: 同じ accessor に強調の色変化も乗るため、遷移時間は再構築の要因で
    // 切り替える（年代切替 400ms / 強調 HIGHLIGHT_FILL_TRANSITION_MS）。年代
    // フェードの 400ms をホバーへ流用すると色の追従が鈍く見える。
    transitions: { getFillColor: { duration: fillTransitionMs } },
    // ホバー/クリックの表示処理は Deck レベルの handlePickHover / handlePickClick
    // に集約する（TASK-24。per-layer に分けると rivers との発火順レースになる）
  });
}

/**
 * picking 結果からツールチップ/パネル用の表示ラベルを整形する（TASK-24）。
 * - rivers: 河川名（name-ja.json 適用。未登録は英語のまま）
 * - cities: 都市名（TASK-27。name-ja.json 適用。未登録は英語のまま）
 * - powers / hre-powers: 勢力ラベル（displayLabel。宗主国込み表記）
 * - それ以外（picking なし・ラベル系レイヤー）は null
 *
 * TASK-29: 引数の info は Deck レベル onHover/onClick が渡す単一の picking
 * 結果で、deck.gl は最前面のレイヤーを返す。renderLayers が描画順を
 * PICKING_PRIORITY の逆順（優先が高いほど上）から導出しているため、
 * ホバーでは「単一 pick = PICKING_PRIORITY の最優先候補」が概ね成立する。
 * ただし河川ラインは描画幅が細く、カーソル直下ピクセルには常に powers
 * ポリゴンが存在するため、河川に対しては単一 pick だけでは優先が効かない
 * （TASK-36）。クリックでは handlePickClick が resolveClickPick で選び直した
 * info を渡すため、この関数自体は info の由来（単一 pick か選び直し後か）を
 * 意識しない。
 */
function pickedLabel(info: PickingInfo): string | null {
  const layerId = info.layer?.id;
  if (info.object === undefined || layerId === undefined) return null;
  // TASK-100: 山岳は年代非依存の地形。ラベル整形（mountainPickLabel /
  // peakPickLabel）は年を引数に取らない純粋関数なので、年代を切り替えても
  // 同じ pick からは必ず同じ文字列が出る（AC #5）。
  if (isMountainPickLayerId(layerId)) {
    return mountainPickLabel(info.object as MountainLabelDatum, nameJa);
  }
  if (isPeakPickLayerId(layerId)) {
    // peaks（可視 ▲）と peaks-hit（透明判定円）はデータが同一（PeakMarkerDatum）
    // なので、どちらの pick でも同じ経路で「名称 標高m」を出せる
    return peakPickLabel(info.object as PeakMarkerDatum, nameJa);
  }
  if (isCityPickLayerId(layerId)) {
    // 都市は cityDisplayName で解決（Venice 等の勢力名衝突キーは都市訳を優先）
    // TASK-82: cities（可視ドット）と cities-hit（透明判定円）はデータが同一
    // （CityMarkerDatum）なので、どちらの pick でも同じ経路で表示できる
    return cityDisplayName((info.object as CityMarkerDatum).name, nameJa);
  }
  const feature = info.object as Feature;
  if (isRiversPickLayerId(layerId)) {
    const name = riverNameFor(feature.properties);
    return name === null ? null : nameJa[name] ?? name;
  }
  if (
    layerId === POWER_LAYER_ID || layerId === HRE_LAYER_ID ||
    layerId === FRANCE_FIEF_LAYER_ID || layerId === ITALY_FIEF_LAYER_ID ||
    layerId === CLIOPATRIA_FIEF_LAYER_ID
  ) {
    // TASK-71/96: フランス諸侯領・イタリア諸侯領は SUBJECTO を持たないため
    // displayLabel は NAME の日本語表記（称号付き）をそのまま返す
    // （宗主国込み表記にはならない）
    // TASK-110: Cliopatria 由来の領邦は SUBJECTO を持つものがあり、その場合は
    // HRE 領邦と同じく「宗主国込み」の表記になる（displayLabel の既存規則）
    return displayLabel(feature.properties, overrides.renames, nameJa);
  }
  return null;
}

/**
 * FeatureCollection / cities.json が持つ非標準トップレベルの `metadata` を
 * 型を緩めて取り出す（TASK-109）。GeoJSON の型定義に `metadata` は無く、
 * cities.json は GeoJSON ですらないため、読み出しはここ 1 箇所に閉じ込める。
 * データが未ロード・metadata 未付与ならそのまま undefined になり、
 * 呼び出し側（sourceLines）が空の出典行に倒す。
 */
function collectionMetadata(data: unknown): unknown {
  return (data as { metadata?: unknown } | null | undefined)?.metadata;
}

/**
 * picking 結果から、その feature が属するデータセットの `metadata` を解決する
 * （TASK-109）。pickedLabel と同じレイヤー ID の分岐で、ラベルと出典が必ず
 * 同じデータ由来になるようにする。metadata の中身は解釈せず、整形は info.ts の
 * sourceLines（純粋関数）に委ねる。
 *
 * 対象外レイヤー・picking なし・未ロードは undefined = 出典欄を出さない。
 */
function pickedMetadata(info: PickingInfo): unknown {
  const layerId = info.layer?.id;
  if (layerId === undefined) return undefined;
  if (isMountainPickLayerId(layerId)) return collectionMetadata(mountainsData);
  if (isPeakPickLayerId(layerId)) return collectionMetadata(peaksData);
  if (isCityPickLayerId(layerId)) return collectionMetadata(citiesData);
  if (isRiversPickLayerId(layerId)) return collectionMetadata(riversData);
  if (currentView === null) return undefined;
  if (layerId === POWER_LAYER_ID) {
    // TASK-92 の派生 base（baseFill）を塗っている年は、picking もその FC を
    // 返す。派生物は base から切り出しただけで出典は同じなので、派生側に
    // metadata が無ければ base のものへフォールバックする。
    const fill = powerFillDataFor(currentView.base, currentView.baseFill);
    return collectionMetadata(fill) ?? collectionMetadata(currentView.base);
  }
  if (layerId === HRE_LAYER_ID) return collectionMetadata(currentView.hre);
  if (layerId === FRANCE_FIEF_LAYER_ID) {
    return collectionMetadata(currentView.fiefs);
  }
  if (layerId === ITALY_FIEF_LAYER_ID) {
    return collectionMetadata(currentView.italyFiefs);
  }
  // TASK-110: Cliopatria 由来の領邦だけが別出典（CC BY 4.0）。レイヤーを
  // 分けてあるので、この 1 行で AC #3（クリックで出典が出て OHM 由来と
  // 区別できる）が成立する。metadata の中身は解釈せず sourceLines に委ねる。
  if (layerId === CLIOPATRIA_FIEF_LAYER_ID) {
    return collectionMetadata(currentView.cliopatriaFiefs);
  }
  return undefined;
}

/**
 * Deck レベルのホバー処理（TASK-24 AC #3）。最前面の picking 結果 1 件だけを
 * 受け取るため、河川ライン上では河川名、勢力ポリゴン上では勢力ラベル、
 * どちらも無ければ非表示、が一意に決まる（rivers が powers のホバーを阻害しない）。
 *
 * TASK-69: 河川ホバー時はカーソル追従ツールチップ（ここ）と地図上の河川名
 * ラベル（buildRiverLabelLayer）が同時に出る。ツールチップは残す方針とした:
 * 地図上ラベルのアンカーは川の中点（rivers.ts riverLabelAnchors）で、ホバー
 * 位置から遠い・ビューポート外のこともあり、それ単独ではホバーの即時
 * フィードバックにならないため。ツールチップ = カーソル直下の即応表示、
 * 地図ラベル = 川そのものへの注記（選択時は解除まで残る）と役割が異なり、
 * 勢力・都市のホバー挙動（ツールチップ）とも一貫する。
 */
function handlePickHover(info: PickingInfo): void {
  const label = pickedLabel(info);
  if (label !== null) showTooltip(label, info.x, info.y);
  else hideTooltip();
  // TASK-30 / TASK-94: 勢力（宗主・封臣のいずれ）のホバーでその勢力圏の外枠を
  // 出し、ホバー解除（picking なし・対象外レイヤー）で通常表示へ戻す
  applyExtentKey(extentKeyFromPick(info));
  // TASK-90: 勢力・領邦のホバー強調。河川・都市・何も無い場所のホバーでは
  // キーが null になり強調が解除される（AC #2/#6）。判定経路は
  // extentKeyFromPick と同型（同じ info から純粋関数でキーを解決する）。
  powerHighlight.hover(powerHighlightKeyFromPick(info));
  // TASK-42: 河川ホバー中の中間強調。pick が rivers 以外・picking なしの場合は
  // null（通常表示）に戻す。ホバーの picking 方式自体（直下 pick）は変更しない
  // （TASK-36 の半径補正はクリック限定という設計判断を維持）。
  applyRiverHover(
    isRiversPickLayerId(info.layer?.id) && info.object !== undefined
      ? riverNameFor((info.object as Feature).properties)
      : null,
  );
  // TASK-100: 山岳のホバー強調（山脈は輪郭・山峰は記号）。河川と同じく
  // 「対象外の pick・picking なし」では null に倒れて強調が解除される。
  applyTerrainHover(mountainNameFromPick(info), peakNameFromPick(info));
}

/**
 * picking 結果から山脈名（英語の元名）を解決する（TASK-100）。
 * 対象外レイヤー・picking なしは null。extentKeyFromPick / powerHighlightKeyFromPick
 * と同型で、ホバー（直下 pick）とクリック（resolveClickInfo で選び直した pick）が
 * 同じ経路を通ることを保証する。
 */
function mountainNameFromPick(info: PickingInfo): string | null {
  if (info.object === undefined || !isMountainPickLayerId(info.layer?.id)) {
    return null;
  }
  return (info.object as MountainLabelDatum).name;
}

/** picking 結果から山峰名（英語の元名）を解決する（TASK-100） */
function peakNameFromPick(info: PickingInfo): string | null {
  if (info.object === undefined || !isPeakPickLayerId(info.layer?.id)) {
    return null;
  }
  return (info.object as PeakMarkerDatum).name;
}

/**
 * picking 結果から、外枠を出すべき宗主キーを解決する（TASK-94 / TASK-120）。
 * 判定本体は suzerain_extent.ts の suzerainExtentKey（純粋関数）。都市マーカーの
 * picking 結果は GeoJSON Feature ではないが、suzerainExtentKey がレイヤー ID
 * を先に見るため feature でなくても安全に null になる。
 *
 * TASK-120: 諸侯領オーバーレイは「封土を包含する base 勢力」で宗主キーを
 * 決めるため base も渡す。包含判定は polylabel（labelAnchorFor）と
 * point-in-polygon で mousemove 1 回あたり 1ms 未満だが、同じ封土の上を
 * 動く間の再計算まで避けるため memoizeLatest で 1 スロットだけ覚える
 * （TASK-50 の規律。picking 結果の object は data 配列の feature そのもので
 * 参照が安定しているため、同一封土の連続ホバーは必ずキャッシュに当たる）。
 */
const memoizedExtentKey = memoizeLatest(suzerainExtentKey);

function extentKeyFromPick(info: PickingInfo): string | null {
  if (info.object === undefined || info.layer === null) return null;
  return memoizedExtentKey(
    info.layer.id,
    info.object as Feature,
    currentView?.base ?? EMPTY_FEATURE_COLLECTION,
    overrides,
  );
}

/**
 * picking 結果から政治ポリゴンの強調キーを解決する（TASK-90）。
 * 判定本体は power_highlight.ts の powerHighlightKey（純粋関数）。
 * extentKeyFromPick と同型にし、ホバー（直下 pick）とクリック
 * （resolveClickInfo で選び直した pick）が同じ経路を通ることを保証する。
 * 都市マーカーの picking 結果は GeoJSON Feature ではないが、
 * powerHighlightKey がレイヤー ID を先に見るため安全に null になる。
 */
function powerHighlightKeyFromPick(info: PickingInfo): string | null {
  if (info.object === undefined || info.layer === null) return null;
  return powerHighlightKey(info.layer.id, (info.object as Feature).properties);
}

/**
 * 勢力圏の外枠の対象（宗主キー）を更新し、変化があればレイヤーを再構築する。
 * キー単位の変化検知なので、同じ宗主の別 feature へホバーが移っても
 * renderLayers は呼ばれない（TASK-50 の規律）。
 */
function applyExtentKey(next: string | null): void {
  if (next === extentKey) return;
  extentKey = next;
  renderLayers();
}

/**
 * pickMultipleObjects で近傍候補を取得する際の最大件数（depth）（TASK-36）。
 * deck.gl デフォルトの 10 より絞り、余分な GPU 読み戻しコストを抑える。
 *
 * TASK-96: pickable 層の数（PICKING_PRIORITY.length）そのものを使う。
 * 3 系統の領邦オーバーレイ（hre-powers / france-fiefs / italy-fiefs）は
 * scripts/build-fief-flat.ts が幾何的に排他化するため、同一ピクセルへ実際に
 * 重なるのは高々 6 層だが、この定数を層数から導いておけば層を足すたびに
 * 「上限に収まっているか」を数え直さずに済む（TASK-71 以来この見積もりは
 * 2 度陳腐化した）。
 */
const CLICK_PICK_DEPTH = PICKING_PRIORITY.length;

/**
 * Deck レベルの単一 picking 結果を、必要な場合のみ半径内の複数候補で選び
 * 直す（TASK-36）。単一 pick が既に rivers ならそのまま使う（再ピック不要）。
 * 単一 pick が rivers 以外（powers 等）または何も無い場合にのみ
 * overlay.pickMultipleObjects で半径内の候補を集め、resolveClickPick
 * （PICKING_PRIORITY 準拠）で選び直す。これにより河川の描画幅（2px）の外側
 * でも pickingRadius 分の近傍探索が河川に対して機能するようになる。
 * ホバーでは呼ばない（mousemove 毎の pickMultipleObjects は高コストなため、
 * この補正はクリックに限定する設計判断。TASK-36）。
 *
 * TASK-51: この PICKING_RADIUS_PX（picking.ts、near-cursor 再ピック半径）と
 * rivers.ts の透明ヒットライン半幅（RIVER_HIT_LINE_WIDTH_PX / 2）が合成され、
 * 河川クリックの実効許容範囲になる（rivers.ts RIVER_CLICK_TOLERANCE_PX を参照）。
 *
 * TASK-82: 都市側は逆に合成させない。cities-hit（透明判定円）は
 * picking.ts isNearCursorRepickable で再ピック候補から除外されるため、
 * 都市の実効判定範囲はホバー・クリックとも cities.ts CITY_PICK_TOLERANCE_PX
 * （= CITY_HIT_RADIUS_PX）で一致する。直下 pick が cities/cities-hit なら
 * isDirectPickFinal でそのまま確定する（再ピックへ落ちない）。
 */
function resolveClickInfo(info: PickingInfo): PickingInfo {
  if (isDirectPickFinal(info.layer?.id)) return info;
  const candidates = overlay.pickMultipleObjects({
    x: info.x,
    y: info.y,
    radius: PICKING_RADIUS_PX,
    depth: CLICK_PICK_DEPTH,
  });
  return resolveClickPick(candidates) ?? info;
}

/**
 * Deck レベルのクリック処理（TASK-24 AC #2/#3、TASK-36）。
 * - 河川ライン: 選択をトグルし、選択時は情報パネルに河川名を表示
 * - 勢力ポリゴン: 従来どおり勢力ラベルをパネル表示し、河川選択は解除
 * - 何も無い場所: 河川選択を解除（Deck の onClick は picking なしでも
 *   layer: null の info で呼ばれることを @deck.gl/core の実装で確認済み）
 * TASK-36: Deck onClick が渡す単一 info をそのまま使わず、まず
 * resolveClickInfo で半径内の河川優先の選び直しを行う。
 */
function handlePickClick(rawInfo: PickingInfo): void {
  const info = resolveClickInfo(rawInfo);
  // TASK-30 / TASK-94: クリックでも勢力圏の外枠を反映する（デスクトップでは
  // ホバー経路で既に反映済みだが、ホバーの無いタッチ操作でも成立させる。
  // 河川・都市・空白のクリックはキー null に倒れて外枠が消える）
  applyExtentKey(extentKeyFromPick(info));
  // TASK-90: 勢力・領邦のクリック強調（ホバーの無いタッチ操作でも成立させる）。
  // 保持・解除規則は power_highlight.ts togglePowerSelection（河川の選択トグルと
  // 同一規則）: 同一対象の再クリックで解除・別対象で移動・河川/都市/空クリック
  // （キー null）で解除。年代切替では yearSwitcher の applyFn が clear する。
  powerHighlight.click(powerHighlightKeyFromPick(info));
  // TASK-100: 山岳のクリック強調（ホバーの無いタッチ操作でも成立させる）。
  // 保持・解除規則は河川・勢力と同一（toggleMountainSelection /
  // togglePeakSelection）。山岳以外のクリックはキーが null になり解除される。
  applyTerrainSelection(
    toggleMountainSelection(selectedMountainName, mountainNameFromPick(info)),
    togglePeakSelection(selectedPeakName, peakNameFromPick(info)),
  );
  const layerId = info.layer?.id;
  if (isMountainPickLayerId(layerId) || isPeakPickLayerId(layerId)) {
    // 山岳のクリックは河川の選択を解除する（都市・勢力のクリックと同じ扱い）。
    // パネルは「選択が残っているとき」だけ更新する: 同じ対象の再クリックは
    // 強調を解除する操作なので、そこでパネルだけ出続けると状態が食い違う
    // （河川と同一規則）。
    applyRiverSelection(null);
    if (selectedMountainName !== null || selectedPeakName !== null) {
      const label = pickedLabel(info);
      if (label !== null) {
        showInfoPanel(label, sourceLines(pickedMetadata(info)));
      }
    }
    return;
  }
  if (isRiversPickLayerId(layerId) && info.object !== undefined) {
    const name = riverNameFor((info.object as Feature).properties);
    applyRiverSelection(toggleRiverSelection(selectedRiverName, name));
    if (selectedRiverName !== null) {
      const label = pickedLabel(info);
      if (label !== null) {
        showInfoPanel(label, sourceLines(pickedMetadata(info)));
      }
    }
    return;
  }
  // 河川以外（都市マーカー・勢力ポリゴン・空白）のクリックは河川選択を解除し、
  // picking があれば整形済みラベル（都市名/勢力名）をパネルへ出す（TASK-27）
  applyRiverSelection(null);
  const label = pickedLabel(info);
  if (label !== null) showInfoPanel(label, sourceLines(pickedMetadata(info)));
}

/** 河川の選択状態を更新し、変化があればレイヤーを再構築して反映する */
function applyRiverSelection(next: string | null): void {
  if (next === selectedRiverName) return;
  selectedRiverName = next;
  renderLayers();
}

/**
 * 河川のホバー状態を更新し、変化があればレイヤーを再構築して反映する
 * （TASK-42）。毎 mousemove で呼ばれるため、値が変化しない限り
 * renderLayers() を呼ばない（無駄な再構築を避ける）。
 */
function applyRiverHover(next: string | null): void {
  if (next === hoveredRiverName) return;
  hoveredRiverName = next;
  renderLayers();
}

/**
 * 山脈・山峰のホバー状態をまとめて更新し、変化があれば 1 度だけレイヤーを
 * 再構築する（TASK-100）。山脈と山峰を 1 本の関数で扱うのは、両者が
 * 同時に変化する（山峰から外れて山脈へ入る等）ときに renderLayers を
 * 2 度呼ばないため。毎 mousemove で呼ばれるので、値が変化しない限り
 * renderLayers() を呼ばない（applyRiverHover と同じ変化検知。TASK-50 の規律）。
 */
function applyTerrainHover(
  nextMountain: string | null,
  nextPeak: string | null,
): void {
  if (nextMountain === hoveredMountainName && nextPeak === hoveredPeakName) {
    return;
  }
  hoveredMountainName = nextMountain;
  hoveredPeakName = nextPeak;
  renderLayers();
}

/** 山脈・山峰の選択状態をまとめて更新する（変化時のみ再構築。TASK-100） */
function applyTerrainSelection(
  nextMountain: string | null,
  nextPeak: string | null,
): void {
  if (nextMountain === selectedMountainName && nextPeak === selectedPeakName) {
    return;
  }
  selectedMountainName = nextMountain;
  selectedPeakName = nextPeak;
  renderLayers();
}

/**
 * rivers（表示ライン）と rivers-hit（透明ヒットライン）で共通の GeoJsonLayer
 * base props（TASK-53）。両層は同一データをライン描画する層で、picking 可否や
 * ラインの丸め方も揃える。riversData は loadRivers がモジュール変数を差し替える
 * ため、モジュール定数に data を焼き込むと初期の空 FC を参照し続けてしまう。
 * 呼び出し時に評価する関数にして常に最新の riversData を返す（挙動不変）。
 */
function riversLayerBaseProps() {
  return {
    data: riversData,
    pickable: true,
    stroked: false,
    filled: false,
    lineWidthUnits: "pixels",
    lineCapRounded: true,
    lineJointRounded: true,
  } as const;
}

/**
 * 主要河川ラインの GeoJsonLayer を生成する（TASK-24）。
 * 色・幅は rivers.ts の純粋関数で決め、選択中の河川全体（同名 feature）を
 * 太く濃色で強調する。TASK-42: ホバー中（未選択）の河川は中間強調にする
 * （選択 > ホバー > 通常の優先度は rivers.ts 側で解決）。選択・ホバーの
 * いずれも updateTriggers で再評価させる。
 */
function buildRiversLineLayer(): GeoJsonLayer {
  return new GeoJsonLayer({
    ...riversLayerBaseProps(),
    id: RIVERS_LAYER_ID,
    getLineColor: (f: Feature) =>
      riverLineColor(
        riverNameFor(f.properties),
        selectedRiverName,
        hoveredRiverName,
      ),
    getLineWidth: (f: Feature) =>
      riverLineWidth(
        riverNameFor(f.properties),
        selectedRiverName,
        hoveredRiverName,
      ),
    lineWidthMinPixels: 1,
    updateTriggers: {
      getLineColor: [selectedRiverName, hoveredRiverName],
      getLineWidth: [selectedRiverName, hoveredRiverName],
    },
  });
}

/**
 * 国名（勢力）・都市名・河川名のラベル TextLayer で共通の base props
 * （TASK-65、TASK-72 で改訂）。フォント・halo（SDF アウトライン）・衝突制御を
 * 1 箇所に集約し、builder 間での値ドリフト（TASK-54 の中間版/最終版の混在で
 * 実際に発生）を防ぐ。
 * - 描画スタイル（labels.ts labelTextStyleProps）: フォント + クリーム halo。
 *   TASK-54 の半透明背景パネルは TASK-72 で撤去した（背景の白枠が地図の
 *   情報を隠すため）。可読性は halo（LABEL_OUTLINE_WIDTH / _COLOR）に一本化。
 * - 衝突制御: 全層とも CollisionFilterExtension の同一衝突空間に参加させ、
 *   判定時はラベルを COLLISION_SIZE_SCALE 倍サイズとして扱う（実表示より
 *   広い余白を確保し、初期ズーム z4 や密集地帯での判読不能な重なりを防ぐ。
 *   TASK-54 で 2 → 2.6、TASK-72 で背景パネル padding の喪失を補って 2.8）。
 *   表示優先は各層のデータが持つ priority に従う。
 * - TASK-108: 衝突判定の結果（collision_fade）は 0/1 ではなく連続値なので、
 *   負けかけたラベルが半透明のまま描かれ続ける。labelCollisionExtensions が
 *   返す 2 つ目の extension でそれを二値化し、「読める」か「出ない」かの
 *   二択に倒す（順序に意味があるため必ずこの関数から組み立てる）。
 *   ここが唯一の extensions 指定箇所で、4 つの TextLayer builder（河川名・
 *   山脈名・都市名・勢力名（HRE 領邦名/仏諸侯領名を含む））が全て spread する。
 * 層固有の props（id・data・getText/getPosition・サイズ・文字色・
 * characterSet・getPixelOffset・updateTriggers・pickable 等）は各 builder に
 * 残す。
 */
function labelLayerBaseProps() {
  return {
    sizeUnits: "pixels" as const,
    ...labelTextStyleProps(),
    extensions: labelCollisionExtensions(),
    collisionTestProps: { sizeScale: COLLISION_SIZE_SCALE },
    getCollisionPriority: (d: LabelDatum) => d.priority,
  };
}

/**
 * 河川名ラベルのデータ + characterSet をメモ化する（TASK-50）。
 * riversData・nameJa は起動時に一度ロードされたあと year に関わらず不変な
 * ため、hover/selection だけを変える renderLayers 呼び出しでは引数の参照が
 * 前回と同じになり、riverLabelAnchors と characterSetFrom の再計算を
 * スキップできる。
 */
const memoizedRiverLabelData = memoizeLatest(
  (fc: FeatureCollection, ja: Record<string, string>) => {
    const data = riverLabelAnchors(fc, ja);
    return { data, characterSet: characterSetFrom(data.map((d) => d.text)) };
  },
);

/**
 * 河川名ラベルの TextLayer を生成する（TASK-24 AC #1、TASK-69）。
 * アンカーは最長 LineString の中点（rivers.ts riverLabelAnchors）。勢力ラベル
 * より小さめの水色系文字 + 白 halo で「水系の注記」に見えるようにし、
 * CollisionFilterExtension（勢力ラベルと同一衝突空間）でライン長由来の
 * priority により長い川を優先表示する。pickable: false でライン・ポリゴンの
 * picking を妨げない。
 *
 * TASK-69: 常時表示をやめ、ホバー中・クリック選択中の河川だけを表示する。
 * 表示対象の決定は純粋関数 filterVisibleRiverLabels に委ね、ここでは
 * hovered/selected を渡すだけにする。アンカー生成（memoizedRiverLabelData）は
 * 年代・hover/selection 非依存のまま全河川分を 1 度だけ行い、hover 連続移動で
 * 再計算が走らないようにする（TASK-50 非退行）。characterSet も全河川分の
 * メモ化結果（同一参照）を渡し続け、表示対象が変わってもフォントアトラスの
 * 再生成が起きないようにする。
 */
function buildRiverLabelLayer(): TextLayer<
  LabelDatum,
  CollisionFilterExtensionProps<LabelDatum>
> {
  const { data: anchors, characterSet } = memoizedRiverLabelData(
    riversData,
    nameJa,
  );
  const data = filterVisibleRiverLabels(
    anchors,
    hoveredRiverName,
    selectedRiverName,
  );
  return new TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>>({
    // フォント・クリーム halo（TASK-72: ライン/ワール/レク川合流部の密集や
    // HRE 外縁の赤境界線との重なり対策。背景パネルは撤去済み）・衝突制御は
    // 共通 base props
    ...labelLayerBaseProps(),
    id: RIVER_LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => d.text,
    getPosition: (d) => d.position,
    // 勢力ラベル（POWER_LABEL_SIZE_PX）より控えめなサイズ・濃い水色（#0277bd）+ 白 halo
    getSize: RIVER_LABEL_SIZE_PX,
    getColor: RIVER_LABEL_COLOR,
    // 日本語名（ライン川 等）のグリフもラベル文字列から自動生成する
    characterSet,
  });
}

/**
 * 山脈名ラベルのデータ + characterSet をメモ化する（TASK-97）。
 * mountainsData・nameJa は起動時に一度ロードされたあと年代・ズーム・
 * hover/selection に関わらず不変なので、polylabel によるアンカー生成は
 * 起動後 1 度だけ走り、以降は同じ参照が返る（TASK-50 のメモ化方針）。
 */
const memoizedMountainLabelData = memoizeLatest(
  (fc: FeatureCollection, ja: Record<string, string>) => {
    const data = mountainLabelAnchors(fc, ja);
    return { data, characterSet: characterSetFrom(data.map((d) => d.text)) };
  },
);

/**
 * 山脈名ラベルの TextLayer を生成する（TASK-97 AC #1/#2/#3/#4）。
 *
 * 常時表示（河川名のようなホバー限定ではない）にするのは、山脈が年代に依らない
 * 地形で「今どこを見ているか」の手掛かりとして常に有効だから。年代切替では
 * データも表示条件も一切変わらない（AC #4）。表示するのは現在の整数ズーム段
 * （zoomStep）で NE の MIN_LABEL 由来のしきい値を満たすものだけ（AC #2）。
 *
 * 衝突制御は勢力名・都市名・河川名と同一空間で、priority は都市帯より下の
 * 固定帯（mountains.ts）。密集地帯では山脈名が先に間引かれ、勢力名・都市名の
 * 可読性を損なわない（AC #3）。pickable: false でポリゴン・マーカーの picking を
 * 妨げない（ホバー/クリック対象化は TASK-100）。
 */
function buildMountainLabelLayer(): TextLayer<
  MountainLabelDatum,
  CollisionFilterExtensionProps<MountainLabelDatum>
> {
  const { data: anchors, characterSet } = memoizedMountainLabelData(
    mountainsData,
    nameJa,
  );
  const data = filterVisibleMountainLabels(anchors, zoomStep);
  return new TextLayer<
    MountainLabelDatum,
    CollisionFilterExtensionProps<MountainLabelDatum>
  >({
    // フォント・クリーム halo（陰影の濃い山体の上でも輪郭が効く）・衝突制御は
    // 共通 base props
    ...labelLayerBaseProps(),
    id: MOUNTAIN_LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => d.text,
    getPosition: (d) => d.position,
    getSize: MOUNTAIN_LABEL_SIZE_PX,
    getColor: MOUNTAIN_LABEL_COLOR,
    // 日本語名（アルプス山脈 等）のグリフはラベル文字列から自動生成する。
    // 表示対象が変わってもフォントアトラスを作り直さないよう、characterSet は
    // 常に全山脈分（メモ化された同一参照）を渡す（河川ラベルと同じ扱い）
    characterSet,
    updateTriggers: { getText: [zoomStep], getPosition: [zoomStep] },
  });
}

/**
 * 山脈の判定円層に渡すデータをメモ化する（TASK-100）。入力の anchors は
 * memoizedMountainLabelData の安定参照なので、ズーム段が変わらない限り
 * 同じ配列参照が deck.gl へ渡り、hover/selection だけの renderLayers 呼び出しでは
 * ScatterplotLayer の属性再計算が走らない（TASK-50 の方針）。
 */
const memoizedMountainHitData = memoizeLatest(
  (anchors: readonly MountainLabelDatum[], step: number) =>
    mountainHitData(anchors, step),
);

/**
 * 山脈の透明ヒット層（ScatterplotLayer）を生成する（TASK-100 AC #1）。
 * 山脈名ラベルと同じアンカー（labels.ts labelAnchorFor = 山体内部で最も境界から
 * 遠い点）へ、完全透明・MOUNTAIN_HIT_RADIUS_PX の円を置く判定専用レイヤー。
 * 「面をそのまま pickable にしない」理由と半径の根拠は mountains.ts の
 * MOUNTAIN_HIT_LAYER_ID / MOUNTAIN_HIT_RADIUS_PX を参照。
 *
 * data はズーム段でのみ変わり、年代・hover/selection には依存しない
 * （山脈は年代非依存の地形。AC #5）。したがって updateTriggers はズーム段だけ。
 */
function buildMountainHitLayer(): ScatterplotLayer<MountainLabelDatum> {
  const { data: anchors } = memoizedMountainLabelData(mountainsData, nameJa);
  return new ScatterplotLayer<MountainLabelDatum>({
    id: MOUNTAIN_HIT_LAYER_ID,
    data: memoizedMountainHitData(anchors, zoomStep),
    pickable: true,
    getPosition: (d) => d.position,
    radiusUnits: "pixels",
    getRadius: MOUNTAIN_HIT_RADIUS_PX,
    getFillColor: MOUNTAIN_HIT_FILL_COLOR,
    stroked: false,
    updateTriggers: { getPosition: [zoomStep] },
  });
}

/**
 * 山脈の強調輪郭（GeoJsonLayer）を生成する（TASK-100 AC #4）。
 * ホバー/選択中の山脈だけをオリーブの線で囲い、それ以外は完全透明・線幅 0 で
 * 描く（判定は mountains.ts の mountainOutlineColor / mountainOutlineWidth）。
 *
 * 塗り（filled: false）を持たないので、勢力・領邦のアクティブ塗り
 * （power_highlight.ts）と面の表現がぶつからない。pickable: false なので
 * PICKING_PRIORITY 外で、レイヤー順の整合検証では無視される（勢力圏の外枠
 * hre-extent と同じ扱い）。data は年代非依存の mountainsData そのもの。
 */
function buildMountainOutlineLayer(): GeoJsonLayer {
  return new GeoJsonLayer({
    id: MOUNTAIN_OUTLINE_LAYER_ID,
    data: mountainsData,
    pickable: false,
    filled: false,
    stroked: true,
    lineWidthUnits: "pixels",
    lineJointRounded: true,
    getLineColor: (f: Feature) =>
      mountainOutlineColor(
        f.properties,
        selectedMountainName,
        hoveredMountainName,
      ),
    getLineWidth: (f: Feature) =>
      mountainOutlineWidth(
        f.properties,
        selectedMountainName,
        hoveredMountainName,
      ),
    updateTriggers: {
      getLineColor: [selectedMountainName, hoveredMountainName],
      getLineWidth: [selectedMountainName, hoveredMountainName],
    },
  });
}

/**
 * ズームフィルタ済みの表示山峰をメモ化する（TASK-99）。peaksData は起動時に
 * 一度ロードされたあと年代・hover/selection に関わらず不変なので、
 * peakEntries（検証付き変換）は起動後 1 度だけ走る。ズーム段が変わったときだけ
 * filterVisiblePeaks が新しい配列を返し、下流（マーカー/ラベル）のメモ化キーに
 * なる（cities.ts の memoizedVisibleCityEntries と同型）。
 */
const memoizedPeakEntries = memoizeLatest(
  (fc: FeatureCollection) => peakEntries(fc),
);
const memoizedVisiblePeaks = memoizeLatest(
  (entries: readonly PeakEntry[], zoomStep: number) =>
    filterVisiblePeaks(entries, zoomStep),
);

/** 山峰マーカーデータをメモ化する（入力は memoizedVisiblePeaks の安定参照） */
const memoizedPeakMarkerData = memoizeLatest(
  (entries: readonly PeakEntry[]) => buildPeakMarkerData(entries),
);

/**
 * 山峰名ラベルのデータをメモ化する（TASK-99）。入力はズームフィルタ済みの
 * 安定参照なので、hover/selection だけの renderLayers 呼び出しでは同じ配列
 * 参照が deck.gl へ渡り続ける（TASK-50 の方針）。
 */
const memoizedPeakLabelData = memoizeLatest(
  (entries: readonly PeakEntry[], ja: Record<string, string>) =>
    buildPeakLabelData(entries, ja),
);

/**
 * 山峰名ラベルの characterSet をメモ化する（TASK-99）。「現在のズームで表示中の
 * 山峰」ではなく**全山峰**の名称のみ版・標高併記版の両方から作る
 * （peakLabelTexts）。ズーム段が変わって表示件数やテキストの内容（標高の併記）が
 * 変わってもフォントアトラスを作り直さないための契約で、河川・山脈ラベルと
 * 同じ扱い。
 */
const memoizedPeakCharacterSet = memoizeLatest(
  (entries: readonly PeakEntry[], ja: Record<string, string>) =>
    characterSetFrom(peakLabelTexts(buildPeakLabelData(entries, ja))),
);

/**
 * 主要山峰マーカーの層を生成する（TASK-99 AC #1/#2/#4/#5）。
 *
 * 都市マーカー（ScatterplotLayer の丸ドット）と違い TextLayer に ▲ のグリフを
 * 描かせる。形で都市と区別するための選択で、根拠は peaks.ts の
 * PEAK_MARKER_GLYPH に詳述（deck.gl の ScatterplotLayer は丸しか描けず、
 * PolygonLayer は固定 px の記号を作れず、IconLayer は画像デコードの失敗経路と
 * バンドル増を伴う）。
 *
 * CollisionFilterExtension は**付けない**（labelLayerBaseProps を spread しない
 * のはそのため）。間引きの対象はラベルだけにして、ラベルが競り負けても記号は
 * 残るようにする。表示する山峰はラベル層と同じ filterVisiblePeaks の結果なので、
 * 記号と名前の出し入れは必ず一致する。
 *
 * 年代には一切依存しない（AC #5）。レイヤー順は都市ドットの直下・都市の透明
 * 判定円の直上（renderLayers。PICKING_PRIORITY から導出）で、主題（都市ドット・
 * 河川ライン）を地形の記号が覆わない。
 *
 * TASK-100: pickable: true にし、ホバー/クリックで「名称 標高m」を出す。
 * 可視記号を pickable にしておくことで、隣接する都市の透明判定円
 * （cities-hit、9px）が重なっても「見えている ▲ の直上は必ずその山峰」が
 * レイヤー順だけで保証される（都市ドットと rivers-hit の関係と同じ。TASK-49）。
 * 記号の色とサイズは強調状態で変わる（peaks.ts peakMarkerColor / peakMarkerSize）。
 */
function buildPeakMarkerLayer(): TextLayer<PeakMarkerDatum> {
  const entries = memoizedVisiblePeaks(
    memoizedPeakEntries(peaksData),
    zoomStep,
  );
  return new TextLayer<PeakMarkerDatum>({
    id: PEAK_LAYER_ID,
    data: memoizedPeakMarkerData(entries),
    pickable: true,
    sizeUnits: "pixels",
    // フォント + クリーム halo（陰影・半透明塗りの上でも記号の輪郭が立つ）。
    // 衝突制御は含まない（labelLayerBaseProps ではなく描画スタイルのみ）
    ...labelTextStyleProps(),
    getText: () => PEAK_MARKER_GLYPH,
    getPosition: (d) => d.position,
    getSize: (d) => peakMarkerSize(d, selectedPeakName, hoveredPeakName),
    getColor: (d) => peakMarkerColor(d, selectedPeakName, hoveredPeakName),
    characterSet: [...PEAK_MARKER_CHARACTER_SET],
    updateTriggers: {
      getPosition: [zoomStep],
      getSize: [selectedPeakName, hoveredPeakName],
      getColor: [selectedPeakName, hoveredPeakName],
    },
  });
}

/**
 * 山峰マーカーの透明ヒット層（ScatterplotLayer）を生成する（TASK-100 AC #2）。
 * cities-hit（TASK-82）と同型で、可視記号（▲）と同一データ
 * （memoizedPeakMarkerData の安定参照）を完全透明・PEAK_HIT_RADIUS_PX の円で
 * マーカーの直下に重ねる。
 *
 * これにより、ホバーでもクリックでも「カーソル直下 pick」だけで山峰を拾える
 * （ホバー側に pickMultipleObjects を足さない = TASK-36 のコスト設計を維持）。
 * ▲ のグリフは picking が不透明ピクセルにしか当たらず三角形の上端は 1〜2px しか
 * 幅が無いため、記号だけを pickable にすると狙って外す位置が構造的に残る
 * （根拠は peaks.ts PEAK_HIT_LAYER_ID）。
 */
function buildPeakHitLayer(): ScatterplotLayer<PeakMarkerDatum> {
  const entries = memoizedVisiblePeaks(
    memoizedPeakEntries(peaksData),
    zoomStep,
  );
  return new ScatterplotLayer<PeakMarkerDatum>({
    id: PEAK_HIT_LAYER_ID,
    data: memoizedPeakMarkerData(entries),
    pickable: true,
    getPosition: (d) => d.position,
    radiusUnits: "pixels",
    getRadius: PEAK_HIT_RADIUS_PX,
    getFillColor: PEAK_HIT_FILL_COLOR,
    stroked: false,
    updateTriggers: { getPosition: [zoomStep] },
  });
}

/**
 * 山峰名ラベルの TextLayer を生成する（TASK-99 AC #1/#3/#4/#5）。
 *
 * 衝突制御は勢力名・都市名・河川名・山脈名と同一空間で、priority は山脈帯の
 * 下半分（peaks.ts の帯設計）。密集地帯では山峰名が山脈名より先に間引かれ、
 * 勢力名・都市名の可読性を損なわない（AC #3）。重なりの解消に
 * COLLISION_SIZE_SCALE を触らないのは decision-21 のとおりで、密度の調整は
 * priority とズーム出し分け（peakMinZoom）だけで行う。
 *
 * 標高の併記は高ズーム（peaks.ts PEAK_ELEVATION_LABEL_MIN_ZOOM）でだけ行う。
 * 併記するとラベル幅が約 2.2 倍になり、同じ場所の勢力名・都市名を巻き込んで
 * 潰すため（根拠は同定数のコメント）。pickable: false（TASK-100 の範囲外）。
 */
function buildPeakLabelLayer(): TextLayer<
  PeakLabelDatum,
  CollisionFilterExtensionProps<PeakLabelDatum>
> {
  const allEntries = memoizedPeakEntries(peaksData);
  const data = memoizedPeakLabelData(
    memoizedVisiblePeaks(allEntries, zoomStep),
    nameJa,
  );
  return new TextLayer<
    PeakLabelDatum,
    CollisionFilterExtensionProps<PeakLabelDatum>
  >({
    // フォント・クリーム halo・衝突制御は共通 base props
    ...labelLayerBaseProps(),
    id: PEAK_LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => peakLabelText(d, zoomStep),
    getPosition: (d) => d.position,
    // サイズ・文字色は山脈名ラベルと同一（12px の苔緑）。山峰は「山脈の中の
    // 1 点」で同じ地形の注記なので、新しい色を足して記号性を薄めるより、
    // 「緑 = 地形」（TASK-97）をそのまま共有する方が読み手の負荷が小さい。
    // 都市（濃茶）・勢力（濃グレー/臙脂/藍紫）・河川（水色）との区別は従来どおり
    getSize: MOUNTAIN_LABEL_SIZE_PX,
    getColor: MOUNTAIN_LABEL_COLOR,
    // マーカー（▲）を覆わないよう少し上へずらす（都市ラベルと同じ向き）
    getPixelOffset: [...PEAK_LABEL_PIXEL_OFFSET],
    // 日本語名（モンブラン 等）と標高併記（4807m）のグリフを両方含む
    characterSet: memoizedPeakCharacterSet(allEntries, nameJa),
    // ズーム段が変わると表示対象と標高併記の有無が変わる
    updateTriggers: { getText: [zoomStep], getPosition: [zoomStep] },
  });
}

/**
 * 河川の透明ヒットライン層（GeoJsonLayer）を生成する（TASK-43）。
 * rivers と同一データ（riversData）を完全透明・RIVER_HIT_LINE_WIDTH_PX（14px）
 * で描画する判定専用レイヤー。PICKING_PRIORITY 上は cities より劣後（TASK-49）
 * のため renderLayers では rivers・cities の下に描画され、見た目には影響しない
 * （完全透明）まま「河川ライン・都市ドットのどちらの上でもない帯内」だけを
 * 河川として判定する。見た目（色・線幅の選択/ホバー/通常 3 状態）には一切
 * 関与しないため、getLineColor/getLineWidth は固定値のままで良く、
 * selectedRiverName / hoveredRiverName への依存も無い（updateTriggers 不要）。
 * data（riversData）自体は起動時に 1 度だけロードされ年代に依存しないため、
 * rivers 層と同様に data の updateTriggers も不要。
 */
function buildRiversHitLayer(): GeoJsonLayer {
  return new GeoJsonLayer({
    ...riversLayerBaseProps(),
    id: RIVERS_HIT_LAYER_ID,
    getLineColor: RIVER_HIT_LINE_COLOR,
    getLineWidth: RIVER_HIT_LINE_WIDTH_PX,
  });
}

/**
 * ズームフィルタ済みの表示都市エントリをメモ化する（TASK-66 AC #2/#3）。
 * 年内の人口降順ランクが visibleCityRankLimit(zoomStep) 内の都市だけを返す。
 * キーは citiesData・year・zoomStep（整数ズーム段）で、hover/selection
 * だけの renderLayers 呼び出しでは同じ参照が返りフィルタ再計算をスキップする
 * （TASK-50 方針）。返り値の配列参照が安定するため、下流の
 * memoizedCityMarkerData / memoizedCityLabelData のメモ化キーとしても機能する。
 */
const memoizedVisibleCityEntries = memoizeLatest(
  (data: CitiesData, year: number, zoomStep: number) =>
    filterCitiesByZoom(cityEntriesForYear(data, year), zoomStep),
);

/**
 * 都市マーカーデータをメモ化する（TASK-66）。entries は
 * memoizedVisibleCityEntries が返す安定参照なので、年・ズーム段が変わらない
 * 限り deck.gl へ渡す data の参照も安定し、hover/selection の再構築で
 * ScatterplotLayer の属性再計算が走らない。
 */
const memoizedCityMarkerData = memoizeLatest(
  (entries: readonly CityEntry[]) => buildCityMarkerData(entries),
);

/**
 * 主要都市マーカーの ScatterplotLayer を生成する（TASK-27 AC #1/#3/#6）。
 * 小さな濃色ドット + 白縁で、勢力の半透明塗りの上でも視認できるようにする。
 * レイヤー順は rivers-hit の上・rivers の下（renderLayers）に置き、picking の
 * 優先順位を 河川 > 都市 > 河川ヒット層 > HRE 領邦 > 勢力 にする（TASK-49）。
 * cities を rivers-hit より優先することで、河畔都市（河川の判定帯 ±7px 内の
 * マーカー）の picking が rivers-hit に遮蔽されないようにする。年代切替では
 * 同一 ID のまま cityEntriesForYear で該当年のデータへ差し替えるだけにする。
 * TASK-66: data はズームフィルタ済み（人口上位ランクのみ）のエントリに
 * 差し替え、整数ズーム段（zoomStep）の変化でも再評価する。
 */
function buildCityMarkerLayer(year: number): ScatterplotLayer<CityMarkerDatum> {
  const entries = memoizedVisibleCityEntries(citiesData, year, zoomStep);
  return new ScatterplotLayer<CityMarkerDatum>({
    id: CITY_LAYER_ID,
    data: memoizedCityMarkerData(entries),
    pickable: true,
    getPosition: (d) => d.position,
    // 3px の固定ドット。国土に対する「点」の記号で、ズームに追従させない
    radiusUnits: "pixels",
    getRadius: CITY_MARKER_RADIUS_PX,
    // ラベルと同系の濃茶 fill + 白 stroke（塗りの上でも沈まない）
    getFillColor: [90, 46, 16, 255],
    stroked: true,
    lineWidthUnits: "pixels",
    getLineWidth: 1,
    getLineColor: [255, 255, 255, 230],
    updateTriggers: { getPosition: [year, zoomStep] },
  });
}

/**
 * 都市マーカーの透明ヒット層（ScatterplotLayer）を生成する（TASK-82）。
 * cities と同一データ（memoizedCityMarkerData の安定参照）を完全透明・
 * CITY_HIT_RADIUS_PX（9px）で描画する判定専用レイヤーで、rivers-hit
 * （TASK-43）と同型の仕組み。
 *
 * これにより、ホバーでもクリックでも「カーソル直下 pick」だけで
 * CITY_PICK_TOLERANCE_PX（cities.ts）の判定範囲が得られる。ホバー側に
 * pickMultipleObjects を足さない（TASK-36 のコスト設計を維持）まま、
 * 従来「クリックは近傍再ピックで ~9px / ホバーはドットの 3px のみ」だった
 * 非対称を解消する（AC #1/#2）。
 *
 * レイヤー順は cities の直下・rivers-hit の上（PICKING_PRIORITY 由来）。
 * 可視ドット（cities）を上に置くことで、判定円同士が重なる密集地域でも
 * 「ドット直上は必ずその都市」が保証される（AC #6）。
 * stroked: false・完全透明なので見た目には一切影響しない。
 */
function buildCityHitLayer(year: number): ScatterplotLayer<CityMarkerDatum> {
  const entries = memoizedVisibleCityEntries(citiesData, year, zoomStep);
  return new ScatterplotLayer<CityMarkerDatum>({
    id: CITY_HIT_LAYER_ID,
    data: memoizedCityMarkerData(entries),
    pickable: true,
    getPosition: (d) => d.position,
    radiusUnits: "pixels",
    getRadius: CITY_HIT_RADIUS_PX,
    getFillColor: CITY_HIT_FILL_COLOR,
    stroked: false,
    updateTriggers: { getPosition: [year, zoomStep] },
  });
}

/**
 * 都市名ラベルの TextLayer を生成する（TASK-27 AC #2/#4）。
 * 文字色は濃茶（#793E16）。国名ラベルの濃グレー [40,40,40]・河川ラベルの
 * 水色と明確に異なり、白 halo 付きで一見して都市と区別できる。サイズは
 * 河川ラベルと同じ CITY_LABEL_SIZE_PX（国名 POWER_LABEL_SIZE_PX より控えめ）で、
 * マーカーの右上へ
 * ピクセルオフセットしてドットとラベルが重ならないようにする。
 * CollisionFilterExtension は国名・河川ラベルと同一衝突空間
 * （collisionTestProps.sizeScale: 2）に参加させ、人口由来の都市固定バンド
 * priority（cities.ts）で大国ラベルに譲りつつ小勢力ラベルとは競らせる。
 * pickable: false でマーカー・ポリゴンの picking を妨げない。
 *
 * TASK-82: 判定範囲を広げるにあたりラベル自体のクリック対象化も検討したが、
 * 採用しない。ラベルは衝突フィルタで間引かれ（同じ都市でもズーム・年代で
 * 出たり消えたりする）、かつマーカーからピクセルオフセットして描かれるため、
 * 当たり判定にすると「表示されている年だけ広く拾える」「ドットから離れた
 * 文字の上でも拾える」と判定範囲が状態依存で不安定になる。判定の基準は
 * マーカー中心からの距離（cities.ts CITY_PICK_TOLERANCE_PX）1 本に保つ。
 */
/**
 * 都市名ラベルのデータ + characterSet をメモ化する（TASK-50）。
 * TASK-66: 入力はズームフィルタ済みエントリ（memoizedVisibleCityEntries の
 * 安定参照）に変更した。entries・nameJa の参照が変わらない限り
 * buildCityLabelData・characterSetFrom の再計算を hover/selection の
 * renderLayers ではスキップする。year またはズーム段が変わると
 * memoizedVisibleCityEntries が新しい参照を返すため正しく再計算される。
 */
const memoizedCityLabelData = memoizeLatest(
  (entries: readonly CityEntry[], ja: Record<string, string>) => {
    const labelData = buildCityLabelData(entries, ja);
    return {
      data: labelData,
      characterSet: characterSetFrom(labelData.map((d) => d.text)),
    };
  },
);

function buildCityLabelLayer(
  year: number,
): TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>> {
  const { data, characterSet } = memoizedCityLabelData(
    memoizedVisibleCityEntries(citiesData, year, zoomStep),
    nameJa,
  );
  return new TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>>({
    // フォント・クリーム halo（TASK-72: ケルン大司教領周辺など都市名の
    // 密集箇所対策。国名・河川ラベルと共通）・衝突制御は共通 base props
    ...labelLayerBaseProps(),
    id: CITY_LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => d.text,
    getPosition: (d) => d.position,
    getSize: CITY_LABEL_SIZE_PX,
    getColor: CITY_LABEL_COLOR,
    // マーカー（3px + 白縁）を覆わないよう少し上へずらす（オフセットのみ。
    // getTextAnchor: "start" / getAlignmentBaseline: "bottom" は
    // CollisionFilterExtension の衝突判定パスと相性が悪く、指定すると
    // ラベルが全滅することを目視で確認したため既定（中央揃え）のまま使う）
    getPixelOffset: [0, -10],
    // 日本語都市名（パリ 等）のグリフもラベル文字列から自動生成する
    characterSet,
    // TASK-66: ズーム段の変化でも accessor を再評価させる（data 参照も
    // memoizedVisibleCityEntries 経由で変わるが、意図を明示して二重に守る）
    updateTriggers: {
      getText: [year, zoomStep],
      getPosition: [year, zoomStep],
    },
  });
}

/**
 * 勢力圏の外枠オーバーレイ（GeoJsonLayer）を生成する（TASK-30 AC #2〜#4 /
 * TASK-94）。データは base（europe_*）から宗主キーで集めた feature の union
 * （suzerain_extent.ts）で、領邦オーバーレイの有無に依らず勢力圏全体の輪郭が
 * 取れる。太い臙脂の外縁線 + ごく薄い塗りで「どこからどこまでが 1 つの勢力圏か」
 * を一目で示す。pickable: false のため picking の優先順位（PICKING_PRIORITY）・
 * ツールチップ・パネルには一切関与しない（AC #5）。表示の on/off は visible で
 * 切り替え、レイヤー ID を保って deck.gl の差分更新に任せる。
 */
function buildSuzerainExtentLayer(
  year: number,
  base: FeatureCollection,
): GeoJsonLayer {
  return new GeoJsonLayer({
    id: HRE_EXTENT_LAYER_ID,
    data: suzerainExtent(base, extentKey, overrides),
    visible: extentKey !== null,
    pickable: false,
    stroked: true,
    filled: true,
    getFillColor: HRE_EXTENT_FILL_COLOR,
    getLineColor: HRE_EXTENT_LINE_COLOR,
    lineWidthUnits: "pixels",
    getLineWidth: HRE_EXTENT_LINE_WIDTH_PX,
    opacity: 1,
    updateTriggers: { getFillColor: [year], getLineColor: [year] },
  });
}

/**
 * base 勢力の境界線（概略境界）の描画データをメモ化する（TASK-80）。
 *
 * 入力は「諸侯領オーバーレイ対象年（1000〜1300）なら TASK-78 の派生 base 輪郭
 * （outlines。諸侯領 union の外側だけに切り出した LineString 群）、それ以外の年
 * なら base 勢力ポリゴンの環」。前者を優先することで TASK-78 の二重輪郭解消
 * （諸侯領の内側を走る base 境界線を描かない）はそのまま維持される。
 *
 * memoizeLatest で包む理由は buildLabelData と同じ: applyRiverHover /
 * applyExtentKey / ズーム段の変化は currentView を差し替えずに renderLayers()
 * を呼ぶため、同じ参照が渡り続けてセグメント分割（1 年あたり 5〜7 千セグメント）
 * を再計算しない。年代切替でだけ参照が変わって再計算される。
 */
const memoizedApproximateBorderData = memoizeLatest(
  (base: FeatureCollection, outlines: FeatureCollection) =>
    buildApproximateBorderData(
      outlines.features.length > 0 ? outlines : base,
    ),
);

/**
 * 直近に反映した概略境界の描画データ（TASK-80）。スタイル差し替え
 * （OpenFreeMap へのフォールバック）で source ごと消えた後の再登録や、
 * styledata 経由の位置再調整で「今描くべきデータ」を参照するために持つ。
 */
let approximateBorderData: FeatureCollection = EMPTY_APPROXIMATE_BORDER_DATA;

/**
 * 概略境界（MapLibre の line レイヤー 3 枚）をスタイルへ反映する（TASK-80）。
 *
 * MapLibre 側に持つ理由: deck.gl の GeoJsonLayer / PathLayer には blur も破線も
 * 無く、「にじんだ低 alpha の帯」を描けない（詳細は approximate_borders.ts）。
 *
 * 位置は海洋の水面（water）の直下。政治ポリゴンの塗りとの前後は deck 側の
 * beforeId が決める（underWaterBeforeId が概略境界の最下段を指すため、deck は
 * 自分のグループを概略境界の直下へ入れ直す）。deck レイヤーは構築時の props を
 * 持ち回るので、概略境界がまだ無い時点で作られた deck レイヤーは beforeId が
 * water のまま = 塗りが線の上に来る。その場合だけ renderLayers() で deck
 * レイヤーを作り直させる（順序が既に正しければ何もしないため、styledata の
 * 再発火は数回で収束する）。
 *
 * スタイル未読込・差し替え中は何もしない（styledata / renderLayers から
 * 何度でも呼ばれるので、次の機会に追いつく）。例外は握りつぶす: 概略境界が
 * 描けないことは地図全体を落とす理由にならない。
 */
let syncingApproximateBorders = false;
function syncApproximateBorders(): void {
  // renderLayers → syncApproximateBorders → renderLayers の再入を止める
  if (syncingApproximateBorders) return;
  syncingApproximateBorders = true;
  try {
    const styleLayerIds = currentStyleLayerIds();
    if (styleLayerIds.length === 0) return;
    const source = map.getSource(APPROXIMATE_BORDER_SOURCE_ID);
    if (source === undefined) {
      map.addSource(
        APPROXIMATE_BORDER_SOURCE_ID,
        approximateBorderSourceSpec(
          approximateBorderData,
        ) as GeoJSONSourceSpecification,
      );
    } else {
      (source as GeoJSONSource).setData(approximateBorderData);
    }
    const beforeId = approximateBorderBeforeId(styleLayerIds);
    for (const spec of approximateBorderLayerSpecs()) {
      if (map.getLayer(spec.id) === undefined) {
        map.addLayer(spec as unknown as LayerSpecification, beforeId);
      }
    }
    // 追加後の実際の順序を見て、塗りが線の上に来ていたら deck レイヤーを
    // 作り直す（buildPowerLayer が beforeId を概略境界の直下へ再計算する）
    if (
      currentView !== null &&
      !approximateBorderStackIsValid(currentStyleLayerIds())
    ) {
      renderLayers();
    }
  } catch (error) {
    console.warn(`概略境界レイヤーの反映に失敗しました: ${String(error)}`);
  } finally {
    syncingApproximateBorders = false;
  }
}

/**
 * 現在の年代データ + 河川 + 都市 + ラベルの全レイヤーを組み立てて overlay へ
 * 反映する。描画順（配列順 = 下から上）: powers → france-fiefs → hre-powers →
 * hre-extent → rivers-hit → cities-hit → cities → rivers → power-labels →
 * river-labels → city-labels。
 * TASK-71: france-fiefs は powers の直上（ベースの France ポリゴンの上）に置く。
 * 塗りは共通の FILL_ALPHA（半透明）なので下の勢力塗りが透け、諸侯領の欠落部
 * （南仏・パリ周辺など）はベースの France 塗りがそのまま見える。
 * rivers-hit（TASK-43）は rivers と同一データの透明太幅ヒットライン層で、
 * picking 専用に重ねる（見た目には影響しない）。cities の下に描画すること
 * （TASK-49）で、河畔都市マーカーの picking を rivers-hit が遮蔽しないように
 * する。cities-hit（TASK-82）は cities と同一データの透明・大半径ヒット層で、
 * cities の直下・rivers-hit の上に置く。可視ドット（cities）を上に保つことで
 * 密集地域でも「ドット直上は必ずその都市」が成立し、rivers-hit より上に置く
 * ことで河畔都市でも中心から CITY_PICK_TOLERANCE_PX 以内が都市になる。
 *
 * TASK-77: 上の描画順は deck レイヤー同士の相対順で、MapLibre スタイルとの
 * 前後関係は各レイヤーの beforeId で決まる。powers / france-fiefs / hre-powers
 * の 3 枚だけがベースマップの水面ポリゴンより下（buildPowerLayer で
 * underWaterBeforeId を付与）、残り（hre-extent・rivers-hit・cities-hit・
 * cities・rivers）は従来どおり水面より上に描かれる。beforeId は MapLibre 側の
 * 挿入位置のみを変え、
 * deck レイヤー配列の順序 = picking 優先順（PICKING_PRIORITY）には影響しない
 * （@deck.gl/mapbox は beforeId ごとにグループを作り、同一グループ内では配列順で
 * 描画する）。
 *
 * TASK-77: ラベル 3 層だけは overlaid の labelOverlay（別 canvas）へ分ける。
 * interleaved のグループ分割が CollisionFilterExtension の衝突マップを壊し
 * ラベルが全滅するため（理由と検証は layer_stack.ts の OVERLAID_LAYER_IDS）。
 * 分配の不変条件は overlaySplitIsValid で毎回検証する。ラベルは元々
 * pickable: false・最前面のため、見た目・picking・イベント処理は変わらない。
 *
 * TASK-29: pickable レイヤーの並びは picking.ts の PICKING_PRIORITY
 * （河川 > 都市 > 河川ヒット層 > HRE 領邦 > 勢力。先頭が最優先。TASK-49 で
 * cities を rivers-hit より優先に変更）から導出する。deck.gl の picking は
 * 最前面（配列の最後）が勝つため、描画順 = 優先順の逆順にすることで
 * 「河川と勢力が重なる位置では河川名を優先」（AC #2）と「都市ドット直上では
 * 都市を優先」（TASK-49）がレイヤー順だけで担保される。ラベル系
 * （pickable: false）は picking に関与しないためその上へ後置し、
 * layerOrderMatchesPickingPriority で全体の整合を検証する。年代切替と河川
 * 選択の変更はどちらもこの関数経由で反映し、レイヤー id を保つことで
 * deck.gl の差分更新に任せる。
 */
function renderLayers(): void {
  if (currentView === null) return;
  const { year, base, hre, fiefs, outlines, baseFill, italyFiefs } =
    currentView;
  const { cliopatriaFiefs } = currentView;
  // TASK-80: base の境界線は全年代とも MapLibre の概略境界レイヤー
  // （approximate-borders-*、syncApproximateBorders）が描くため、powers の
  // stroke は常に止める（TASK-78 は諸侯領オーバーレイ対象年だけ止めていた）。
  // 描画データの入力は「対象年 = 切り出し済みの base 輪郭（outlines）、
  // それ以外 = base ポリゴンの環」で、TASK-78 の二重輪郭解消は維持される。
  const buildPickableLayer: Record<string, () => Layer> = {
    [POWER_LAYER_ID]: () =>
      buildPowerLayer(
        POWER_LAYER_ID,
        year,
        // TASK-92: 諸侯領オーバーレイ対象年は諸侯領 union を差し引いた派生 base を
        // 塗る。諸侯領の下に base の半透明が重なって出る「境界線を伴わない濃淡」を
        // 消すのが目的で、非対象年・取得失敗時は base に縮退する。
        powerFillDataFor(base, baseFill),
        LINE_COLOR,
        LINE_WIDTH_PX,
        false,
      ),
    [HRE_LAYER_ID]: () => buildPowerLayer(HRE_LAYER_ID, year, hre),
    // TASK-71: 中世フランス諸侯領。base の France ポリゴンの上に重ね、
    // 藍紫の境界線で区画を示す（非対象年は空 FC なので実質非表示）
    [FRANCE_FIEF_LAYER_ID]: () =>
      buildPowerLayer(
        FRANCE_FIEF_LAYER_ID,
        year,
        fiefs,
        FIEF_LINE_COLOR,
        FIEF_LINE_WIDTH_PX,
      ),
    // TASK-96: 中世イタリア諸侯領。仏諸侯領と同じ藍紫の境界線・同じ塗り規則で
    // 「諸侯領の区画」という記号を共有する（帝国系の臙脂とは色相で区別する）。
    // 非対象年は空 FC なので実質非表示。
    [ITALY_FIEF_LAYER_ID]: () =>
      buildPowerLayer(
        ITALY_FIEF_LAYER_ID,
        year,
        italyFiefs,
        FIEF_LINE_COLOR,
        FIEF_LINE_WIDTH_PX,
      ),
    // TASK-110: Cliopatria 由来の領邦。OHM に該当リレーションが無い領邦だけを
    // 収録した補完データで、既存 3 系統と同じ buildPowerLayer に載せる
    // （非対象年・未生成時は空 FC なので実質非表示）。境界線色だけは feature 単位で
    // 決める: このレイヤーは仏諸侯領と帝国領邦を同居させるため、レイヤー一律に
    // すると凡例（藍紫 = 諸侯領の区画 / 白 = 帝国領邦・base と同じ線）が破れる。
    [CLIOPATRIA_FIEF_LAYER_ID]: () =>
      buildPowerLayer(
        CLIOPATRIA_FIEF_LAYER_ID,
        year,
        cliopatriaFiefs,
        (f: Feature) =>
          isHreSuzerainFeature(f.properties) ? LINE_COLOR : FIEF_LINE_COLOR,
        FIEF_LINE_WIDTH_PX,
      ),
    [CITY_LAYER_ID]: () => buildCityMarkerLayer(year),
    [CITY_HIT_LAYER_ID]: () => buildCityHitLayer(year),
    [RIVERS_LAYER_ID]: () => buildRiversLineLayer(),
    [RIVERS_HIT_LAYER_ID]: () => buildRiversHitLayer(),
    // TASK-100: 山岳 3 層。いずれも年代に依存しない（AC #5）
    [PEAK_LAYER_ID]: () => buildPeakMarkerLayer(),
    [PEAK_HIT_LAYER_ID]: () => buildPeakHitLayer(),
    [MOUNTAIN_HIT_LAYER_ID]: () => buildMountainHitLayer(),
  };
  const layers: Layer[] = [];
  // picking 優先順（PICKING_PRIORITY）の逆順 = 下→上の描画順で並べる
  for (const id of renderOrderFromPickingPriority(PICKING_PRIORITY)) {
    const build = buildPickableLayer[id];
    if (build === undefined) {
      throw new Error(`PICKING_PRIORITY のレイヤー ${id} に builder が無い`);
    }
    layers.push(build());
    // TASK-30 / TASK-94: 勢力圏の外枠は powers/hre-powers の上・cities の下に
    // 挿入する（領邦の塗りの上に輪郭が乗り、都市マーカー・河川は隠さない）。
    // pickable: false のため PICKING_PRIORITY 外の ID で、整合検証では
    // 無視される（layerOrderMatchesPickingPriority の既存仕様）。
    if (id === HRE_LAYER_ID) {
      layers.push(buildSuzerainExtentLayer(year, base));
      // TASK-100: 山脈の強調輪郭は勢力圏の外枠と同じ層（政治ポリゴンの上・
      // 都市ドット/河川ラインの下）に置く。輪郭どうしが同じ階層に並ぶことで
      // 「臙脂の外縁 = 帝国範囲 / オリーブの外縁 = 山脈の範囲」が同じ土俵で
      // 読み比べられる。pickable: false のため PICKING_PRIORITY 外の ID で、
      // 整合検証では無視される（勢力圏の外枠と同じ扱い）。
      // 山峰マーカー（peaks）は TASK-100 で pickable になったため
      // PICKING_PRIORITY 由来のループ本体が積む（ここでは積まない）。
      layers.push(buildMountainOutlineLayer());
    }
  }
  // TASK-77: ラベル層は overlaid オーバーレイ（別 canvas）へ載せる。
  // 順序は描画順（山脈名 → 山峰名 → 勢力名 → 河川名 → 都市名）で、TASK-97 の
  // 山脈名・TASK-99 の山峰名は地形の注記なので最下段に置く（表示の取捨は
  // 配列順ではなく priority が決める）。
  const labelLayers: Layer[] = [
    buildMountainLabelLayer(),
    buildPeakLabelLayer(),
    buildLabelLayer(year, base, hre, fiefs, italyFiefs, cliopatriaFiefs),
    buildRiverLabelLayer(),
    buildCityLabelLayer(year),
  ];
  if (!layerOrderMatchesPickingPriority(layers.map((l) => l.id))) {
    throw new Error("レイヤー順が PICKING_PRIORITY と整合していない");
  }
  if (
    !overlaySplitIsValid(
      layers.map((l) => l.id),
      labelLayers.map((l) => l.id),
    )
  ) {
    throw new Error("interleaved / overlaid のレイヤー分配が不正");
  }
  // TASK-84: 政治ポリゴンの挿入位置（beforeId = 海洋 water）が「内水面より上・
  // 海洋と海岸線より下」であることを、実際のスタイル順に対して毎回確認する。
  // ベースマップ側のレイヤー順を変えて沿岸の線や塗りが壊れたらここで気付ける
  // （対象レイヤーを持たないフォールバックスタイルでは常に true）。
  if (!waterStackIsValid(currentStyleLayerIds())) {
    throw new Error("ベースマップの水面・海岸線の重ね順が不正");
  }
  overlay.setProps({ layers });
  labelOverlay.setProps({ layers: labelLayers });
  // TASK-80: base の境界線（概略境界）は MapLibre 側の line レイヤー。deck の
  // レイヤー反映後に同期することで、deck がグループを追加し直した場合でも
  // 概略境界が塗りの上に来る位置へ引き上げられる。
  approximateBorderData = memoizedApproximateBorderData(base, outlines);
  syncApproximateBorders();
}

/**
 * 勢力名ラベルの TextLayer を生成する（TASK-20）。
 * base（europe_*）と HRE 領邦オーバーレイ（hre_*）双方のラベルを 1 枚に束ね、
 * CollisionFilterExtension で重なりを間引く。面積由来の priority（labels.ts）
 * により大勢力を優先表示し、小勢力はズームインで空きができ次第表示される。
 * pickable は false（ラベル自体はホバー対象にせず、下のポリゴンの picking を
 * 妨げない）。年代切替では同一 ID のまま data を差し替えるのみ。
 */
/**
 * 勢力名ラベルのデータ + characterSet をメモ化する（TASK-50）。
 * 直近実測 ~4.3ms/回の主因だった buildLabelData（全 base+hre feature への
 * polylabel）を、year・base・hre・nameJa の参照同値でキャッシュする。
 * applyRiverHover / applyRiverSelection / applyExtentKey は currentView
 * （base/hre）を書き換えずに renderLayers() を呼ぶだけなので、同じ引数の
 * 参照が渡り続けてキャッシュヒットし polylabel は走らない。switchYear
 * 経由で currentView が新しい base/hre に置き換わったとき（年代切替・
 * データ再ロード）だけ、参照が変わって正しく再計算される。
 */
const memoizedPowerLabelData = memoizeLatest(
  (
    // year は抑制対象の解決（suppressedPowerNames）に使い、同時にメモ化キーの
    // 一部にもなる（base/hre/fiefs と揃えて明示的に年代依存であることを示す）
    year: number,
    base: FeatureCollection,
    hre: FeatureCollection,
    fiefs: FeatureCollection,
    italyFiefs: FeatureCollection,
    cliopatriaFiefs: FeatureCollection,
    ja: Record<string, string>,
    dedupe: FiefDedupeTable,
  ) => {
    // TASK-23: ラベルは name-ja.json で日本語化する（未登録 NAME は英語のまま）。
    // TASK-30: kind（base/hre）を付与し、HRE 領邦ラベルだけ帝国色で塗り分ける。
    // TASK-71: フランス諸侯領は kind=fief で藍紫。オーバーレイ非対象年では
    // fiefs が空 FC なのでラベルも 0 件になる（二重ラベルにならない）。
    // TASK-78 AC #1: 諸侯領にほぼ完全内包される base 勢力（1000〜1300 の
    // Britany）は、同じ土地の諸侯領ラベル（ブルターニュ公領）と二重表示に
    // なるため base 側のラベルだけ落とす。抑制対象が無い年（900・1400 以降や
    // 対応表の取得失敗時）は同一参照が返り、polylabel のメモ化も効き続ける。
    // TASK-122: 抑制対象を FeatureCollection から落とすのではなく datum に
    // suppressed の印だけ付ける。諸侯領ラベルを出していないズーム段では抑制を
    // 解除しないとその土地のラベルが 1 つも無くなる（AC #4）ため、実際に出すか
    // どうかの判断は filterPowerLabelsByZoom（ズーム段依存）へ移した。datum を
    // 常に作っておくことで characterSet も絞り込み前の全テキストから作れる。
    const suppressed = suppressedPowerNames(dedupe, year);
    const cliopatriaLabelGroups = partitionFiefsBySuzerain(cliopatriaFiefs);
    const data = [
      ...buildLabelData(base, ja, "base", suppressed),
      ...buildLabelData(hre, ja, "hre"),
      ...buildLabelData(fiefs, ja, "fief"),
      // TASK-96: 伊諸侯領も kind=fief（藍紫）。base 側の教皇領・帝国との
      // 二重ラベルは fief-dedupe.json の被覆率が抑制する（1100 年以降の
      // Corsica は被覆率 0.9983 で抑制側に入る）。
      ...buildLabelData(italyFiefs, ja, "fief"),
      // TASK-110: Cliopatria 由来は 1 枚のレイヤーに仏諸侯領と帝国領邦が同居
      // するため、kind をレイヤー一律ではなく宗主で決める（labels.ts
      // partitionFiefsBySuzerain）。こうしないと 1400/1492 年に Cliopatria 由来の
      // バイエルンだけ藍紫・隣の OHM 由来領邦は臙脂、という凡例の破れが出る。
      ...buildLabelData(cliopatriaLabelGroups.hre, ja, "hre"),
      ...buildLabelData(cliopatriaLabelGroups.fief, ja, "fief"),
    ];
    // TASK-122 AC #7: characterSet はズームで絞り込む**前**の全 datum から
    // 作る。表示中の datum から作ると、ズームインで諸侯領ラベルが増えた瞬間に
    // 未収録グリフ（ü・日本語）が豆腐になるか、フォントアトラスが作り直される。
    return { data, characterSet: characterSetFrom(data.map((d) => d.text)) };
  },
);

/**
 * 現在のズーム段で表示する勢力ラベルだけに絞る（TASK-122）。
 * memoizedPowerLabelData の安定参照 + zoomStep をキーにするので、ホバー/
 * 選択のたびに走る renderLayers() では再計算されない（山脈の
 * memoizedMountainHitData と同型）。zoomStep をこちら側のキーに置くことで、
 * 段が変わっても polylabel（memoizedPowerLabelData）は再計算されない。
 */
const memoizedVisiblePowerLabels = memoizeLatest(
  (data: readonly LabelDatum[], zoomStep: number) =>
    filterPowerLabelsByZoom(data, zoomStep),
);

function buildLabelLayer(
  year: number,
  base: FeatureCollection,
  hre: FeatureCollection,
  fiefs: FeatureCollection,
  italyFiefs: FeatureCollection,
  cliopatriaFiefs: FeatureCollection,
): TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>> {
  // TextLayer は 1 枚のまま・衝突制御（共有空間・priority）も従来どおり。
  const { data: allData, characterSet } = memoizedPowerLabelData(
    year,
    base,
    hre,
    fiefs,
    italyFiefs,
    cliopatriaFiefs,
    nameJa,
    fiefDedupe,
  );
  // TASK-122: FIEF_LABEL_MIN_ZOOM 未満では諸侯領・帝国領邦ラベルを出さず、
  // 代わりに TASK-78 で抑制していた base ラベルを復活させる。
  const data = memoizedVisiblePowerLabels(allData, zoomStep);
  return new TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>>({
    // フォント・クリーム halo（TASK-72: ケルン大司教領・ザクセン選帝侯領/
    // 公領周辺の密集や HRE 外縁の赤境界線との重なり対策。背景パネルは撤去済み）
    // ・衝突制御（COLLISION_SIZE_SCALE 倍判定）は共通 base props
    ...labelLayerBaseProps(),
    id: LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => d.text,
    getPosition: (d) => d.position,
    // POWER_LABEL_SIZE_PX 固定・濃色文字 + 白 halo（SDF アウトライン）で塗りの上でも判読できる。
    // TASK-30 AC #1: 文字色は kind で塗り分け（独立国 = 濃グレー、HRE 域内の
    // 領邦 = 臙脂 HRE_LABEL_COLOR、TASK-71: フランス諸侯領 = 藍紫
    // FIEF_LABEL_COLOR）。ラベルだけで由来の系統を区別できる。
    // TASK-93: 強調（ホバー/クリック）中の勢力・領邦のラベルは、同じ色相のまま
    // 暗く沈めた強調用の色へ切り替える。アクティブ塗りの上で通常色のままだと
    // 文字が塗りに埋もれるため（判定は d.key = 塗りと同一の強調キー）。
    getSize: POWER_LABEL_SIZE_PX,
    getColor: (d: LabelDatum) => [
      ...powerLabelColor(
        d,
        powerHighlight.selected(),
        powerHighlight.hovered(),
      ),
    ],
    // ü などの非 ASCII 文字（Württemberg 等）もグリフを生成する
    characterSet,
    // TASK-93: 強調キーは getColor の入力なので trigger に足す（足さないと
    // deck.gl が getColor を再評価せず文字色が切り替わらない）。data 自体は
    // 強調状態に依存しないため memoizedPowerLabelData のキャッシュは効き続け、
    // ホバーのたびに polylabel が走ることはない。
    // TASK-122: 表示対象がズーム段でも変わるため trigger に zoomStep を足す。
    // characterSet は絞り込み前の全テキストなので段が変わっても不変
    // （フォントアトラスは作り直されない）。
    updateTriggers: {
      getText: [year, zoomStep],
      getPosition: [year, zoomStep],
      getColor: [powerHighlight.selected(), powerHighlight.hovered()],
    },
  });
}

// ホバー/クリック情報 UI への反映フック（setupInfoUI が実体を差し込む）。
// buildPowerLayer は年代切替のたびに再生成されるため、レイヤー側は常にこの
// モジュールスコープの関数を参照し、DOM 配線は 1 度だけ行う。
let showTooltip: (label: string, x: number, y: number) => void = () => {};
let hideTooltip: () => void = () => {};
let showInfoPanel: (label: string, sources: SourceLine[]) => void = () => {};

/** クリックパネルの出典欄（TASK-109）を包む要素の class 名 */
const INFO_PANEL_SOURCE_CLASS = "info-panel-source";

/**
 * ホバーツールチップとクリックパネルの DOM を配線する（TASK-7, app-spec §5.2）。
 * - ツールチップ: onHover の {x, y} を使いカーソル近傍へ absolute 配置。object なしで非表示
 * - パネル: クリックで表示し続ける固定小パネル（左上）。閉じるボタンで非表示
 * どちらも displayLabel（純粋関数）で整形済みのラベルを受け取るだけにする。
 */
function setupInfoUI(): void {
  const tooltip = document.getElementById("info-tooltip");
  const panel = document.getElementById("info-panel");
  const panelLabel = document.getElementById("info-panel-label");
  const panelClose = document.getElementById("info-panel-close") as
    | HTMLButtonElement
    | null;
  if (!tooltip || !panel || !panelLabel || !panelClose) {
    console.warn("情報表示 UI 要素が見つからないため配線をスキップします");
    return;
  }

  // TASK-111: カーソル近傍への配置は tooltipPlacement（純粋関数）に委ね、ここは
  // 実測サイズの取得と style への反映だけを行う。hidden のままでは
  // getBoundingClientRect が 0 を返すので、先に表示してから測る。折り返し後の
  // 実寸が要るため、textContent の更新より後に測ることも必須。測る前に left/top を
  // 原点へ戻すのは、絶対配置の shrink-to-fit 幅が「左端から親の右端まで」の
  // 余白に依存し、前回の右寄り座標のままだと本来より狭く折り返された幅を
  // 測ってしまうため（配置後は left + width <= viewport なので再折り返しは起きない）。
  showTooltip = (label, x, y) => {
    tooltip.textContent = label;
    tooltip.style.left = "0px";
    tooltip.style.top = "0px";
    tooltip.hidden = false;
    const rect = tooltip.getBoundingClientRect();
    const { left, top } = tooltipPlacement(
      { x, y },
      { width: rect.width, height: rect.height },
      { width: globalThis.innerWidth, height: globalThis.innerHeight },
    );
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };
  hideTooltip = () => {
    tooltip.hidden = true;
  };
  // TASK-109: 出典欄（見出し + 値の定義リスト）。index.html には置かず、
  // 名前 1 行だけだった従来のパネル DOM に対して 1 度だけ足す。行の中身は
  // sourceLines（純粋関数）が決めた配列をそのまま写すだけにする。
  const panelSource = document.createElement("dl");
  panelSource.className = INFO_PANEL_SOURCE_CLASS;
  panelSource.hidden = true;
  panel.appendChild(panelSource);

  showInfoPanel = (label, sources) => {
    panelLabel.textContent = label;
    panelSource.replaceChildren(...sources.flatMap(sourceLineNodes));
    // 出典 metadata を持たないデータ（rivers / cities / mountains 等）では
    // 行が 0 件になるので、罫線ごと出典欄を畳んで従来の 1 行パネルに戻す
    panelSource.hidden = sources.length === 0;
    panel.hidden = false;
  };

  panelClose.addEventListener("click", () => {
    panel.hidden = true;
  });
}

/**
 * 出典行 1 件を dt（見出し）+ dd（値）の 2 ノードにする（TASK-109）。
 * href があればリンクにし、無ければただのテキストにする。metadata 由来の
 * 文字列は textContent / href で入れるだけで、HTML としては解釈しない。
 */
function sourceLineNodes(line: SourceLine): Node[] {
  const dt = document.createElement("dt");
  dt.className = `${INFO_PANEL_SOURCE_CLASS}-label`;
  dt.textContent = line.label;
  const dd = document.createElement("dd");
  dd.className = `${INFO_PANEL_SOURCE_CLASS}-value`;
  if (line.href === undefined) {
    dd.textContent = line.value;
  } else {
    const a = document.createElement("a");
    a.href = line.href;
    a.target = "_blank";
    // 新規タブへ開く外部リンクの定石（opener 経由の書き換え・リファラ漏れ防止）
    a.rel = "noopener noreferrer";
    a.textContent = line.value;
    dd.appendChild(a);
  }
  return [dt, dd];
}

setupInfoUI();

/**
 * attribution フッターの折りたたみ UI を配線する（TASK-26）。
 * 状態遷移は footer.ts の reducer（純粋関数）、イベント購読と
 * aria-expanded / hidden の同期は collapsible.ts の共通配線（TASK-53）に
 * 集約されており、ここでは要素の取得と root 内判定の注入だけを行う。
 * - ⓘボタン click でトグル（native button なので Enter/Space は標準動作。AC #4）
 * - フッター外の click / Escape キーで折りたたみ（展開時のみ。AC #3）
 */
function setupFooter(): void {
  const footer = document.getElementById("app-footer");
  const toggle = document.getElementById("footer-toggle") as
    | HTMLButtonElement
    | null;
  const content = document.getElementById("footer-content");
  if (!footer || !toggle || !content) {
    console.warn("フッター UI 要素が見つからないため配線をスキップします");
    return;
  }

  // AC #1〜#4: 配線仕様（トグル / 外側 click / Escape / 属性同期）は
  // wireCollapsiblePanel に共通化した。ⓘボタン自身のクリックは footer 内
  // なので outside-click にならず、二重発火しない。
  wireCollapsiblePanel({
    toggle,
    content,
    containsTarget: (target) =>
      target instanceof Node && footer.contains(target),
    eventSource: document,
  });
}

setupFooter();

// ---- データの既知の制限一覧（TASK-46）----

// revealKnownLimitations は loadKnownLimitations 成功時にトグルボタンを表示し
// 一覧を描画するフック（setupKnownLimitationsUI が実体を差し込む。notes.json と
// 同じ「未生成時はトグルごと非表示で従来表示を維持」方針）
let revealKnownLimitations: (limitations: KnownLimitation[]) => void = () => {};

// reflectYearToKnownLimitations は年代切替の確定（applyFn。最新要求のみ到達）に
// 追従して一覧の該当年代表示を更新するフック（setupKnownLimitationsUI が実体を
// 差し込む。reflectYearToNotes と同じタイミング保証）。TASK-52。
let reflectYearToKnownLimitations: (year: number) => void = () => {};

/**
 * データの既知の制限一覧 UI を配線する（TASK-46）。
 * 折りたたみは attribution フッターと同一の操作性（トグル click /
 * コンテナ外 click / Escape）なので、reducer（footer.ts）ごと共通配線
 * wireCollapsiblePanel（collapsible.ts、TASK-53）を再利用する。
 * ここでは一覧の描画と表示フックの差し込みだけを行う。
 *
 * TASK-52: 全件表示は維持したまま、knownLimitationEntries で現在年代の
 * 該当判定（active）を付与し、該当項目だけ視覚強調する（削除ではなく配線）。
 */
function setupKnownLimitationsUI(): void {
  const container = document.getElementById("known-limitations");
  const toggle = document.getElementById("known-limitations-toggle") as
    | HTMLButtonElement
    | null;
  const content = document.getElementById("known-limitations-content");
  const list = document.getElementById("known-limitations-list");
  if (!container || !toggle || !content || !list) {
    console.warn(
      "既知の制限 UI 要素が見つからないため配線をスキップします",
    );
    return;
  }

  let limitations: KnownLimitation[] = [];
  let currentYear: number | null = null;

  /**
   * 現在の limitations / currentYear を元に一覧を再描画する。
   * currentYear が未確定（switchYear 未完了）の間は年代非依存として
   * 全件 active 扱いにはせず、そもそも呼ばれない想定だが、防御的に
   * limitations が空・currentYear が null のときは何もしない。
   */
  function renderList(): void {
    if (limitations.length === 0 || currentYear === null) return;
    const entries = knownLimitationEntries(limitations, currentYear);
    list!.replaceChildren(...entries.map((entry) => {
      const li = document.createElement("li");
      li.textContent = entry.text;
      li.classList.toggle("known-limitations-item--active", entry.active);
      if (entry.active) {
        const badge = document.createElement("span");
        badge.className = "known-limitations-badge";
        badge.textContent = "この年代に該当";
        li.append(" ", badge);
      }
      return li;
    }));
  }

  // 折りたたみの配線（トグル / コンテナ外 click / Escape / 属性同期）は
  // attribution と同じ共通配線に委譲する（TASK-53）
  wireCollapsiblePanel({
    toggle,
    content,
    containsTarget: (target) =>
      target instanceof Node && container.contains(target),
    eventSource: document,
  });

  // known-limitations.json のロード成功時のみトグルを表示し、一覧を描画する
  // （AC #3: 制限事項の追加はデータ編集のみで可能。全件表示は維持したまま、
  // TASK-52 で現在年代の該当項目を視覚強調する）
  revealKnownLimitations = (loaded) => {
    if (loaded.length === 0) return;
    limitations = loaded;
    renderList();
    toggle!.hidden = false;
  };

  // AC 相当: 年代切替の確定（applyFn。最新要求のみ到達）に追従して
  // 一覧の該当年代表示を更新する。パネルの開閉状態に関わらず内容を
  // 最新化しておくことで、次回展開時は常に現在年代の判定を表示する。
  reflectYearToKnownLimitations = (year) => {
    currentYear = year;
    renderList();
  };
}

setupKnownLimitationsUI();

/**
 * known-limitations.json（データの既知の制限一覧）を取得する（TASK-46）。
 * 失敗・未生成・全件不正のときは revealKnownLimitations を呼ばないため
 * トグルボタンごと非表示になる（従来表示を一切変えない。notes.json と同じ方針）。
 */
async function loadKnownLimitations(): Promise<void> {
  try {
    const res = await fetch(KNOWN_LIMITATIONS_DATA_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const parsed = parseKnownLimitations(await res.json());
    if (parsed.length === 0) throw new Error("limitations が空または不正");
    revealKnownLimitations(parsed);
  } catch (error) {
    console.warn(
      `known-limitations.json の取得に失敗しました。制限事項なしで継続します: ${
        String(error)
      }`,
    );
  }
}

// ---- 年代ごとの歴史解説パネル（TASK-33）----

/**
 * 解説データ（/data/notes.json）。取得失敗・未生成時は null のままで、
 * トグルボタンごと非表示にして従来表示を維持する（colors.json 等と同様）。
 */
let notesData: NotesData | null = null;

// 解説 UI への反映フック（setupNotesUI が実体を差し込む）。
// reflectYearToNotes は applyFn（最新要求のみ）から呼ばれ、確定した年の解説へ
// 内容を差し替える（reflectYearToTimeline と同じタイミング保証）。
let reflectYearToNotes: (year: number) => void = () => {};

// loadNotes 成功時にトグルボタンを表示するフック（欠如時は hidden のまま）
let revealNotesToggle: () => void = () => {};

/**
 * 年代解説パネルの DOM を配線する（TASK-33）。
 * 状態遷移は notes.ts の reducer（純粋関数）に集約し、ここでは
 * 「イベント → reducer → aria-expanded / hidden の同期」と内容描画だけを行う。
 * - 「解説」トグル click で開閉（native button なので Enter/Space は標準動作）
 * - Escape キーで折りたたみ（展開時のみ）
 * - outside-click では閉じない（地図クリック操作で解説が誤って閉じないため。
 *   方針は notes.ts の先頭コメント参照）
 */
function setupNotesUI(): void {
  const toggle = document.getElementById("notes-toggle") as
    | HTMLButtonElement
    | null;
  const panel = document.getElementById("notes-panel");
  const heading = document.getElementById("notes-heading");
  const points = document.getElementById("notes-points");
  const summary = document.getElementById("notes-summary");
  if (!toggle || !panel || !heading || !points || !summary) {
    console.warn("解説 UI 要素が見つからないため配線をスキップします");
    return;
  }

  let state = createNotesState();
  let currentYear: number | null = null;

  /** 現在の状態を aria-expanded / hidden へ反映する */
  function render(): void {
    toggle!.setAttribute("aria-expanded", notesAriaExpanded(state));
    panel!.hidden = isNotesPanelHidden(state);
  }

  /**
   * 指定年の解説を見出し・箇条書き・まとめへ描画する。
   * その年の解説が欠落・不正形（notesForYear が null）の場合は箇条書きを
   * 空にして案内文だけ出す（データ契約上は全 20 年分あるため防御的措置）。
   */
  function renderContent(year: number): void {
    heading!.textContent = notesHeadingFor(year);
    const entry = notesData === null ? null : notesForYear(notesData, year);
    if (entry === null) {
      points!.replaceChildren();
      summary!.textContent = "この年代の解説はまだありません。";
      return;
    }
    points!.replaceChildren(...entry.points.map((p) => {
      const li = document.createElement("li");
      li.textContent = p;
      return li;
    }));
    summary!.textContent = entry.summary;
  }

  function dispatch(event: NotesEvent): void {
    state = reduceNotesEvent(state, event);
    render();
  }

  toggle.addEventListener("click", () => dispatch("toggle"));

  // Escape キーで折りたたむ（未展開時は何もしない）
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!state.expanded) return;
    dispatch("escape");
  });

  // AC #1: 年代切替の確定（applyFn。最新要求のみ到達）に追従して内容を
  // 差し替える。展開中でも即時に新しい年の解説へ切り替わる。
  reflectYearToNotes = (year) => {
    currentYear = year;
    renderContent(year);
  };

  // notes.json のロード成功時のみトグルを表示する。ロード前に年が確定して
  // いた場合（通常は Promise.all で先にロードが終わるため起きない）にも
  // 備えて内容を描き直す。
  revealNotesToggle = () => {
    toggle!.hidden = false;
    if (currentYear !== null) renderContent(currentYear);
  };

  render();
}

setupNotesUI();

// タイムライン UI への「反映」フック（setupTimeline が実体を差し込む）。
// applyFn（最新要求のみ）から呼ぶことで、古い要求で年表示・スライダーが
// 巻き戻らないことを担保する（TASK-6 の UI 反映タイミング）。
let reflectYearToTimeline: (year: number) => void = () => {};

// 年代切替の競合ガード（DOM/deck.gl 非依存ロジックは powers.ts に集約）。
// overlay への反映（applyFn）は最新要求のときだけ呼ばれ、遅延解決した古い要求で
// 表示が巻き戻らない。AC #4: GeoJsonLayer の data 差し替えのみ・overlay は再生成しない。
// TASK-19: base と HRE 領邦オーバーレイは複合ローダで両方揃ってから同時に反映する。
// hre-powers を後置して powers の上に描画する（非対象年は空 FC で実質非表示）。
const yearSwitcher = createYearSwitcher(
  dataLoader,
  (year, data) => {
    // TASK-90: 年代が変われば同じ勢力が同じ形で存在するとは限らないため、
    // ポリゴンの強調（選択・ホバー）は年代切替で解除する。ここでの再構築は
    // 抑止し、直後の renderLayers()（年代フェード付き）へまとめる。
    suppressPowerHighlightRender = true;
    powerHighlight.clear();
    suppressPowerHighlightRender = false;
    // TASK-24: レイヤー組み立ては renderLayers に集約（河川選択の変更と共用）
    currentView = {
      year,
      base: data.base,
      hre: data.hre,
      fiefs: data.fiefs,
      outlines: data.outlines,
      baseFill: data.baseFill,
      italyFiefs: data.italyFiefs,
      cliopatriaFiefs: data.cliopatriaFiefs,
    };
    renderLayers();
    // AC #2/#3: 実際に反映された年で UI を確定させる（最新要求のみ到達する）
    reflectYearToTimeline(year);
    // TASK-33 AC #1: 解説パネルも確定年に追従させる
    reflectYearToNotes(year);
    // TASK-52: 既知の制限一覧も確定年に追従させ、該当項目の強調を更新する
    reflectYearToKnownLimitations(year);
    // AC #1: 年代確定のたびに URL を現在の視点込みで同期する
    syncUrlToState();
  },
);

// AC #1: 表示状態を URL クエリへ replaceState で反映する（履歴を汚さない）。
// 同一クエリの重複更新は updater 側で抑止するため、moveend など高頻度でも安全。
const updateUrl = createReplaceStateUpdater((query) => {
  globalThis.history.replaceState(null, "", query);
});

/** 確定年代 + 現在の地図視点から表示状態を組み立てる */
function currentAppState(): AppState {
  const c = map.getCenter();
  return {
    year: yearSwitcher.currentYear() ?? initialYear,
    zoom: map.getZoom(),
    center: [c.lng, c.lat],
  };
}

/** 現在の表示状態を URL クエリへ同期する（変化がなければ何もしない） */
function syncUrlToState(): void {
  updateUrl(currentAppState());
}

// AC #1: パン/ズーム確定（moveend）ごとに URL を更新。move 中の高頻度発火は拾わない。
map.on("moveend", syncUrlToState);

// TASK-66 AC #2: ズーム操作に追従して都市のズーム別表示を更新する。
// zoom イベントはズームアニメーション中に高頻度で発火するため、整数ズーム段
// （zoomStep）が変わった時だけ renderLayers() を呼ぶ（毎フレームの
// レイヤー再構築を避ける）。zoomend ではなく zoom を使うのは、ピンチ/ホイール
// の途中でも段を跨いだ時点で即座に都市が増減し、操作へ滑らかに追従するため。
map.on("zoom", () => {
  const step = Math.floor(map.getZoom());
  if (step === zoomStep) return;
  zoomStep = step;
  renderLayers();
});

// ---- ローディング/エラー UI（TASK-9, docs/app-spec.md §5.4）----

// ロード状態機械（DOM 非依存ロジックは loading_state.ts に集約）。
// switchYear が開始/成功/失敗を通知し、setupLoadingUI が差し込む描画関数へ反映する。
let loadingState = createLoadingState();

// ロード状態を UI へ反映するフック（setupLoadingUI が実体を差し込む）。
let renderLoadingUI: (state: LoadingState) => void = () => {};

/** ロード状態を更新し、最新状態を UI へ反映する */
function updateLoadingState(next: LoadingState): void {
  loadingState = next;
  renderLoadingUI(loadingState);
}

/**
 * 表示年代を切り替える（TASK-6 のスライダー・目視確認から呼ばれる公開 API）。
 * 連続呼び出し時は最後に要求した年代だけが反映される。
 *
 * TASK-9: ロードの開始/成功/失敗を loading_state へ通知してスピナー・トーストを制御する。
 * - キャッシュ済み年代は fetch が発生しないためスピナーを出さない（開始を通知しない）。
 * - 失敗しても reject を握りつぶし（トーストで再試行に誘導するため）、
 *   `void switchYear(...)` 呼び出し側で未処理 rejection を出さない。
 */
export function switchYear(year: number): Promise<void> {
  const cached = dataLoader.has(year);
  if (!cached) updateLoadingState(startLoading(loadingState, year));
  return yearSwitcher.switchTo(year).then(
    () => {
      if (!cached) updateLoadingState(succeedLoading(loadingState, year));
    },
    (error: unknown) => {
      updateLoadingState(failLoading(loadingState, year));
      console.error(
        `年代 ${year} の GeoJSON 取得に失敗しました: ${String(error)}`,
      );
    },
  );
}

/**
 * スピナーとエラートースト（app-spec §5.4）の DOM を配線する。
 * 表示可否は loading_state の状態機械から導出し、この関数は描画に徹する。
 * - スピナー: 進行中のロードが 1 つ以上ある間だけ表示（キャッシュヒットでは出ない）
 * - トースト: 失敗した年代があれば表示し、「再試行」で失敗年代を再取得、「閉じる」で消す
 */
function setupLoadingUI(): void {
  const spinner = document.getElementById("loading-spinner");
  const toast = document.getElementById("error-toast");
  const toastMessage = document.getElementById("error-toast-message");
  const retryBtn = document.getElementById("error-toast-retry") as
    | HTMLButtonElement
    | null;
  const closeBtn = document.getElementById("error-toast-close") as
    | HTMLButtonElement
    | null;
  if (!spinner || !toast || !toastMessage || !retryBtn || !closeBtn) {
    console.warn(
      "ローディング/エラー UI 要素が見つからないため配線をスキップします",
    );
    return;
  }

  renderLoadingUI = (state) => {
    spinner.hidden = !isSpinnerVisible(state);
    if (hasError(state)) {
      const years = failedYears(state);
      toastMessage.textContent = `${
        years.join("・")
      } 年の地図データ取得に失敗しました`;
      toast.hidden = false;
    } else {
      toast.hidden = true;
    }
  };

  // AC #3: 失敗した年代を再取得する。成功すれば hasError が false になりトーストが消える。
  retryBtn.addEventListener("click", () => {
    for (const year of failedYears(loadingState)) {
      void switchYear(year);
    }
  });

  // ユーザーが明示的に閉じたら失敗集合をクリアする（再試行はしない）
  closeBtn.addEventListener("click", () => {
    updateLoadingState(clearErrors(loadingState));
  });

  renderLoadingUI(loadingState);
}

setupLoadingUI();

/**
 * タイムラインスライダー（app-spec §5.1）を組み立てて配線する。
 *
 * 離散スライダーの実体は `input[type=range]`（0..19 の index）で、値→年は yearAtIndex。
 * datalist で 20 目盛りを提示し、間の年は index 化できないため選べない（AC #1）。
 *
 * UI 反映の方針:
 * - ユーザー操作（要求）時は syncUI で即時に UI を更新し、操作追従性を確保する。
 * - 加えて applyFn（最新要求のみ到達）から reflectYearToTimeline 経由でも syncUI を呼ぶ。
 *   どちらの経路も「最後にユーザーが要求した年」へ収束し、遅延解決した古い要求で
 *   UI が巻き戻ることはない（switchYear のトークンガードが古い反映を破棄するため）。
 *
 * キーボード二重発火対策:
 * - keydown は document で受けるが、フォーカスがスライダー自身の場合は何もしない。
 *   range は矢印キーで値が変わり input イベントを発火するので、そちらの経路で 1 回
 *   だけ切り替わる。二重に stepYear すると 1 打鍵で 2 年代進む不具合になるため防ぐ。
 *   TASK-25: keyToStep が ↑↓ も返すようになったが、対象キー判定は keyToStep に
 *   集約されているためこのガードはそのまま ↑↓ にも効く（縦 range の native な
 *   ↑↓ 操作とも二重にならない）。
 */
function setupTimeline(): void {
  const root = document.getElementById("timeline");
  const yearEl = document.getElementById("timeline-year");
  const slider = document.getElementById("timeline-slider") as
    | HTMLInputElement
    | null;
  const prevBtn = document.getElementById("timeline-prev") as
    | HTMLButtonElement
    | null;
  const nextBtn = document.getElementById("timeline-next") as
    | HTMLButtonElement
    | null;
  const marks = document.getElementById("timeline-marks");
  if (!root || !yearEl || !slider || !prevBtn || !nextBtn || !marks) {
    console.warn("タイムライン UI 要素が見つからないため配線をスキップします");
    return;
  }

  const lastIndex = SNAPSHOT_YEARS.length - 1;

  // 20 目盛りを datalist に展開し、range の上限を index 空間に合わせる（AC #1）。
  slider.min = "0";
  slider.max = String(lastIndex);
  slider.step = "1";
  marks.replaceChildren(
    ...SNAPSHOT_YEARS.map((year, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.label = String(year);
      return opt;
    }),
  );

  /** 年に合わせて年表示・スライダー位置・端ボタン活性を揃える（要求/反映の共通経路） */
  function syncUI(year: number): void {
    const idx = indexOfYear(SNAPSHOT_YEARS, year);
    yearEl!.textContent = String(year);
    if (idx >= 0) slider!.value = String(idx);
    prevBtn!.disabled = idx <= 0;
    nextBtn!.disabled = idx >= lastIndex;
  }

  /** スライダーの現在 index から現在年を得る */
  function currentYear(): number {
    return yearAtIndex(SNAPSHOT_YEARS, Number(slider!.value));
  }

  /** 年を要求する: UI を即時反映し、switchYear（キャッシュ + 最新要求ガード）へ委譲 */
  function requestYear(year: number): void {
    syncUI(year);
    void switchYear(year);
  }

  // AC #2: ドラッグ / 目盛りクリック → range の input イベント
  slider.addEventListener("input", () => {
    requestYear(yearAtIndex(SNAPSHOT_YEARS, Number(slider.value)));
  });

  // AC #2: 前後ボタン（端では stepYear が停止し、ボタンも disabled になる）
  prevBtn.addEventListener("click", () => {
    requestYear(stepYear(SNAPSHOT_YEARS, currentYear(), -1));
  });
  nextBtn.addEventListener("click", () => {
    requestYear(stepYear(SNAPSHOT_YEARS, currentYear(), 1));
  });

  // AC #2: キーボード ← → / ↑ ↓（↑=古い方向・↓=新しい方向。縦レイアウトの
  // 上=古い並びと一致させる。スライダー自身にフォーカスがある時は native + input に委ねる）
  document.addEventListener("keydown", (e) => {
    const step = keyToStep(e.key);
    if (step === 0) return;
    if (e.target === slider) return; // 二重発火防止（range の input が処理する）
    e.preventDefault();
    requestYear(stepYear(SNAPSHOT_YEARS, currentYear(), step));
  });

  // applyFn（最新要求のみ）からの権威ある反映をこの UI に差し込む
  reflectYearToTimeline = syncUI;

  // 初期表示を復元年（URL または INITIAL_YEAR）に合わせる（実データ反映は
  // map load 後の switchYear）
  syncUI(initialYear);
}

setupTimeline();

/** colors.json を取得する。失敗時は空マップのままデフォルト色で継続する */
async function loadColors(): Promise<void> {
  try {
    const res = await fetch("/data/colors.json");
    if (!res.ok) throw new Error(`status ${res.status}`);
    colors = await res.json() as Record<string, string>;
  } catch (error) {
    console.warn(
      `colors.json の取得に失敗しました。デフォルト色で継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * name-overrides.json を取得する。失敗時は空マップのまま生値で継続する。
 * ラベル整形（displayLabel）が SUBJECTO の綴りゆれを正規化するのに使い、
 * 宗主補正（suzerains）は勢力圏の外枠・色キー・表示ラベルで使う（TASK-94）。
 * initPowerLayer は switchYear より前にこれを待つため、年代データへ補正を
 * 適用する withSuzerainOverrides から見て overrides は常に確定済み。
 */
async function loadOverrides(): Promise<void> {
  try {
    const res = await fetch("/data/name-overrides.json");
    if (!res.ok) throw new Error(`status ${res.status}`);
    overrides = parseSuzerainOverrides(await res.json());
  } catch (error) {
    console.warn(
      `name-overrides.json の取得に失敗しました。SUBJECTO 生値で継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * name-ja.json（英語 NAME → 日本語名）を取得する（TASK-23）。
 * 失敗時は空マップのまま英語表記で継続する。
 */
async function loadNameJa(): Promise<void> {
  try {
    const res = await fetch("/data/name-ja.json");
    if (!res.ok) throw new Error(`status ${res.status}`);
    nameJa = await res.json() as Record<string, string>;
  } catch (error) {
    console.warn(
      `name-ja.json の取得に失敗しました。英語表記で継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * fief-dedupe.json（諸侯領による base 勢力の被覆率表）を取得する（TASK-78）。
 * 失敗・未生成・不正形のときは空表のままにし、base ラベルの抑制を一切行わない
 * （= TASK-78 以前の表示。colors.json 等と同じ縮退方針）。
 */
async function loadFiefDedupe(): Promise<void> {
  try {
    const res = await fetch(FIEF_DEDUPE_DATA_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    fiefDedupe = parseFiefDedupeTable(await res.json());
  } catch (error) {
    console.warn(
      `fief-dedupe.json の取得に失敗しました。諸侯領と base の二重ラベルを抑制せず継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * rivers.geojson（主要河川ライン）を取得する（TASK-24）。
 * 失敗時は空 FeatureCollection のまま河川なしで継続する（colors.json 等と同様）。
 */
async function loadRivers(): Promise<void> {
  try {
    const res = await fetch(RIVERS_DATA_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    riversData = await res.json() as FeatureCollection;
  } catch (error) {
    console.warn(
      `rivers.geojson の取得に失敗しました。河川なしで継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * mountains.geojson（主要山脈ポリゴン）を取得する（TASK-97）。
 * 失敗・未生成時は空 FeatureCollection のまま山脈ラベルなしで継続する
 * （河川と同じ縮退方針）。
 */
async function loadMountains(): Promise<void> {
  try {
    const res = await fetch(MOUNTAINS_DATA_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    mountainsData = await res.json() as FeatureCollection;
  } catch (error) {
    console.warn(
      `mountains.geojson の取得に失敗しました。山脈ラベルなしで継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * peaks.geojson（主要山峰の Point）を取得する（TASK-99）。
 * 失敗・未生成時は空 FeatureCollection のまま山峰なしで継続する
 * （河川・山脈と同じ縮退方針）。形の検証は表示時の peakEntries が行うため、
 * ここでは丸ごと保持する。
 */
async function loadPeaks(): Promise<void> {
  try {
    const res = await fetch(PEAKS_DATA_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    peaksData = await res.json() as FeatureCollection;
  } catch (error) {
    console.warn(
      `peaks.geojson の取得に失敗しました。山峰なしで継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * cities.json（年 → 主要都市配列）を取得する（TASK-27）。
 * 失敗・未生成時は空のまま都市なしで継続する（colors.json 等と同様）。
 * 形の検証は表示時の cityEntriesForYear が行うため、ここでは丸ごと保持する。
 */
async function loadCities(): Promise<void> {
  try {
    const res = await fetch(CITIES_DATA_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    citiesData = await res.json() as CitiesData;
  } catch (error) {
    console.warn(
      `cities.json の取得に失敗しました。都市なしで継続します: ${
        String(error)
      }`,
    );
  }
}

/**
 * notes.json（年 → 歴史解説）を取得する（TASK-33）。
 * 失敗・未生成・不正形（parseNotesData が null）のときは notesData を null の
 * まま維持し、revealNotesToggle を呼ばないためトグルボタンごと非表示になる
 * （従来表示を一切変えない）。
 */
async function loadNotes(): Promise<void> {
  try {
    const res = await fetch(NOTES_DATA_URL);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const parsed = parseNotesData(await res.json());
    if (parsed === null) throw new Error("years が不正または空");
    notesData = parsed;
    revealNotesToggle();
  } catch (error) {
    console.warn(
      `notes.json の取得に失敗しました。解説なしで継続します: ${String(error)}`,
    );
  }
}

/** 初期年代の勢力圏を描画する。例外で地図全体を落とさない */
async function initPowerLayer(): Promise<void> {
  try {
    // TASK-23: name-ja.json のロード完了を待ってから初期描画するため、初期
    // ラベル・ツールチップは最初から日本語で表示される（失敗時のみ英語継続）。
    // TASK-24: rivers.geojson も初期描画前に揃え、初回から河川を重ねる。
    // TASK-27: cities.json も同様に揃え、初回から都市マーカーを重ねる。
    // TASK-33: notes.json も初期描画前に揃え、初回の年確定（applyFn →
    // reflectYearToNotes）の時点で解説を描画できるようにする。
    // TASK-46: known-limitations.json も同様に揃え、初回描画前にトグルを出す。
    await Promise.all([
      loadColors(),
      loadOverrides(),
      loadNameJa(),
      loadRivers(),
      // TASK-97: mountains.geojson も初期描画前に揃え、初回から山脈名を重ねる
      loadMountains(),
      // TASK-99: peaks.geojson も同様に揃え、初回から山峰マーカーを重ねる
      loadPeaks(),
      loadCities(),
      loadNotes(),
      loadKnownLimitations(),
      // TASK-78: 初期年（1000）が諸侯領オーバーレイ対象年なので、初期描画前に
      // 被覆率表を揃えて 1 フレーム目から二重ラベルを出さないようにする
      loadFiefDedupe(),
    ]);
    await switchYear(initialYear);
  } catch (error) {
    console.error(`勢力圏レイヤーの初期化に失敗しました: ${String(error)}`);
  }
}

// スタイル読み込み完了後に overlay を統合し、初期年代を描画する。
map.on("load", () => {
  map.addControl(overlay);
  // TASK-77: ラベル専用の overlaid オーバーレイ。interleaved の overlay より
  // 後に追加し、地図 canvas の上（= 全レイヤーの最前面）にラベルを重ねる。
  map.addControl(labelOverlay);
  void initPowerLayer();
});

// 目視確認・TASK-6 スライダー用に year 切替を公開する（インラインスクリプト不要）。
(globalThis as unknown as {
  __setYear?: (year: number) => Promise<void>;
  __getYear?: () => number;
}).__setYear = switchYear;
(globalThis as unknown as { __getYear?: () => number }).__getYear = () =>
  yearSwitcher.currentYear() ?? INITIAL_YEAR;

// TASK-66: ヘッドレス CDP 検証用にズーム別都市表示の内部状態を公開する
// （__getYear と同じ「目視/無人確認のための読み取り専用フック」。deck.gl の
// canvas からは表示都市数を数えられないため、フィルタ結果の件数を直接返す）。
(globalThis as unknown as {
  __getCityDebug?: () => {
    zoomStep: number;
    rankLimit: number;
    totalCities: number;
    visibleCities: number;
  };
}).__getCityDebug = () => {
  const year = yearSwitcher.currentYear() ?? INITIAL_YEAR;
  const entries = cityEntriesForYear(citiesData, year);
  return {
    zoomStep: zoomStep,
    rankLimit: visibleCityRankLimit(zoomStep),
    totalCities: entries.length,
    visibleCities: filterCitiesByZoom(entries, zoomStep).length,
  };
};

// TASK-97: ヘッドレス CDP 検証用に山脈ラベルの表示状態を公開する
// （__getCityDebug と同じ読み取り専用フック）。canvas からは表示中のラベルを
// 数えられないため、ズーム段・表示中の山脈名・アンカーの画面座標を直接返す。
// AC #2（ズーム出し分け）は visibleLabels の増減で、AC #8（陰影との位置一致）は
// screen の座標をスクリーンショットと突き合わせて確認する。
(globalThis as unknown as {
  __getMountainLabelDebug?: () => {
    zoomStep: number;
    totalMountains: number;
    visibleLabels: { name: string; text: string; minZoom: number }[];
    screen: { name: string; x: number; y: number }[];
  };
}).__getMountainLabelDebug = () => {
  const { data } = memoizedMountainLabelData(mountainsData, nameJa);
  const visible = filterVisibleMountainLabels(data, zoomStep);
  return {
    zoomStep,
    totalMountains: data.length,
    visibleLabels: visible.map((d) => ({
      name: d.name,
      text: d.text,
      minZoom: d.minZoom,
    })),
    screen: visible.map((d) => {
      const point = map.project(d.position);
      return { name: d.name, x: point.x, y: point.y };
    }),
  };
};

// TASK-99: ヘッドレス CDP 検証用に山峰マーカー/ラベルの表示状態を公開する
// （__getMountainLabelDebug と同じ読み取り専用フック）。AC #4（ズーム出し分け）は
// visible の増減で、AC #9（陰影の山地との位置一致）は screen の座標を
// スクリーンショットと突き合わせて確認する。text はそのズーム段で実際に描く
// 文字列（標高併記の有無を含む）。
(globalThis as unknown as {
  __getPeakDebug?: () => {
    zoomStep: number;
    totalPeaks: number;
    visible: {
      name: string;
      text: string;
      elevation: number | null;
      priority: number;
      x: number;
      y: number;
    }[];
  };
}).__getPeakDebug = () => {
  const allEntries = memoizedPeakEntries(peaksData);
  const labels = memoizedPeakLabelData(
    memoizedVisiblePeaks(allEntries, zoomStep),
    nameJa,
  );
  return {
    zoomStep,
    totalPeaks: allEntries.length,
    visible: labels.map((d) => {
      const point = map.project(d.position);
      return {
        name: d.name,
        text: peakLabelText(d, zoomStep),
        elevation: d.elevation,
        priority: d.priority,
        x: point.x,
        y: point.y,
      };
    }),
  };
};

// TASK-122: ヘッドレス CDP 検証用に勢力ラベルのズーム別表示状態を公開する
// （__getMountainLabelDebug と同じ読み取り専用フック）。canvas からは表示中の
// ラベルを数えられないため、絞り込み前後の内訳を直接返す。AC #1/#2 は
// visible の kind 別件数で、AC #4（base 抑制の解除）は suppressedVisible
// （そのズーム段で復活している base ラベル名）で確認する。
(globalThis as unknown as {
  __getPowerLabelDebug?: () => {
    zoomStep: number;
    fiefLabelsVisible: boolean;
    total: Record<string, number>;
    visible: Record<string, number>;
    suppressedVisible: string[];
    characterSetSize: number;
  };
}).__getPowerLabelDebug = () => {
  const view = currentView;
  const { data, characterSet } = view === null
    ? { data: [] as LabelDatum[], characterSet: [] as string[] }
    : memoizedPowerLabelData(
      view.year,
      view.base,
      view.hre,
      view.fiefs,
      view.italyFiefs,
      view.cliopatriaFiefs,
      nameJa,
      fiefDedupe,
    );
  const countByKind = (list: readonly LabelDatum[]) => {
    const counts: Record<string, number> = { base: 0, hre: 0, fief: 0 };
    for (const d of list) counts[d.kind ?? "base"]++;
    return counts;
  };
  const visible = memoizedVisiblePowerLabels(data, zoomStep);
  return {
    zoomStep,
    fiefLabelsVisible: fiefLabelsVisibleAt(zoomStep),
    total: countByKind(data),
    visible: countByKind(visible),
    suppressedVisible: visible.filter((d) => d.suppressed === true).map((d) =>
      d.text
    ),
    characterSetSize: characterSet.length,
  };
};

// TASK-69: ヘッドレス CDP 検証用に河川ラベルの表示状態を公開する
// （__getCityDebug と同じ「目視/無人確認のための読み取り専用フック」。deck.gl の
// canvas からは表示中の河川ラベルを数えられないため、フィルタ結果を直接返す）。
(globalThis as unknown as {
  __getRiverLabelDebug?: () => {
    hovered: string | null;
    selected: string | null;
    visibleLabels: string[];
  };
}).__getRiverLabelDebug = () => {
  const { data } = memoizedRiverLabelData(riversData, nameJa);
  return {
    hovered: hoveredRiverName,
    selected: selectedRiverName,
    visibleLabels: filterVisibleRiverLabels(
      data,
      hoveredRiverName,
      selectedRiverName,
    ).map((d) => d.name),
  };
};

// TASK-71: ヘッドレス CDP 検証用に中世フランス諸侯領オーバーレイの表示状態を
// 公開する（__getCityDebug / __getRiverLabelDebug と同じ「目視/無人確認のための
// 読み取り専用フック」。deck.gl の canvas からは表示中の諸侯領・ラベルを
// 数えられないため、現在年のオーバーレイ有無・feature 数・ラベル名一覧を直接返す）。
// AC #4 の「対象外の年で表示されない」ことは overlay=false / featureCount=0 /
// labels=[] で確認できる。
(globalThis as unknown as {
  __getFranceFiefDebug?: () => {
    year: number;
    overlay: boolean;
    featureCount: number;
    labels: string[];
  };
}).__getFranceFiefDebug = () => {
  const year = yearSwitcher.currentYear() ?? INITIAL_YEAR;
  const fiefs = currentView?.fiefs ?? EMPTY_FEATURE_COLLECTION;
  return {
    year,
    overlay: hasFranceFiefOverlay(year, FRANCE_FIEF_OVERLAY_YEARS),
    featureCount: fiefs.features.length,
    labels: buildLabelData(fiefs, nameJa, "fief").map((d) => d.text),
  };
};

// TASK-86: ヘッドレス CDP 検証用に HRE 領邦オーバーレイの表示状態を公開する
// （__getFranceFiefDebug と同型の読み取り専用フック）。中世（OHM 由来）と
// 近世（Roller 由来）で出典が替わっても同じ hre-powers レイヤーに載ることを、
// 年代を切り替えながら source / featureCount / labels で確認できる。
(globalThis as unknown as {
  __getHreFiefDebug?: () => {
    year: number;
    overlay: boolean;
    source: "ohm-medieval" | "roller-early-modern" | "none";
    featureCount: number;
    labels: string[];
  };
}).__getHreFiefDebug = () => {
  const year = yearSwitcher.currentYear() ?? INITIAL_YEAR;
  const hre = currentView?.hre ?? EMPTY_FEATURE_COLLECTION;
  const overlay = hasHreOverlay(year, HRE_ALL_OVERLAY_YEARS);
  return {
    year,
    overlay,
    source: !overlay
      ? "none"
      : HRE_FIEF_OVERLAY_YEARS.includes(year)
      ? "ohm-medieval"
      : "roller-early-modern",
    featureCount: hre.features.length,
    labels: buildLabelData(hre, nameJa, "hre").map((d) => d.text),
  };
};

// TASK-96: ヘッドレス CDP 検証用に中世イタリア諸侯領オーバーレイの表示状態を
// 公開する（__getFranceFiefDebug / __getHreFiefDebug と同型の読み取り専用フック）。
// AC #1（1200 年のフィレンツェ・ジェノヴァ・ピサ・シエナ・ルッカ・スポレート）・
// AC #2（1100 年のトスカーナ辺境伯領）は labels の内容で確認できる。
(globalThis as unknown as {
  __getItalyFiefDebug?: () => {
    year: number;
    overlay: boolean;
    featureCount: number;
    labels: string[];
  };
}).__getItalyFiefDebug = () => {
  const year = yearSwitcher.currentYear() ?? INITIAL_YEAR;
  const italyFiefs = currentView?.italyFiefs ?? EMPTY_FEATURE_COLLECTION;
  return {
    year,
    overlay: hasItalyFiefOverlay(year, ITALY_FIEF_OVERLAY_YEARS),
    featureCount: italyFiefs.features.length,
    labels: buildLabelData(italyFiefs, nameJa, "fief").map((d) => d.text),
  };
};

// TASK-110: ヘッドレス CDP 検証用に Cliopatria 由来の領邦オーバーレイの表示
// 状態を公開する（__getItalyFiefDebug と同型の読み取り専用フック）。
// AC #5（1000/1100 年のアキテーヌ公領・トゥールーズ伯領・王領、1279〜1492 年の
// バイエルン公領）は labels の内容で、AC #3（出典が OHM 由来と区別できる）は
// source の内容で確認できる。hreLabels / fiefLabels を分けて返すのは、
// 凡例（臙脂 = 帝国領邦 / 藍紫 = 諸侯領）の出し分けが宗主どおりに効いて
// いるかを canvas を見ずに突き合わせるため。
(globalThis as unknown as {
  __getCliopatriaFiefDebug?: () => {
    year: number;
    overlay: boolean;
    featureCount: number;
    source: unknown;
    hreLabels: string[];
    fiefLabels: string[];
  };
}).__getCliopatriaFiefDebug = () => {
  const year = yearSwitcher.currentYear() ?? INITIAL_YEAR;
  const cliopatriaFiefs = currentView?.cliopatriaFiefs ??
    EMPTY_FEATURE_COLLECTION;
  const groups = partitionFiefsBySuzerain(cliopatriaFiefs);
  return {
    year,
    overlay: hasCliopatriaFiefOverlay(year, CLIOPATRIA_FIEF_OVERLAY_YEARS),
    featureCount: cliopatriaFiefs.features.length,
    // TASK-109 の出典 metadata（source / license / sourceUrl …）をそのまま返す。
    // 情報パネルに出るのと同じ値なので、AC #3 の「OHM 由来と区別できる」を
    // 出典行の生成前の段階で確認できる。
    source: collectionMetadata(cliopatriaFiefs),
    hreLabels: buildLabelData(groups.hre, nameJa, "hre").map((d) => d.text),
    fiefLabels: buildLabelData(groups.fief, nameJa, "fief").map((d) => d.text),
  };
};

// TASK-80: ヘッドレス CDP 検証用に概略境界（MapLibre line レイヤー）の状態を
// 公開する（__getCityDebug と同じ読み取り専用フック）。canvas のピクセルからは
// 「どの区間がどの段で描かれているか」を数えられないため、段ごとの run 数と
// スタイル上の重ね順（塗り → 概略境界 → 海洋 water）を直接返す。
(globalThis as unknown as {
  __getApproximateBorderDebug?: () => {
    year: number;
    sourcePresent: boolean;
    layers: { id: string; index: number }[];
    fillGroupIndex: number;
    waterIndex: number;
    stackValid: boolean;
    styleOrder: string[];
    runsByTier: Record<string, number>;
    longestRunKm: number;
  };
}).__getApproximateBorderDebug = () => {
  const styleLayerIds = currentStyleLayerIds();
  const runsByTier: Record<string, number> = {};
  let longestRunKm = 0;
  for (const feature of approximateBorderData.features) {
    const tier = String(feature.properties?.[TIER_PROPERTY]);
    runsByTier[tier] = (runsByTier[tier] ?? 0) + 1;
    longestRunKm = Math.max(
      longestRunKm,
      Number(feature.properties?.[MAX_SEGMENT_KM_PROPERTY] ?? 0),
    );
  }
  return {
    year: yearSwitcher.currentYear() ?? INITIAL_YEAR,
    sourcePresent: map.getSource(APPROXIMATE_BORDER_SOURCE_ID) !== undefined,
    layers: APPROXIMATE_BORDER_LAYER_IDS.map((id) => ({
      id,
      index: styleLayerIds.indexOf(id),
    })),
    // 政治ポリゴンの塗りは deck のレイヤーグループ（custom レイヤー）として
    // 1 枚に束ねられる（"powers" という ID はスタイル上に存在しない）
    fillGroupIndex: styleLayerIds.indexOf(
      politicalFillGroupId(styleLayerIds) ?? "",
    ),
    waterIndex: styleLayerIds.indexOf(WATER_LAYER_ID),
    stackValid: approximateBorderStackIsValid(styleLayerIds),
    styleOrder: styleLayerIds,
    runsByTier,
    longestRunKm,
  };
};

// TASK-82: ヘッドレス CDP 検証用に「画面座標 (x, y) をホバー/クリックしたら
// 何が拾えるか」を公開する（__getCityDebug と同じ読み取り専用フック）。
// ホバー側は Deck が onHover で使うのと同じ pickObject（pickingRadius 付き）、
// クリック側はさらに resolveClickInfo を通した結果で、両者のレイヤー ID と
// 表示ラベルを返す。都市マーカー中心からのオフセットを変えながら呼べば、
// 実効判定範囲（cities.ts CITY_PICK_TOLERANCE_PX = 9px）とホバー/クリックの
// 一致（AC #1/#2）、河畔都市・密集地域での取り違えの有無（AC #3/#6）を
// canvas のピクセルを見ずに確認できる。
(globalThis as unknown as {
  __probePick?: (x: number, y: number) => {
    hoverLayer: string | null;
    hoverLabel: string | null;
    clickLayer: string | null;
    clickLabel: string | null;
  };
}).__probePick = (x, y) => {
  const raw = overlay.pickObject({ x, y, radius: PICKING_RADIUS_PX }) ??
    ({ x, y, layer: null, object: undefined } as unknown as PickingInfo);
  const click = resolveClickInfo(raw);
  return {
    hoverLayer: raw.layer?.id ?? null,
    hoverLabel: pickedLabel(raw),
    clickLayer: click.layer?.id ?? null,
    clickLabel: pickedLabel(click),
  };
};

// TASK-90: ヘッドレス CDP 検証用に政治ポリゴンの強調状態を公開する
// （__getCityDebug と同じ読み取り専用フック）。canvas のピクセルからは
// 「どの feature がアクティブ色で塗られているか」を数えられないため、
// 現在の選択・ホバーキーと、そのキーでアクティブになる feature 数を
// レイヤー別に返す。飛び地を含む同一勢力が同時に強調されること（AC #1/#4）と、
// 解除（AC #2/#6）・HRE 帝国範囲強調との併存（AC #5）を無人で確認できる。
(globalThis as unknown as {
  __getPowerHighlightDebug?: () => {
    selected: string | null;
    hovered: string | null;
    activeColor: number[];
    activeFeatures: Record<string, number>;
    extentKey: string | null;
    extentMembers: string[];
  };
}).__getPowerHighlightDebug = () => {
  const selected = powerHighlight.selected();
  const hovered = powerHighlight.hovered();
  const countActive = (fc: FeatureCollection) =>
    fc.features.filter((f) =>
      isPowerActive(colorKeyFor(f.properties), selected, hovered)
    ).length;
  return {
    selected,
    hovered,
    activeColor: [...ACTIVE_FILL_COLOR],
    activeFeatures: {
      [POWER_LAYER_ID]: countActive(
        // TASK-92: powers が実際に塗るのは派生 base（対象年）なのでそれを数える
        powerFillDataFor(
          currentView?.base ?? EMPTY_FEATURE_COLLECTION,
          currentView?.baseFill ?? EMPTY_FEATURE_COLLECTION,
        ),
      ),
      [HRE_LAYER_ID]: countActive(currentView?.hre ?? EMPTY_FEATURE_COLLECTION),
      [FRANCE_FIEF_LAYER_ID]: countActive(
        currentView?.fiefs ?? EMPTY_FEATURE_COLLECTION,
      ),
      [ITALY_FIEF_LAYER_ID]: countActive(
        currentView?.italyFiefs ?? EMPTY_FEATURE_COLLECTION,
      ),
      [CLIOPATRIA_FIEF_LAYER_ID]: countActive(
        currentView?.cliopatriaFiefs ?? EMPTY_FEATURE_COLLECTION,
      ),
    },
    // TASK-94: 外枠の対象（宗主キー）と、その外枠に含まれる base feature の
    // NAME 一覧。canvas のピクセルからは外枠の範囲を読めないため、実機検証は
    // ここで「誰が囲まれているか」を突き合わせる（AC #1/#3/#8/#9）。
    extentKey,
    extentMembers: extractSuzerainMembers(
      currentView?.base ?? EMPTY_FEATURE_COLLECTION,
      extentKey,
      overrides,
    ).map((f) => String(f.properties?.NAME ?? "")),
  };
};

// TASK-82: __probePick の呼び出し座標を組み立てるための補助フック。現在表示中の
// 都市マーカー（ズームフィルタ済み）の画面座標（container px = deck の x/y と
// 同一系）を返す。密集地域（1500 年 HRE 域）での隣接都市の間隔や、河畔都市
// （パリ・ルーアン）の中心座標を実行時に取得して probe に渡すために使う。
(globalThis as unknown as {
  __getCityScreenPositions?: () => { name: string; x: number; y: number }[];
}).__getCityScreenPositions = () => {
  const year = yearSwitcher.currentYear() ?? INITIAL_YEAR;
  const entries = memoizedVisibleCityEntries(citiesData, year, zoomStep);
  return entries.map((entry) => {
    const point = map.project([entry.lon, entry.lat]);
    return { name: entry.name, x: point.x, y: point.y };
  });
};
