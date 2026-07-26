import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import nameJa from "../data/name-ja.json" with { type: "json" };
import {
  ADOPTED_MOUNTAIN_NAMES,
  buildMountainsSourceUrl,
  clipMountainsToBbox,
  filterMountainRanges,
  MIN_CLIP_AREA_RATIO,
  MOUNTAIN_FEATURECLA,
  MOUNTAINS_SIZE_LIMIT_BYTES,
  MOUNTAINS_SOURCE_COMMIT,
  MOUNTAINS_SOURCE_LICENSE,
  MOUNTAINS_SOURCE_REPO,
  pruneMountainProperties,
} from "./build-mountains.ts";
import { EUROPE_BBOX } from "./build-data.ts";

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

Deno.test("buildMountainsSourceUrl はピン留めコミットの raw URL を生成する", () => {
  assertEquals(
    buildMountainsSourceUrl(),
    `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${MOUNTAINS_SOURCE_COMMIT}/geojson/ne_50m_geography_regions_polys.geojson`,
  );
});

Deno.test("出典定数は河川（build-rivers.ts）と同じピン留めコミット・ライセンスを指す", () => {
  assertEquals(MOUNTAINS_SOURCE_REPO, "nvkelso/natural-earth-vector");
  assertEquals(
    MOUNTAINS_SOURCE_COMMIT,
    "ca96624a56bd078437bca8184e78163e5039ad19",
  );
  assertEquals(MOUNTAINS_SOURCE_LICENSE, "Public Domain (Natural Earth)");
  assert(MOUNTAINS_SIZE_LIMIT_BYTES > 0);
});

Deno.test("filterMountainRanges は FEATURECLA が Range/mtn の feature だけを残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      boxFeature({ FEATURECLA: MOUNTAIN_FEATURECLA, NAME: "ALPS" }, [
        5,
        43,
        16,
        48,
      ]),
      // Plateau（イベリア半島・中央ロシア高地）は「山脈」ではないので除外する
      boxFeature({ FEATURECLA: "Plateau", NAME: "PENÍNSULA IBÉRICA" }, [
        -9,
        36,
        3,
        43,
      ]),
      boxFeature({ FEATURECLA: "Plain", NAME: "NORTHERN EUROPEAN PLAIN" }, [
        -4,
        43,
        66,
        69,
      ]),
      boxFeature({ FEATURECLA: "Island", NAME: "ICELAND" }, [-24, 63, -13, 66]),
    ],
  };

  const filtered = filterMountainRanges(fc);

  assertEquals(filtered.features.map((f) => f.properties?.NAME), ["ALPS"]);
});

Deno.test("clipMountainsToBbox は bbox 内へクリップし、域外の feature を落とす", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      // 完全に bbox 内（そのまま残る）
      boxFeature({ NAME: "inside" }, [0, 40, 10, 50]),
      // 完全に bbox 外（消える）
      boxFeature({ NAME: "outside" }, [100, 10, 110, 20]),
    ],
  };

  const clipped = clipMountainsToBbox(fc, EUROPE_BBOX);

  assertEquals(clipped.features.map((f) => f.properties?.NAME), ["inside"]);
});

Deno.test("clipMountainsToBbox は残存面積比が閾値未満の feature を落とす（域外にはみ出す山脈の採否）", () => {
  // 東端 60 度をまたぐ矩形。bbox 内に残るのは経度 55〜60 の 1/4 だけ
  const mostlyOutside = boxFeature({ NAME: "mostly-outside" }, [
    55,
    40,
    75,
    50,
  ]);
  // 同じく東端をまたぐが、bbox 内に 3/4 が残る
  const mostlyInside = boxFeature({ NAME: "mostly-inside" }, [45, 40, 65, 50]);
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [mostlyOutside, mostlyInside],
  };

  const clipped = clipMountainsToBbox(fc, EUROPE_BBOX);

  assertEquals(clipped.features.map((f) => f.properties?.NAME), [
    "mostly-inside",
  ]);
  // 閾値は 1/4 と 3/4 の間にある（実データの ZAGROS 14% / ATLAS 49% を分ける値）
  assert(MIN_CLIP_AREA_RATIO > 0.25 && MIN_CLIP_AREA_RATIO < 0.75);
});

Deno.test("pruneMountainProperties は name / scalerank / min_label だけを残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      boxFeature({
        FEATURECLA: MOUNTAIN_FEATURECLA,
        NAME: "PYRENEES",
        NAME_JA: "ピレネー山脈",
        NAME_DE: "Pyrenäen",
        SCALERANK: 3,
        MIN_LABEL: 4,
        MAX_LABEL: 8,
        WIKIDATAID: "Q12431",
      }, [-2, 42, 3, 43]),
    ],
  };

  const pruned = pruneMountainProperties(fc);

  assertEquals(pruned.features[0].properties, {
    name: "PYRENEES",
    scalerank: 3,
    min_label: 4,
  });
});

Deno.test("pruneMountainProperties は name 欠損を null に正規化する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [boxFeature({ SCALERANK: 4 }, [0, 40, 1, 41])],
  };

  assertEquals(pruneMountainProperties(fc).features[0].properties, {
    name: null,
    scalerank: 4,
    min_label: null,
  });
});

Deno.test("収録する山脈一覧（ADOPTED_MOUNTAIN_NAMES）は AC #1 の 5 山脈を含む", () => {
  for (
    const name of [
      "ALPS",
      "PYRENEES",
      "CARPATHIAN MOUNTAINS",
      "APPENNINI",
      "KJØLEN MOUNTAINS",
    ]
  ) {
    assert(
      ADOPTED_MOUNTAIN_NAMES.includes(name),
      `${name} が収録一覧に無い（AC #1）`,
    );
  }
  // 山体の大半が域外に出る山脈（実測: ZAGROS 14% / KUH RUD 10%）は収録しない
  assert(!ADOPTED_MOUNTAIN_NAMES.includes("ZAGROS MOUNTAINS"));
  assert(!ADOPTED_MOUNTAIN_NAMES.includes("KUH RUD MOUNTAINS"));
  // Plateau は山脈でないので収録しない
  assert(!ADOPTED_MOUNTAIN_NAMES.includes("PENÍNSULA IBÉRICA"));
  assert(!ADOPTED_MOUNTAIN_NAMES.includes("CENTRAL RUSSIAN UPLAND"));
});

Deno.test("収録する山脈は全て data/name-ja.json に日本語表記を持つ", () => {
  const mapping = nameJa as Record<string, string>;
  const missing = ADOPTED_MOUNTAIN_NAMES.filter((name) => !(name in mapping));
  assertEquals(
    missing,
    [],
    "日本語表記が無い山脈がある（英語のまま表示される）",
  );
});
