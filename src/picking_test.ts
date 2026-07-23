import { assert, assertEquals } from "@std/assert";
import {
  CITY_LAYER_ID,
  HRE_LAYER_ID,
  isRiversPickLayerId,
  layerOrderMatchesPickingPriority,
  PICKING_PRIORITY,
  POWER_LAYER_ID,
  renderOrderFromPickingPriority,
  resolveClickPick,
  RIVERS_HIT_LAYER_ID,
  RIVERS_LAYER_ID,
  selectPreferredPick,
} from "./picking.ts";

// ---- PICKING_PRIORITY ----

Deno.test("PICKING_PRIORITY: 河川ヒット層 > 河川 > 都市 > HRE 領邦 > 勢力 の順で並ぶ（TASK-43）", () => {
  assertEquals(
    [...PICKING_PRIORITY],
    [
      RIVERS_HIT_LAYER_ID,
      RIVERS_LAYER_ID,
      CITY_LAYER_ID,
      HRE_LAYER_ID,
      POWER_LAYER_ID,
    ],
  );
});

Deno.test("PICKING_PRIORITY: rivers-hit は rivers と同格以上（rivers より前か同順位）（TASK-43）", () => {
  const hitIndex = PICKING_PRIORITY.indexOf(RIVERS_HIT_LAYER_ID);
  const riverIndex = PICKING_PRIORITY.indexOf(RIVERS_LAYER_ID);
  assert(hitIndex !== -1);
  assert(riverIndex !== -1);
  assert(hitIndex <= riverIndex);
});

// ---- isRiversPickLayerId ----

Deno.test("isRiversPickLayerId: rivers / rivers-hit の両方で true（TASK-43）", () => {
  assert(isRiversPickLayerId(RIVERS_LAYER_ID));
  assert(isRiversPickLayerId(RIVERS_HIT_LAYER_ID));
});

Deno.test("isRiversPickLayerId: rivers 系以外は false（TASK-43）", () => {
  assert(!isRiversPickLayerId(POWER_LAYER_ID));
  assert(!isRiversPickLayerId(CITY_LAYER_ID));
  assert(!isRiversPickLayerId(HRE_LAYER_ID));
  assert(!isRiversPickLayerId(undefined));
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

// ---- resolveClickPick ----

/** テスト用の pickMultipleObjects 相当の候補（PickingInfo の layer 部分のみ模す） */
function pickInfo(
  layerId: string | null,
  label: string,
): { layer: { id: string } | null; label: string } {
  return { layer: layerId === null ? null : { id: layerId }, label };
}

Deno.test("resolveClickPick: 候補ゼロなら null を返す（TASK-36）", () => {
  assertEquals(resolveClickPick([]), null);
});

Deno.test("resolveClickPick: rivers が候補に含まれれば先頭でなくても rivers を選ぶ（TASK-36 AC）", () => {
  const power = pickInfo(POWER_LAYER_ID, "フランス王国");
  const river = pickInfo(RIVERS_LAYER_ID, "ライン川");
  // pickMultipleObjects はカーソル直下（powers）を先頭で返す想定
  assertEquals(resolveClickPick([power, river]), river);
});

Deno.test("resolveClickPick: rivers-hit の候補も rivers 同様に最優先で選ばれる（TASK-43）", () => {
  const power = pickInfo(POWER_LAYER_ID, "フランス王国");
  const hit = pickInfo(RIVERS_HIT_LAYER_ID, "ライン川");
  assertEquals(resolveClickPick([power, hit]), hit);
  assertEquals(resolveClickPick([hit, power]), hit);
});

Deno.test("resolveClickPick: rivers-hit と rivers が同時に候補でも river 系が勝つ（勢力より優先）（TASK-43）", () => {
  const power = pickInfo(POWER_LAYER_ID, "フランス王国");
  const hit = pickInfo(RIVERS_HIT_LAYER_ID, "ライン川");
  const river = pickInfo(RIVERS_LAYER_ID, "ライン川");
  const best = resolveClickPick([power, hit, river]);
  assert(best === hit || best === river);
});

Deno.test("resolveClickPick: rivers が候補に無ければ既存挙動（PICKING_PRIORITY の最優先）を返す", () => {
  const power = pickInfo(POWER_LAYER_ID, "フランス王国");
  const hre = pickInfo(HRE_LAYER_ID, "オーストリア大公国");
  // hre が power より高優先のため、入力順によらず hre を返す
  assertEquals(resolveClickPick([power, hre]), hre);
  assertEquals(resolveClickPick([hre, power]), hre);
});

Deno.test("resolveClickPick: rivers も混在候補も無い単一候補ならそれを返す（先頭 = 直下の最前面）", () => {
  const power = pickInfo(POWER_LAYER_ID, "フランス王国");
  assertEquals(resolveClickPick([power]), power);
});

Deno.test("resolveClickPick: 都市 > HRE > 勢力 の優先順も rivers 同様に成立する", () => {
  const power = pickInfo(POWER_LAYER_ID, "神聖ローマ帝国");
  const city = pickInfo(CITY_LAYER_ID, "ウィーン");
  assertEquals(resolveClickPick([power, city]), city);
});

Deno.test("resolveClickPick: layer が null（何も無い場所）のみなら先頭候補をそのまま返す", () => {
  const blank = pickInfo(null, "");
  assertEquals(resolveClickPick([blank]), blank);
});

// ---- renderOrderFromPickingPriority ----

Deno.test("renderOrderFromPickingPriority: 描画順（下→上）は優先順の逆順になる", () => {
  assertEquals(
    renderOrderFromPickingPriority(PICKING_PRIORITY),
    [
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
    ],
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

Deno.test("layerOrderMatchesPickingPriority: rivers-hit は rivers より上（最前面）でないと整合しない（TASK-43）", () => {
  assert(
    layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
    ]),
  );
  assert(
    !layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
});
