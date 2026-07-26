import { assert, assertEquals } from "@std/assert";
import {
  CITY_HIT_LAYER_ID,
  CITY_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
  isCityPickLayerId,
  isDirectPickFinal,
  isNearCursorRepickable,
  isRiversPickLayerId,
  ITALY_FIEF_LAYER_ID,
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

Deno.test("PICKING_PRIORITY: 河川 > 都市 > 都市ヒット層 > 河川ヒット層 > HRE 領邦 > 仏諸侯領 > 伊諸侯領 > 勢力 の順で並ぶ（TASK-49, TASK-71, TASK-82, TASK-96）", () => {
  assertEquals(
    [...PICKING_PRIORITY],
    [
      RIVERS_LAYER_ID,
      CITY_LAYER_ID,
      CITY_HIT_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      HRE_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      ITALY_FIEF_LAYER_ID,
      POWER_LAYER_ID,
    ],
  );
});

Deno.test("PICKING_PRIORITY: italy-fiefs は powers より優先される（オーバーレイがベースの上）（TASK-96 AC #3）", () => {
  const italyIndex = PICKING_PRIORITY.indexOf(ITALY_FIEF_LAYER_ID);
  const powerIndex = PICKING_PRIORITY.indexOf(POWER_LAYER_ID);
  assert(italyIndex !== -1);
  assert(italyIndex < powerIndex);
});

Deno.test("PICKING_PRIORITY: 3 系統のオーバーレイ（HRE 領邦・仏諸侯領・伊諸侯領）は既存の相対順を保ったまま powers の上に並ぶ（TASK-96）", () => {
  const overlays = [HRE_LAYER_ID, FRANCE_FIEF_LAYER_ID, ITALY_FIEF_LAYER_ID];
  const indices = overlays.map((id) => PICKING_PRIORITY.indexOf(id));
  // 既存 2 層の相対順（hre-powers > france-fiefs）は TASK-71 のまま変えない
  assert(indices[0] < indices[1]);
  // 追加した伊諸侯領は既存 2 層の下・powers の上（既存の順序に影響しない位置）
  assert(indices[1] < indices[2]);
  assert(indices[2] < PICKING_PRIORITY.indexOf(POWER_LAYER_ID));
});

Deno.test("renderOrderFromPickingPriority: italy-fiefs は powers の上・france-fiefs の下に描画される（TASK-96）", () => {
  const order = renderOrderFromPickingPriority(PICKING_PRIORITY);
  assert(order.indexOf(POWER_LAYER_ID) < order.indexOf(ITALY_FIEF_LAYER_ID));
  assert(
    order.indexOf(ITALY_FIEF_LAYER_ID) < order.indexOf(FRANCE_FIEF_LAYER_ID),
  );
});

Deno.test("layerOrderMatchesPickingPriority: 3 系統のオーバーレイを含む実際の描画順が整合する（TASK-96 AC #6）", () => {
  assert(
    layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      ITALY_FIEF_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      HRE_LAYER_ID,
      // hre-extent（pickable: false）は優先リスト外なので無視される
      "hre-extent",
      RIVERS_HIT_LAYER_ID,
      CITY_HIT_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
      "power-labels",
    ]),
  );
  // 伊諸侯領を仏諸侯領の上へ入れ替えると不整合として検出される
  assert(
    !layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      ITALY_FIEF_LAYER_ID,
      HRE_LAYER_ID,
    ]),
  );
});

Deno.test("PICKING_PRIORITY: cities-hit は可視の河川ライン（rivers）と都市ドット（cities）には劣後する（TASK-82 AC #3）", () => {
  const hit = PICKING_PRIORITY.indexOf(CITY_HIT_LAYER_ID);
  assert(hit !== -1);
  assert(PICKING_PRIORITY.indexOf(RIVERS_LAYER_ID) < hit);
  assert(PICKING_PRIORITY.indexOf(CITY_LAYER_ID) < hit);
});

