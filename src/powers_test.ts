import { assert, assertEquals, assertRejects } from "@std/assert";
import type { FeatureCollection } from "geojson";
import {
  colorKeyFor,
  createYearDataLoader,
  createYearSwitcher,
  dataUrlFor,
  DEFAULT_FILL_COLOR,
  FILL_ALPHA,
  fillColorFor,
  hexToRgb,
  LINE_COLOR,
  type Rgba,
} from "./powers.ts";

Deno.test("colorKeyFor は独立勢力（SUBJECTO が NAME と同じ）では NAME を返す", () => {
  assertEquals(colorKeyFor({ NAME: "Cyprus", SUBJECTO: "Cyprus" }), "Cyprus");
});

Deno.test("colorKeyFor は SUBJECTO が null なら NAME を返す", () => {
  assertEquals(colorKeyFor({ NAME: "France", SUBJECTO: null }), "France");
});

Deno.test("colorKeyFor は SUBJECTO が空文字なら NAME を返す", () => {
  assertEquals(colorKeyFor({ NAME: "France", SUBJECTO: "" }), "France");
});

Deno.test("colorKeyFor は属領（SUBJECTO≠NAME）で NAME|SUBJECTO を返す", () => {
  assertEquals(
    colorKeyFor({ NAME: "Algeria", SUBJECTO: "France" }),
    "Algeria|France",
  );
});

Deno.test("colorKeyFor は NAME が null なら null を返す", () => {
  assertEquals(colorKeyFor({ NAME: null, SUBJECTO: null }), null);
});

Deno.test("colorKeyFor は properties が null なら null を返す", () => {
  assertEquals(colorKeyFor(null), null);
});

Deno.test("hexToRgb は #rrggbb を [r,g,b] に変換する", () => {
  assertEquals(hexToRgb("#ffffff"), [255, 255, 255]);
  assertEquals(hexToRgb("#000000"), [0, 0, 0]);
  assertEquals(hexToRgb("#94aa41"), [0x94, 0xaa, 0x41]);
});

Deno.test("hexToRgb は不正な文字列で null を返す", () => {
  assertEquals(hexToRgb("94aa41"), null);
  assertEquals(hexToRgb("#fff"), null);
  assertEquals(hexToRgb("#gggggg"), null);
});

Deno.test("fillColorFor は割当色を [r,g,b,FILL_ALPHA] で返す", () => {
  const colors = { "Algeria|France": "#94aa41" };
  assertEquals(
    fillColorFor({ NAME: "Algeria", SUBJECTO: "France" }, colors),
    [0x94, 0xaa, 0x41, FILL_ALPHA],
  );
});

Deno.test("fillColorFor は独立勢力の NAME キーを引く", () => {
  const colors = { France: "#123456" };
  assertEquals(
    fillColorFor({ NAME: "France", SUBJECTO: null }, colors),
    [0x12, 0x34, 0x56, FILL_ALPHA],
  );
});

Deno.test("fillColorFor はキー欠落時にデフォルト色を返す", () => {
  assertEquals(
    fillColorFor({ NAME: "Unknown", SUBJECTO: null }, {}),
    DEFAULT_FILL_COLOR,
  );
});

Deno.test("fillColorFor は NAME null 時にデフォルト色を返す", () => {
  assertEquals(
    fillColorFor({ NAME: null, SUBJECTO: null }, { France: "#123456" }),
    DEFAULT_FILL_COLOR,
  );
});

Deno.test("FILL_ALPHA は opacity 0.5 相当（128 前後）", () => {
  assert(FILL_ALPHA >= 110 && FILL_ALPHA <= 140);
});

Deno.test("DEFAULT_FILL_COLOR は塗りと同じ alpha を持つグレー系", () => {
  assertEquals(DEFAULT_FILL_COLOR[3], FILL_ALPHA);
  // R≈G≈B のニュートラルなグレー
  const [r, g, b] = DEFAULT_FILL_COLOR;
  assert(Math.abs(r - g) <= 8 && Math.abs(g - b) <= 8);
});

Deno.test("LINE_COLOR は白系（RGB が高く不透明寄り）", () => {
  const [r, g, b, a] = LINE_COLOR;
  assert(r >= 200 && g >= 200 && b >= 200);
  assert(a > 0);
});

Deno.test("dataUrlFor は同一オリジンの GeoJSON パスを返す", () => {
  assertEquals(dataUrlFor(1000), "/data/europe_1000.geojson");
  assertEquals(dataUrlFor(900), "/data/europe_900.geojson");
});

function fakeCollection(name: string): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { NAME: name, SUBJECTO: name },
        geometry: { type: "Point", coordinates: [0, 0] },
      },
    ],
  };
}

