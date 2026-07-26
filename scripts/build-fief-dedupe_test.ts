import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import area from "@turf/area";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type {
  Feature,
  FeatureCollection,
  LineString,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import {
  coverageByPowerName,
  fiefUnionOf,
  MIN_RECORDED_COVERAGE,
  outlinesOutsideFiefs,
} from "./build-fief-dedupe.ts";
import { FRANCE_FIEF_OVERLAY_YEARS } from "../src/config.ts";
import { FIEF_DEDUPE_YEARS } from "./build-fief-dedupe.ts";

/** 矩形ポリゴンの feature（NAME 付き） */
function box(
  name: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): Feature<Polygon> {
  return {
    type: "Feature",
    properties: { NAME: name },
    geometry: {
      type: "Polygon",
      coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]],
    },
  };
}

function fc(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

/** ライン片の中央セグメントの中点（端点は境界上になり得るため使わない） */
function midpoint(coords: readonly Position[]): Position {
  const i = Math.floor((coords.length - 1) / 2);
  return [
    (coords[i][0] + coords[i + 1][0]) / 2,
    (coords[i][1] + coords[i + 1][1]) / 2,
  ];
}

Deno.test("FIEF_DEDUPE_YEARS は諸侯領オーバーレイ対象年と同値", () => {
  assertEquals([...FIEF_DEDUPE_YEARS], [...FRANCE_FIEF_OVERLAY_YEARS]);
});

Deno.test("fiefUnionOf は隣接する諸侯領を 1 つのポリゴンへ統合する", () => {
  const union = fiefUnionOf(
    fc([box("A", 0, 0, 1, 1), box("B", 1, 0, 2, 1)]),
  );
  assert(union !== null);
  assertAlmostEquals(area(union), area(box("AB", 0, 0, 2, 1)), 1);
});

Deno.test("fiefUnionOf は諸侯領が無ければ null を返す", () => {
  assertEquals(fiefUnionOf(fc([])), null);
});

Deno.test("coverageByPowerName は諸侯領に完全内包される勢力を 1 とする（ブルターニュ相当）", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 1, 1)]));
  const coverage = coverageByPowerName(
    fc([box("Britany", 0.2, 0.2, 0.8, 0.8)]),
    union,
  );
  assertAlmostEquals(coverage["Britany"], 1, 0.001);
});

Deno.test("coverageByPowerName は部分重複を面積比で返す（ブルターニュ以外は抑制されない）", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 1, 1)]));
  const coverage = coverageByPowerName(fc([box("France", 0, 0, 2, 1)]), union);
  assertAlmostEquals(coverage["France"], 0.5, 0.01);
});

Deno.test("coverageByPowerName は同名の複数 feature を面積加重で集計する", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 1, 1)]));
  const coverage = coverageByPowerName(
    fc([box("Split", 0, 0, 1, 1), box("Split", 2, 0, 3, 1)]),
    union,
  );
  assertAlmostEquals(coverage["Split"], 0.5, 0.01);
});

Deno.test("coverageByPowerName は重ならない勢力を表に載せない", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 1, 1)]));
  const coverage = coverageByPowerName(fc([box("Far", 10, 10, 11, 11)]), union);
  assertEquals(Object.hasOwn(coverage, "Far"), false);
});

Deno.test("coverageByPowerName は MIN_RECORDED_COVERAGE 未満の微小重複を捨てる", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 1, 1)]));
  // 1000 x 1 の勢力が 1 x 1 だけ重なる ≒ 被覆率 0.001 未満
  const coverage = coverageByPowerName(fc([box("Huge", 0, 0, 2000, 1)]), union);
  assert(MIN_RECORDED_COVERAGE > 0);
  assertEquals(Object.hasOwn(coverage, "Huge"), false);
});

Deno.test("coverageByPowerName は諸侯領 union が null なら空表を返す", () => {
  assertEquals(coverageByPowerName(fc([box("France", 0, 0, 1, 1)]), null), {});
});

