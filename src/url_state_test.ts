import { assertEquals } from "@std/assert";
import {
  type AppState,
  createReplaceStateUpdater,
  decodeState,
  encodeState,
  type StateBounds,
} from "./url_state.ts";

const DEFAULTS: AppState = {
  year: 1000,
  zoom: 4,
  center: [15, 50],
};

const BOUNDS: StateBounds = {
  years: [900, 1000, 1100, 1200, 1300],
  minZoom: 3,
  maxZoom: 8,
};

// ---- encodeState ----

Deno.test("encodeState は仕様例の形式でクエリ文字列を生成する", () => {
  assertEquals(
    encodeState({ year: 1300, zoom: 4.5, center: [15, 50] }),
    "?year=1300&zoom=4.5&center=15.0,50.0",
  );
});

Deno.test("encodeState は zoom / center を小数 1 桁に丸める", () => {
  assertEquals(
    encodeState({ year: 1200, zoom: 4.567, center: [15.04, 49.98] }),
    "?year=1200&zoom=4.6&center=15.0,50.0",
  );
});

Deno.test("encodeState は整数座標にも .0 を付ける（丸め桁を固定）", () => {
  assertEquals(
    encodeState({ year: 900, zoom: 3, center: [0, 0] }),
    "?year=900&zoom=3.0&center=0.0,0.0",
  );
});

Deno.test("encodeState は center を lon,lat の順で並べる", () => {
  // center は [経度, 緯度]。仕様例 center=15.0,50.0 は lon=15 / lat=50。
  assertEquals(
    encodeState({ year: 1000, zoom: 5, center: [-3.7, 40.4] }),
    "?year=1000&zoom=5.0&center=-3.7,40.4",
  );
});

// ---- decodeState: 正常系 ----

Deno.test("decodeState は妥当なクエリを state に復元する", () => {
  assertEquals(
    decodeState("?year=1300&zoom=4.5&center=15.0,50.0", DEFAULTS, BOUNDS),
    { year: 1300, zoom: 4.5, center: [15, 50] },
  );
});

Deno.test("decodeState は先頭 ? なしのクエリも解釈する", () => {
  assertEquals(
    decodeState("year=1100&zoom=6&center=10.0,45.0", DEFAULTS, BOUNDS),
    { year: 1100, zoom: 6, center: [10, 45] },
  );
});

Deno.test("decodeState は空クエリで全てデフォルトへフォールバックする", () => {
  assertEquals(decodeState("", DEFAULTS, BOUNDS), DEFAULTS);
  assertEquals(decodeState("?", DEFAULTS, BOUNDS), DEFAULTS);
});

// ---- decodeState: year のパラメータ単位フォールバック ----

Deno.test("decodeState は非実在年をデフォルト year にフォールバックし他は活かす", () => {
  assertEquals(
    decodeState("?year=1350&zoom=5&center=10.0,45.0", DEFAULTS, BOUNDS),
    { year: 1000, zoom: 5, center: [10, 45] },
  );
});

Deno.test("decodeState は非数値 year をデフォルトにフォールバックする", () => {
  assertEquals(
    decodeState("?year=abc&zoom=5&center=10.0,45.0", DEFAULTS, BOUNDS).year,
    1000,
  );
});

Deno.test("decodeState は小数 year をデフォルトにフォールバックする", () => {
  assertEquals(
    decodeState("?year=1300.5&zoom=5&center=10.0,45.0", DEFAULTS, BOUNDS).year,
    1000,
  );
});

// ---- decodeState: zoom のパラメータ単位フォールバック / クランプ ----

Deno.test("decodeState は範囲超過 zoom を上限にクランプする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=99&center=15.0,50.0", DEFAULTS, BOUNDS).zoom,
    8,
  );
});

Deno.test("decodeState は範囲未満 zoom を下限にクランプする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=0&center=15.0,50.0", DEFAULTS, BOUNDS).zoom,
    3,
  );
});

Deno.test("decodeState は非数値 zoom をデフォルトにフォールバックする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=xyz&center=15.0,50.0", DEFAULTS, BOUNDS).zoom,
    4,
  );
});

Deno.test("decodeState は空 zoom をデフォルトにフォールバックする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=&center=15.0,50.0", DEFAULTS, BOUNDS).zoom,
    4,
  );
});

// ---- decodeState: center のパラメータ単位フォールバック ----

Deno.test("decodeState は要素数不正な center をデフォルトにフォールバックし他は活かす", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=15.0", DEFAULTS, BOUNDS),
    { year: 1300, zoom: 5, center: [15, 50] },
  );
});

