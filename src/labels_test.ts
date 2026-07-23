import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Position } from "geojson";
import {
  BASE_LABEL_COLOR,
  buildLabelData,
  characterSetFrom,
  CITY_LABEL_COLOR,
  CITY_LABEL_SIZE_PX,
  HRE_LABEL_COLOR,
  LABEL_FONT_FAMILY,
  LABEL_FONT_SETTINGS,
  LABEL_OUTLINE_COLOR,
  LABEL_OUTLINE_WIDTH,
  labelAnchorFor,
  labelColorFor,
  labelPriorityFor,
  labelTextFor,
  MAX_LABEL_PRIORITY,
  MIN_LABEL_PRIORITY,
  POWER_LABEL_SIZE_PX,
  RIVER_LABEL_COLOR,
  RIVER_LABEL_SIZE_PX,
} from "./labels.ts";

/** テスト用の Feature を組み立てる */
function feature(
  geometry: Feature["geometry"] | null,
  properties: Feature["properties"] = { NAME: "Testland" },
): Feature {
  return {
    type: "Feature",
    properties,
    geometry: geometry as Feature["geometry"],
  };
}

/** 正方形の外環リング（反時計回り・閉環） */
function squareRing(x: number, y: number, size: number): Position[] {
  return [
    [x, y],
    [x + size, y],
    [x + size, y + size],
    [x, y + size],
    [x, y],
  ];
}

/**
 * ray casting による点のポリゴン内判定（外環のみ・テスト検証用）。
 * 境界上の点は扱わない前提（テストデータは内部に十分な余白を持たせる）。
 */
function pointInRing(point: [number, number], ring: Position[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// ---- labelTextFor ----

Deno.test("labelTextFor は NAME をそのまま返す", () => {
  assertEquals(labelTextFor({ NAME: "France" }), "France");
});

Deno.test("labelTextFor は属領（SUBJECTO≠NAME）でも NAME のみを返す", () => {
  // 宗主国込みの表記（"NAME — SUBJECTO 領"）はツールチップの displayLabel に
  // 委ね、地図上の常時ラベルは NAME のみとする方針（info.ts と矛盾しない）
  assertEquals(
    labelTextFor({ NAME: "Granada", SUBJECTO: "Castille" }),
    "Granada",
  );
});

// TASK-23: 日本語表記マップ（ja）の適用
Deno.test("labelTextFor は ja マップで NAME を日本語化する", () => {
  assertEquals(
    labelTextFor({ NAME: "France" }, { France: "フランス王国" }),
    "フランス王国",
  );
});

Deno.test("labelTextFor は ja に無い NAME を英語のままフォールバックする", () => {
  assertEquals(
    labelTextFor({ NAME: "Wales" }, { France: "フランス王国" }),
    "Wales",
  );
});

Deno.test("labelTextFor は ja を省略すると従来どおり NAME を返す", () => {
  assertEquals(labelTextFor({ NAME: "France" }), "France");
});

Deno.test("labelTextFor は NAME が null・空文字・欠落なら null を返す", () => {
  assertEquals(labelTextFor({ NAME: null }), null);
  assertEquals(labelTextFor({ NAME: "" }), null);
  assertEquals(labelTextFor({}), null);
  assertEquals(labelTextFor(null), null);
});

// ---- labelAnchorFor ----

Deno.test("labelAnchorFor は正方形 Polygon の中心付近を返す", () => {
  const f = feature({
    type: "Polygon",
    coordinates: [squareRing(0, 0, 10)],
  });
  const anchor = labelAnchorFor(f);
  assert(anchor !== null);
  const [x, y] = anchor;
  assert(Math.abs(x - 5) < 1, `x=${x} は中心 5 付近のはず`);
  assert(Math.abs(y - 5) < 1, `y=${y} は中心 5 付近のはず`);
});

Deno.test("labelAnchorFor は MultiPolygon で最大ポリゴン（本体）にアンカーを置く", () => {
  // 大きい本体（0..10）と遠く離れた小さい離島（100..101）
  const f = feature({
    type: "MultiPolygon",
    coordinates: [
      [squareRing(100, 100, 1)],
      [squareRing(0, 0, 10)],
    ],
  });
  const anchor = labelAnchorFor(f);
  assert(anchor !== null);
  assert(
    pointInRing(anchor, squareRing(0, 0, 10)),
    `anchor=${JSON.stringify(anchor)} は本体側に乗るはず`,
  );
});

Deno.test("labelAnchorFor は凹形状（L字）でもポリゴン内部にアンカーを置く", () => {
  // L 字型: bbox 中心 (5,5) は内部に含まれない
  const ring: Position[] = [
    [0, 0],
    [10, 0],
    [10, 10],
    [8, 10],
    [8, 2],
    [0, 2],
    [0, 0],
  ];
  const f = feature({ type: "Polygon", coordinates: [ring] });
  const anchor = labelAnchorFor(f);
  assert(anchor !== null);
  assert(
    pointInRing(anchor, ring),
    `anchor=${JSON.stringify(anchor)} はポリゴン内部のはず`,
  );
});

Deno.test("labelAnchorFor は Polygon/MultiPolygon 以外・空ジオメトリで null を返す", () => {
  assertEquals(
    labelAnchorFor(feature({ type: "Point", coordinates: [0, 0] })),
    null,
  );
  assertEquals(
    labelAnchorFor(feature({ type: "MultiPolygon", coordinates: [] })),
    null,
  );
  assertEquals(labelAnchorFor(feature(null)), null);
});

// ---- labelPriorityFor ----

Deno.test("labelPriorityFor は面積が大きいほど高い優先度を返す", () => {
  const small = feature({
    type: "Polygon",
    coordinates: [squareRing(0, 0, 0.5)],
  });
  const large = feature({
    type: "Polygon",
    coordinates: [squareRing(0, 0, 10)],
  });
  assert(labelPriorityFor(large) > labelPriorityFor(small));
});

Deno.test("labelPriorityFor は MultiPolygon の最大ポリゴン面積で決まる", () => {
  // 本体 10x10 + 離島 1x1 と、本体 10x10 のみは同じ優先度になる
  const withIsland = feature({
    type: "MultiPolygon",
    coordinates: [[squareRing(100, 100, 1)], [squareRing(0, 0, 10)]],
  });
  const bodyOnly = feature({
    type: "Polygon",
    coordinates: [squareRing(0, 0, 10)],
  });
  assertEquals(labelPriorityFor(withIsland), labelPriorityFor(bodyOnly));
});

Deno.test("labelPriorityFor は常に -1000..1000 の範囲に収まる", () => {
  // CollisionFilterExtension の getCollisionPriority の許容レンジ
  const cases = [
    feature({ type: "Polygon", coordinates: [squareRing(0, 0, 1e-8)] }),
    feature({ type: "Polygon", coordinates: [squareRing(0, 0, 360)] }),
    feature({ type: "Point", coordinates: [0, 0] }),
    feature(null),
  ];
  for (const f of cases) {
    const p = labelPriorityFor(f);
    assert(
      p >= MIN_LABEL_PRIORITY && p <= MAX_LABEL_PRIORITY,
      `priority=${p} はレンジ外`,
    );
  }
});

// ---- buildLabelData ----

Deno.test("buildLabelData は NAME 欠落・非ポリゴン feature を除外する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      feature({ type: "Polygon", coordinates: [squareRing(0, 0, 10)] }, {
        NAME: "France",
      }),
      // NAME null → 除外
      feature({ type: "Polygon", coordinates: [squareRing(20, 0, 10)] }, {
        NAME: null,
      }),
      // 非ポリゴン → 除外
      feature({ type: "Point", coordinates: [0, 0] }, { NAME: "PointLand" }),
    ],
  };
  const data = buildLabelData(fc);
  assertEquals(data.length, 1);
  assertEquals(data[0].text, "France");
  assert(pointInRing(data[0].position, squareRing(0, 0, 10)));
  assertEquals(data[0].priority, labelPriorityFor(fc.features[0]));
});

