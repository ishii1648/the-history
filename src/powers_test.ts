import { assert, assertEquals, assertRejects } from "@std/assert";
import type { FeatureCollection } from "geojson";
import {
  colorKeyFor,
  createCombinedYearLoader,
  createHreOverlayLoader,
  createYearDataLoader,
  createYearSwitcher,
  dataUrlFor,
  DEFAULT_FILL_COLOR,
  EMPTY_FEATURE_COLLECTION,
  FILL_ALPHA,
  fillColorFor,
  hasHreOverlay,
  hexToRgb,
  hreDataUrlFor,
  LINE_COLOR,
  type Rgba,
  type YearLayerData,
} from "./powers.ts";
import { HRE_OVERLAY_YEARS, SNAPSHOT_YEARS } from "./config.ts";

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

Deno.test("createYearSwitcher は追い越された（stale）要求の失敗を黙殺する（TASK-48）", async () => {
  const d1200 = deferred<FeatureCollection>();
  const loader = {
    load: (year: number) =>
      year === 1200 ? d1200.promise : Promise.resolve(fakeCollection("Y1300")),
  };
  const applied: number[] = [];
  const switcher = createYearSwitcher(loader, (year) => {
    applied.push(year);
  });
  const p1 = switcher.switchTo(1200); // スライダーで通り過ぎた古い要求
  const p2 = switcher.switchTo(1300); // 最新要求。即成功・反映
  await p2;
  assertEquals(applied, [1300]);
  // 追い越された要求が後から失敗しても、switchTo は reject してはいけない
  // （reject すると main.ts 側で現在表示と無関係な失敗トーストが出る）
  d1200.reject(new Error("network down"));
  await p1;
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

// ---- TASK-19: HRE（神聖ローマ帝国）領邦オーバーレイ ----

Deno.test("HRE_OVERLAY_YEARS は ETH データのカバー年のみで、全て SNAPSHOT_YEARS に含まれる", () => {
  assertEquals([...HRE_OVERLAY_YEARS], [1500, 1530, 1600, 1650]);
  for (const year of HRE_OVERLAY_YEARS) {
    assert(SNAPSHOT_YEARS.includes(year));
  }
});

Deno.test("hreDataUrlFor は HRE オーバーレイ GeoJSON のパスを返す", () => {
  assertEquals(hreDataUrlFor(1500), "/data/hre_1500.geojson");
  assertEquals(hreDataUrlFor(1650), "/data/hre_1650.geojson");
});

Deno.test("hasHreOverlay は対象年のみ true を返す", () => {
  assert(hasHreOverlay(1500, HRE_OVERLAY_YEARS));
  assert(hasHreOverlay(1650, HRE_OVERLAY_YEARS));
  assert(!hasHreOverlay(1400, HRE_OVERLAY_YEARS));
  assert(!hasHreOverlay(1700, HRE_OVERLAY_YEARS));
});

Deno.test("EMPTY_FEATURE_COLLECTION は feature を持たない FeatureCollection", () => {
  assertEquals(EMPTY_FEATURE_COLLECTION, {
    type: "FeatureCollection",
    features: [],
  });
});

Deno.test("createHreOverlayLoader は非対象年で fetch せず空 FeatureCollection を返す", async () => {
  const calls: string[] = [];
  const loader = createHreOverlayLoader((url) => {
    calls.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fakeCollection("Austria")),
    });
  }, HRE_OVERLAY_YEARS);
  const fc = await loader.load(1400);
  assertEquals(fc, EMPTY_FEATURE_COLLECTION);
  assertEquals(calls, []);
  // 非対象年は fetch 不要なので「取得済み」扱い（スピナーを出さない）
  assert(loader.has(1400));
});

Deno.test("createHreOverlayLoader は対象年で hre URL を fetch して返す（キャッシュあり）", async () => {
  const calls: string[] = [];
  const loader = createHreOverlayLoader((url) => {
    calls.push(url);
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fakeCollection("Austria")),
    });
  }, HRE_OVERLAY_YEARS);
  assert(!loader.has(1500));
  const fc = await loader.load(1500);
  assertEquals(fc.features[0].properties?.NAME, "Austria");
  assertEquals(calls, ["/data/hre_1500.geojson"]);
  await loader.load(1500);
  assertEquals(calls, ["/data/hre_1500.geojson"]);
  assert(loader.has(1500));
});

Deno.test("createHreOverlayLoader は取得失敗時に warn して空 FC を返す（キャッシュせず再試行可能）", async () => {
  let count = 0;
  const warns: string[] = [];
  const loader = createHreOverlayLoader(
    (_url) => {
      count++;
      return Promise.resolve({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      });
    },
    HRE_OVERLAY_YEARS,
    (msg) => warns.push(msg),
  );
  const fc = await loader.load(1500);
  assertEquals(fc, EMPTY_FEATURE_COLLECTION);
  assertEquals(warns.length, 1);
  assert(!loader.has(1500));
  // 失敗はキャッシュされず、次のロードで再試行される
  await loader.load(1500);
  assertEquals(count, 2);
});

Deno.test("createHreOverlayLoader は fetch 自体の reject でも空 FC を返す", async () => {
  const warns: string[] = [];
  const loader = createHreOverlayLoader(
    (_url) => Promise.reject(new Error("network down")),
    HRE_OVERLAY_YEARS,
    (msg) => warns.push(msg),
  );
  const fc = await loader.load(1600);
  assertEquals(fc, EMPTY_FEATURE_COLLECTION);
  assertEquals(warns.length, 1);
});

