import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { GeoJsonLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection } from "geojson";
import { buildBasemapStyle } from "./basemap.ts";
import {
  type BasemapErrorEvent,
  createFallbackState,
  decideFallback,
} from "./fallback.ts";
import {
  createYearDataLoader,
  createYearSwitcher,
  fillColorFor,
  LINE_COLOR,
  LINE_WIDTH_PX,
} from "./powers.ts";
import { displayLabel } from "./info.ts";
import {
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  FALLBACK_STYLE_URL,
  INITIAL_CENTER,
  INITIAL_YEAR,
  INITIAL_ZOOM,
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

const mapContainer = document.getElementById("map");
if (!mapContainer) {
  throw new Error("#map 要素が見つかりません");
}

// AC #2/#3: 起動時に URL クエリから表示状態を復元する（不正値はパラメータ単位で
// デフォルトへフォールバック）。地図の初期 center/zoom と初期年代はこの値を使う。
const initialState = decodeState(
  globalThis.location.search,
  { year: INITIAL_YEAR, zoom: INITIAL_ZOOM, center: [...INITIAL_CENTER] },
  { years: SNAPSHOT_YEARS, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM },
);
const initialYear = initialState.year;

// PMTiles プロトコルを MapLibre に登録（1 回だけ）
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// アーカイブを登録しておくと pmtiles:// の解決とヘッダ取得を共有できる
const archive = new PMTiles(BASEMAP_PMTILES_URL);
protocol.add(archive);

const map = new maplibregl.Map({
  container: mapContainer,
  style: buildBasemapStyle(BASEMAP_PMTILES_URL) as StyleSpecification,
  center: initialState.center,
  zoom: initialState.zoom,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
});

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

/** GeoJsonLayer の ID。年代切替でも同一 ID を保ち、overlay は再生成しない */
const POWER_LAYER_ID = "powers";

/** colors.json（NAME / "NAME|SUBJECTO" → HEX のフラットマップ） */
let colors: Record<string, string> = {};

/** name-overrides.json の renames（SUBJECTO 生値 → 正規化名）。ラベル整形で使う */
let renames: Record<string, string> = {};

/** 年代 GeoJSON のメモリキャッシュ付きローダ（fetch は本番のもの） */
const dataLoader = createYearDataLoader((url) => fetch(url));

// AC #1: MapboxOverlay（interleaved）で deck.gl を MapLibre に統合する。
// overlay と GeoJsonLayer はここで 1 度だけ生成し、年代切替では data を差し替えるのみ。
const overlay = new MapboxOverlay({ interleaved: true, layers: [] });

/**
 * 指定年代の FeatureCollection から GeoJsonLayer を 1 枚生成する。
 * data 以外のプロパティは全年代で不変。updateTriggers に year を渡し、
 * 色関数の再評価を促す（colors 読み込み前後でも齟齬が出ないようにする）。
 */
function buildPowerLayer(
  year: number,
  data: FeatureCollection,
): GeoJsonLayer {
  return new GeoJsonLayer({
    id: POWER_LAYER_ID,
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
    // AC #1: ホバーで勢力ラベルをカーソル近傍にツールチップ表示（object なしで非表示）
    onHover: ({ object, x, y }) => {
      const label = object
        ? displayLabel((object as Feature).properties, renames)
        : null;
      if (label !== null) showTooltip(label, x, y);
      else hideTooltip();
    },
    // AC #2: クリックで同ラベルを固定パネルに表示（モバイルのホバー代替）
    onClick: ({ object }) => {
      const label = object
        ? displayLabel((object as Feature).properties, renames)
        : null;
      if (label !== null) showInfoPanel(label);
    },
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

// タイムライン UI への「反映」フック（setupTimeline が実体を差し込む）。
// applyFn（最新要求のみ）から呼ぶことで、古い要求で年表示・スライダーが
// 巻き戻らないことを担保する（TASK-6 の UI 反映タイミング）。
let reflectYearToTimeline: (year: number) => void = () => {};

// 年代切替の競合ガード（DOM/deck.gl 非依存ロジックは powers.ts に集約）。
// overlay への反映（applyFn）は最新要求のときだけ呼ばれ、遅延解決した古い要求で
// 表示が巻き戻らない。AC #4: GeoJsonLayer の data 差し替えのみ・overlay は再生成しない。
const yearSwitcher = createYearSwitcher(
  dataLoader,
  (year, data) => {
    overlay.setProps({ layers: [buildPowerLayer(year, data)] });
    // AC #2/#3: 実際に反映された年で UI を確定させる（最新要求のみ到達する）
    reflectYearToTimeline(year);
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

/**
 * 表示年代を切り替える（TASK-6 のスライダー・目視確認から呼ばれる公開 API）。
 * 連続呼び出し時は最後に要求した年代だけが反映される。
 */
export function switchYear(year: number): Promise<void> {
  return yearSwitcher.switchTo(year);
}

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
 *   range は ← → で値が変わり input イベントを発火するので、そちらの経路で 1 回だけ
 *   切り替わる。二重に stepYear すると 1 打鍵で 2 年代進む不具合になるため防ぐ。
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

  // AC #2: キーボード ← →（スライダー自身にフォーカスがある時は native + input に委ねる）
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

/** 初期年代の勢力圏を描画する。例外で地図全体を落とさない */
async function initPowerLayer(): Promise<void> {
  try {
    await Promise.all([loadColors(), loadOverrides()]);
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