Deno.test("PICKING_PRIORITY: cities-hit は rivers-hit より優先される（都市の判定円が河川の判定帯に遮蔽されない）（TASK-82 AC #1）", () => {
  assert(
    PICKING_PRIORITY.indexOf(CITY_HIT_LAYER_ID) <
      PICKING_PRIORITY.indexOf(RIVERS_HIT_LAYER_ID),
  );
});

Deno.test("PICKING_PRIORITY: france-fiefs は powers より優先される（オーバーレイがベースの上）（TASK-71）", () => {
  const fiefIndex = PICKING_PRIORITY.indexOf(FRANCE_FIEF_LAYER_ID);
  const powerIndex = PICKING_PRIORITY.indexOf(POWER_LAYER_ID);
  assert(fiefIndex !== -1);
  assert(powerIndex !== -1);
  assert(fiefIndex < powerIndex);
});

Deno.test("renderOrderFromPickingPriority: france-fiefs は powers の上・cities の下に描画される（TASK-71）", () => {
  const order = renderOrderFromPickingPriority(PICKING_PRIORITY);
  assert(order.indexOf(POWER_LAYER_ID) < order.indexOf(FRANCE_FIEF_LAYER_ID));
  assert(order.indexOf(FRANCE_FIEF_LAYER_ID) < order.indexOf(CITY_LAYER_ID));
});

Deno.test("isDirectPickFinal: france-fiefs は直下 pick 確定にしない（河川の近傍再ピックを妨げない）（TASK-71）", () => {
  assert(!isDirectPickFinal(FRANCE_FIEF_LAYER_ID));
});

Deno.test("PICKING_PRIORITY: rivers-hit は rivers より劣後する（rivers より後）（TASK-49）", () => {
  const hitIndex = PICKING_PRIORITY.indexOf(RIVERS_HIT_LAYER_ID);
  const riverIndex = PICKING_PRIORITY.indexOf(RIVERS_LAYER_ID);
  assert(hitIndex !== -1);
  assert(riverIndex !== -1);
  assert(riverIndex < hitIndex);
});