Deno.test("createYearDataLoader は年代 GeoJSON を fetch して返す", async () => {
  const calls: string[] = [];
  const loader = createYearDataLoader((url) => {
    calls.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fakeCollection("A")),
    });
  });
  const fc = await loader.load(1000);
  assertEquals(fc.features[0].properties?.NAME, "A");
  assertEquals(calls, ["/data/europe_1000.geojson"]);
});

Deno.test("createYearDataLoader は同一年代を 1 度だけ fetch する（キャッシュ）", async () => {
  let count = 0;
  const loader = createYearDataLoader((_url) => {
    count++;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fakeCollection("A")),
    });
  });
  await loader.load(1000);
  assert(!loader.has(1200));
  await loader.load(1000);
  assertEquals(count, 1);
  assert(loader.has(1000));
});

Deno.test("createYearDataLoader は並行呼び出しを 1 度の fetch に集約する", async () => {
  let count = 0;
  const loader = createYearDataLoader((_url) => {
    count++;
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fakeCollection("A")),
    });
  });
  await Promise.all([loader.load(1000), loader.load(1000)]);
  assertEquals(count, 1);
});

Deno.test("createYearDataLoader は非 ok レスポンスで reject し、キャッシュしない", async () => {
  let count = 0;
  const loader = createYearDataLoader((_url) => {
    count++;
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    });
  });
  await assertRejects(() => loader.load(1000));
  assert(!loader.has(1000));
  // 失敗後は再試行できる（inflight が残らない）
  await assertRejects(() => loader.load(1000));
  assertEquals(count, 2);
});

Deno.test("Rgba 型は 4 要素タプル", () => {
  const c: Rgba = [1, 2, 3, 4];
  assertEquals(c.length, 4);
});

/** 解決タイミングを外部から制御できる Promise */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

Deno.test("createYearSwitcher の currentYear は初期状態で undefined", () => {
  const loader = { load: () => Promise.resolve(fakeCollection("A")) };
  const switcher = createYearSwitcher(loader, () => {});
  assertEquals(switcher.currentYear(), undefined);
});

Deno.test("createYearSwitcher は逐次解決なら各要求を順に反映する", async () => {
  const loader = {
    load: (year: number) => Promise.resolve(fakeCollection(`Y${year}`)),
  };
  const applied: number[] = [];
  const switcher = createYearSwitcher(loader, (year) => applied.push(year));
  await switcher.switchTo(1200);
  await switcher.switchTo(1300);
  assertEquals(applied, [1200, 1300]);
  assertEquals(switcher.currentYear(), 1300);
});

Deno.test("createYearSwitcher は後から解決した古い要求を破棄する（最新のみ反映）", async () => {
  const d1200 = deferred<FeatureCollection>();
  const d1300 = deferred<FeatureCollection>();
  const loader = {
    load: (year: number) => year === 1200 ? d1200.promise : d1300.promise,
  };
  const applied: Array<{ year: number; name: string }> = [];
  const switcher = createYearSwitcher(loader, (year, data) => {
    applied.push({ year, name: String(data.features[0].properties?.NAME) });
  });
  const p1 = switcher.switchTo(1200);
  const p2 = switcher.switchTo(1300);
  // 新しい 1300 が先に、古い 1200 が後から解決する（ドラッグ時の競合を再現）
  d1300.resolve(fakeCollection("Y1300"));
  d1200.resolve(fakeCollection("Y1200"));
  await Promise.all([p1, p2]);
  // 古い 1200 は破棄され、表示も currentYear も 1300 のまま
  assertEquals(applied, [{ year: 1300, name: "Y1300" }]);
  assertEquals(switcher.currentYear(), 1300);
});

Deno.test("createYearSwitcher は連続要求で最後の要求だけを反映する", async () => {
  const deferreds = new Map<
    number,
    ReturnType<typeof deferred<FeatureCollection>>
  >();
  const loader = {
    load: (year: number) => {
      const d = deferred<FeatureCollection>();
      deferreds.set(year, d);
      return d.promise;
    },
  };
  const applied: number[] = [];
  const switcher = createYearSwitcher(loader, (year) => applied.push(year));
  const ps = [
    switcher.switchTo(1200),
    switcher.switchTo(1300),
    switcher.switchTo(1400),
  ];
  // 逆順（新しいものから）に解決しても、反映されるのは最後に要求した 1400 のみ
  deferreds.get(1400)!.resolve(fakeCollection("A"));
  deferreds.get(1300)!.resolve(fakeCollection("A"));
  deferreds.get(1200)!.resolve(fakeCollection("A"));
  await Promise.all(ps);
  assertEquals(applied, [1400]);
  assertEquals(switcher.currentYear(), 1400);
});
