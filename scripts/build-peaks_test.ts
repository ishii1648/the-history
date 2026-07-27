import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Point } from "geojson";
import nameJa from "../data/name-ja.json" with { type: "json" };
import {
  ADOPTED_PEAK_NAMES,
  buildPeaksSourceUrl,
  clipPeaksToBbox,
  extractPeakNames,
  MAX_PEAK_SCALERANK,
  MIN_PEAK_ELEVATION_M,
  PEAK_FEATURECLA,
  PEAKS_SIZE_LIMIT_BYTES,
  PEAKS_SOURCE_COMMIT,
  PEAKS_SOURCE_LICENSE,
  PEAKS_SOURCE_REPO,
  prunePeakProperties,
  roundPeakCoordinates,
  selectMajorPeaks,
} from "./build-peaks.ts";
import { MOUNTAINS_SOURCE_COMMIT } from "./build-mountains.ts";
import { EUROPE_BBOX } from "./build-data.ts";

/** テスト用に Point の Feature を組み立てる */
function pointFeature(
  properties: Record<string, unknown>,
  lon: number,
  lat: number,
): Feature<Point> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

/** 収録される山峰の properties（10m elevation points は小文字キー） */
function peakProps(
  name: string,
  elevation: number,
  scalerank: number,
): Record<string, unknown> {
  return { featurecla: PEAK_FEATURECLA, name, elevation, scalerank };
}

Deno.test("buildPeaksSourceUrl はピン留めコミットの raw URL を生成する", () => {
  assertEquals(
    buildPeaksSourceUrl(),
    `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${PEAKS_SOURCE_COMMIT}/geojson/ne_10m_geography_regions_elevation_points.geojson`,
  );
});

Deno.test("出典定数は河川・山脈と同じピン留めコミット・ライセンスを指す", () => {
  assertEquals(PEAKS_SOURCE_REPO, "nvkelso/natural-earth-vector");
  assertEquals(PEAKS_SOURCE_COMMIT, "ca96624a56bd078437bca8184e78163e5039ad19");
  // 山脈（build-mountains.ts）と同一コミットであること（世代のドリフト検出）
  assertEquals(PEAKS_SOURCE_COMMIT, MOUNTAINS_SOURCE_COMMIT);
  assertEquals(PEAKS_SOURCE_LICENSE, "Public Domain (Natural Earth)");
  assert(PEAKS_SIZE_LIMIT_BYTES > 0);
});

Deno.test("clipPeaksToBbox は bbox 内の点だけを残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      // アルプス（bbox 内）
      pointFeature(peakProps("Mont Blanc", 4807, 3), 6.86504, 45.83368),
      // ヒマラヤ（bbox 外・東）
      pointFeature(peakProps("Everest", 8848, 1), 86.925, 27.988),
      // 南半球（bbox 外・南）
      pointFeature(peakProps("Kilimanjaro", 5895, 2), 37.353, -3.067),
    ],
  };

  assertEquals(
    clipPeaksToBbox(fc, EUROPE_BBOX).features.map((f) => f.properties?.name),
    ["Mont Blanc"],
  );
});

Deno.test("clipPeaksToBbox は Point 以外のジオメトリを落とす", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: peakProps("line", 1000, 3),
        geometry: { type: "LineString", coordinates: [[0, 40], [1, 41]] },
      },
    ],
  };

  assertEquals(clipPeaksToBbox(fc, EUROPE_BBOX).features, []);
});

Deno.test("selectMajorPeaks は scalerank の上位帯を残す（AC #1 の主要 3 山峰）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      pointFeature(peakProps("Mont Blanc", 4807, 3), 6.86504, 45.83368),
      pointFeature(peakProps("Matterhorn", 4478, 6), 7.72958, 45.93817),
      pointFeature(peakProps("Grossglockner", 3798, 6), 12.69533, 47.07471),
    ],
  };

  assertEquals(
    selectMajorPeaks(fc).features.map((f) => f.properties?.name),
    ["Mont Blanc", "Matterhorn", "Grossglockner"],
  );
});

Deno.test("selectMajorPeaks は scalerank が下位でも標高が閾値以上なら残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      // 実データの Monte Rosa（アルプス第 2 の高峰なのに scalerank 9）
      pointFeature(peakProps("Monte Rosa", 4634, 9), 7.86998, 45.94003),
      // 実データの Gora Tebulosmta（コーカサスの二次峰。標高が閾値未満で落ちる）
      pointFeature(peakProps("Gora Tebulosmta", 4494, 9), 45.3, 42.59),
      // 低山（scalerank も標高も閾値未満）
      pointFeature(peakProps("Vaalserberg", 321, 9), 6.02, 50.76),
    ],
  };

  assertEquals(
    selectMajorPeaks(fc).features.map((f) => f.properties?.name),
    ["Monte Rosa"],
  );
});

