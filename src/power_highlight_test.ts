import { assert, assertEquals, assertFalse } from "@std/assert";
import {
  ACTIVE_FILL_COLOR,
  createPowerHighlightStore,
  HIGHLIGHT_FILL_TRANSITION_MS,
  isPowerActive,
  POWER_HIGHLIGHT_LAYER_IDS,
  powerFillColor,
  powerHighlightKey,
  togglePowerSelection,
  YEAR_FILL_TRANSITION_MS,
} from "./power_highlight.ts";
import { FILL_ALPHA, hexToRgb } from "./powers.ts";
import {
  BRITAIN_FIEF_LAYER_ID,
  CITY_LAYER_ID,
  CLIOPATRIA_FIEF_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
  ITALY_FIEF_LAYER_ID,
  POWER_LAYER_ID,
  RIVERS_HIT_LAYER_ID,
  RIVERS_LAYER_ID,
  SOVEREIGN_FIEF_LAYER_ID,
} from "./picking.ts";

const colors: Record<string, string> = {
  "France": "#3366cc",
  "Holy Roman Empire": "#cc6633",
  "Bavaria|Holy Roman Empire": "#66aa33",
  "Normandy": "#aa3366",
};

// ---- 強調キー（適用単位。AC #1/#4）----

Deno.test("powerHighlightKey: 政治ポリゴン 3 層は colorKeyFor と同一のキーを返す", () => {
  assertEquals(powerHighlightKey(POWER_LAYER_ID, { NAME: "France" }), "France");
  assertEquals(
    powerHighlightKey(HRE_LAYER_ID, {
      NAME: "Bavaria",
      SUBJECTO: "Holy Roman Empire",
    }),
    "Bavaria|Holy Roman Empire",
  );
  assertEquals(
    powerHighlightKey(FRANCE_FIEF_LAYER_ID, { NAME: "Normandy" }),
    "Normandy",
  );
});

Deno.test("powerHighlightKey: 領邦は親勢力（宗主国）とは別キーになる", () => {
  const hre = powerHighlightKey(POWER_LAYER_ID, { NAME: "Holy Roman Empire" });
  const fief = powerHighlightKey(HRE_LAYER_ID, {
    NAME: "Bavaria",
    SUBJECTO: "Holy Roman Empire",
  });
  assertEquals(hre, "Holy Roman Empire");
  assert(fief !== hre);
});

Deno.test("powerHighlightKey: 河川・都市・picking なしは null（強調対象外）", () => {
  assertEquals(powerHighlightKey(RIVERS_LAYER_ID, { name: "Rhine" }), null);
  assertEquals(powerHighlightKey(RIVERS_HIT_LAYER_ID, { name: "Rhine" }), null);
  assertEquals(powerHighlightKey(CITY_LAYER_ID, undefined), null);
  assertEquals(powerHighlightKey(undefined, undefined), null);
});

Deno.test("powerHighlightKey: NAME を持たない feature は null", () => {
  assertEquals(powerHighlightKey(POWER_LAYER_ID, { NAME: null }), null);
  assertEquals(powerHighlightKey(POWER_LAYER_ID, {}), null);
});

Deno.test("POWER_HIGHLIGHT_LAYER_IDS: 強調対象は政治ポリゴンの 7 層のみ（TASK-96 で伊諸侯領・TASK-110 で Cliopatria 領邦・#172 でブリテン諸島・#189 で主権政体を追加）", () => {
  assertEquals(
    [...POWER_HIGHLIGHT_LAYER_IDS].sort(),
    [
      BRITAIN_FIEF_LAYER_ID,
      CLIOPATRIA_FIEF_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      HRE_LAYER_ID,
      ITALY_FIEF_LAYER_ID,
      POWER_LAYER_ID,
      SOVEREIGN_FIEF_LAYER_ID,
    ].sort(),
  );
});

Deno.test("powerHighlightKey: 主権政体も colorKeyFor と同一のキーで強調される（#189）", () => {
  // #189 の生成物は SUBJECTO を持たない（仏諸侯領と同型）ため、キーは
  // NAME 単独になる。NAME は base の呼称に合わせているため、base 側と
  // 同じ政体（Crimean Khanate 等）は年代を跨いで同じキーで強調される
  assertEquals(
    powerHighlightKey(SOVEREIGN_FIEF_LAYER_ID, { NAME: "Crimean Khanate" }),
    "Crimean Khanate",
  );
  assertEquals(powerHighlightKey(SOVEREIGN_FIEF_LAYER_ID, {}), null);
});

