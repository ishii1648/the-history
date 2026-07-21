import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { MapboxOverlay } from "@deck.gl/mapbox";
import type { Layer, PickingInfo } from "@deck.gl/core";
import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import {
  CollisionFilterExtension,
  type CollisionFilterExtensionProps,
} from "@deck.gl/extensions";
import type { Feature, FeatureCollection } from "geojson";
import { buildBasemapStyle } from "./basemap.ts";
import {
  type BasemapErrorEvent,
  createFallbackState,
  decideFallback,
} from "./fallback.ts";
import {
  createCombinedYearLoader,
  createHreOverlayLoader,
  createYearDataLoader,
  createYearSwitcher,
  EMPTY_FEATURE_COLLECTION,
  fillColorFor,
  LINE_COLOR,
  LINE_WIDTH_PX,
} from "./powers.ts";
import { displayLabel } from "./info.ts";
import {
  buildLabelData,
  characterSetFrom,
  labelColorFor,
  type LabelDatum,
} from "./labels.ts";
import { extractHreExtent, shouldHighlightHre } from "./hre_extent.ts";
import {
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
  cityDisplayName,
  cityEntriesForYear,
  type CityMarkerDatum,
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
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  DEM_PMTILES_URL,
  FALLBACK_STYLE_URL,
  HRE_OVERLAY_YEARS,
  INITIAL_CENTER,
  INITIAL_YEAR,
  INITIAL_ZOOM,
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
import {
  ariaExpandedValue,
  createFooterState,
  type FooterEvent,
  isContentHidden,
  reduceFooterEvent,
} from "./footer.ts";
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
  CITY_LAYER_ID,
  HRE_LAYER_ID,
  layerOrderMatchesPickingPriority,
  PICKING_PRIORITY,
  POWER_LAYER_ID,
  renderOrderFromPickingPriority,
  RIVERS_LAYER_ID,
} from "./picking.ts";

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

// ---- 勢力圏ポリゴンレイヤー（TASK-5, docs/app-spec.md §3.3, §4.3）----

// pickable なレイヤーの ID（powers / hre-powers / cities / rivers）は
// picking.ts に集約した（TASK-29）。picking の優先順位（PICKING_PRIORITY）と
// 描画順の対応を 1 箇所で管理するため。各レイヤーとも年代切替・選択変更で
// 同一 ID を保ち、data 差し替えのみで deck.gl の差分更新に任せる方針は不変。

/**
 * 勢力名ラベル（TextLayer）のレイヤー ID（TASK-20）。
 * powers / hre-powers の上に重ね、年代切替では data のみ差し替える。
 */
const LABEL_LAYER_ID = "power-labels";

/** 河川名ラベル（TextLayer）のレイヤー ID（TASK-24） */
const RIVER_LABEL_LAYER_ID = "river-labels";

/** 都市名ラベル（TextLayer）のレイヤー ID（TASK-27） */
const CITY_LABEL_LAYER_ID = "city-labels";

/**
 * HRE 帝国範囲の強調オーバーレイ（GeoJsonLayer）のレイヤー ID（TASK-30）。
 * pickable: false のため PICKING_PRIORITY には含めない（picking 非関与）。
 */
const HRE_EXTENT_LAYER_ID = "hre-extent";

/**
 * 帝国範囲の強調色（TASK-30 AC #2）。HRE 領邦ラベルの臙脂
 * （labels.ts HRE_LABEL_COLOR）と同系色で「帝国系」の記号を揃える。
 * 外縁線は不透明、塗りはごく薄くして下の勢力塗り・領邦境界を隠さない。
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

/** 帝国範囲の外縁線の太さ（px）。通常の勢力境界（1px 白）より明確に太くする */
const HRE_EXTENT_LINE_WIDTH_PX = 3;

/**
 * picking の許容半径（px）。細い河川ライン（通常 2px）でもカーソルが多少
 * ずれた位置のクリック/ホバーを拾えるようにする（TASK-24 AC #2）。
 */
const PICKING_RADIUS_PX = 6;

/** colors.json（NAME / "NAME|SUBJECTO" → HEX のフラットマップ） */
let colors: Record<string, string> = {};