Deno.test("PICKING_PRIORITY: cities は rivers-hit より優先される（河畔都市マーカーの picking 遮蔽を防ぐ）（TASK-49）", () => {
  const cityIndex = PICKING_PRIORITY.indexOf(CITY_LAYER_ID);
  const hitIndex = PICKING_PRIORITY.indexOf(RIVERS_HIT_LAYER_ID);
  assert(cityIndex !== -1);
  assert(hitIndex !== -1);
  assert(cityIndex < hitIndex);
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

// ---- isCityPickLayerId / isNearCursorRepickable（TASK-82）----

Deno.test("isCityPickLayerId: cities / cities-hit の両方で true（TASK-82）", () => {
  assert(isCityPickLayerId(CITY_LAYER_ID));
  assert(isCityPickLayerId(CITY_HIT_LAYER_ID));
});

Deno.test("isCityPickLayerId: 都市系以外は false（TASK-82）", () => {
  assert(!isCityPickLayerId(RIVERS_LAYER_ID));
  assert(!isCityPickLayerId(RIVERS_HIT_LAYER_ID));
  assert(!isCityPickLayerId(POWER_LAYER_ID));
  assert(!isCityPickLayerId(undefined));
});

Deno.test("isNearCursorRepickable: cities-hit だけがクリックの近傍再ピック対象外（ホバーと実効判定範囲を一致させる）（TASK-82 AC #2）", () => {
  assert(!isNearCursorRepickable(CITY_HIT_LAYER_ID));
  assert(isNearCursorRepickable(CITY_LAYER_ID));
  assert(isNearCursorRepickable(RIVERS_LAYER_ID));
  assert(isNearCursorRepickable(RIVERS_HIT_LAYER_ID));
  assert(isNearCursorRepickable(POWER_LAYER_ID));
  assert(isNearCursorRepickable(undefined));
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

Deno.test("resolveClickPick: rivers-hit と cities が同時に候補なら cities を選ぶ（河畔都市マーカーの picking 遮蔽を解消）（TASK-49）", () => {
  const hit = pickInfo(RIVERS_HIT_LAYER_ID, "セーヌ川");
  const city = pickInfo(CITY_LAYER_ID, "パリ");
  assertEquals(resolveClickPick([hit, city]), city);
  assertEquals(resolveClickPick([city, hit]), city);
});

Deno.test("resolveClickPick: rivers と cities が同時に候補なら従来どおり rivers を選ぶ（decision-7 維持）（TASK-49）", () => {
  const river = pickInfo(RIVERS_LAYER_ID, "セーヌ川");
  const city = pickInfo(CITY_LAYER_ID, "パリ");
  assertEquals(resolveClickPick([river, city]), river);
  assertEquals(resolveClickPick([city, river]), river);
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

Deno.test("resolveClickPick: cities-hit は近傍再ピックの候補から除外され、他候補が選ばれる（TASK-82 AC #2）", () => {
  const cityHit = pickInfo(CITY_HIT_LAYER_ID, "パリ");
  const power = pickInfo(POWER_LAYER_ID, "フランス王国");
  // 直下が powers で、半径 6px 内にだけ都市の判定円がある状況。ホバーでは
  // 都市を拾えない位置なので、クリックでも拾わない（範囲を一致させる）
  assertEquals(resolveClickPick([power, cityHit]), power);
  assertEquals(resolveClickPick([cityHit, power]), power);
});

Deno.test("resolveClickPick: 候補が cities-hit だけなら null（直下 pick の結果へフォールバック）（TASK-82 AC #2）", () => {
  const cityHit = pickInfo(CITY_HIT_LAYER_ID, "パリ");
  assertEquals(resolveClickPick([cityHit]), null);
});

Deno.test("resolveClickPick: cities-hit を除外しても cities（ドット）は従来どおり選ばれる（TASK-82）", () => {
  const cityHit = pickInfo(CITY_HIT_LAYER_ID, "ルーアン");
  const city = pickInfo(CITY_LAYER_ID, "パリ");
  const power = pickInfo(POWER_LAYER_ID, "フランス王国");
  assertEquals(resolveClickPick([power, cityHit, city]), city);
});

Deno.test("isDirectPickFinal: rivers/rivers-hit/cities/cities-hit の直下ヒットは radius 再ピックで上書きしない（TASK-49, TASK-82）", () => {
  assert(isDirectPickFinal(RIVERS_LAYER_ID));
  assert(isDirectPickFinal(RIVERS_HIT_LAYER_ID));
  // 都市ドットの直下ヒットを近傍河川の radius 再ピックで奪ってはいけない
  assert(isDirectPickFinal(CITY_LAYER_ID));
  // 都市の判定円（cities-hit）も同様。ここを確定にしないと、直下で都市を
  // 拾えているのに近傍再ピックの rivers（PICKING_PRIORITY 上位）に奪われる
  assert(isDirectPickFinal(CITY_HIT_LAYER_ID));
  assert(!isDirectPickFinal(POWER_LAYER_ID));
  assert(!isDirectPickFinal(HRE_LAYER_ID));
  assert(!isDirectPickFinal(undefined));
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
      ITALY_FIEF_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      HRE_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      CITY_HIT_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
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

Deno.test("layerOrderMatchesPickingPriority: cities-hit は rivers-hit の上・cities の下でないと整合しない（TASK-82 AC #5）", () => {
  assert(
    layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      CITY_HIT_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
  // cities より上（= cities より優先）に置くと不整合
  assert(
    !layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      CITY_LAYER_ID,
      CITY_HIT_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
  // rivers-hit より下（= rivers-hit に遮蔽される）に置くと不整合
  assert(
    !layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      CITY_HIT_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
});

Deno.test("layerOrderMatchesPickingPriority: rivers-hit は cities より下・rivers より下でないと整合しない（TASK-49）", () => {
  assert(
    layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
  assert(
    !layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      HRE_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
    ]),
  );
});
