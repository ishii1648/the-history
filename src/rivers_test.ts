import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { Rgba } from "./powers.ts";
import { memoizeLatest } from "./memo.ts";
import { PICKING_RADIUS_PX } from "./picking.ts";
import {
  filterVisibleRiverLabels,
  RIVER_CLICK_TOLERANCE_PX,
  RIVER_HIT_LINE_COLOR,
  RIVER_HIT_LINE_WIDTH_PX,
  RIVER_HOVERED_LINE_COLOR,
  RIVER_HOVERED_LINE_WIDTH_PX,
  RIVER_LINE_COLOR,
  RIVER_LINE_WIDTH_PX,
  RIVER_SELECTED_LINE_COLOR,
  RIVER_SELECTED_LINE_WIDTH_PX,
  riverLabelAnchors,
  type RiverLabelDatum,
  riverLineColor,
  riverLineWidth,
  riverNameFor,
  RIVERS_DATA_URL,
  toggleRiverSelection,
} from "./rivers.ts";

// ---- 透明ヒットライン層（TASK-43）----

Deno.test("RIVER_HIT_LINE_WIDTH_PX: 12px 以上（ホバー/クリックの実効判定幅を広げる）", () => {
  assert(RIVER_HIT_LINE_WIDTH_PX >= 12);
});

Deno.test("RIVER_HIT_LINE_COLOR: 完全透明（alpha 0）", () => {
  assertEquals(RIVER_HIT_LINE_COLOR[3], 0);
});

// ---- 河川クリックの実効許容範囲（TASK-51）----

Deno.test("RIVER_CLICK_TOLERANCE_PX: ヒットライン半幅 + PICKING_RADIUS_PX の合成で 13px", () => {
  assertEquals(RIVER_CLICK_TOLERANCE_PX, 13);
});

Deno.test("RIVER_CLICK_TOLERANCE_PX: RIVER_HIT_LINE_WIDTH_PX / 2 + PICKING_RADIUS_PX から導出される（片方の定数変更で追従する構造）", () => {
  assertEquals(
    RIVER_CLICK_TOLERANCE_PX,
    RIVER_HIT_LINE_WIDTH_PX / 2 + PICKING_RADIUS_PX,
  );
});

/** テスト用の河川 feature を組み立てる */
function riverFeature(
  name: unknown,
  geometry: Geometry,
): Feature {
  return {
    type: "Feature",
    properties: name === undefined ? {} : { name, scalerank: 3 },
    geometry,
  } as Feature;
}