Deno.test("selectMajorPeaks は山峰以外（窪地・spot elevation）と無名の点を落とす", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      // カスピ海沿岸低地の窪地（featurecla = depression、name は null）
      pointFeature(
        { featurecla: "depression", name: null, elevation: -28, scalerank: 2 },
        49.01,
        44.258,
      ),
      // spot elevation（無名の標高点）
      pointFeature(
        {
          featurecla: "spot elevation",
          name: null,
          elevation: 311,
          scalerank: 9,
        },
        25.96,
        56.87,
      ),
      // featurecla は mountain だが name が空文字
      pointFeature(peakProps("", 4000, 3), 10, 45),
      pointFeature(peakProps("Mont Blanc", 4807, 3), 6.86504, 45.83368),
    ],
  };

  assertEquals(
    selectMajorPeaks(fc).features.map((f) => f.properties?.name),
    ["Mont Blanc"],
  );
});

Deno.test("収録閾値は実測分布の意図した位置にある（MAX_PEAK_SCALERANK / MIN_PEAK_ELEVATION_M）", () => {
  // scalerank は 2/3/6/7/9 の 5 段しかない（EUROPE_BBOX 内の実測）。6 まで採ると
  // 22 件、7 まで採ると 47 件で 15〜30 件の目安を大きく超える
  assert(MAX_PEAK_SCALERANK >= 6 && MAX_PEAK_SCALERANK < 7);
  // 標高の第 2 条件は scalerank 7 以下に落ちた最高峰級だけを拾う位置に置く。
  // 実測では Monte Rosa 4634 と Gora Tebulosmta 4494 の間（140 m の空き）
  assert(MIN_PEAK_ELEVATION_M > 4494 && MIN_PEAK_ELEVATION_M <= 4634);
});

Deno.test("prunePeakProperties は name / elevation / scalerank だけを残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      pointFeature(
        {
          featurecla: PEAK_FEATURECLA,
          name: "Mont Blanc",
          name_ja: "モンブラン",
          name_fr: "Mont Blanc",
          elevation: 4807,
          scalerank: 3,
          min_zoom: 5.1,
          region: "Europe",
          wikidataid: "Q583",
        },
        6.86504,
        45.83368,
      ),
    ],
  };

  assertEquals(prunePeakProperties(fc).features[0].properties, {
    name: "Mont Blanc",
    elevation: 4807,
    scalerank: 3,
  });
});

Deno.test("prunePeakProperties は欠損値を null に正規化する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [pointFeature({ scalerank: 6 }, 10, 45)],
  };

  assertEquals(prunePeakProperties(fc).features[0].properties, {
    name: null,
    elevation: null,
    scalerank: 6,
  });
});

Deno.test("roundPeakCoordinates は座標を指定桁に丸める", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      pointFeature(peakProps("Mont Blanc", 4807, 3), 6.8650412, 45.8336789),
    ],
  };

  const rounded = roundPeakCoordinates(fc, 5);

  assertEquals(
    (rounded.features[0].geometry as Point).coordinates,
    [6.86504, 45.83368],
  );
});

Deno.test("extractPeakNames は収録名をソートして返す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      pointFeature({ name: "Matterhorn" }, 7.72958, 45.93817),
      pointFeature({ name: "Mont Blanc" }, 6.86504, 45.83368),
      pointFeature({ name: null }, 0, 0),
    ],
  };

  assertEquals(extractPeakNames(fc), ["Matterhorn", "Mont Blanc"]);
});

Deno.test("収録する山峰一覧（ADOPTED_PEAK_NAMES）は AC #1 の 3 山峰を含み 15〜30 件に収まる", () => {
  for (const name of ["Mont Blanc", "Matterhorn", "Grossglockner"]) {
    assert(
      ADOPTED_PEAK_NAMES.includes(name),
      `${name} が収録一覧に無い（AC #1）`,
    );
  }
  assert(
    ADOPTED_PEAK_NAMES.length >= 15 && ADOPTED_PEAK_NAMES.length <= 30,
    `収録件数 ${ADOPTED_PEAK_NAMES.length} が 15〜30 件の範囲外（ラベル密度）`,
  );
  // 低山・標高点は収録しない（EUROPE_BBOX 内 99 件のうち大半がこの帯）
  assert(!ADOPTED_PEAK_NAMES.includes("Vaalserberg"));
  assert(!ADOPTED_PEAK_NAMES.includes("Rock of Gibraltar"));
  // 名前の重複が無い（同名の山峰は日本語名の引き先が一意にならない）
  assertEquals(new Set(ADOPTED_PEAK_NAMES).size, ADOPTED_PEAK_NAMES.length);
});

Deno.test("収録する山峰は全て data/name-ja.json に日本語表記を持つ", () => {
  const mapping = nameJa as Record<string, string>;
  const missing = ADOPTED_PEAK_NAMES.filter((name) => !(name in mapping));
  assertEquals(
    missing,
    [],
    "日本語表記が無い山峰がある（英語のまま表示される）",
  );
});