Deno.test("decodeState は非数値 center をデフォルトにフォールバックする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=foo,bar", DEFAULTS, BOUNDS).center,
    [15, 50],
  );
});

Deno.test("decodeState は空要素を含む center をデフォルトにフォールバックする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=,", DEFAULTS, BOUNDS).center,
    [15, 50],
  );
});

// TASK-22: 数値として妥当だが範囲外の center はフォールバックではなくクランプする
// （共有 URL の意図をなるべく保つ）。パース不能値は従来どおりフォールバック。

Deno.test("decodeState は経度が範囲外の center を境界へクランプする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=200.0,50.0", DEFAULTS, BOUNDS).center,
    [180, 50],
  );
});

Deno.test("decodeState は緯度が範囲外の center を境界へクランプする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=15.0,89.0", DEFAULTS, BOUNDS).center,
    [15, 85],
  );
});

Deno.test("decodeState は境界値の center を受理する", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=-180.0,-85.0", DEFAULTS, BOUNDS)
      .center,
    [-180, -85],
  );
});

// ---- decodeState: center の明示 bounds（ヨーロッパ bbox 相当）クランプ ----

const EUROPE_BOUNDS: StateBounds = {
  ...BOUNDS,
  minLon: -25,
  maxLon: 60,
  minLat: 34,
  maxLat: 72,
};

Deno.test("decodeState は明示 bounds の内側の center をそのまま受理する", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=15.0,50.0", DEFAULTS, EUROPE_BOUNDS)
      .center,
    [15, 50],
  );
});

Deno.test("decodeState は明示 bounds の外の center を bbox 内へクランプする", () => {
  // 経度・緯度とも下限側に外れる（大西洋の先）→ 南西角へクランプ
  assertEquals(
    decodeState("?year=1300&zoom=5&center=-100.0,10.0", DEFAULTS, EUROPE_BOUNDS)
      .center,
    [-25, 34],
  );
  // 経度・緯度とも上限側に外れる（シベリア方面）→ 北東角へクランプ
  assertEquals(
    decodeState("?year=1300&zoom=5&center=100.0,80.0", DEFAULTS, EUROPE_BOUNDS)
      .center,
    [60, 72],
  );
});

Deno.test("decodeState は片軸だけ範囲外の center をその軸のみクランプする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=70.0,50.0", DEFAULTS, EUROPE_BOUNDS)
      .center,
    [60, 50],
  );
  assertEquals(
    decodeState("?year=1300&zoom=5&center=15.0,20.0", DEFAULTS, EUROPE_BOUNDS)
      .center,
    [15, 34],
  );
});

Deno.test("decodeState は明示 bounds でもパース不能な center をデフォルトへフォールバックする", () => {
  assertEquals(
    decodeState("?year=1300&zoom=5&center=foo,bar", DEFAULTS, EUROPE_BOUNDS)
      .center,
    [15, 50],
  );
});

// ---- 往復（encode → decode）----

Deno.test("encode → decode は丸め後の state を保存する", () => {
  const state: AppState = { year: 1200, zoom: 4.5, center: [15, 50] };
  assertEquals(decodeState(encodeState(state), DEFAULTS, BOUNDS), state);
});

// ---- createReplaceStateUpdater: 重複抑止 ----

Deno.test("createReplaceStateUpdater は初回に replace を呼ぶ", () => {
  const calls: string[] = [];
  const update = createReplaceStateUpdater((q) => calls.push(q));
  update({ year: 1300, zoom: 4.5, center: [15, 50] });
  assertEquals(calls, ["?year=1300&zoom=4.5&center=15.0,50.0"]);
});

Deno.test("createReplaceStateUpdater は同一 state の重複呼び出しを抑止する", () => {
  const calls: string[] = [];
  const update = createReplaceStateUpdater((q) => calls.push(q));
  const s: AppState = { year: 1300, zoom: 4.5, center: [15, 50] };
  update(s);
  update({ ...s });
  assertEquals(calls.length, 1);
});

Deno.test("createReplaceStateUpdater は state 変化時に再度 replace を呼ぶ", () => {
  const calls: string[] = [];
  const update = createReplaceStateUpdater((q) => calls.push(q));
  update({ year: 1300, zoom: 4.5, center: [15, 50] });
  update({ year: 1300, zoom: 5.5, center: [15, 50] });
  assertEquals(calls.length, 2);
});
