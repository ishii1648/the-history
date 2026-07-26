import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import area from "@turf/area";
import { polygon as turfPolygon } from "@turf/helpers";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";
import {
  cleanFeatureCollection,
  cleanGeometry,
  dropTinyRings,
  MIN_HOLE_AREA_M2,
  MIN_PART_AREA_M2,
  normalizeSelfIntersections,
  polygonParts,
  selfIntersectionPoints,
} from "./clean-polygons.ts";
import { SIZE_LIMIT_BYTES, YEARS } from "./build-data.ts";
import {
  FIEF_SIZE_LIMIT_BYTES,
  FRANCE_FIEF_YEARS,
} from "./build-france-fiefs.ts";
import { HRE_OVERLAY_YEARS, HRE_SIZE_LIMIT_BYTES } from "./build-hre.ts";

/** 経緯度の矩形リング（反時計回り）。widthDeg 四方 */
function square(
  west: number,
  south: number,
  widthDeg: number,
): Position[] {
  const east = west + widthDeg;
  const north = south + widthDeg;
  return [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
}

/** 自己交差する蝶ネクタイ型リング（(0.5,0.5) で交差する） */
const BOWTIE: Position[] = [
  [0, 0],
  [1, 1],
  [1, 0],
  [0, 1],
  [0, 0],
];

function poly(rings: Position[][]): Polygon {
  return { type: "Polygon", coordinates: rings };
}

function multi(polygons: Position[][][]): MultiPolygon {
  return { type: "MultiPolygon", coordinates: polygons };
}

function feature(
  name: string,
  geometry: Polygon | MultiPolygon,
): Feature<Polygon | MultiPolygon> {
  return { type: "Feature", properties: { NAME: name }, geometry };
}

function ringAreaM2(ring: Position[]): number {
  return area(turfPolygon([ring]));
}

Deno.test("selfIntersectionPoints は自己交差点を検出し、単純なポリゴンでは空", () => {
  const kinked = selfIntersectionPoints(poly([BOWTIE]));
  assertEquals(kinked.length, 1);
  assertAlmostEquals(kinked[0][0], 0.5, 1e-9);
  assertAlmostEquals(kinked[0][1], 0.5, 1e-9);

  assertEquals(selfIntersectionPoints(poly([square(0, 0, 1)])).length, 0);
});

Deno.test("selfIntersectionPoints は MultiPolygon の全パートを見る", () => {
  const geometry = multi([[square(10, 10, 1)], [BOWTIE]]);
  assertEquals(selfIntersectionPoints(geometry).length, 1);
});

Deno.test("normalizeSelfIntersections は自己交差を解消し面積を保つ", () => {
  const before = poly([BOWTIE]);
  const after = normalizeSelfIntersections(before);
  assert(after !== null);
  assertEquals(selfIntersectionPoints(after).length, 0);
  // 蝶ネクタイは交点 (0.5,0.5) で 2 枚の三角形に分割される。面積の合計は
  // 元のリングが実際に囲む面（両ローブ）と一致し、交差部を二重に数えない
  assertEquals(polygonParts(after).length, 2);
  const expected = ringAreaM2([[0, 0], [0.5, 0.5], [0, 1], [0, 0]]) +
    ringAreaM2([[0.5, 0.5], [1, 1], [1, 0], [0.5, 0.5]]);
  assertAlmostEquals(
    area({
      type: "Feature",
      properties: {},
      geometry: after,
    } as Feature),
    expected,
    expected * 1e-6,
  );
});

Deno.test("normalizeSelfIntersections は入力を変更しない（純粋関数）", () => {
  const geometry = poly([BOWTIE]);
  const snapshot = JSON.stringify(geometry);
  normalizeSelfIntersections(geometry);
  assertEquals(JSON.stringify(geometry), snapshot);
});

Deno.test("normalizeSelfIntersections は面が残らない退化ジオメトリで null を返す", () => {
  // 全頂点が一直線に潰れたリング（bbox クリップ・simplify の残骸）
  const degenerate = poly([[
    [0, 0],
    [1, 0],
    [0, 0],
    [0, 0],
  ]]);
  assertEquals(normalizeSelfIntersections(degenerate), null);
});

Deno.test("dropTinyRings は閾値未満のパートと穴だけを落とす", () => {
  // 1 度四方 ≒ 12,300 km² なので、0.01 度四方 ≒ 1.2 km²、0.005 度四方 ≒ 0.3 km²
  const big = square(0, 0, 1);
  const smallPart = square(50, 0, 0.005);
  const bigHole = square(0.2, 0.2, 0.5);
  const smallHole = square(0.1, 0.1, 0.005);
  assert(ringAreaM2(smallPart) < MIN_PART_AREA_M2);
  assert(ringAreaM2(smallHole) < MIN_HOLE_AREA_M2);
  assert(ringAreaM2(bigHole) > MIN_HOLE_AREA_M2);

  const result = dropTinyRings(
    multi([[big, bigHole, smallHole], [smallPart]]),
  );
  assertEquals(result.droppedParts, 1);
  assertEquals(result.droppedHoles, 1);
  assert(result.geometry !== null);
  assertEquals(polygonParts(result.geometry).length, 1);
  assertEquals(polygonParts(result.geometry)[0].length, 2);
});

Deno.test("dropTinyRings は全パートが閾値未満なら null を返す", () => {
  const result = dropTinyRings(multi([[square(0, 0, 0.005)]]));
  assertEquals(result.geometry, null);
  assertEquals(result.droppedParts, 1);
});

Deno.test("dropTinyRings は入力を変更しない（純粋関数）", () => {
  const geometry = multi([[square(0, 0, 1)], [square(50, 0, 0.005)]]);
  const snapshot = JSON.stringify(geometry);
  dropTinyRings(geometry);
  assertEquals(JSON.stringify(geometry), snapshot);
});

Deno.test("cleanGeometry は自己交差が無ければジオメトリを作り直さない", () => {
  const geometry = poly([square(0, 0, 1)]);
  const result = cleanGeometry(geometry);
  // 同一参照で返る = union による正規化を通していない（差分を出さない）
  assertEquals(result.geometry, geometry);
  assertEquals(result.normalized, false);
});

Deno.test("cleanGeometry は自己交差解消と微小破片除去の両方を行う", () => {
  const geometry = multi([[BOWTIE], [square(50, 0, 0.005)]]);
  const result = cleanGeometry(geometry);
  assert(result.geometry !== null);
  assertEquals(selfIntersectionPoints(result.geometry).length, 0);
  assertEquals(result.normalized, true);
  assertEquals(result.droppedParts, 1);
  assertEquals(polygonParts(result.geometry).length, 2);
});

Deno.test("cleanFeatureCollection は並び・properties・非ポリゴンを保つ", () => {
  const line: Feature = {
    type: "Feature",
    properties: { NAME: "river" },
    geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
  };
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      feature("a", poly([square(0, 0, 1)])),
      line,
      feature("b", poly([BOWTIE])),
    ],
  };
  const { fc: cleaned, stats } = cleanFeatureCollection(fc);
  assertEquals(cleaned.features.map((f) => f.properties?.NAME), [
    "a",
    "river",
    "b",
  ]);
  assertEquals(cleaned.features[0], fc.features[0]);
  assertEquals(cleaned.features[1], line);
  assertEquals(stats.normalizedFeatures, 1);
  assertEquals(stats.droppedFeatures, []);
  assertEquals(
    selfIntersectionPoints(
      cleaned.features[2].geometry as Polygon | MultiPolygon,
    ).length,
    0,
  );
});

