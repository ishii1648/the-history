import { assert, assertEquals } from "@std/assert";
import { BASEMAP_PMTILES_URL, DEM_PMTILES_URL } from "./config.ts";
import {
  isLocalHostname,
  resolveBasemapPmtilesUrl,
  resolveDemPmtilesUrl,
  resolvePmtilesUrl,
  TILES_ORIGIN,
} from "./pmtiles_url.ts";

// --- TASK-127: 本番/ローカルの PMTiles URL 切替 ---
// 本番（Cloudflare Pages: zeitreises.com / *.pages.dev プレビュー）は R2 の
// カスタムドメイン https://tiles.zeitreises.com から配信し、ローカル開発は
// 従来どおり同一オリジンの /europe.pmtiles を使う。切替はビルドを分けず、
// location.hostname を入力とする純粋関数で実行時に決める（プレビュー・本番・
// ローカルで同一成果物を使えるようにするため）。

Deno.test("TILES_ORIGIN は R2 カスタムドメインの https オリジン（末尾スラッシュなし）", () => {
  assertEquals(TILES_ORIGIN, "https://tiles.zeitreises.com");
  assert(!TILES_ORIGIN.endsWith("/"));
  // URL として妥当なオリジンであること（typo 防止）
  assertEquals(new URL(TILES_ORIGIN).origin, TILES_ORIGIN);
});

Deno.test("isLocalHostname: ローカル開発のホスト名を true にする", () => {
  for (
    const host of [
      "localhost",
      "LOCALHOST",
      "app.localhost",
      "127.0.0.1",
      "127.1.2.3",
      "0.0.0.0",
      "::1",
      "[::1]",
      // LAN 上の実機確認（プライベート IP 直アクセス）もローカル扱い
      "192.168.1.10",
      "10.0.0.5",
      "172.16.0.1",
      "172.31.255.254",
      // file:// などホスト名が空のケース
      "",
    ]
  ) {
    assert(isLocalHostname(host), `${JSON.stringify(host)} はローカル扱い`);
  }
});

Deno.test("isLocalHostname: 本番・プレビューのホスト名を false にする", () => {
  for (
    const host of [
      "zeitreises.com",
      "www.zeitreises.com",
      "zeitreise-aop.pages.dev",
      "abc123.zeitreise-aop.pages.dev",
      // 172.x でもプライベート範囲（16〜31）外はローカル扱いしない
      "172.15.0.1",
      "172.32.0.1",
    ]
  ) {
    assert(!isLocalHostname(host), `${JSON.stringify(host)} は本番扱い`);
  }
});

Deno.test("resolvePmtilesUrl: ローカルは同一オリジンパスをそのまま返す", () => {
  assertEquals(
    resolvePmtilesUrl("localhost", BASEMAP_PMTILES_URL),
    BASEMAP_PMTILES_URL,
  );
  assertEquals(
    resolvePmtilesUrl("127.0.0.1", DEM_PMTILES_URL),
    DEM_PMTILES_URL,
  );
});

Deno.test("resolvePmtilesUrl: 本番/プレビューは R2 カスタムドメインの絶対 URL を返す", () => {
  assertEquals(
    resolvePmtilesUrl("zeitreises.com", BASEMAP_PMTILES_URL),
    `${TILES_ORIGIN}${BASEMAP_PMTILES_URL}`,
  );
  assertEquals(
    resolvePmtilesUrl("zeitreise-aop.pages.dev", DEM_PMTILES_URL),
    `${TILES_ORIGIN}${DEM_PMTILES_URL}`,
  );
});

Deno.test("resolveBasemapPmtilesUrl / resolveDemPmtilesUrl は config の定数と整合する（AC #5）", () => {
  // 本番: R2 カスタムドメインを指す
  assertEquals(
    resolveBasemapPmtilesUrl("zeitreises.com"),
    "https://tiles.zeitreises.com/europe.pmtiles",
  );
  assertEquals(
    resolveDemPmtilesUrl("zeitreises.com"),
    "https://tiles.zeitreises.com/europe-dem.pmtiles",
  );
  // ローカル: 従来どおり同一オリジン
  assertEquals(resolveBasemapPmtilesUrl("localhost"), BASEMAP_PMTILES_URL);
  assertEquals(resolveDemPmtilesUrl("localhost"), DEM_PMTILES_URL);
});
