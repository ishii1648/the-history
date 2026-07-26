import { assert, assertEquals } from "@std/assert";
import {
  BASE_OUTLINE_LAYER_ID,
  CITY_LABEL_LAYER_ID,
  LABEL_LAYER_ID,
  OVERLAID_LAYER_IDS,
  overlaySplitIsValid,
  RIVER_LABEL_LAYER_ID,
  UNDER_WATER_LAYER_IDS,
  underWaterBeforeId,
  WATER_STYLE_LAYER_ID,
} from "./layer_stack.ts";
import { buildBasemapStyle, WATER_LAYER_ID } from "./basemap.ts";
import { BASEMAP_PMTILES_URL } from "./config.ts";
import {
  CITY_LAYER_ID,
  FRANCE_FIEF_LAYER_ID,
  HRE_LAYER_ID,
  layerOrderMatchesPickingPriority,
  PICKING_PRIORITY,
  POWER_LAYER_ID,
  RIVERS_HIT_LAYER_ID,
  RIVERS_LAYER_ID,
} from "./picking.ts";

/** ベースマップ（Protomaps 羊皮紙スタイル）の実レイヤー id 列 */
const realStyleLayerIds = buildBasemapStyle(BASEMAP_PMTILES_URL).layers.map(
  (l) => l.id,
);

// --- TASK-77: 勢力・諸侯領ポリゴンを水面より下に差し込む ---
// ベースマップ（現代海岸線）と政治ポリゴン（粗い海岸線）の解像度差で塗りが
// 海へはみ出す。deck.gl の beforeId で水面ポリゴンより下に差し込み、はみ出しを
// 水面に覆わせて隠す。

Deno.test("WATER_STYLE_LAYER_ID はベースマップスタイルに実在する水面レイヤー id", () => {
  // ハードコードした id がスタイルから消えたらここで落ちる（TASK-77 AC #1）
  assertEquals(WATER_STYLE_LAYER_ID, WATER_LAYER_ID);
  assert(
    realStyleLayerIds.includes(WATER_STYLE_LAYER_ID),
    `水面レイヤー ${WATER_STYLE_LAYER_ID} が実スタイルに無い: ${
      realStyleLayerIds.join(", ")
    }`,
  );
});

Deno.test("水面より下へ回すのは政治ポリゴン 3 枚と base 境界線オーバーレイのみ", () => {
  assertEquals(
    [...UNDER_WATER_LAYER_IDS].sort(),
    [
      BASE_OUTLINE_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      HRE_LAYER_ID,
      POWER_LAYER_ID,
    ].sort(),
  );
});

Deno.test("base 境界線オーバーレイは powers と同じ水面下グループに入る（TASK-78）", () => {
  // powers の stroke を置き換える層なので、beforeId が powers と一致しなければ
  // 別グループに分かれて描画順（諸侯領より下）が壊れる
  assertEquals(
    underWaterBeforeId(BASE_OUTLINE_LAYER_ID, realStyleLayerIds),
    underWaterBeforeId(POWER_LAYER_ID, realStyleLayerIds),
  );
});

Deno.test("base 境界線オーバーレイは pickable 層ではない（picking 挙動は不変。TASK-78）", () => {
  assert(!PICKING_PRIORITY.includes(BASE_OUTLINE_LAYER_ID));
  // 追加しても既存の picking 順の検証は通る（優先リスト外は無視される）
  assert(
    layerOrderMatchesPickingPriority([
      POWER_LAYER_ID,
      BASE_OUTLINE_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      HRE_LAYER_ID,
      RIVERS_HIT_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
    ]),
  );
});

Deno.test("base 境界線オーバーレイは overlaid 側に混ぜない（衝突フィルタの分配を壊さない。TASK-78）", () => {
  assert(!OVERLAID_LAYER_IDS.includes(BASE_OUTLINE_LAYER_ID));
  assert(
    overlaySplitIsValid(
      [POWER_LAYER_ID, BASE_OUTLINE_LAYER_ID, FRANCE_FIEF_LAYER_ID],
      [LABEL_LAYER_ID, RIVER_LABEL_LAYER_ID, CITY_LABEL_LAYER_ID],
    ),
  );
});

Deno.test("3 ポリゴンレイヤーには水面レイヤー id が beforeId として付与される", () => {
  for (const id of [POWER_LAYER_ID, FRANCE_FIEF_LAYER_ID, HRE_LAYER_ID]) {
    assertEquals(
      underWaterBeforeId(id, realStyleLayerIds),
      WATER_STYLE_LAYER_ID,
      `${id} は水面より下に描画されるはず`,
    );
  }
});

