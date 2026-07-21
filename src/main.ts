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
  colorKeyFor,
  createYearDataLoader,
  createYearSwitcher,
  fillColorFor,
  LINE_COLOR,
  LINE_WIDTH_PX,
} from "./powers.ts";
import {
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  FALLBACK_STYLE_URL,
  INITIAL_CENTER,
  INITIAL_YEAR,
  INITIAL_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
} from "./config.ts";

const mapContainer = document.getElementById("map");
if (!mapContainer) {
  throw new Error("#map 要素が見つかりません");
}

// PMTiles プロトコルを MapLibre に登録（1 回だけ）
const protocol = new Protocol();
maplibregl.addProtocol("pmtiles", protocol.tile);

// アーカイブを登録しておくと pmtiles:// の解決とヘッダ取得を共有できる
const archive = new PMTiles(BASEMAP_PMTILES_URL);
protocol.add(archive);

const map = new maplibregl.Map({
  container: mapContainer,
  style: buildBasemapStyle(BASEMAP_PMTILES_URL) as StyleSpecification,
  center: [...INITIAL_CENTER],
  zoom: INITIAL_ZOOM,
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
    onHover: ({ object }) => {
      if (object) {
        const f = object as Feature;
        console.debug(
          "[powers] hover",
          colorKeyFor(f.properties),
          f.properties,
        );
      }
    },
    onClick: ({ object }) => {
      if (object) {
        const f = object as Feature;
        console.debug(
          "[powers] click",
          colorKeyFor(f.properties),
          f.properties,
        );
      }
    },
  });
}

// 年代切替の競合ガード（DOM/deck.gl 非依存ロジックは powers.ts に集約）。
// overlay への反映（applyFn）は最新要求のときだけ呼ばれ、遅延解決した古い要求で
// 表示が巻き戻らない。AC #4: GeoJsonLayer の data 差し替えのみ・overlay は再生成しない。
const yearSwitcher = createYearSwitcher(
  dataLoader,
  (year, data) => {
    overlay.setProps({ layers: [buildPowerLayer(year, data)] });
  },
);

/**
 * 表示年代を切り替える（TASK-6 のスライダー・目視確認から呼ばれる公開 API）。
 * 連続呼び出し時は最後に要求した年代だけが反映される。
 */
export function switchYear(year: number): Promise<void> {
  return yearSwitcher.switchTo(year);
}

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

/** 初期年代の勢力圏を描画する。例外で地図全体を落とさない */
async function initPowerLayer(): Promise<void> {
  try {
    await loadColors();
    await switchYear(INITIAL_YEAR);
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
