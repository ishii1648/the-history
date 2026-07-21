import { assert, assertEquals } from "@std/assert";
import {
  createFallbackState,
  decideFallback,
  isBasemapFetchError,
} from "./fallback.ts";

const SOURCE_ID = "basemap";

Deno.test("isBasemapFetchError: basemap ソース起因のエラーは true", () => {
  assert(
    isBasemapFetchError(
      { sourceId: SOURCE_ID, error: { message: "Not Found (404)" } },
      SOURCE_ID,
    ),
  );
});

Deno.test("isBasemapFetchError: pmtiles を含むメッセージは true", () => {
  assert(
    isBasemapFetchError(
      { error: { message: "pmtiles: archive fetch failed" } },
      SOURCE_ID,
    ),
  );
});

Deno.test("isBasemapFetchError: ネットワーク系メッセージは true", () => {
  assert(
    isBasemapFetchError(
      { error: { message: "Failed to fetch" } },
      SOURCE_ID,
    ),
  );
  assert(
    isBasemapFetchError(
      { error: { message: "NetworkError when attempting to fetch resource." } },
      SOURCE_ID,
    ),
  );
});

Deno.test("isBasemapFetchError: 無関係なエラーは false", () => {
  assert(
    !isBasemapFetchError(
      { error: { message: "Image 'marker' could not be loaded" } },
      SOURCE_ID,
    ),
  );
});

Deno.test("isBasemapFetchError: 別ソースの非ネットワークエラーは false", () => {
  assert(
    !isBasemapFetchError(
      { sourceId: "other-source", error: { message: "layer style invalid" } },
      SOURCE_ID,
    ),
  );
});

Deno.test("isBasemapFetchError: error 情報なしのイベントは false", () => {
  assert(!isBasemapFetchError({}, SOURCE_ID));
});

// TASK-34: DEM（hillshade 用 raster-dem ソース）は任意生成のため、アーカイブ
// 不在によるエラーが起きうる。dem ソース起因のエラーでは（メッセージが
// pmtiles/ネットワーク系でも）OpenFreeMap へフォールバックしてはならない。
Deno.test("isBasemapFetchError: dem ソース起因の pmtiles エラーは false", () => {
  assert(
    !isBasemapFetchError(
      {
        sourceId: "dem",
        error: { message: "pmtiles: archive fetch failed" },
      },
      SOURCE_ID,
    ),
  );
});

Deno.test("isBasemapFetchError: 別ソースのネットワーク系エラーも false", () => {
  assert(
    !isBasemapFetchError(
      { sourceId: "dem", error: { message: "Failed to fetch" } },
      SOURCE_ID,
    ),
  );
});

Deno.test("decideFallback: dem ソースのエラーではフォールバックしない", () => {
  const s0 = createFallbackState();
  const d = decideFallback(
    s0,
    { sourceId: "dem", error: { message: "pmtiles: not found" } },
    SOURCE_ID,
  );
  assertEquals(d.fallback, false);
  assertEquals(d.state.fallenBack, false);
});

Deno.test("decideFallback: 初回の該当エラーで一度だけフォールバックする", () => {
  const s0 = createFallbackState();
  const event = { sourceId: SOURCE_ID, error: { message: "Failed to fetch" } };

  const d1 = decideFallback(s0, event, SOURCE_ID);
  assertEquals(d1.fallback, true);

  // 2 回目以降は同じエラーでも切り替えない（切替は一度きり）
  const d2 = decideFallback(d1.state, event, SOURCE_ID);
  assertEquals(d2.fallback, false);
});

Deno.test("decideFallback: 非該当エラーでは状態が変わらない", () => {
  const s0 = createFallbackState();
  const d = decideFallback(
    s0,
    { error: { message: "Image 'x' could not be loaded" } },
    SOURCE_ID,
  );
  assertEquals(d.fallback, false);
  assertEquals(d.state.fallenBack, false);
});

Deno.test("decideFallback: 状態を破壊せず新しい状態を返す（純粋関数）", () => {
  const s0 = createFallbackState();
  const event = { sourceId: SOURCE_ID, error: { message: "Failed to fetch" } };
  const d = decideFallback(s0, event, SOURCE_ID);
  assertEquals(s0.fallenBack, false);
  assertEquals(d.state.fallenBack, true);
});
