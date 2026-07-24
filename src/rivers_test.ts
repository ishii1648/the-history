import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { PICKING_RADIUS_PX } from "./picking.ts";
import {
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

Deno.test("riverLineColor: 中間強調色は通常色と選択強調色のどちらとも異なる", () => {
  assert(
    RIVER_HOVERED_LINE_COLOR !== RIVER_LINE_COLOR &&
      RIVER_HOVERED_LINE_COLOR !== RIVER_SELECTED_LINE_COLOR,
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

// ---- 定数（basemap.ts からの移設契約） ----

Deno.test("RIVERS_DATA_URL は scripts 側の生成物パスと一致する", () => {
  assertEquals(RIVERS_DATA_URL, "/data/rivers.geojson");
});

// --- TASK-44: ベースマップ川ライン除外に伴う視認性の底上げ ---

Deno.test("RIVER_LINE_WIDTH_PX は 3 以上（唯一の川表示としての視認性, TASK-44）", () => {
  assert(RIVER_LINE_WIDTH_PX >= 3);
});
