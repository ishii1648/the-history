import maplibregl from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { buildBasemapStyle } from "./basemap.ts";
import {
  type BasemapErrorEvent,
  createFallbackState,
  decideFallback,
} from "./fallback.ts";
import {
  BASEMAP_PMTILES_URL,
  BASEMAP_SOURCE_ID,
  FALLBACK_STYLE_URL,
  INITIAL_CENTER,
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