Deno.test("buildLabelData は空 FeatureCollection で空配列を返す", () => {
  assertEquals(
    buildLabelData({ type: "FeatureCollection", features: [] }),
    [],
  );
});

// TASK-23: 日本語表記マップ（ja）の適用
Deno.test("buildLabelData は ja マップを適用した text を返す（未登録は英語のまま）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      feature({ type: "Polygon", coordinates: [squareRing(0, 0, 10)] }, {
        NAME: "France",
      }),
      feature({ type: "Polygon", coordinates: [squareRing(20, 0, 10)] }, {
        NAME: "Wales",
      }),
    ],
  };
  const data = buildLabelData(fc, { France: "フランス王国" });
  assertEquals(data.map((d) => d.text), ["フランス王国", "Wales"]);
});

// TASK-30: ラベル由来種別（kind）の付与
Deno.test("buildLabelData は kind を渡すと全 datum に付与する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      feature({ type: "Polygon", coordinates: [squareRing(0, 0, 10)] }, {
        NAME: "Bavaria",
      }),
      feature({ type: "Polygon", coordinates: [squareRing(20, 0, 10)] }, {
        NAME: "Saxony",
      }),
    ],
  };
  const data = buildLabelData(fc, {}, "hre");
  assertEquals(data.map((d) => d.kind), ["hre", "hre"]);
});

Deno.test("buildLabelData は kind 省略時に kind キーを持たない（後方互換）", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      feature({ type: "Polygon", coordinates: [squareRing(0, 0, 10)] }, {
        NAME: "France",
      }),
    ],
  };
  const data = buildLabelData(fc);
  assertEquals("kind" in data[0], false);
});

// ---- labelColorFor ----