/** name-overrides.json の renames（SUBJECTO 生値 → 正規化名）。ラベル整形で使う */
let renames: Record<string, string> = {};

/**
 * name-ja.json（英語 NAME → 日本語名のフラットマップ）。ツールチップ・パネル・
 * 地図上ラベルの表示だけを日本語化する（TASK-23）。未登録名は英語のまま。
 */
let nameJa: Record<string, string> = {};

// 年代 GeoJSON のローダ（fetch は本番のもの）。base（europe_*）と HRE 領邦
// オーバーレイ（hre_*、対象年のみ）を複合ローダで束ね、並行ロードして両方
// 揃ってから反映する。HRE の取得失敗は powers.ts 側で warn + 空扱いになり、
// base の表示・ローディング/エラー UI（failLoading）は base 失敗時のみ動く。
const dataLoader = createCombinedYearLoader(
  createYearDataLoader((url) => fetch(url)),
  createHreOverlayLoader((url) => fetch(url), HRE_OVERLAY_YEARS),
);

/** 主要河川 GeoJSON（起動時に 1 度ロード。失敗時は空のまま河川なしで継続） */
let riversData: FeatureCollection = EMPTY_FEATURE_COLLECTION;

/**
 * 主要都市データ（TASK-27。起動時に 1 度ロード）。
 * 取得失敗・未生成時は空のまま都市なしで継続する（colors.json 等と同様）。
 */
let citiesData: CitiesData = { years: {} };

/** クリックで選択（強調）中の河川名。null は未選択（TASK-24 AC #2） */
let selectedRiverName: string | null = null;

/**
 * HRE 本体・域内領邦のホバー/クリック中に帝国範囲を強調表示するか
 * （TASK-30 AC #2/#3）。判定は hre_extent.ts の shouldHighlightHre に委ねる。
 */
let hreHighlighted = false;

/** 直近に反映された年代のデータ。選択変更時のレイヤー再構築で使う */
let currentView:
  | { year: number; base: FeatureCollection; hre: FeatureCollection }
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
const overlay = new MapboxOverlay({
  interleaved: true,
  layers: [],
  pickingRadius: PICKING_RADIUS_PX,
  onHover: handlePickHover,
  onClick: handlePickClick,
});

/**
 * 指定年代の FeatureCollection から GeoJsonLayer を 1 枚生成する。
 * data 以外のプロパティは全年代で不変。updateTriggers に year を渡し、
 * 色関数の再評価を促す（colors 読み込み前後でも齟齬が出ないようにする）。
 * powers と hre-powers の 2 枚で共用し、id 以外は同一の挙動にする（TASK-19）。
 */
