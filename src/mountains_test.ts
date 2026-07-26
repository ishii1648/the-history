import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import { MAX_ZOOM, MIN_ZOOM } from "./config.ts";
import {
  filterVisibleMountainLabels,
  MOUNTAIN_LABEL_PRIORITY_MAX,
  MOUNTAIN_LABEL_PRIORITY_MIN,
  mountainLabelAnchors,
  mountainLabelMinZoom,
  mountainLabelPriority,
  MOUNTAINS_DATA_URL,
} from "./mountains.ts";
import { CITY_LABEL_PRIORITY_MIN } from "./cities.ts";

/** テスト用に矩形 Polygon の Feature を組み立てる */
function boxFeature(
  properties: Record<string, unknown>,
  [west, south, east, north]: [number, number, number, number],
): Feature<Polygon> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ]],
    },
  };
}

function collection(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

Deno.test("MOUNTAINS_DATA_URL は build.ts のコピー先と一致する", () => {
  assertEquals(MOUNTAINS_DATA_URL, "/data/mountains.geojson");
});

Deno.test("mountainLabelMinZoom は NE の MIN_LABEL をアプリのズーム段へ写す（AC #2）", () => {
  // 小数の MIN_LABEL は切り上げ（その段でラベルが確実に読める側へ倒す）
  assertEquals(mountainLabelMinZoom(5.3), 6);
  assertEquals(mountainLabelMinZoom(3.5), 4);
  assertEquals(mountainLabelMinZoom(4), 4);
  assertEquals(mountainLabelMinZoom(6), 6);
  // アプリのズーム範囲（MIN_ZOOM..MAX_ZOOM）へクランプする
  assertEquals(mountainLabelMinZoom(2), MIN_ZOOM);
  assertEquals(mountainLabelMinZoom(0), MIN_ZOOM);
  assertEquals(mountainLabelMinZoom(12), MAX_ZOOM);
  // 欠損・非数値は最も保守的（最大ズームでのみ表示）に倒す
  assertEquals(mountainLabelMinZoom(null), MAX_ZOOM);
  assertEquals(mountainLabelMinZoom("4"), MAX_ZOOM);
});

Deno.test("mountainLabelPriority は SCALERANK が小さい（主要な）山脈ほど高い", () => {
  assertEquals(mountainLabelPriority(1), MOUNTAIN_LABEL_PRIORITY_MAX);
  assert(mountainLabelPriority(1) > mountainLabelPriority(3));
  assert(mountainLabelPriority(3) > mountainLabelPriority(4));
  assertEquals(mountainLabelPriority(99), MOUNTAIN_LABEL_PRIORITY_MIN);
  assertEquals(mountainLabelPriority(null), MOUNTAIN_LABEL_PRIORITY_MIN);
});

Deno.test("山脈ラベルの優先度帯は都市ラベル帯より下・小領邦の面積由来 priority より上（AC #1/#3）", () => {
  // 都市名・大国名には譲る
  assert(MOUNTAIN_LABEL_PRIORITY_MAX < CITY_LABEL_PRIORITY_MIN);
  // 公領・伯領規模（面積 6 deg² = 100*log10(6) ≒ 78）の勢力名には勝つ。
  // ここを下回ると密集地帯で山脈名が 1 つも残らない（実機で確認済み）
  assert(MOUNTAIN_LABEL_PRIORITY_MIN > 100 * Math.log10(6));
});

Deno.test("mountainLabelAnchors はポリゴン内部にアンカーを置き、日本語名を引く", () => {
  const fc = collection([
    boxFeature({ name: "ALPS", scalerank: 1, min_label: 2 }, [4, 44, 16, 48]),
  ]);

  const [datum] = mountainLabelAnchors(fc, { ALPS: "アルプス山脈" });

  assertEquals(datum.name, "ALPS");
  assertEquals(datum.text, "アルプス山脈");
  assert(datum.position[0] > 4 && datum.position[0] < 16);
  assert(datum.position[1] > 44 && datum.position[1] < 48);
  assertEquals(datum.minZoom, MIN_ZOOM);
  assertEquals(datum.priority, MOUNTAIN_LABEL_PRIORITY_MAX);
});

Deno.test("mountainLabelAnchors は日本語名が無ければ元名のまま返す", () => {
  const fc = collection([
    boxFeature({ name: "S. Nevada", scalerank: 4, min_label: 5.3 }, [
      -4,
      36,
      -2,
      37,
    ]),
  ]);

  assertEquals(mountainLabelAnchors(fc).map((d) => d.text), ["S. Nevada"]);
});

Deno.test("mountainLabelAnchors は name 欠損・ポリゴンでない feature を除外する", () => {
  const fc = collection([
    boxFeature({ scalerank: 1, min_label: 2 }, [0, 40, 1, 41]),
    {
      type: "Feature",
      properties: { name: "line", scalerank: 1, min_label: 2 },
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    },
    boxFeature({ name: "ok", scalerank: 1, min_label: 2 }, [0, 40, 1, 41]),
  ]);

  assertEquals(mountainLabelAnchors(fc).map((d) => d.name), ["ok"]);
});

Deno.test("mountainLabelAnchors は MultiPolygon で最大のポリゴンにアンカーを置く", () => {
  const fc = collection([{
    type: "Feature",
    properties: { name: "Dinaric Alps", scalerank: 4, min_label: 5.3 },
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        // 小さな島（0.01 deg²）
        [[[30, 60], [30.1, 60], [30.1, 60.1], [30, 60.1], [30, 60]]],
        // 本体（4 deg²）
        [[[14, 43], [16, 43], [16, 45], [14, 45], [14, 43]]],
      ],
    },
  }]);

  const [datum] = mountainLabelAnchors(fc);

  assert(datum.position[0] > 14 && datum.position[0] < 16);
  assert(datum.position[1] > 43 && datum.position[1] < 45);
});

Deno.test("filterVisibleMountainLabels はズーム段が minZoom 以上のラベルだけ返す（AC #2）", () => {
  const fc = collection([
    boxFeature({ name: "ALPS", scalerank: 1, min_label: 2 }, [4, 44, 16, 48]),
    boxFeature({ name: "Balkan Mts.", scalerank: 4, min_label: 5.3 }, [
      22,
      42,
      28,
      43,
    ]),
    boxFeature({ name: "Sierra Morena", scalerank: 4, min_label: 6 }, [
      -7,
      38,
      -3,
      39,
    ]),
  ]);
  const anchors = mountainLabelAnchors(fc);

  assertEquals(filterVisibleMountainLabels(anchors, 4).map((d) => d.name), [
    "ALPS",
  ]);
  assertEquals(filterVisibleMountainLabels(anchors, 5.9).map((d) => d.name), [
    "ALPS",
  ]);
  assertEquals(filterVisibleMountainLabels(anchors, 6).map((d) => d.name), [
    "ALPS",
    "Balkan Mts.",
    "Sierra Morena",
  ]);
  // 非有限ズーム（防御）は最遠段として扱う
  assertEquals(filterVisibleMountainLabels(anchors, NaN).map((d) => d.name), [
    "ALPS",
  ]);
});

Deno.test("filterVisibleMountainLabels は入力配列を破壊せず、datum の参照をそのまま返す（メモ化の契約）", () => {
  const fc = collection([
    boxFeature({ name: "ALPS", scalerank: 1, min_label: 2 }, [4, 44, 16, 48]),
  ]);
  const anchors = mountainLabelAnchors(fc);

  const visible = filterVisibleMountainLabels(anchors, 8);

  assertEquals(anchors.length, 1);
  assert(visible[0] === anchors[0]);
});
