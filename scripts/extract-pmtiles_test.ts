import { assertEquals, assertThrows } from "@std/assert";
import { MAX_ZOOM } from "../src/config.ts";
import { EUROPE_BBOX } from "./build-data.ts";
import {
  BASEMAP_MAX_ZOOM,
  BUILD_BASE_URL,
  buildDownloadUrl,
  buildExtractArgs,
  EUROPE_BBOX_STRING,
  formatBbox,
  latestBuildKey,
} from "./extract-pmtiles.ts";

Deno.test("formatBbox は [W, S, E, N] をカンマ区切り文字列にする", () => {
  assertEquals(formatBbox([-25, 34, 60, 72]), "-25,34,60,72");
});

Deno.test("EUROPE_BBOX_STRING はデータパイプラインの EUROPE_BBOX と一致する", () => {
  assertEquals(EUROPE_BBOX_STRING, formatBbox(EUROPE_BBOX));
  assertEquals(EUROPE_BBOX_STRING, "-25,34,60,72");
});

Deno.test("BASEMAP_MAX_ZOOM はアプリの MAX_ZOOM と一致する", () => {
  assertEquals(BASEMAP_MAX_ZOOM, MAX_ZOOM);
});

Deno.test("latestBuildKey は日付キーの最新（辞書順最大）を返す", () => {
  const key = latestBuildKey([
    { key: "20250101.pmtiles" },
    { key: "20260720.pmtiles" },
    { key: "20231002.pmtiles" },
  ]);
  assertEquals(key, "20260720.pmtiles");
});

Deno.test("latestBuildKey は YYYYMMDD.pmtiles 以外のキーを無視する", () => {
  const key = latestBuildKey([
    { key: "20260720.pmtiles.layerstats.parquet" },
    { key: "20250101.pmtiles" },
    { key: "99999999-notes.txt" },
  ]);
  assertEquals(key, "20250101.pmtiles");
});

Deno.test("latestBuildKey は有効なキーが無いとき例外を投げる", () => {
  assertThrows(() => latestBuildKey([]), Error);
  assertThrows(() => latestBuildKey([{ key: "foo.txt" }]), Error);
});

Deno.test("buildDownloadUrl はビルドキーから配布 URL を組み立てる", () => {
  assertEquals(
    buildDownloadUrl("20260720.pmtiles"),
    `${BUILD_BASE_URL}20260720.pmtiles`,
  );
});

Deno.test("buildDownloadUrl は不正なキーを拒否する", () => {
  assertThrows(() => buildDownloadUrl("../evil.pmtiles"), Error);
  assertThrows(() => buildDownloadUrl("foo.pmtiles"), Error);
  assertThrows(() => buildDownloadUrl(""), Error);
});

Deno.test("buildExtractArgs は既定でヨーロッパ bbox と maxzoom=8 を指定する", () => {
  assertEquals(
    buildExtractArgs(
      "https://build.protomaps.com/20260720.pmtiles",
      "data/europe.pmtiles",
    ),
    [
      "extract",
      "https://build.protomaps.com/20260720.pmtiles",
      "data/europe.pmtiles",
      "--bbox=-25,34,60,72",
      "--maxzoom=8",
    ],
  );
});

Deno.test("buildExtractArgs は bbox / maxzoom を上書きできる", () => {
  assertEquals(
    buildExtractArgs("in.pmtiles", "out.pmtiles", {
      bbox: "0,0,1,1",
      maxzoom: 5,
    }),
    ["extract", "in.pmtiles", "out.pmtiles", "--bbox=0,0,1,1", "--maxzoom=5"],
  );
});