Deno.test("labelColorFor は kind=hre で帝国色、それ以外で基本色を返す", () => {
  assertEquals(labelColorFor({ kind: "hre" }), HRE_LABEL_COLOR);
  assertEquals(labelColorFor({ kind: "base" }), BASE_LABEL_COLOR);
  assertEquals(labelColorFor({}), BASE_LABEL_COLOR);
});

Deno.test("labelColorFor の 2 色は互いに異なる RGBA を返す", () => {
  // AC #1: HRE 領邦ラベルと独立国ラベルが文字色だけで区別できること
  assert(
    JSON.stringify(HRE_LABEL_COLOR) !== JSON.stringify(BASE_LABEL_COLOR),
  );
});

// ---- characterSetFrom ----

Deno.test("characterSetFrom は全ラベルの文字を重複なく集める（非 ASCII 含む）", () => {
  const chars = characterSetFrom(["Württemberg", "Wales"]);
  // 重複なし
  assertEquals(new Set(chars).size, chars.length);
  // 非 ASCII の ü が含まれる（TextLayer の characterSet 用）
  assert(chars.includes("ü"));
  assert(chars.includes("W"));
  // "W" は両方に現れるが 1 回だけ
  assertEquals(chars.filter((c) => c === "W").length, 1);
});

Deno.test("characterSetFrom は空入力で空配列を返す", () => {
  assertEquals(characterSetFrom([]), []);
});

// ---- TASK-38: ラベル共通フォント設定・アウトライン・サイズ ----

// TASK-38 以前の各ラベルサイズ（px）。新サイズはこれ以上でなければならない。
const PRE_TASK_38_POWER_LABEL_SIZE_PX = 13;
const PRE_TASK_38_RIVER_LABEL_SIZE_PX = 11;
const PRE_TASK_38_CITY_LABEL_SIZE_PX = 11;
// 過度な画面占有・衝突増を避けるための上限（AC #2）
const MAX_REASONABLE_LABEL_SIZE_PX = 20;

Deno.test("LABEL_FONT_SETTINGS は sdf を有効にする（アウトライン描画の前提）", () => {
  assertEquals(LABEL_FONT_SETTINGS.sdf, true);
});

Deno.test("LABEL_OUTLINE_WIDTH は正の値（縁取りが実際に描かれる）", () => {
  assert(LABEL_OUTLINE_WIDTH > 0);
});

Deno.test("LABEL_OUTLINE_COLOR は白系（十分な RGB 輝度）で十分不透明", () => {
  const [r, g, b, a] = LABEL_OUTLINE_COLOR;
  assert(
    r >= 200 && g >= 200 && b >= 200,
    `outline=${LABEL_OUTLINE_COLOR} は白系のはず`,
  );
  assert(a >= 200, `outline alpha=${a} は十分不透明のはず`);
});

Deno.test("LABEL_FONT_FAMILY は sans-serif フォールバックを含む文字列", () => {
  assert(LABEL_FONT_FAMILY.includes("sans-serif"));
});

Deno.test("国名・河川名・都市名ラベルのサイズは従来値以上・上限内", () => {
  for (
    const [size, pre] of [
      [POWER_LABEL_SIZE_PX, PRE_TASK_38_POWER_LABEL_SIZE_PX],
      [RIVER_LABEL_SIZE_PX, PRE_TASK_38_RIVER_LABEL_SIZE_PX],
      [CITY_LABEL_SIZE_PX, PRE_TASK_38_CITY_LABEL_SIZE_PX],
    ] as const
  ) {
    assert(size >= pre, `size=${size} は従来値 ${pre} 以上のはず`);
    assert(
      size <= MAX_REASONABLE_LABEL_SIZE_PX,
      `size=${size} は上限 ${MAX_REASONABLE_LABEL_SIZE_PX} 以内のはず`,
    );
  }
});

Deno.test("TASK-38: 既存のラベル色分け定数は変更されていない", () => {
  // 国名 = 濃グレー、HRE 領邦 = 臙脂、都市 = 茶系、河川 = 水色系（不変）
  assertEquals(BASE_LABEL_COLOR, [40, 40, 40, 255]);
  assertEquals(HRE_LABEL_COLOR, [140, 30, 30, 255]);
  assertEquals(CITY_LABEL_COLOR, [121, 62, 22, 255]);
  assertEquals(RIVER_LABEL_COLOR, [2, 119, 189, 255]);
});

// TASK-23: 日本語ラベルのグリフ生成（characterSet が日本語文字を含む）
Deno.test("characterSetFrom は日本語ラベルの文字も重複なく集める", () => {
  const chars = characterSetFrom(["フランス王国", "神聖ローマ帝国", "Wales"]);
  assertEquals(new Set(chars).size, chars.length);
  assert(chars.includes("フ"));
  assert(chars.includes("帝"));
  assert(chars.includes("W"));
  // "国" は両方の日本語ラベルに現れるが 1 回だけ
  assertEquals(chars.filter((c) => c === "国").length, 1);
});