function buildPowerLayer(
  id: string,
  year: number,
  data: FeatureCollection,
): GeoJsonLayer {
  return new GeoJsonLayer({
    id,
    data,
    // AC #3: ホバー/クリックを有効化（ツールチップ UI は TASK-7）
    pickable: true,
    stroked: true,
    filled: true,
    // AC #2: 塗り色は colors.json 参照・opacity 0.5 相当（alpha はカラーに内包）
    getFillColor: (f: Feature) => fillColorFor(f.properties, colors),
    // AC #2: 白系の境界線
    getLineColor: LINE_COLOR,
    lineWidthUnits: "pixels",
    getLineWidth: LINE_WIDTH_PX,
    // 塗りの alpha はカラー側で表現するため、レイヤー opacity は等倍にする
    opacity: 1,
    updateTriggers: { getFillColor: [year] },
    // AC #5: 年代切替時に塗り色を数百 ms かけて補間し、ポリゴンをフェードさせる。
    // 同一 layer id を保つため deck.gl が差分更新し、getFillColor の遷移が発火する。
    transitions: { getFillColor: { duration: 400 } },
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
 * 「単一 pick = PICKING_PRIORITY の最優先候補」が成立し、河川と勢力が重なる
 * 位置では常に河川名が優先される（AC #2。pickMultipleObjects は不要）。
 */
function pickedLabel(info: PickingInfo): string | null {
  const layerId = info.layer?.id;
  if (info.object === undefined || layerId === undefined) return null;
  if (layerId === CITY_LAYER_ID) {
    // 都市は cityDisplayName で解決（Venice 等の勢力名衝突キーは都市訳を優先）
    return cityDisplayName((info.object as CityMarkerDatum).name, nameJa);
  }
  const feature = info.object as Feature;
  if (layerId === RIVERS_LAYER_ID) {
    const name = riverNameFor(feature.properties);
    return name === null ? null : nameJa[name] ?? name;
  }
  if (layerId === POWER_LAYER_ID || layerId === HRE_LAYER_ID) {
    return displayLabel(feature.properties, renames, nameJa);
  }
  return null;
}

/**
 * Deck レベルのホバー処理（TASK-24 AC #3）。最前面の picking 結果 1 件だけを
 * 受け取るため、河川ライン上では河川名、勢力ポリゴン上では勢力ラベル、
 * どちらも無ければ非表示、が一意に決まる（rivers が powers のホバーを阻害しない）。
 */
function handlePickHover(info: PickingInfo): void {
  const label = pickedLabel(info);
  if (label !== null) showTooltip(label, info.x, info.y);
  else hideTooltip();
  // TASK-30 AC #2/#3: HRE 本体・域内領邦のホバーで帝国範囲を強調し、
  // ホバー解除（picking なし・非 HRE 対象）で通常表示へ戻す
  applyHreHighlight(hreHighlightFromPick(info));
}

/**
 * picking 結果から帝国範囲を強調すべきかを判定する（TASK-30）。
 * 判定本体は hre_extent.ts の shouldHighlightHre（純粋関数）。都市マーカーの
 * picking 結果は GeoJSON Feature ではないが、shouldHighlightHre がレイヤー ID
 * を先に見るため properties が undefined でも安全に false になる。
 */
function hreHighlightFromPick(info: PickingInfo): boolean {
  if (info.object === undefined || info.layer === null) return false;
  return shouldHighlightHre(
    info.layer.id,
    (info.object as Feature).properties,
    renames,
  );
}

/** 帝国範囲の強調状態を更新し、変化があればレイヤーを再構築して反映する */
function applyHreHighlight(next: boolean): void {
  if (next === hreHighlighted) return;
  hreHighlighted = next;
  renderLayers();
}

/**
 * Deck レベルのクリック処理（TASK-24 AC #2/#3）。
 * - 河川ライン: 選択をトグルし、選択時は情報パネルに河川名を表示
 * - 勢力ポリゴン: 従来どおり勢力ラベルをパネル表示し、河川選択は解除
 * - 何も無い場所: 河川選択を解除（Deck の onClick は picking なしでも
 *   layer: null の info で呼ばれることを @deck.gl/core の実装で確認済み）
 */
function handlePickClick(info: PickingInfo): void {
  // TASK-30 AC #2/#3: クリックでも帝国範囲の強調/解除を反映する（デスクトップ
  // ではホバー経路で既に反映済みだが、ホバーの無いタッチ操作でも成立させる。
  // 別の場所（河川・都市・非 HRE 勢力・空白）のクリックは false 側へ倒れて
  // 強調が解除される）
  applyHreHighlight(hreHighlightFromPick(info));
  const layerId = info.layer?.id;
  if (layerId === RIVERS_LAYER_ID && info.object !== undefined) {
    const name = riverNameFor((info.object as Feature).properties);
    applyRiverSelection(toggleRiverSelection(selectedRiverName, name));
    if (selectedRiverName !== null) {
      const label = pickedLabel(info);
      if (label !== null) showInfoPanel(label);
    }
    return;
  }
  // 河川以外（都市マーカー・勢力ポリゴン・空白）のクリックは河川選択を解除し、
  // picking があれば整形済みラベル（都市名/勢力名）をパネルへ出す（TASK-27）
  applyRiverSelection(null);
  const label = pickedLabel(info);
  if (label !== null) showInfoPanel(label);
}

/** 河川の選択状態を更新し、変化があればレイヤーを再構築して反映する */
function applyRiverSelection(next: string | null): void {
  if (next === selectedRiverName) return;
  selectedRiverName = next;
  renderLayers();
}

/**
 * 主要河川ラインの GeoJsonLayer を生成する（TASK-24）。
 * 色・幅は rivers.ts の純粋関数で決め、選択中の河川全体（同名 feature）を
 * 太く濃色で強調する。選択状態は updateTriggers で再評価させる。
 */
function buildRiversLineLayer(): GeoJsonLayer {
  return new GeoJsonLayer({
    id: RIVERS_LAYER_ID,
    data: riversData,
    pickable: true,
    stroked: false,
    filled: false,
    getLineColor: (f: Feature) =>
      riverLineColor(riverNameFor(f.properties), selectedRiverName),
    lineWidthUnits: "pixels",
    getLineWidth: (f: Feature) =>
      riverLineWidth(riverNameFor(f.properties), selectedRiverName),
    lineWidthMinPixels: 1,
    lineCapRounded: true,
    lineJointRounded: true,
    updateTriggers: {
      getLineColor: [selectedRiverName],
      getLineWidth: [selectedRiverName],
    },
  });
}

/**
 * 河川名ラベルの TextLayer を生成する（TASK-24 AC #1）。
 * アンカーは最長 LineString の中点（rivers.ts riverLabelAnchors）。勢力ラベル
 * より小さめの水色系文字 + 白 halo で「水系の注記」に見えるようにし、
 * CollisionFilterExtension（勢力ラベルと同一衝突空間）でライン長由来の
 * priority により長い川を優先表示する。pickable: false でライン・ポリゴンの
 * picking を妨げない。
 */
function buildRiverLabelLayer(): TextLayer<
  LabelDatum,
  CollisionFilterExtensionProps<LabelDatum>
> {
  const data = riverLabelAnchors(riversData, nameJa);
  return new TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>>({
    id: RIVER_LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => d.text,
    getPosition: (d) => d.position,
    // 勢力ラベル（13px）より控えめな 11px・濃い水色（#0277bd）+ 白 halo
    getSize: 11,
    sizeUnits: "pixels",
    getColor: [2, 119, 189, 255],
    fontFamily: "sans-serif",
    fontWeight: 600,
    fontSettings: { sdf: true },
    outlineWidth: 2,
    outlineColor: [255, 255, 255, 220],
    // 日本語名（ライン川 等）のグリフもラベル文字列から自動生成する
    characterSet: characterSetFrom(data.map((d) => d.text)),
    extensions: [new CollisionFilterExtension()],
    collisionTestProps: { sizeScale: 2 },
    getCollisionPriority: (d: LabelDatum) => d.priority,
  });
}

/**
 * 主要都市マーカーの ScatterplotLayer を生成する（TASK-27 AC #1/#3/#6）。
 * 小さな濃色ドット + 白縁で、勢力の半透明塗りの上でも視認できるようにする。
 * レイヤー順は hre-powers の上・rivers の下（renderLayers）に置き、picking の
 * 優先順位を 河川 > 都市 > 国名 にする。年代切替では同一 ID のまま
 * cityEntriesForYear で該当年のデータへ差し替えるだけにする。
 */
function buildCityMarkerLayer(year: number): ScatterplotLayer<CityMarkerDatum> {
  return new ScatterplotLayer<CityMarkerDatum>({
    id: CITY_LAYER_ID,
    data: buildCityMarkerData(cityEntriesForYear(citiesData, year)),
    pickable: true,
    getPosition: (d) => d.position,
    // 3px の固定ドット。国土に対する「点」の記号で、ズームに追従させない
    radiusUnits: "pixels",
    getRadius: 3,
    // ラベルと同系の濃茶 fill + 白 stroke（塗りの上でも沈まない）
    getFillColor: [90, 46, 16, 255],
    stroked: true,
    lineWidthUnits: "pixels",
    getLineWidth: 1,
    getLineColor: [255, 255, 255, 230],
    updateTriggers: { getPosition: [year] },
  });
}

/**
 * 都市名ラベルの TextLayer を生成する（TASK-27 AC #2/#4）。
 * 文字色は濃茶（#793E16）。国名ラベルの濃グレー [40,40,40]・河川ラベルの
 * 水色と明確に異なり、白 halo 付きで一見して都市と区別できる。サイズは
 * 河川ラベルと同じ 11px（国名 13px より控えめ）で、マーカーの右上へ
 * ピクセルオフセットしてドットとラベルが重ならないようにする。
 * CollisionFilterExtension は国名・河川ラベルと同一衝突空間
 * （collisionTestProps.sizeScale: 2）に参加させ、人口由来の都市固定バンド
 * priority（cities.ts）で大国ラベルに譲りつつ小勢力ラベルとは競らせる。
 * pickable: false でマーカー・ポリゴンの picking を妨げない。
 */
function buildCityLabelLayer(
  year: number,
): TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>> {
  const data = buildCityLabelData(cityEntriesForYear(citiesData, year), nameJa);
  return new TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>>({
    id: CITY_LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => d.text,
    getPosition: (d) => d.position,
    getSize: 11,
    sizeUnits: "pixels",
    getColor: [121, 62, 22, 255],
    fontFamily: "sans-serif",
    fontWeight: 600,
    fontSettings: { sdf: true },
    outlineWidth: 2,
    outlineColor: [255, 255, 255, 220],
    // マーカー（3px + 白縁）を覆わないよう少し上へずらす（オフセットのみ。
    // getTextAnchor: "start" / getAlignmentBaseline: "bottom" は
    // CollisionFilterExtension の衝突判定パスと相性が悪く、指定すると
    // ラベルが全滅することを目視で確認したため既定（中央揃え）のまま使う）
    getPixelOffset: [0, -10],
    // 日本語都市名（パリ 等）のグリフもラベル文字列から自動生成する
    characterSet: characterSetFrom(data.map((d) => d.text)),
    updateTriggers: { getText: [year], getPosition: [year] },
    extensions: [new CollisionFilterExtension()],
    collisionTestProps: { sizeScale: 2 },
    getCollisionPriority: (d: LabelDatum) => d.priority,
  });
}

/**
 * HRE 帝国範囲の強調オーバーレイ（GeoJsonLayer）を生成する（TASK-30 AC #2〜#4）。
 * データは base の HRE 本体ポリゴン（extractHreExtent）で、領邦オーバーレイの
 * 有無に依らず帝国全体の輪郭が取れる。太い臙脂の外縁線 + ごく薄い塗りで
 * 「どこからどこまでが帝国か」を一目で示す。pickable: false のため picking の
 * 優先順位（PICKING_PRIORITY）・ツールチップ・パネルには一切関与しない
 * （AC #5）。強調の on/off は visible で切り替え、レイヤー ID を保って
 * deck.gl の差分更新に任せる。
 */
function buildHreExtentLayer(
  year: number,
  base: FeatureCollection,
): GeoJsonLayer {
  return new GeoJsonLayer({
    id: HRE_EXTENT_LAYER_ID,
    data: extractHreExtent(base),
    visible: hreHighlighted,
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
 * 現在の年代データ + 河川 + 都市 + ラベルの全レイヤーを組み立てて overlay へ
 * 反映する。描画順（配列順 = 下から上）: powers → hre-powers → hre-extent →
 * cities → rivers → power-labels → river-labels → city-labels。
 *
 * TASK-29: pickable レイヤーの並びは picking.ts の PICKING_PRIORITY
 * （河川 > 都市 > HRE > 勢力。先頭が最優先）から導出する。deck.gl の picking
 * は最前面（配列の最後）が勝つため、描画順 = 優先順の逆順にすることで
 * 「河川と勢力が重なる位置では河川名を優先」（AC #2）がレイヤー順だけで
 * 担保される。ラベル系（pickable: false）は picking に関与しないため
 * その上へ後置し、layerOrderMatchesPickingPriority で全体の整合を検証する。
 * 年代切替と河川選択の変更はどちらもこの関数経由で反映し、レイヤー id を
 * 保つことで deck.gl の差分更新に任せる。
 */
function renderLayers(): void {
  if (currentView === null) return;
  const { year, base, hre } = currentView;
  const buildPickableLayer: Record<string, () => Layer> = {
    [POWER_LAYER_ID]: () => buildPowerLayer(POWER_LAYER_ID, year, base),
    [HRE_LAYER_ID]: () => buildPowerLayer(HRE_LAYER_ID, year, hre),
    [CITY_LAYER_ID]: () => buildCityMarkerLayer(year),
    [RIVERS_LAYER_ID]: () => buildRiversLineLayer(),
  };
  const layers: Layer[] = [];
  // picking 優先順（PICKING_PRIORITY）の逆順 = 下→上の描画順で並べる
  for (const id of renderOrderFromPickingPriority(PICKING_PRIORITY)) {
    const build = buildPickableLayer[id];
    if (build === undefined) {
      throw new Error(`PICKING_PRIORITY のレイヤー ${id} に builder が無い`);
    }
    layers.push(build());
    // TASK-30: 帝国範囲の強調は powers/hre-powers の上・cities の下に挿入する
    // （領邦の塗りの上に輪郭が乗り、都市マーカー・河川は隠さない）。
    // pickable: false のため PICKING_PRIORITY 外の ID で、整合検証では
    // 無視される（layerOrderMatchesPickingPriority の既存仕様）。
    if (id === HRE_LAYER_ID) layers.push(buildHreExtentLayer(year, base));
  }
  layers.push(
    buildLabelLayer(year, base, hre),
    buildRiverLabelLayer(),
    buildCityLabelLayer(year),
  );
  if (!layerOrderMatchesPickingPriority(layers.map((l) => l.id))) {
    throw new Error("レイヤー順が PICKING_PRIORITY と整合していない");
  }
  overlay.setProps({ layers });
}

/**
 * 勢力名ラベルの TextLayer を生成する（TASK-20）。
 * base（europe_*）と HRE 領邦オーバーレイ（hre_*）双方のラベルを 1 枚に束ね、
 * CollisionFilterExtension で重なりを間引く。面積由来の priority（labels.ts）
 * により大勢力を優先表示し、小勢力はズームインで空きができ次第表示される。
 * pickable は false（ラベル自体はホバー対象にせず、下のポリゴンの picking を
 * 妨げない）。年代切替では同一 ID のまま data を差し替えるのみ。
 */
function buildLabelLayer(
  year: number,
  base: FeatureCollection,
  hre: FeatureCollection,
): TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>> {
  // TASK-23: ラベルは name-ja.json で日本語化する（未登録 NAME は英語のまま）。
  // characterSet はラベル文字列から導出するため日本語グリフも自動で生成される。
  // TASK-30: kind（base/hre）を付与し、HRE 領邦ラベルだけ帝国色で塗り分ける。
  // TextLayer は 1 枚のまま・衝突制御（共有空間・priority）も従来どおり。
  const data = [
    ...buildLabelData(base, nameJa, "base"),
    ...buildLabelData(hre, nameJa, "hre"),
  ];
  return new TextLayer<LabelDatum, CollisionFilterExtensionProps<LabelDatum>>({
    id: LABEL_LAYER_ID,
    data,
    pickable: false,
    getText: (d) => d.text,
    getPosition: (d) => d.position,
    // 13px 固定・濃色文字 + 白 halo（SDF アウトライン）で塗りの上でも判読できる。
    // TASK-30 AC #1: 文字色は kind で塗り分け（独立国 = 濃グレー、HRE 域内の
    // 領邦 = 臙脂 HRE_LABEL_COLOR）。ラベルだけで域内/域外を区別できる。
    getSize: 13,
    sizeUnits: "pixels",
    getColor: (d: LabelDatum) => [...labelColorFor(d)],
    fontFamily: "sans-serif",
    fontWeight: 600,
    fontSettings: { sdf: true },
    outlineWidth: 2,
    outlineColor: [255, 255, 255, 220],
    // ü などの非 ASCII 文字（Württemberg 等）もグリフを生成する
    characterSet: characterSetFrom(data.map((d) => d.text)),
    updateTriggers: { getText: [year], getPosition: [year] },
    // 衝突制御: 判定時はラベルを 2 倍サイズとして扱い、初期ズーム（z4）での
    // 密集を抑える（実表示より広い余白を確保し、判読不能な重なりを防ぐ）
    extensions: [new CollisionFilterExtension()],
    collisionTestProps: { sizeScale: 2 },
    getCollisionPriority: (d: LabelDatum) => d.priority,
  });
}

// ホバー/クリック情報 UI への反映フック（setupInfoUI が実体を差し込む）。
// buildPowerLayer は年代切替のたびに再生成されるため、レイヤー側は常にこの
// モジュールスコープの関数を参照し、DOM 配線は 1 度だけ行う。
let showTooltip: (label: string, x: number, y: number) => void = () => {};
let hideTooltip: () => void = () => {};
let showInfoPanel: (label: string) => void = () => {};

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

  // カーソルとツールチップが重ならないよう少しずらす（px）
  const OFFSET_X = 12;
  const OFFSET_Y = 12;

  showTooltip = (label, x, y) => {
    tooltip.textContent = label;
    tooltip.style.left = `${x + OFFSET_X}px`;
    tooltip.style.top = `${y + OFFSET_Y}px`;
    tooltip.hidden = false;
  };
  hideTooltip = () => {
    tooltip.hidden = true;
  };
  showInfoPanel = (label) => {
    panelLabel.textContent = label;
    panel.hidden = false;
  };

  panelClose.addEventListener("click", () => {
    panel.hidden = true;
  });
}

setupInfoUI();

/**
 * attribution フッターの折りたたみ UI を配線する（TASK-26）。
 * 状態遷移は footer.ts の reducer（純粋関数）に集約し、ここでは
 * 「イベント → reducer → aria-expanded / hidden の同期」だけを行う。
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

  let state = createFooterState();

  /** 現在の状態を aria-expanded / hidden へ反映する（AC #1/#2/#4） */
  function render(): void {
    toggle!.setAttribute("aria-expanded", ariaExpandedValue(state));
    content!.hidden = isContentHidden(state);
  }

  function dispatch(event: FooterEvent): void {
    state = reduceFooterEvent(state, event);
    render();
  }

  toggle.addEventListener("click", () => dispatch("toggle"));

  // AC #3: 展開中にフッター外をクリック/タップしたら折りたたむ。
  // ⓘボタン自身のクリックは footer 内なのでここでは処理せず、二重発火しない。
  document.addEventListener("click", (e) => {
    if (!state.expanded) return;
    if (e.target instanceof Node && footer!.contains(e.target)) return;
    dispatch("outside-click");
  });

  // AC #3/#4: Escape キーで折りたたむ（未展開時は reducer が状態を変えない）
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!state.expanded) return;
    dispatch("escape");
  });

  render();
}

setupFooter();

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
    // TASK-24: レイヤー組み立ては renderLayers に集約（河川選択の変更と共用）
    currentView = { year, base: data.base, hre: data.hre };
    renderLayers();
    // AC #2/#3: 実際に反映された年で UI を確定させる（最新要求のみ到達する）
    reflectYearToTimeline(year);
    // TASK-33 AC #1: 解説パネルも確定年に追従させる
    reflectYearToNotes(year);
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
 * name-overrides.json の renames を取得する。失敗時は空マップのまま生値で継続する。
 * ラベル整形（displayLabel）が SUBJECTO の綴りゆれを正規化するのに使う。
 */
async function loadOverrides(): Promise<void> {
  try {
    const res = await fetch("/data/name-overrides.json");
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json() as { renames?: Record<string, string> };
    renames = data.renames ?? {};
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
    await Promise.all([
      loadColors(),
      loadOverrides(),
      loadNameJa(),
      loadRivers(),
      loadCities(),
      loadNotes(),
    ]);
    await switchYear(initialYear);
  } catch (error) {
    console.error(`勢力圏レイヤーの初期化に失敗しました: ${String(error)}`);
  }
}

// スタイル読み込み完了後に overlay を統合し、初期年代を描画する。
map.on("load", () => {
  map.addControl(overlay);
  void initPowerLayer();
});

// 目視確認・TASK-6 スライダー用に year 切替を公開する（インラインスクリプト不要）。
(globalThis as unknown as {
  __setYear?: (year: number) => Promise<void>;
  __getYear?: () => number;
}).__setYear = switchYear;
(globalThis as unknown as { __getYear?: () => number }).__getYear = () =>
  yearSwitcher.currentYear() ?? INITIAL_YEAR;
