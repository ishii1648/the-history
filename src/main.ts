import { INITIAL_CENTER, INITIAL_YEAR, INITIAL_ZOOM } from "./config.ts";

const mapContainer = document.getElementById("map");
if (!mapContainer) {
  throw new Error("#map 要素が見つかりません");
}

console.log(
  `ヨーロッパ国境変遷マップを起動: center=${
    JSON.stringify(INITIAL_CENTER)
  }, zoom=${INITIAL_ZOOM}, year=${INITIAL_YEAR}`,
);