Deno.test("河川・河川ヒット層・都市・ラベル系レイヤーには beforeId を付与しない（水面より上を維持, AC #2）", () => {
  const aboveWater = [
    RIVERS_LAYER_ID,
    RIVERS_HIT_LAYER_ID,
    CITY_LAYER_ID,
    ...OVERLAID_LAYER_IDS,
    // HRE 帝国範囲の強調（main.ts のレイヤー ID）
    "hre-extent",
  ];
  for (const id of aboveWater) {
    assertEquals(
      underWaterBeforeId(id, realStyleLayerIds),
      undefined,
      `${id} は従来どおり水面より上に描画されるはず`,
    );
  }
});

Deno.test("水面レイヤー id がスタイルに無い場合は beforeId なしへフォールバックし例外を投げない（AC #4）", () => {
  // フォールバックスタイル（OpenFreeMap 等）に water が無いケースを模す
  const withoutWater = realStyleLayerIds.filter(
    (id) => id !== WATER_STYLE_LAYER_ID,
  );
  for (const id of UNDER_WATER_LAYER_IDS) {
    assertEquals(underWaterBeforeId(id, withoutWater), undefined);
  }
  // スタイル未読込（レイヤー列が空）でも同様に例外を投げない
  for (const id of UNDER_WATER_LAYER_IDS) {
    assertEquals(underWaterBeforeId(id, []), undefined);
  }
});

// --- TASK-77: ラベル層を overlaid オーバーレイへ分ける ---
// beforeId で interleaved のレイヤーグループが 2 つに分かれると、先に描画される
// グループ（水面より下）の描画パスが CollisionFilterExtension の衝突マップを
// 「そのグループだけ」に絞って描き直してしまい、ラベル（TextLayer）が全滅する。
// ラベル 3 層は picking に関与しない（pickable: false）ため、別の overlaid
// オーバーレイ（deck 専用 canvas）へ移して衝突判定を interleaved のグループ
// 分割から切り離す。

Deno.test("overlaid 側に載せるのはラベル 3 層のみ", () => {
  assertEquals(OVERLAID_LAYER_IDS, [
    LABEL_LAYER_ID,
    RIVER_LABEL_LAYER_ID,
    CITY_LABEL_LAYER_ID,
  ]);
});

Deno.test("overlaid 側のレイヤーは picking 優先順に含まれない（picking は interleaved 側のみ, AC #3）", () => {
  for (const id of OVERLAID_LAYER_IDS) {
    assert(
      !PICKING_PRIORITY.includes(id),
      `${id} が PICKING_PRIORITY に含まれると picking 優先順が変わる`,
    );
  }
});

Deno.test("overlaySplitIsValid は正しい分配を受理する", () => {
  assert(overlaySplitIsValid(
    [
      POWER_LAYER_ID,
      FRANCE_FIEF_LAYER_ID,
      HRE_LAYER_ID,
      "hre-extent",
      RIVERS_HIT_LAYER_ID,
      CITY_LAYER_ID,
      RIVERS_LAYER_ID,
    ],
    [...OVERLAID_LAYER_IDS],
  ));
});

Deno.test("overlaySplitIsValid はラベル層が interleaved 側に混ざった分配を拒否する", () => {
  assert(
    !overlaySplitIsValid(
      [POWER_LAYER_ID, RIVERS_LAYER_ID, LABEL_LAYER_ID],
      [RIVER_LABEL_LAYER_ID, CITY_LABEL_LAYER_ID],
    ),
  );
});

Deno.test("overlaySplitIsValid はラベル層の欠落・余分なレイヤーを拒否する", () => {
  // ラベル層が足りない
  assert(
    !overlaySplitIsValid(
      [POWER_LAYER_ID, RIVERS_LAYER_ID],
      [LABEL_LAYER_ID, RIVER_LABEL_LAYER_ID],
    ),
  );
  // overlaid 側に picking 対象（河川）が混ざる = picking が壊れる
  assert(
    !overlaySplitIsValid(
      [POWER_LAYER_ID],
      [...OVERLAID_LAYER_IDS, RIVERS_LAYER_ID],
    ),
  );
});

Deno.test("beforeId の付与は picking 優先順（PICKING_PRIORITY）に影響しない（AC #3）", () => {
  // beforeId は MapLibre 側の描画位置だけを決める。picking は deck.gl の
  // レイヤー配列順で決まるため、優先順のリスト自体は従来と同一であること
  // （順序を変える変更が入ったらここで気付ける）。
  assertEquals(PICKING_PRIORITY, [
    RIVERS_LAYER_ID,
    CITY_LAYER_ID,
    RIVERS_HIT_LAYER_ID,
    HRE_LAYER_ID,
    FRANCE_FIEF_LAYER_ID,
    POWER_LAYER_ID,
  ]);
});