/** base（europe_*）と hre（hre_*）を出し分けるモック fetch を作る */
function makeCombinedFetch(calls: string[]) {
  return (url: string) => {
    calls.push(url);
    const name = url.includes("hre_") ? "Austria" : "France";
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(fakeCollection(name)),
    });
  };
}

Deno.test("createCombinedYearLoader は対象年で base と hre を両方ロードして返す", async () => {
  const calls: string[] = [];
  const fetchFn = makeCombinedFetch(calls);
  const loader = createCombinedYearLoader(
    createYearDataLoader(fetchFn),
    createHreOverlayLoader(fetchFn, HRE_OVERLAY_YEARS),
  );
  const data = await loader.load(1500);
  assertEquals(data.base.features[0].properties?.NAME, "France");
  assertEquals(data.hre.features[0].properties?.NAME, "Austria");
  assertEquals(calls.sort(), [
    "/data/europe_1500.geojson",
    "/data/hre_1500.geojson",
  ]);
});

Deno.test("createCombinedYearLoader は非対象年で base のみ fetch し hre は空 FC", async () => {
  const calls: string[] = [];
  const fetchFn = makeCombinedFetch(calls);
  const loader = createCombinedYearLoader(
    createYearDataLoader(fetchFn),
    createHreOverlayLoader(fetchFn, HRE_OVERLAY_YEARS),
  );
  const data = await loader.load(1400);
  assertEquals(data.base.features[0].properties?.NAME, "France");
  assertEquals(data.hre, EMPTY_FEATURE_COLLECTION);
  assertEquals(calls, ["/data/europe_1400.geojson"]);
});

Deno.test("createCombinedYearLoader は base と hre を並行に要求する", async () => {
  const calls: string[] = [];
  const pending = new Map<string, ReturnType<typeof deferred<unknown>>>();
  const loader = createCombinedYearLoader(
    createYearDataLoader((url) => {
      calls.push(url);
      const d = deferred<unknown>();
      pending.set(url, d);
      return d.promise as Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
      }>;
    }),
    createHreOverlayLoader((url) => {
      calls.push(url);
      const d = deferred<unknown>();
      pending.set(url, d);
      return d.promise as Promise<{
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
      }>;
    }, HRE_OVERLAY_YEARS),
  );
  const p = loader.load(1530);
  // どちらの fetch も解決していない時点で、両方の要求が発行されている（並行ロード）
  assertEquals(calls.sort(), [
    "/data/europe_1530.geojson",
    "/data/hre_1530.geojson",
  ]);
  for (const [url, d] of pending) {
    d.resolve({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve(fakeCollection(url.includes("hre_") ? "A" : "B")),
    });
  }
  const data = await p;
  assertEquals(data.base.features[0].properties?.NAME, "B");
  assertEquals(data.hre.features[0].properties?.NAME, "A");
});

Deno.test("createCombinedYearLoader は base 失敗で reject する（hre は成功しても）", async () => {
  const loader = createCombinedYearLoader(
    createYearDataLoader((_url) =>
      Promise.resolve({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      })
    ),
    createHreOverlayLoader(
      (_url) =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(fakeCollection("Austria")),
        }),
      HRE_OVERLAY_YEARS,
    ),
  );
  await assertRejects(() => loader.load(1500));
});

Deno.test("createCombinedYearLoader は hre 失敗でも base を返す（overlay は空扱い）", async () => {
  const warns: string[] = [];
  const loader = createCombinedYearLoader(
    createYearDataLoader((_url) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(fakeCollection("France")),
      })
    ),
    createHreOverlayLoader(
      (_url) =>
        Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        }),
      HRE_OVERLAY_YEARS,
      (msg) => warns.push(msg),
    ),
  );
  const data = await loader.load(1500);
  assertEquals(data.base.features[0].properties?.NAME, "France");
  assertEquals(data.hre, EMPTY_FEATURE_COLLECTION);
  assertEquals(warns.length, 1);
});

Deno.test("createCombinedYearLoader の has は base と hre の両方が取得済みのとき true", async () => {
  const calls: string[] = [];
  const fetchFn = makeCombinedFetch(calls);
  const loader = createCombinedYearLoader(
    createYearDataLoader(fetchFn),
    createHreOverlayLoader(fetchFn, HRE_OVERLAY_YEARS),
  );
  assert(!loader.has(1500));
  await loader.load(1500);
  assert(loader.has(1500));
  // 非対象年は hre 側が常に「取得済み」なので base のキャッシュ状況に従う
  assert(!loader.has(1400));
  await loader.load(1400);
  assert(loader.has(1400));
});

Deno.test("createYearSwitcher は複合データ（base+hre）でも古い要求を破棄する", async () => {
  const d1400 = deferred<YearLayerData>();
  const d1500 = deferred<YearLayerData>();
  const loader = {
    load: (year: number) => year === 1400 ? d1400.promise : d1500.promise,
  };
  const applied: Array<{ year: number; hreCount: number }> = [];
  const switcher = createYearSwitcher(loader, (year, data) => {
    applied.push({ year, hreCount: data.hre.features.length });
  });
  const p1 = switcher.switchTo(1400);
  const p2 = switcher.switchTo(1500);
  // 新しい 1500 が先に、古い 1400 が後から解決する
  d1500.resolve({ base: fakeCollection("F"), hre: fakeCollection("A") });
  d1400.resolve({ base: fakeCollection("F"), hre: EMPTY_FEATURE_COLLECTION });
  await Promise.all([p1, p2]);
  assertEquals(applied, [{ year: 1500, hreCount: 1 }]);
  assertEquals(switcher.currentYear(), 1500);
});
