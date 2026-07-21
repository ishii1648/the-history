import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import {
  buildRiversSourceUrl,
  clipRiversToBbox,
  filterMajorRivers,
  MAX_SCALERANK,
  pruneRiverProperties,
  RIVERS_SIZE_LIMIT_BYTES,
  RIVERS_SOURCE_COMMIT,
  RIVERS_SOURCE_LICENSE,
  RIVERS_SOURCE_REPO,
} from "./build-rivers.ts";

/** テスト用に MultiLineString の Feature を組み立てる */
function multiLineFeature(
  properties: Record<string, unknown>,
  lines: number[][][],
): Feature<MultiLineString> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "MultiLineString", coordinates: lines },
  };
}

Deno.test("buildRiversSourceUrl はピン留めコミットの raw URL を生成する", () => {
  assertEquals(
    buildRiversSourceUrl(),
    `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${RIVERS_SOURCE_COMMIT}/geojson/ne_50m_rivers_lake_centerlines.geojson`,
  );
});

Deno.test("定数は仕様どおりの出典情報とサイズ上限を持つ", () => {
  assertEquals(RIVERS_SOURCE_REPO, "nvkelso/natural-earth-vector");
  assertEquals(RIVERS_SOURCE_COMMIT.length, 40);
  assertEquals(RIVERS_SOURCE_LICENSE, "Public Domain (Natural Earth)");
  assertEquals(RIVERS_SIZE_LIMIT_BYTES, 150 * 1000);
  // Elbe（scalerank 5）が残る閾値であること
  assert(MAX_SCALERANK >= 5);
});

Deno.test("filterMajorRivers は scalerank が閾値以下の feature のみ残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "Danube", scalerank: 2 }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "Elbe", scalerank: 5 }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "Minor", scalerank: 6 }, [[[0, 0], [1, 1]]]),
    ],
  };

  const filtered = filterMajorRivers(fc, 5);

  const names = filtered.features.map((f) => f.properties?.name);
  assertEquals(names, ["Danube", "Elbe"]);
});

Deno.test("filterMajorRivers は scalerank が数値でない feature を除去する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "no-rank" }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "bad-rank", scalerank: "x" }, [[[0, 0], [
        1,
        1,
      ]]]),
      multiLineFeature({ name: "ok", scalerank: 1 }, [[[0, 0], [1, 1]]]),
    ],
  };

  const filtered = filterMajorRivers(fc, 5);

  assertEquals(filtered.features.map((f) => f.properties?.name), ["ok"]);
});

Deno.test("clipRiversToBbox は bbox 外のラインを除去し、空パートを残さない", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      // 完全に内側
      multiLineFeature({ name: "inside" }, [[[2, 2], [8, 8]]]),
      // 完全に外側 → 除去される
      multiLineFeature({ name: "outside" }, [[[20, 20], [30, 30]]]),
      // 一部が内側・一部が外側 → 内側パートのみ残る
      multiLineFeature({ name: "mixed" }, [
        [[2, 2], [8, 8]],
        [[20, 20], [30, 30]],
      ]),
      // bbox をまたぐ → 内側区間に切り詰められる
      multiLineFeature({ name: "crossing" }, [[[5, 5], [15, 5]]]),
    ],
  };

  const clipped = clipRiversToBbox(fc, [0, 0, 10, 10]);

  const names = clipped.features.map((f) => f.properties?.name).sort();
  assertEquals(names, ["crossing", "inside", "mixed"]);

  for (const feature of clipped.features) {
    const geometry = feature.geometry;
    assert(geometry !== null);
    assert(
      geometry.type === "LineString" || geometry.type === "MultiLineString",
    );
    if (geometry.type === "MultiLineString") {
      assert(geometry.coordinates.length > 0);
      for (const line of geometry.coordinates) {
        assert(line.length >= 2, "点数 2 未満のラインが残ってはいけない");
      }
    }
  }

  // crossing は x=10 で切り詰められる
  const crossing = clipped.features.find(
    (f) => f.properties?.name === "crossing",
  );
  assert(crossing !== undefined);
  const coords = crossing.geometry.type === "MultiLineString"
    ? crossing.geometry.coordinates.flat()
    : (crossing.geometry as { coordinates: number[][] }).coordinates;
  for (const [x] of coords) {
    assert(x <= 10, `bbox 外の座標が残っている: x=${x}`);
  }
});

Deno.test("clipRiversToBbox はライン以外のジオメトリをスキップする", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "point" },
        geometry: { type: "Point", coordinates: [5, 5] },
      },
      multiLineFeature({ name: "line" }, [[[2, 2], [8, 8]]]),
    ],
  };

  const clipped = clipRiversToBbox(fc, [0, 0, 10, 10]);

  assertEquals(clipped.features.map((f) => f.properties?.name), ["line"]);
});

Deno.test("pruneRiverProperties は name と scalerank のみ残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature(
        {
          name: "Rhine",
          scalerank: 4,
          featurecla: "River",
          min_zoom: 3.0,
          note: "x",
        },
        [[[0, 0], [1, 1]]],
      ),
      multiLineFeature({ scalerank: 3 }, [[[0, 0], [1, 1]]]),
    ],
  };

  const pruned = pruneRiverProperties(fc);

  assertEquals(pruned.features[0].properties, { name: "Rhine", scalerank: 4 });
  // name が無い feature は name: null で正規化する
  assertEquals(pruned.features[1].properties, { name: null, scalerank: 3 });
});