Deno.test("coverageByPowerName は NAME を持たない feature を無視する", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 1, 1)]));
  const anonymous: Feature = {
    type: "Feature",
    properties: {},
    geometry: box("x", 0, 0, 1, 1).geometry,
  };
  assertEquals(coverageByPowerName(fc([anonymous]), union), {});
});

Deno.test("coverageByPowerName のキーは昇順で決定的", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 10, 10)]));
  const coverage = coverageByPowerName(
    fc([box("Zeta", 0, 0, 1, 1), box("Alpha", 1, 1, 2, 2)]),
    union,
  );
  assertEquals(Object.keys(coverage), ["Alpha", "Zeta"]);
});

Deno.test("outlinesOutsideFiefs は諸侯領に完全内包される境界線を出力しない（二重輪郭の解消）", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 10, 10)]));
  const outlines = outlinesOutsideFiefs(
    fc([box("Britany", 1, 1, 2, 2)]),
    union,
  );
  assertEquals(outlines.features.length, 0);
});

Deno.test("outlinesOutsideFiefs は諸侯領の外側の境界線をそのまま残す", () => {
  const union = fiefUnionOf(fc([box("Fief", 0, 0, 1, 1)]));
  const outside = box("Bohemia", 10, 10, 11, 11);
  const outlines = outlinesOutsideFiefs(fc([outside]), union);
  assertEquals(outlines.features.length, 1);
  assertEquals(outlines.features[0].properties?.NAME, "Bohemia");
  assertEquals(
    (outlines.features[0].geometry as LineString).coordinates,
    outside.geometry.coordinates[0],
  );
});

Deno.test("outlinesOutsideFiefs は諸侯領を跨ぐ境界線から内側の部分だけを落とす", () => {
  const fief = box("Fief", 0, 0, 1, 1);
  const union = fiefUnionOf(fc([fief]));
  assert(union !== null);
  const outlines = outlinesOutsideFiefs(
    fc([box("France", 0.5, 0.5, 3, 3)]),
    union,
  );
  assert(outlines.features.length > 0);
  for (const feature of outlines.features) {
    const coords = (feature.geometry as LineString).coordinates;
    assert(
      !booleanPointInPolygon(
        midpoint(coords),
        union as Feature<Polygon | MultiPolygon>,
      ),
      `諸侯領内部に残ったライン: ${JSON.stringify(coords)}`,
    );
  }
});

Deno.test("outlinesOutsideFiefs は bbox が重なるだけで交差しない境界線を落とさない", () => {
  // 諸侯領 union の bbox（[0,0,4,4]）の内側だが、どの諸侯領とも交差しない位置。
  // turf の lineSplit は交差が無いと 0 件を返すため、これを「内側」と誤って
  // 扱うと神聖ローマ帝国・イングランドの輪郭が丸ごと消える（実測で発生）。
  const union = fiefUnionOf(fc([box("A", 0, 0, 1, 1), box("B", 3, 3, 4, 4)]));
  const outlines = outlinesOutsideFiefs(
    fc([box("Holy Roman Empire", 1.5, 1.5, 2.5, 2.5)]),
    union,
  );
  assertEquals(outlines.features.length, 1);
  assertEquals(
    (outlines.features[0].geometry as LineString).coordinates.length,
    5,
  );
});

Deno.test("outlinesOutsideFiefs は union が null なら全境界線を残す（対象外年の非退行）", () => {
  const outlines = outlinesOutsideFiefs(
    fc([box("France", 0, 0, 1, 1), box("Bohemia", 5, 5, 6, 6)]),
    null,
  );
  assertEquals(outlines.features.length, 2);
});

Deno.test("outlinesOutsideFiefs は穴（内環）も独立したラインとして出力する", () => {
  const withHole: Feature<Polygon> = {
    type: "Feature",
    properties: { NAME: "Donut" },
    geometry: {
      type: "Polygon",
      coordinates: [
        [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
        [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
      ],
    },
  };
  const outlines = outlinesOutsideFiefs(fc([withHole]), null);
  assertEquals(outlines.features.length, 2);
});