function fc(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

// ---- toggleRiverSelection ----

Deno.test("toggleRiverSelection: 未選択から河川クリックで選択される", () => {
  assertEquals(toggleRiverSelection(null, "Rhine"), "Rhine");
});

Deno.test("toggleRiverSelection: 選択中の河川を再クリックで解除される", () => {
  assertEquals(toggleRiverSelection("Rhine", "Rhine"), null);
});

Deno.test("toggleRiverSelection: 別の河川クリックで選択が切り替わる", () => {
  assertEquals(toggleRiverSelection("Rhine", "Danube"), "Danube");
});

Deno.test("toggleRiverSelection: 河川以外（clickedName null）のクリックで解除される", () => {
  assertEquals(toggleRiverSelection("Rhine", null), null);
  assertEquals(toggleRiverSelection(null, null), null);
});

// ---- riverLineColor / riverLineWidth ----

Deno.test("riverLineColor: 未選択時は通常色を返す", () => {
  assertEquals(riverLineColor("Rhine", null), RIVER_LINE_COLOR);
});

Deno.test("riverLineColor: 選択中の河川は強調色を返す", () => {
  assertEquals(riverLineColor("Rhine", "Rhine"), RIVER_SELECTED_LINE_COLOR);
});

Deno.test("riverLineColor: 選択中でも他の河川は通常色のまま", () => {
  assertEquals(riverLineColor("Danube", "Rhine"), RIVER_LINE_COLOR);
});

Deno.test("riverLineColor: name null は選択状態に関わらず通常色", () => {
  assertEquals(riverLineColor(null, null), RIVER_LINE_COLOR);
  assertEquals(riverLineColor(null, "Rhine"), RIVER_LINE_COLOR);
});

Deno.test("riverLineWidth: 未選択時は通常幅、選択中は太くなる", () => {
  assertEquals(riverLineWidth("Rhine", null), RIVER_LINE_WIDTH_PX);
  assertEquals(riverLineWidth("Rhine", "Rhine"), RIVER_SELECTED_LINE_WIDTH_PX);
  assert(
    RIVER_SELECTED_LINE_WIDTH_PX > RIVER_LINE_WIDTH_PX,
    "強調幅は通常幅より太いこと",
  );
});

Deno.test("riverLineWidth: 選択中でも他の河川は通常幅のまま", () => {
  assertEquals(riverLineWidth("Danube", "Rhine"), RIVER_LINE_WIDTH_PX);
  assertEquals(riverLineWidth(null, "Rhine"), RIVER_LINE_WIDTH_PX);
});

// ---- riverLineColor / riverLineWidth: hovered（TASK-42） ----

Deno.test("riverLineColor: ホバー中（未選択）は中間強調色を返す", () => {
  assertEquals(
    riverLineColor("Rhine", null, "Rhine"),
    RIVER_HOVERED_LINE_COLOR,
  );
});

Deno.test("riverLineColor: 選択中の河川にホバーしても選択強調を維持する（AC #3）", () => {
  assertEquals(
    riverLineColor("Rhine", "Rhine", "Rhine"),
    RIVER_SELECTED_LINE_COLOR,
  );
});

Deno.test("riverLineColor: ホバー中でも他の河川は通常色のまま", () => {
  assertEquals(riverLineColor("Danube", null, "Rhine"), RIVER_LINE_COLOR);
});

Deno.test("riverLineColor: hovered が null なら通常色（回帰）", () => {
  assertEquals(riverLineColor("Rhine", null, null), RIVER_LINE_COLOR);
});

Deno.test("riverLineColor: 強調色（ホバー / 選択）は通常色と異なる", () => {
  // 参照比較ではなく値比較で「強調されているか」を担保する（TASK-73 / TASK-91）
  const key = (c: readonly number[]) => c.join(",");
  assert(
    key(RIVER_HOVERED_LINE_COLOR) !== key(RIVER_LINE_COLOR) &&
      key(RIVER_SELECTED_LINE_COLOR) !== key(RIVER_LINE_COLOR),
  );
});

Deno.test("riverLineColor: 選択時の色はホバー時と同一（TASK-91）", () => {
  // クリック（選択）で色相が変わらないこと。段階差は線幅のみが担う。
  assertEquals(RIVER_SELECTED_LINE_COLOR, RIVER_HOVERED_LINE_COLOR);
  assertEquals(
    riverLineColor("Rhine", "Rhine"),
    riverLineColor("Rhine", null, "Rhine"),
  );
});

Deno.test("riverLineWidth: ホバー中（未選択）は中間幅を返す", () => {
  assertEquals(
    riverLineWidth("Rhine", null, "Rhine"),
    RIVER_HOVERED_LINE_WIDTH_PX,
  );
});

Deno.test("riverLineWidth: 選択中の河川にホバーしても選択幅を維持する（AC #3）", () => {
  assertEquals(
    riverLineWidth("Rhine", "Rhine", "Rhine"),
    RIVER_SELECTED_LINE_WIDTH_PX,
  );
});

Deno.test("riverLineWidth: ホバー中でも他の河川は通常幅のまま", () => {
  assertEquals(riverLineWidth("Danube", null, "Rhine"), RIVER_LINE_WIDTH_PX);
});

Deno.test("riverLineWidth: hovered が null なら通常幅（回帰）", () => {
  assertEquals(riverLineWidth("Rhine", null, null), RIVER_LINE_WIDTH_PX);
});

Deno.test("riverLineWidth: 中間幅は通常幅より太く選択幅より細い", () => {
  assert(
    RIVER_HOVERED_LINE_WIDTH_PX > RIVER_LINE_WIDTH_PX &&
      RIVER_HOVERED_LINE_WIDTH_PX < RIVER_SELECTED_LINE_WIDTH_PX,
  );
});

// ---- riverNameFor ----

Deno.test("riverNameFor: name 文字列を返し、欠落・空・非文字列は null", () => {
  assertEquals(riverNameFor({ name: "Elbe" }), "Elbe");
  assertEquals(riverNameFor({}), null);
  assertEquals(riverNameFor({ name: "" }), null);
  assertEquals(riverNameFor({ name: 42 }), null);
  assertEquals(riverNameFor(null), null);
});

// ---- riverLabelAnchors ----

Deno.test("riverLabelAnchors: LineString の中点座標をアンカーにする", () => {
  const data = riverLabelAnchors(fc([
    riverFeature("Rhine", {
      type: "LineString",
      coordinates: [[0, 0], [10, 0]],
    }),
  ]));
  assertEquals(data.length, 1);
  assertEquals(data[0].text, "Rhine");
  assertEquals(data[0].position, [5, 0]);
});

Deno.test("riverLabelAnchors: 中点は頂点間を線形補間する（頂点に丸めない）", () => {
  // 全長 10 の折れ線。中点（距離 5）は 2 頂点目 [4,0] を越えた [5,0]
  const data = riverLabelAnchors(fc([
    riverFeature("Rhine", {
      type: "LineString",
      coordinates: [[0, 0], [4, 0], [10, 0]],
    }),
  ]));
  assertEquals(data[0].position, [5, 0]);
});

Deno.test("riverLabelAnchors: MultiLineString は最長パートの中点を使う", () => {
  const data = riverLabelAnchors(fc([
    riverFeature("Danube", {
      type: "MultiLineString",
      coordinates: [
        [[0, 0], [1, 0]], // 長さ 1
        [[0, 10], [10, 10]], // 長さ 10（最長）
      ],
    }),
  ]));
  assertEquals(data.length, 1);
  assertEquals(data[0].position, [5, 10]);
});

Deno.test("riverLabelAnchors: name の無い feature はラベルを出さない", () => {
  const line: Geometry = { type: "LineString", coordinates: [[0, 0], [1, 0]] };
  const data = riverLabelAnchors(fc([
    riverFeature(undefined, line),
    riverFeature(null, line),
    riverFeature("", line),
    riverFeature("Elbe", line),
  ]));
  assertEquals(data.map((d) => d.text), ["Elbe"]);
});

Deno.test("riverLabelAnchors: LineString/MultiLineString 以外は除外する", () => {
  const data = riverLabelAnchors(fc([
    riverFeature("NotALine", {
      type: "Point",
      coordinates: [0, 0],
    }),
  ]));
  assertEquals(data, []);
});

Deno.test("riverLabelAnchors: priority はライン長に対して単調（長い川を優先）", () => {
  const data = riverLabelAnchors(fc([
    riverFeature("Short", {
      type: "LineString",
      coordinates: [[0, 0], [1, 0]],
    }),
    riverFeature("Long", {
      type: "LineString",
      coordinates: [[0, 0], [10, 0]],
    }),
    riverFeature("Longest", {
      type: "MultiLineString",
      // 合計長 30（10 + 20）。パート分割されても合計長で評価する
      coordinates: [[[0, 0], [10, 0]], [[0, 1], [20, 1]]],
    }),
  ]));
  const byName = new Map(data.map((d) => [d.text, d.priority]));
  assert(byName.get("Long")! > byName.get("Short")!);
  assert(byName.get("Longest")! > byName.get("Long")!);
});

Deno.test("riverLabelAnchors: ja マップで日本語表記になり、未登録は英語のまま", () => {
  const data = riverLabelAnchors(
    fc([
      riverFeature("Rhine", {
        type: "LineString",
        coordinates: [[0, 0], [10, 0]],
      }),
      riverFeature("Oder", {
        type: "LineString",
        coordinates: [[0, 1], [10, 1]],
      }),
    ]),
    { Rhine: "ライン川" },
  );
  assertEquals(data.map((d) => d.text), ["ライン川", "Oder"]);
});

Deno.test("riverLabelAnchors: 突合キーとして元の英語名（name）を保持する（TASK-69）", () => {
  const data = riverLabelAnchors(
    fc([
      riverFeature("Rhine", {
        type: "LineString",
        coordinates: [[0, 0], [10, 0]],
      }),
    ]),
    { Rhine: "ライン川" },
  );
  assertEquals(data[0].name, "Rhine");
  assertEquals(data[0].text, "ライン川");
});

// ---- filterVisibleRiverLabels（TASK-69）----

/** テスト用のアンカー（表示テキストは日本語、突合キーは英語名） */
function anchor(
  name: string,
  priority = 0,
  position: [number, number] = [0, 0],
): RiverLabelDatum {
  return { name, text: `${name}川`, position, priority };
}

Deno.test("filterVisibleRiverLabels: ホバーも選択も無ければ 1 つも表示しない", () => {
  const anchors = [anchor("Rhine"), anchor("Danube")];
  assertEquals(filterVisibleRiverLabels(anchors, null, null), []);
});

Deno.test("filterVisibleRiverLabels: ホバー中の河川だけを表示する", () => {
  const anchors = [anchor("Rhine"), anchor("Danube")];
  assertEquals(
    filterVisibleRiverLabels(anchors, "Danube", null).map((d) => d.name),
    ["Danube"],
  );
});

Deno.test("filterVisibleRiverLabels: 選択中の河川だけを表示する（ホバーなしでも残る）", () => {
  const anchors = [anchor("Rhine"), anchor("Danube")];
  assertEquals(
    filterVisibleRiverLabels(anchors, null, "Rhine").map((d) => d.name),
    ["Rhine"],
  );
});

Deno.test("filterVisibleRiverLabels: 選択中に別の河川をホバーすると両方表示する", () => {
  const anchors = [anchor("Rhine"), anchor("Danube"), anchor("Elbe")];
  assertEquals(
    filterVisibleRiverLabels(anchors, "Elbe", "Rhine").map((d) => d.name),
    ["Rhine", "Elbe"],
  );
});

Deno.test("filterVisibleRiverLabels: 選択中の河川をホバーしてもラベルは 1 つ", () => {
  const anchors = [anchor("Rhine"), anchor("Danube")];
  assertEquals(
    filterVisibleRiverLabels(anchors, "Rhine", "Rhine").map((d) => d.name),
    ["Rhine"],
  );
});

Deno.test("filterVisibleRiverLabels: 同名の feature が複数あってもラベルは 1 つ（最長 = 最高 priority を採用）", () => {
  const anchors = [
    anchor("Rhine", 10, [1, 1]),
    anchor("Rhine", 30, [2, 2]),
    anchor("Rhine", 20, [3, 3]),
  ];
  const visible = filterVisibleRiverLabels(anchors, "Rhine", null);
  assertEquals(visible.length, 1);
  assertEquals(visible[0].position, [2, 2]);
});

Deno.test("filterVisibleRiverLabels: 未知の名前は無視する（該当なしなら空）", () => {
  const anchors = [anchor("Rhine")];
  assertEquals(filterVisibleRiverLabels(anchors, "Nile", "Amazon"), []);
});

Deno.test("filterVisibleRiverLabels: 入力配列を破壊せず、同一 datum 参照をそのまま返す（アンカー再計算なし）", () => {
  const anchors = [anchor("Rhine"), anchor("Danube")];
  const snapshot = [...anchors];
  const visible = filterVisibleRiverLabels(anchors, "Rhine", null);
  assertEquals(anchors, snapshot);
  assert(visible[0] === anchors[0]);
});

Deno.test("filterVisibleRiverLabels: ホバー連続移動でもアンカー生成は 1 度きり（TASK-50 非退行）", () => {
  const collection = fc([
    riverFeature("Rhine", {
      type: "LineString",
      coordinates: [[0, 0], [10, 0]],
    }),
    riverFeature("Danube", {
      type: "LineString",
      coordinates: [[0, 1], [10, 1]],
    }),
  ]);
  const ja = { Rhine: "ライン川" };
  let calls = 0;
  // main.ts の memoizedRiverLabelData と同じ構造（引数は起動時ロード済みの
  // riversData / nameJa 参照で、hover/selection には依存しない）
  const memoized = memoizeLatest((f: FeatureCollection, j: typeof ja) => {
    calls++;
    return riverLabelAnchors(f, j);
  });
  const hovers = ["Rhine", "Danube", null, "Rhine", "Danube", null];
  for (const hovered of hovers) {
    filterVisibleRiverLabels(memoized(collection, ja), hovered, "Danube");
  }
  assertEquals(calls, 1);
});

// ---- 定数（basemap.ts からの移設契約） ----

Deno.test("RIVERS_DATA_URL は scripts 側の生成物パスと一致する", () => {
  assertEquals(RIVERS_DATA_URL, "/data/rivers.geojson");
});

// --- TASK-44: ベースマップ川ライン除外に伴う視認性の底上げ ---

Deno.test("RIVER_LINE_WIDTH_PX は 3 以上（唯一の川表示としての視認性, TASK-44）", () => {
  assert(RIVER_LINE_WIDTH_PX >= 3);
});

// ---- TASK-73: 羊皮紙/古地図トーンへの配色統一 ----
// ベースマップ（basemap.ts PARCHMENT_FLAVOR_OVERRIDES）が羊皮紙トーンになった
// ため、light flavor の water（#80deea）由来だった水色系の 3 状態を、青灰 +
// 朱（--wax）の古地図配色へ置き換える。3 状態の識別（TASK-42 AC）は退行させない。

/** HSV 相当の彩度（0..1）。0 に近いほど無彩色 */
function saturation([r, g, b]: Rgba): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

/** sRGB の相対輝度（0..255 の近似。3 状態の明度差の比較に使う） */
function luminance([r, g, b]: Rgba): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

Deno.test("RIVER_LINE_COLOR は青灰系（低彩度・寒色寄り）で不透明", () => {
  assertEquals(RIVER_LINE_COLOR, [122, 148, 158, 255]);
  assert(
    saturation(RIVER_LINE_COLOR) < 0.3,
    `通常色 ${RIVER_LINE_COLOR} は低彩度（シアンではない）はず`,
  );
  assert(
    RIVER_LINE_COLOR[2] > RIVER_LINE_COLOR[0],
    "青が赤より強い（寒色寄り）",
  );
  assertEquals(RIVER_LINE_COLOR[3], 255);
});

Deno.test("RIVER_HOVERED_LINE_COLOR は通常色と同系の青灰で、より暗い中間強調", () => {
  assertEquals(RIVER_HOVERED_LINE_COLOR, [74, 106, 122, 255]);
  assert(
    RIVER_HOVERED_LINE_COLOR[2] > RIVER_HOVERED_LINE_COLOR[0],
    "ホバー色も寒色寄り（通常色と同系）",
  );
  assert(
    luminance(RIVER_HOVERED_LINE_COLOR) < luminance(RIVER_LINE_COLOR),
    "ホバー色は通常色より暗く、下地の羊皮紙上で明確に強調される",
  );
  assertEquals(RIVER_HOVERED_LINE_COLOR[3], 255);
});

Deno.test("RIVER_SELECTED_LINE_COLOR はホバー色と同一の濃い青灰（TASK-91）", () => {
  // #4a6a7a。クリックによる色相変化は廃止し、選択の区別は線幅が担う
  assertEquals(RIVER_SELECTED_LINE_COLOR, [74, 106, 122, 255]);
  assert(
    RIVER_SELECTED_LINE_COLOR[2] > RIVER_SELECTED_LINE_COLOR[0],
    "選択色も寒色寄り（通常/ホバーと同系の青灰）",
  );
  assert(
    luminance(RIVER_SELECTED_LINE_COLOR) < luminance(RIVER_LINE_COLOR),
    "選択色は通常色より暗く、下地の羊皮紙上で明確に強調される",
  );
  assertEquals(RIVER_SELECTED_LINE_COLOR[3], 255);
});

Deno.test("河川 3 状態はいずれも羊皮紙下地（#f0e6cd 相当）より十分暗く視認できる", () => {
  // 下地 earth #f0e6cd の近似輝度
  const earthLuminance = luminance([240, 230, 205, 255]);
  for (
    const color of [
      RIVER_LINE_COLOR,
      RIVER_HOVERED_LINE_COLOR,
      RIVER_SELECTED_LINE_COLOR,
    ]
  ) {
    assert(
      earthLuminance - luminance(color) > 60,
      `${color} は羊皮紙下地に対して十分な明度差を持つはず`,
    );
  }
});
