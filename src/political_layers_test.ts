/**
 * political_layers.ts のユニットテスト（TASK-148 / Issue #166）。
 *
 * 検証する契約:
 * - 見た目定数（HRE_EXTENT_* / FIEF_LINE_*）が main.ts 時代の値と一致すること
 * - buildPowerLayer: id・pickable・stroked・境界線・beforeId（underWaterBeforeId
 *   由来）・塗り遷移時間（context の fillTransitionMs）・強調 updateTriggers が
 *   main.ts 時代と一致すること
 * - buildSuzerainExtentLayer: extentKey の有無で visible/data が切り替わり、
 *   同一入力の再構築では union（キャッシュ）が再計算されないこと
 * - buildLabelLayer: **メモ化の参照同値（TASK-50/136 の非退行）**。強調キー
 *   だけが変わる再構築では data / characterSet の参照が前回と同一で、
 *   ズーム段が変わっても characterSet（全 datum 由来。TASK-122 AC #7）は
 *   同一参照のままであること
 * - **キャッシュ共有（debug_hooks.ts との契約）**: factory が公開する
 *   memoizedPowerLabelData / memoizedVisiblePowerLabels は builder と同一
 *   キャッシュを共有し、builder 実行後に同じ引数で呼ぶと再計算なしで
 *   同一参照が返ること
 */
import {
  assert,
  assertEquals,
  assertNotStrictEquals,
  assertStrictEquals,
} from "@std/assert";
import type { Feature, FeatureCollection } from "geojson";
import {
  createPoliticalLayerBuilders,
  FIEF_LINE_COLOR,
  FIEF_LINE_WIDTH_PX,
  HRE_EXTENT_FILL_COLOR,
  HRE_EXTENT_LAYER_ID,
  HRE_EXTENT_LINE_COLOR,
  HRE_EXTENT_LINE_WIDTH_PX,
  type PoliticalLayerContext,
} from "./political_layers.ts";
import {
  FIEF_LABEL_COLOR,
  type LabelDatum,
  POWER_LABEL_SIZE_PX,
} from "./labels.ts";
import { LABEL_LAYER_ID, underWaterBeforeId } from "./layer_stack.ts";
import { HRE_LAYER_ID, POWER_LAYER_ID } from "./picking.ts";
import { LINE_COLOR, LINE_WIDTH_PX, type Rgba } from "./powers.ts";
import { powerFillColor, powerLabelColor } from "./power_highlight.ts";
import { EMPTY_SUZERAIN_OVERRIDES } from "./suzerain_extent.ts";
import { EMPTY_FIEF_DEDUPE_TABLE } from "./fief_dedupe.ts";

// ---- fixtures ----

/** 正方形ポリゴンの Feature を組み立てる */
function polygonFeature(
  properties: Record<string, string>,
  origin: [number, number],
): Feature {
  const [x, y] = origin;
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Polygon",
      coordinates: [[[x, y], [x + 2, y], [x + 2, y + 2], [x, y + 2], [x, y]]],
    },
  };
}

/** base: 独立勢力 2 + France を宗主とする封臣 1（外枠 union の入力になる） */
const baseFc: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    polygonFeature({ NAME: "France" }, [0, 45]),
    polygonFeature({ NAME: "Normandy", SUBJECTO: "France" }, [2, 45]),
    polygonFeature({ NAME: "England" }, [-4, 50]),
  ],
};

/** HRE 領邦 1 件（kind=hre のラベルになり、ズーム段の出し分け対象） */
const hreFc: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    polygonFeature(
      { NAME: "Bavaria", SUBJECTO: "Holy Roman Empire" },
      [10, 47],
    ),
  ],
};

const emptyFc: FeatureCollection = { type: "FeatureCollection", features: [] };

const colors: Record<string, string> = { France: "#aabbcc" };
const nameJa: Record<string, string> = { France: "フランス" };

/** beforeId は deck.gl の型定義に現れないため、読み出しだけ型を緩める */
function beforeIdOf(layer: { props: unknown }): string | undefined {
  return (layer.props as { beforeId?: string }).beforeId;
}