Deno.test("powerHighlightKey: ブリテン諸島の政体も colorKeyFor と同一のキーで強調される（#172）", () => {
  // TASK-151 の生成物は SUBJECTO を持たない（仏諸侯領と同型）ため、キーは
  // NAME 単独になる（独立主権政体として振る舞う）
  assertEquals(
    powerHighlightKey(BRITAIN_FIEF_LAYER_ID, { NAME: "Kingdom of Gwynedd" }),
    "Kingdom of Gwynedd",
  );
  assertEquals(powerHighlightKey(BRITAIN_FIEF_LAYER_ID, {}), null);
});

Deno.test("powerHighlightKey: Cliopatria 領邦も colorKeyFor と同一のキーで強調される（TASK-110）", () => {
  // Cliopatria の properties は既存 fief と同型（NAME / SUBJECTO / PARTOF）で、
  // SUBJECTO を持つものは HRE 領邦と同じ複合キーになる
  assertEquals(
    powerHighlightKey(CLIOPATRIA_FIEF_LAYER_ID, {
      NAME: "Duchy of Bavaria",
      SUBJECTO: "Holy Roman Empire",
    }),
    "Duchy of Bavaria|Holy Roman Empire",
  );
  assertEquals(
    powerHighlightKey(CLIOPATRIA_FIEF_LAYER_ID, { NAME: "County of Toulouse" }),
    "County of Toulouse",
  );
  assertEquals(powerHighlightKey(CLIOPATRIA_FIEF_LAYER_ID, {}), null);
});

Deno.test("powerHighlightKey: 伊諸侯領は NAME で強調され、親（base の教皇領・帝国）とは別キーになる（TASK-96 AC #3）", () => {
  assertEquals(
    powerHighlightKey(ITALY_FIEF_LAYER_ID, { NAME: "Republic of Florence" }),
    "Republic of Florence",
  );
  // 伊諸侯領は SUBJECTO を持たないため、base 側の帝国・教皇領とキーが衝突しない
  assertEquals(
    powerHighlightKey(ITALY_FIEF_LAYER_ID, { NAME: "Duchy of Spoleto" }),
    "Duchy of Spoleto",
  );
});

// ---- クリックの保持・解除規則（AC #3/#6）----

Deno.test("togglePowerSelection: 同一対象の再クリックで解除、別対象で移動", () => {
  assertEquals(togglePowerSelection(null, "France"), "France");
  assertEquals(togglePowerSelection("France", "France"), null);
  assertEquals(togglePowerSelection("France", "Normandy"), "Normandy");
});

Deno.test("togglePowerSelection: 強調対象でないクリック（null）は解除", () => {
  assertEquals(togglePowerSelection("France", null), null);
  assertEquals(togglePowerSelection(null, null), null);
});

// ---- アクティブ判定と塗り色（AC #1/#2）----

Deno.test("isPowerActive: 選択中・ホバー中のキーだけがアクティブ", () => {
  assert(isPowerActive("France", "France", null));
  assert(isPowerActive("France", null, "France"));
  assertFalse(isPowerActive("France", "Normandy", "Normandy"));
  assertFalse(isPowerActive("France", null, null));
});

Deno.test("isPowerActive: キー無し（null）は選択/ホバーが null でもアクティブにならない", () => {
  assertFalse(isPowerActive(null, null, null));
});

Deno.test("powerFillColor: ホバー中の勢力はアクティブ色、それ以外は通常色", () => {
  const props = { NAME: "France" };
  assertEquals(
    powerFillColor(props, colors, null, "France"),
    ACTIVE_FILL_COLOR,
  );
  const normal = powerFillColor(props, colors, null, null);
  const rgb = hexToRgb(colors["France"])!;
  assertEquals(normal, [rgb[0], rgb[1], rgb[2], FILL_ALPHA]);
});

Deno.test("powerFillColor: 同一勢力の飛び地（別 feature・同一キー）も同時にアクティブ", () => {
  const mainland = { NAME: "France" };
  const exclave = { NAME: "France" };
  assertEquals(
    powerFillColor(mainland, colors, "France", null),
    ACTIVE_FILL_COLOR,
  );
  assertEquals(
    powerFillColor(exclave, colors, "France", null),
    ACTIVE_FILL_COLOR,
  );
});

Deno.test("powerFillColor: 領邦の強調は親勢力の塗りへ波及しない", () => {
  const hreBody = { NAME: "Holy Roman Empire" };
  const bavaria = { NAME: "Bavaria", SUBJECTO: "Holy Roman Empire" };
  const selected = "Bavaria|Holy Roman Empire";
  assertEquals(
    powerFillColor(bavaria, colors, selected, null),
    ACTIVE_FILL_COLOR,
  );
  const body = powerFillColor(hreBody, colors, selected, null);
  assert(body[0] !== ACTIVE_FILL_COLOR[0] || body[3] !== ACTIVE_FILL_COLOR[3]);
});

