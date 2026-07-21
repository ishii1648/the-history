import { assert, assertEquals } from "@std/assert";
import {
  CITY_LAYER_ID,
  HRE_LAYER_ID,
  layerOrderMatchesPickingPriority,
  PICKING_PRIORITY,
  POWER_LAYER_ID,
  renderOrderFromPickingPriority,
  RIVERS_LAYER_ID,
  selectPreferredPick,
} from "./picking.ts";

// ---- PICKING_PRIORITY ----

Deno.test("PICKING_PRIORITY: 河川 > 都市 > HRE 領邦 > 勢力 の順で並ぶ", () => {
  assertEquals(
    [...PICKING_PRIORITY],
    [RIVERS_LAYER_ID, CITY_LAYER_ID, HRE_LAYER_ID, POWER_LAYER_ID],
  );
});

// ---- selectPreferredPick ----

/** テスト用の picking 候補を組み立てる */
function pick(
  layerId: string,
  label: string,
): { layerId: string; label: string } {
  return { layerId, label };
}

Deno.test("selectPreferredPick: 河川と勢力が重なる場合は河川を選ぶ（AC #2）", () => {
  const rhine = pick(RIVERS_LAYER_ID, "ライン川");
  const france = pick(POWER_LAYER_ID, "フランス王国");
  assertEquals(selectPreferredPick([france, rhine]), rhine);
  assertEquals(selectPreferredPick([rhine, france]), rhine);
});

Deno.test("selectPreferredPick: 河川 > 都市 > HRE > 勢力 の全順位で最優先を選ぶ", () => {
  const river = pick(RIVERS_LAYER_ID, "ドナウ川");
  const city = pick(CITY_LAYER_ID, "ウィーン");
  const hre = pick(HRE_LAYER_ID, "オーストリア大公国");
  const power = pick(POWER_LAYER_ID, "神聖ローマ帝国");
  assertEquals(selectPreferredPick([power, hre, city, river]), river);
  assertEquals(selectPreferredPick([power, hre, city]), city);
  assertEquals(selectPreferredPick([power, hre]), hre);
  assertEquals(selectPreferredPick([power]), power);
});

Deno.test("selectPreferredPick: 候補ゼロなら null を返す", () => {
  assertEquals(selectPreferredPick([]), null);
});

Deno.test("selectPreferredPick: 優先リスト外のレイヤーは最後に回される", () => {
  const unknown = pick("power-labels", "ラベル");
  const power = pick(POWER_LAYER_ID, "フランス王国");
  assertEquals(selectPreferredPick([unknown, power]), power);
  // 優先リスト外しか無ければそれを返す（候補があるのに null にはしない）
  assertEquals(selectPreferredPick([unknown]), unknown);
});

Deno.test("selectPreferredPick: 同順位の候補は先勝ち（安定）", () => {
  const first = pick(RIVERS_LAYER_ID, "ライン川");
  const second = pick(RIVERS_LAYER_ID, "ドナウ川");
  assertEquals(selectPreferredPick([first, second]), first);
});

// ---- renderOrderFromPickingPriority ----

Deno.test("renderOrderFromPickingPriority: 描画順（下→上）は優先順の逆順になる", () => {
  assertEquals(
    renderOrderFromPickingPriority(PICKING_PRIORITY),
    [POWER_LAYER_ID, HRE_LAYER_ID, CITY_LAYER_ID, RIVERS_LAYER_ID],
  );
});

Deno.test("renderOrderFromPickingPriority: 入力配列を破壊しない", () => {
  const priority = [RIVERS_LAYER_ID, POWER_LAYER_ID] as const;
  const before = [...priority];
  renderOrderFromPickingPriority(priority);
  assertEquals([...priority], before);
});

// ---- layerOrderMatchesPickingPriority ----

Deno.test("layerOrderMatchesPickingPriority: 優先逆順（下→上）の並びは整合する", () => {
  assert(
    layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
});

Deno.test("layerOrderMatchesPickingPriority: ラベル等の優先外レイヤーが混ざっても整合する", () => {
  assert(
    layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
      "power-labels",
      "river-labels",
      "city-labels",
    ]),
  );
});

Deno.test("layerOrderMatchesPickingPriority: rivers が cities より下だと整合しない", () => {
  assert(
    !layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      RIVERS_LAYER_ID,
      CITY_LAYER_ID,
    ]),
  );
});

Deno.test("layerOrderMatchesPickingPriority: pickable レイヤーの重複は整合しない", () => {
  assert(
    !layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      RIVERS_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
});

Deno.test("layerOrderMatchesPickingPriority: 一部レイヤーが無くても残りの相対順で判定する", () => {
  // cities が無い構成でも rivers が powers より上なら整合
  assert(layerOrderMatchesPickingPriority([POWER_LAYER_ID, RIVERS_LAYER_ID]));
  assert(!layerOrderMatchesPickingPriority([RIVERS_LAYER_ID, POWER_LAYER_ID]));
});