/** 全フィールドを埋めた context。テストごとに必要な部分だけ上書きする */
function ctx(
  overrides: Partial<PoliticalLayerContext> = {},
): PoliticalLayerContext {
  return {
    year: 1000,
    colors,
    nameJa,
    overrides: EMPTY_SUZERAIN_OVERRIDES,
    fiefDedupe: EMPTY_FIEF_DEDUPE_TABLE,
    zoomStep: 4,
    extentKey: null,
    selectedPowerKey: null,
    hoveredPowerKey: null,
    fillTransitionMs: 400,
    styleLayerIds: [],
    ...overrides,
  };
}

// ---- 見た目定数（main.ts 時代の値の固定）----

Deno.test("勢力圏外枠・諸侯領境界線の見た目定数は main.ts 時代の値と一致する", () => {
  assertEquals(HRE_EXTENT_LAYER_ID, "hre-extent");
  assertEquals(HRE_EXTENT_LINE_COLOR, [140, 30, 30, 255]);
  assertEquals(HRE_EXTENT_FILL_COLOR, [140, 30, 30, 30]);
  assertEquals(HRE_EXTENT_LINE_WIDTH_PX, 3);
  // 諸侯領境界線はラベル文字色（FIEF_LABEL_COLOR）と同系の藍紫 + alpha 220
  assertEquals(FIEF_LINE_COLOR, [
    FIEF_LABEL_COLOR[0],
    FIEF_LABEL_COLOR[1],
    FIEF_LABEL_COLOR[2],
    220,
  ]);
  assertEquals(FIEF_LINE_WIDTH_PX, 1.5);
});

// ---- buildPowerLayer ----

Deno.test("buildPowerLayer は id・pickable・境界線既定値・opacity を保つ", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildPowerLayer(ctx(), POWER_LAYER_ID, baseFc);
  assertEquals(layer.id, POWER_LAYER_ID);
  assertStrictEquals(layer.props.data, baseFc);
  assert(layer.props.pickable);
  assert(layer.props.stroked);
  assert(layer.props.filled);
  assertEquals(layer.props.opacity, 1);
  assertEquals(layer.props.getLineColor, LINE_COLOR);
  assertEquals(layer.props.getLineWidth, LINE_WIDTH_PX);
  assertEquals(layer.props.lineWidthUnits, "pixels");
});

Deno.test("buildPowerLayer は lineColor/lineWidth/stroked の上書きを反映する", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildPowerLayer(
    ctx(),
    HRE_LAYER_ID,
    hreFc,
    FIEF_LINE_COLOR,
    FIEF_LINE_WIDTH_PX,
    false,
  );
  assertEquals(layer.props.stroked, false);
  assertEquals(layer.props.getLineColor, FIEF_LINE_COLOR);
  assertEquals(layer.props.getLineWidth, FIEF_LINE_WIDTH_PX);
});

Deno.test("buildPowerLayer の beforeId は styleLayerIds から underWaterBeforeId で決まる", () => {
  const f = createPoliticalLayerBuilders();
  const withWater = f.buildPowerLayer(
    ctx({ styleLayerIds: ["landcover", "water", "waterway"] }),
    POWER_LAYER_ID,
    baseFc,
  );
  assertEquals(
    beforeIdOf(withWater),
    underWaterBeforeId(POWER_LAYER_ID, ["landcover", "water", "waterway"]),
  );
  assertEquals(beforeIdOf(withWater), "water");
  // スタイル未読込（空配列）では beforeId なし = 従来描画順
  const withoutStyle = f.buildPowerLayer(ctx(), POWER_LAYER_ID, baseFc);
  assertEquals(beforeIdOf(withoutStyle), undefined);
});

Deno.test("buildPowerLayer の塗り遷移時間は context の fillTransitionMs を使う", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildPowerLayer(
    ctx({ fillTransitionMs: 120 }),
    POWER_LAYER_ID,
    baseFc,
  );
  const transitions = layer.props.transitions as {
    getFillColor: { duration: number };
  };
  assertEquals(transitions.getFillColor.duration, 120);
});