Deno.test("powerFillColor: キーが引けない feature はアクティブ扱いにならない", () => {
  const anonymous = { NAME: null };
  assertEquals(
    powerFillColor(anonymous, colors, null, null),
    powerFillColor(anonymous, colors, "France", "Normandy"),
  );
});

// ---- 配色（AC #8）----

/** [r,g,b] の色相（度）。彩度 0（無彩色）は 0 を返す */
function hueDeg([r, g, b]: readonly number[]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  const h = max === r
    ? ((g - b) / d) % 6
    : max === g
    ? (b - r) / d + 2
    : (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** 円環上の色相差（0..180 度） */
function hueDistance(a: readonly number[], b: readonly number[]): number {
  const diff = Math.abs(hueDeg(a) - hueDeg(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

Deno.test("ACTIVE_FILL_COLOR: 通常塗りより不透明で、既存の強調色と色相が離れている", () => {
  assert(ACTIVE_FILL_COLOR[3] > FILL_ALPHA, "通常塗りより不透明であること");
  // HRE 帝国範囲の臙脂 / 諸侯領境界の藍紫 / 河川選択の赤茶と識別できること。
  // RGB 距離は色相差を表さない（緑と紫は距離が近くても一目で違う）ため、
  // 色相差 60 度以上（12 色相環で 2 段以上離れる）を判定基準にする。
  const others: Record<string, readonly number[]> = {
    "HRE 臙脂": [140, 30, 30],
    "諸侯領藍紫": [74, 42, 130],
    "河川選択の赤茶": [122, 46, 34],
  };
  for (const [label, other] of Object.entries(others)) {
    const distance = hueDistance(ACTIVE_FILL_COLOR, other);
    assert(distance >= 60, `${label} と色相が近すぎる: ${distance} 度`);
  }
});

// ---- 変化検知（AC #7）と保持規則の統合（AC #3）----

function makeStore() {
  let renders = 0;
  const store = createPowerHighlightStore(() => {
    renders++;
  });
  return { store, renders: () => renders };
}

Deno.test("store: ホバーが変化したときだけ onChange が呼ばれる", () => {
  const { store, renders } = makeStore();
  store.hover("France");
  assertEquals(renders(), 1);
  store.hover("France");
  store.hover("France");
  assertEquals(renders(), 1, "同一キーの連続ホバーでは再構築しない");
  store.hover("Normandy");
  assertEquals(renders(), 2);
  store.hover(null);
  assertEquals(renders(), 3);
  store.hover(null);
  assertEquals(renders(), 3, "ホバーなしの連続でも再構築しない");
});

Deno.test("store: クリックが状態を変えないときは onChange を呼ばない", () => {
  const { store, renders } = makeStore();
  store.click(null);
  assertEquals(renders(), 0, "未選択で空クリックしても再構築しない");
  store.click("France");
  assertEquals(renders(), 1);
  assertEquals(store.selected(), "France");
});

Deno.test("store: クリックは選択として保持され、同一対象の再クリックで解除される", () => {
  const { store } = makeStore();
  store.click("France");
  assertEquals(store.selected(), "France");
  // ホバーが外れても選択は残る（タッチ操作でも強調が成立する）
  store.hover(null);
  assertEquals(store.selected(), "France");
  assert(isPowerActive("France", store.selected(), store.hovered()));
  store.click("France");
  assertEquals(store.selected(), null);
  assertFalse(isPowerActive("France", store.selected(), store.hovered()));
});

Deno.test("store: 別対象のクリックで選択が移動する", () => {
  const { store } = makeStore();
  store.click("France");
  store.click("Normandy");
  assertEquals(store.selected(), "Normandy");
  assertFalse(isPowerActive("France", store.selected(), store.hovered()));
});

Deno.test("store: 河川・都市・空クリック（キー null）で選択が解除される", () => {
  const { store, renders } = makeStore();
  store.click("France");
  const before = renders();
  store.click(null);
  assertEquals(store.selected(), null);
  assertEquals(renders(), before + 1);
});

Deno.test("store: clear は選択・ホバーの両方を解除する（年代切替）", () => {
  const { store, renders } = makeStore();
  store.hover("France");
  store.click("France");
  const before = renders();
  store.clear();
  assertEquals(store.selected(), null);
  assertEquals(store.hovered(), null);
  assertEquals(renders(), before + 1, "解除は 1 回の再構築にまとめる");
  store.clear();
  assertEquals(renders(), before + 1, "既に解除済みなら再構築しない");
});

// ---- 遷移時間（getFillColor transitions）----

Deno.test("強調の遷移時間は年代切替のフェードより十分短い", () => {
  assertEquals(YEAR_FILL_TRANSITION_MS, 400);
  assert(HIGHLIGHT_FILL_TRANSITION_MS < YEAR_FILL_TRANSITION_MS / 2);
  assert(HIGHLIGHT_FILL_TRANSITION_MS > 0);
});