Deno.test("cleanFeatureCollection は面が残らない feature を落として記録する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      feature("keep", poly([square(0, 0, 1)])),
      feature("debris", multi([[square(50, 0, 0.005)]])),
    ],
  };
  const { fc: cleaned, stats } = cleanFeatureCollection(fc);
  assertEquals(cleaned.features.length, 1);
  assertEquals(stats.droppedFeatures, ["debris"]);
});

Deno.test("cleanFeatureCollection は入力を変更しない（純粋関数）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [feature("b", poly([BOWTIE]))],
  };
  const snapshot = JSON.stringify(fc);
  cleanFeatureCollection(fc);
  assertEquals(JSON.stringify(fc), snapshot);
});

/** data/ の全 GeoJSON を列挙する */
async function dataGeoJsonFiles(): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir("data")) {
    if (entry.isFile && entry.name.endsWith(".geojson")) names.push(entry.name);
  }
  return names.sort();
}

async function readCollection(name: string): Promise<FeatureCollection> {
  return JSON.parse(
    await Deno.readTextFile(`data/${name}`),
  ) as FeatureCollection;
}

Deno.test("生成物の全ポリゴンに自己交差が無い（全年代）", async () => {
  const offenders: string[] = [];
  for (const name of await dataGeoJsonFiles()) {
    const fc = await readCollection(name);
    for (const f of fc.features) {
      const geometry = f.geometry;
      if (
        geometry === null ||
        (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
      ) {
        continue;
      }
      for (const point of selfIntersectionPoints(geometry)) {
        offenders.push(
          `${name} ${String(f.properties?.NAME)} @ ${point.join(",")}`,
        );
      }
    }
  }
  assertEquals(offenders, []);
});

Deno.test("生成物にクリーンアップ閾値未満のパート・穴が無い（全年代）", async () => {
  const offenders: string[] = [];
  for (const name of await dataGeoJsonFiles()) {
    const fc = await readCollection(name);
    for (const f of fc.features) {
      const geometry = f.geometry;
      if (
        geometry === null ||
        (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
      ) {
        continue;
      }
      for (const part of polygonParts(geometry)) {
        const outer = ringAreaM2(part[0]);
        if (outer < MIN_PART_AREA_M2) {
          offenders.push(
            `${name} ${String(f.properties?.NAME)} part ${outer.toFixed(0)} m²`,
          );
        }
        for (const hole of part.slice(1)) {
          const holeArea = ringAreaM2(hole);
          if (holeArea < MIN_HOLE_AREA_M2) {
            offenders.push(
              `${name} ${String(f.properties?.NAME)} hole ${
                holeArea.toFixed(0)
              } m²`,
            );
          }
        }
      }
    }
  }
  assertEquals(offenders, []);
});

Deno.test("生成物はクリーンアップの不動点（再適用しても変化しない）", async () => {
  for (const name of await dataGeoJsonFiles()) {
    const fc = await readCollection(name);
    const { fc: cleaned, stats } = cleanFeatureCollection(fc);
    // 巨大な文字列を assertEquals に渡すと差分生成でメモリを食い潰すため、
    // 一致判定は assert で行い、失敗時は stats だけを報告する
    assert(
      JSON.stringify(cleaned.features) === JSON.stringify(fc.features),
      `${name} がクリーンアップで変化しました: ${JSON.stringify(stats)}`,
    );
  }
});

Deno.test("閾値は County of Bar の史実の飛び地を削らない", async () => {
  for (const year of FRANCE_FIEF_YEARS) {
    const fc = await readCollection(`france_fiefs_${year}.geojson`);
    const bar = fc.features.find((f) => f.properties?.NAME === "County of Bar");
    if (bar === undefined) continue;
    const geometry = bar.geometry as Polygon | MultiPolygon;
    const parts = polygonParts(geometry);
    const result = cleanGeometry(geometry);
    assert(result.geometry !== null);
    assertEquals(
      result.droppedParts,
      0,
      `${year} の County of Bar の飛び地が削られました`,
    );
    assertEquals(result.droppedHoles, 0);
    assertEquals(polygonParts(result.geometry).length, parts.length);
  }
});

Deno.test("生成物は年代ごとのサイズ上限に収まる", async () => {
  const limits: Array<[string, number]> = [
    ...YEARS.map((y): [string, number] => [
      `europe_${y}.geojson`,
      SIZE_LIMIT_BYTES,
    ]),
    ...FRANCE_FIEF_YEARS.map((y): [string, number] => [
      `france_fiefs_${y}.geojson`,
      FIEF_SIZE_LIMIT_BYTES,
    ]),
    ...FRANCE_FIEF_YEARS.map((y): [string, number] => [
      `france_fiefs_flat_${y}.geojson`,
      FIEF_SIZE_LIMIT_BYTES,
    ]),
    ...HRE_OVERLAY_YEARS.map((y): [string, number] => [
      `hre_${y}.geojson`,
      HRE_SIZE_LIMIT_BYTES,
    ]),
  ];
  for (const [name, limit] of limits) {
    const { size } = await Deno.stat(`data/${name}`);
    assert(size <= limit, `data/${name} が ${size} バイトで上限 ${limit} 超過`);
  }
});