Deno.test("buildPowerLayer の塗りは強調キーを反映し updateTriggers にも載る", () => {
  const f = createPoliticalLayerBuilders();
  const c = ctx({ hoveredPowerKey: "France" });
  const layer = f.buildPowerLayer(c, POWER_LAYER_ID, baseFc);
  const getFillColor = layer.props.getFillColor as (f: Feature) => Rgba;
  const [france, , england] = baseFc.features;
  assertEquals(
    getFillColor(france),
    powerFillColor(france.properties, colors, null, "France"),
  );
  assertEquals(
    getFillColor(england),
    powerFillColor(england.properties, colors, null, null),
  );
  // 強調キーは accessor の入力なので trigger に載る（main.ts 時代の契約）
  const triggers = layer.props.updateTriggers as Record<string, unknown>;
  assertEquals(triggers.getFillColor, [1000, null, "France"]);
});

// ---- buildSuzerainExtentLayer ----

Deno.test("勢力圏の外枠は extentKey が null なら非表示・空データ", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildSuzerainExtentLayer(ctx(), baseFc);
  assertEquals(layer.id, HRE_EXTENT_LAYER_ID);
  assertEquals(layer.props.visible, false);
  assertEquals(layer.props.pickable, false);
  assertEquals((layer.props.data as FeatureCollection).features.length, 0);
});

Deno.test("勢力圏の外枠は extentKey の宗主 + 封臣を union して表示する", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildSuzerainExtentLayer(
    ctx({ extentKey: "France" }),
    baseFc,
  );
  assertEquals(layer.props.visible, true);
  // France 本体 + Normandy（SUBJECTO=France）が 1 枚に融合される
  assertEquals((layer.props.data as FeatureCollection).features.length, 1);
  assertEquals(layer.props.getLineColor, HRE_EXTENT_LINE_COLOR);
  assertEquals(layer.props.getFillColor, HRE_EXTENT_FILL_COLOR);
  assertEquals(layer.props.getLineWidth, HRE_EXTENT_LINE_WIDTH_PX);
});

Deno.test("同一 extentKey の再構築では union が再計算されない（キャッシュ）", () => {
  const f = createPoliticalLayerBuilders();
  const first = f.buildSuzerainExtentLayer(
    ctx({ extentKey: "France" }),
    baseFc,
  );
  const second = f.buildSuzerainExtentLayer(
    ctx({ extentKey: "France" }),
    baseFc,
  );
  assertStrictEquals(second.props.data, first.props.data);
});

// ---- buildLabelLayer ----

Deno.test("勢力ラベル層は id・pickable・サイズが main.ts 時代の契約と一致する", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildLabelLayer(
    ctx(),
    baseFc,
    hreFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
  );
  assertEquals(layer.id, LABEL_LAYER_ID);
  assertEquals(layer.props.pickable, false);
  assertEquals(layer.props.getSize, POWER_LABEL_SIZE_PX);
});

Deno.test("勢力ラベルの文字色は強調キーを反映し updateTriggers にも載る", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildLabelLayer(
    ctx({ selectedPowerKey: "France" }),
    baseFc,
    hreFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
  );
  const getColor = layer.props.getColor as unknown as (
    d: Pick<LabelDatum, "kind" | "key">,
  ) => number[];
  const datum: Pick<LabelDatum, "kind" | "key"> = {
    kind: "base",
    key: "France",
  };
  assertEquals(getColor(datum), [...powerLabelColor(datum, "France", null)]);
  const triggers = layer.props.updateTriggers as Record<string, unknown>;
  assertEquals(triggers.getColor, ["France", null]);
  assertEquals(triggers.getText, [1000, 4]);
  assertEquals(triggers.getPosition, [1000, 4]);
});

Deno.test("強調キーだけの再構築では勢力ラベルの data・characterSet が再計算されない", () => {
  const f = createPoliticalLayerBuilders();
  const build = (c: PoliticalLayerContext) =>
    f.buildLabelLayer(
      c,
      baseFc,
      hreFc,
      emptyFc,
      emptyFc,
      emptyFc,
      emptyFc,
      emptyFc,
    );
  const first = build(ctx());
  const second = build(ctx({ hoveredPowerKey: "France" }));
  // data 参照が同一 = polylabel（buildLabelData）が走らない（TASK-50 非退行）
  assertStrictEquals(second.props.data, first.props.data);
  // characterSet 参照が同一 = フォントアトラスが作り直されない
  assertStrictEquals(second.props.characterSet, first.props.characterSet);
});

