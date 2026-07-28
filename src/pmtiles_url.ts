/**
 * PMTiles URL の本番/ローカル切替（TASK-127）。
 *
 * 本番（Cloudflare Pages: zeitreises.com / *.pages.dev プレビュー）では
 * PMTiles を R2 バケット zeitreise-tiles のカスタムドメイン
 * https://tiles.zeitreises.com から配信し、ローカル開発では従来どおり
 * 同一オリジンの /europe.pmtiles を使う（CORS 制約なし・オフライン可）。
 *
 * 切替は「ビルド時の埋め込み」ではなく location.hostname を入力とする
 * 実行時判定の純粋関数で行う。理由:
 * - 本番・プレビュー・ローカル配信で同一のビルド成果物を使える
 *   （build ジョブが環境変数やシークレットを必要としない。AC #4 と整合）
 * - Pages のプレビュー URL（*.zeitreise-aop.pages.dev）にも同一 artifact が
 *   そのまま配信され、pmtiles は Pages に置かない（25 MiB 制限超過）ため
 *   非ローカルは常に R2 を指すのが正しい
 *
 * CSP の connect-src（scripts/build.ts buildHeadersContent）は TILES_ORIGIN を
 * 参照して許可リストを組み立てるため、配信オリジンの定義はここ 1 箇所とする。
 */

import { BASEMAP_PMTILES_URL, DEM_PMTILES_URL } from "./config.ts";

/** R2 カスタムドメイン（PMTiles 配信オリジン）。末尾スラッシュなし */
export const TILES_ORIGIN = "https://tiles.zeitreises.com";

/** 172.16.0.0/12（プライベート IP）の第 2 オクテット判定を含むプレフィックス */
const PRIVATE_172_RE = /^172\.(1[6-9]|2\d|3[01])\./;

/**
 * ローカル開発とみなすホスト名か（純粋関数）。
 * localhost / *.localhost / ループバック / プライベート IP（LAN 実機確認）/
 * 空文字（file:// 等）を対象にする。これら以外（本番ドメイン・Pages の
 * プレビュードメインを含む）はすべて R2 配信の対象。
 */
export function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "" || h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "0.0.0.0" || h === "::1" || h === "[::1]") return true;
  if (h.startsWith("127.")) return true;
  if (h.startsWith("10.") || h.startsWith("192.168.")) return true;
  if (PRIVATE_172_RE.test(h)) return true;
  return false;
}

/**
 * 同一オリジンパス（例: /europe.pmtiles）を、ホスト名に応じてローカルは
 * そのまま・本番は R2 カスタムドメインの絶対 URL に解決する（純粋関数）。
 */
export function resolvePmtilesUrl(
  hostname: string,
  sameOriginPath: string,
): string {
  return isLocalHostname(hostname)
    ? sameOriginPath
    : `${TILES_ORIGIN}${sameOriginPath}`;
}

/** ベースマップ PMTiles の配信 URL を解決する（AC #5） */
export function resolveBasemapPmtilesUrl(hostname: string): string {
  return resolvePmtilesUrl(hostname, BASEMAP_PMTILES_URL);
}

/** 地形 DEM PMTiles の配信 URL を解決する（AC #5） */
export function resolveDemPmtilesUrl(hostname: string): string {
  return resolvePmtilesUrl(hostname, DEM_PMTILES_URL);
}