Deno.test("ズーム段が変わっても characterSet は全 datum 由来の同一参照を保つ", () => {
  const f = createPoliticalLayerBuilders();
  const build = (c: PoliticalLayerContext) =>
    f.buildLabelLayer(
      c,
      baseFc,
      hreFc,
      emptyFc,
      emptyFc,
      emptyFc,
      emptyFc,
      emptyFc,
    );
  const z4 = build(ctx({ zoomStep: 4 }));
  const z5 = build(ctx({ zoomStep: 5 }));
  // TASK-122 AC #7: characterSet はズーム絞り込み前の全 datum から作る
  assertStrictEquals(z5.props.characterSet, z4.props.characterSet);
  // 表示対象はズーム段で変わる（z4 は base のみ・z5 は領邦ラベルも出る）
  assertNotStrictEquals(z5.props.data, z4.props.data);
  const kinds = (layer: { props: { data: unknown } }) =>
    (layer.props.data as { kind?: string }[]).map((d) => d.kind);
  assert(!kinds(z4).includes("hre"));
  assert(kinds(z5).includes("hre"));
});

// ---- キャッシュ共有（debug_hooks.ts へ注入するインスタンスとの契約）----

Deno.test("公開メモ化インスタンスは builder と同一キャッシュを共有する", () => {
  const f = createPoliticalLayerBuilders();
  const layer = f.buildLabelLayer(
    ctx(),
    baseFc,
    hreFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
  );
  // builder 実行でキャッシュが埋まり、同じ引数の直接呼び出しは同一参照を返す
  // （別インスタンスなら初回計算で新しいオブジェクトが返り、この assert は落ちる）
  const memoized = f.memoizedPowerLabelData(
    1000,
    baseFc,
    hreFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
    nameJa,
    EMPTY_FIEF_DEDUPE_TABLE,
  );
  assertStrictEquals(memoized.characterSet, layer.props.characterSet);
  assertStrictEquals(
    f.memoizedVisiblePowerLabels(memoized.data, 4),
    layer.props.data,
  );
});

Deno.test("factory ごとにキャッシュは独立している", () => {
  const f1 = createPoliticalLayerBuilders();
  const f2 = createPoliticalLayerBuilders();
  const args = [
    1000,
    baseFc,
    hreFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
    emptyFc,
    nameJa,
    EMPTY_FIEF_DEDUPE_TABLE,
  ] as const;
  const r1 = f1.memoizedPowerLabelData(...args);
  const r2 = f2.memoizedPowerLabelData(...args);
  assertNotStrictEquals(r1, r2);
  // それぞれのキャッシュは自分の直近結果を返し続ける
  assertStrictEquals(f1.memoizedPowerLabelData(...args), r1);
  assertStrictEquals(f2.memoizedPowerLabelData(...args), r2);
});

Deno.test("被覆率表による base ラベル抑制はズーム段で解除される（配線契約）", () => {
  const f = createPoliticalLayerBuilders();
  const dedupe = { years: { "1000": { England: 1 } } };
  const build = (zoomStep: number) =>
    f.buildLabelLayer(
      ctx({ zoomStep, fiefDedupe: dedupe }),
      baseFc,
      hreFc,
      emptyFc,
      emptyFc,
      emptyFc,
      emptyFc,
      emptyFc,
    );
  const texts = (layer: { props: { data: unknown } }) =>
    (layer.props.data as { text: string }[]).map((d) => d.text);
  // 諸侯領ラベルを出す段（z5）では被覆された base ラベルが抑制される
  assert(!texts(build(5)).includes("England"));
  // 諸侯領ラベルの無い段（z4）では抑制を解除して base ラベルを出す（TASK-122）
  assert(texts(build(4)).includes("England"));
});
