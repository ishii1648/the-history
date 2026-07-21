/**
 * ベースマップ用 europe.pmtiles 生成スクリプト（docs/app-spec.md §2.2）
 *
 * Protomaps の daily build（https://build.protomaps.com/）最新版から、
 * ヨーロッパ bbox（西経25°〜東経60°・北緯34°〜72°）を `pmtiles extract` で
 * 切り出して data/europe.pmtiles を生成する。
 *
 * - bbox はデータパイプライン（scripts/build-data.ts の EUROPE_BBOX）と共有
 * - maxzoom はアプリのズーム上限（src/config.ts の MAX_ZOOM = 8）に合わせる
 * - 生成物はサイズが大きいためコミットしない（.gitignore で除外）
 *
 * 使い方: deno task extract-pmtiles [出力パス]
 * 前提: pmtiles CLI（go-pmtiles）。無ければ `brew install pmtiles` するか
 * https://github.com/protomaps/go-pmtiles/releases からバイナリを取得する。
 *
 * extract の構文（https://docs.protomaps.com/pmtiles/cli 参照）:
 *   pmtiles extract <input> <output> --bbox=min_lon,min_lat,max_lon,max_lat --maxzoom=N
 */

import { MAX_ZOOM } from "../src/config.ts";
import { EUROPE_BBOX } from "./build-data.ts";

/** daily build の一覧 JSON（maps.protomaps.com/builds が参照するメタデータ） */
export const BUILDS_JSON_URL =
  "https://build-metadata.protomaps.dev/builds.json";

/** daily build 配布ファイルのベース URL */
export const BUILD_BASE_URL = "https://build.protomaps.com/";

/** 既定の出力パス（配信時は Cloudflare R2 に配置する想定・コミットしない） */
export const DEFAULT_OUTPUT = "data/europe.pmtiles";

/** アプリが表示に使う最大ズーム。これより深いタイルは抽出しない */
export const BASEMAP_MAX_ZOOM = MAX_ZOOM;

/** builds.json の 1 エントリ（必要なフィールドのみ） */
export interface BuildEntry {
  key: string;
  size?: number;
  uploaded?: string;
  version?: string;
}

/** bbox タプル [西, 南, 東, 北] を pmtiles の --bbox 形式文字列にする（純粋関数） */
export function formatBbox(
  bbox: readonly [number, number, number, number] | readonly number[],
): string {
  return bbox.join(",");
}

/** ヨーロッパ bbox の --bbox 形式文字列（build-data.ts と単一の情報源を共有） */
export const EUROPE_BBOX_STRING = formatBbox(EUROPE_BBOX);

const DAILY_BUILD_KEY = /^\d{8}\.pmtiles$/;

/**
 * builds.json のエントリ一覧から最新の daily build キーを返す（純粋関数）。
 * キーは YYYYMMDD.pmtiles 形式なので辞書順の最大が最新になる。
 */
export function latestBuildKey(builds: readonly BuildEntry[]): string {
  const keys = builds
    .map((b) => b.key)
    .filter((k) => DAILY_BUILD_KEY.test(k))
    .sort();
  const latest = keys.at(-1);
  if (latest === undefined) {
    throw new Error(
      `daily build（YYYYMMDD.pmtiles）が builds 一覧に見つかりません`,
    );
  }
  return latest;
}

/** daily build キーから配布 URL を組み立てる（純粋関数） */
export function buildDownloadUrl(key: string): string {
  if (!DAILY_BUILD_KEY.test(key)) {
    throw new Error(`不正なビルドキーです: ${JSON.stringify(key)}`);
  }
  return `${BUILD_BASE_URL}${key}`;
}

/** pmtiles extract のコマンドライン引数を組み立てる（純粋関数） */
export function buildExtractArgs(
  source: string,
  output: string,
  options: { bbox?: string; maxzoom?: number } = {},
): string[] {
  const { bbox = EUROPE_BBOX_STRING, maxzoom = BASEMAP_MAX_ZOOM } = options;
  return ["extract", source, output, `--bbox=${bbox}`, `--maxzoom=${maxzoom}`];
}

/** pmtiles CLI が PATH にあるか確認する。無ければ導入手順を出して false */
async function ensurePmtilesCli(): Promise<boolean> {
  try {
    const { success } = await new Deno.Command("pmtiles", {
      args: ["--help"],
      stdout: "null",
      stderr: "null",
    }).output();
    return success;
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
    console.error(
      [
        "pmtiles CLI（go-pmtiles）が見つかりません。以下のいずれかで導入してください:",
        "  - macOS: brew install pmtiles",
        "  - その他: https://github.com/protomaps/go-pmtiles/releases からバイナリを取得",
      ].join("\n"),
    );
    return false;
  }
}

/** builds.json を取得して最新 daily build の配布 URL を返す */
async function resolveLatestBuildUrl(): Promise<string> {
  const res = await fetch(BUILDS_JSON_URL);
  if (!res.ok) {
    throw new Error(`builds.json の取得に失敗しました: HTTP ${res.status}`);
  }
  const builds = (await res.json()) as BuildEntry[];
  return buildDownloadUrl(latestBuildKey(builds));
}

async function main(): Promise<number> {
  if (!(await ensurePmtilesCli())) return 1;

  const output = Deno.args[0] ?? DEFAULT_OUTPUT;
  const source = await resolveLatestBuildUrl();
  const args = buildExtractArgs(source, output);

  console.log(`実行: pmtiles ${args.join(" ")}`);
  const { success, code } = await new Deno.Command("pmtiles", {
    args,
    stdout: "inherit",
    stderr: "inherit",
  }).output();
  if (!success) {
    console.error(`pmtiles extract が失敗しました（exit code ${code}）`);
    return code;
  }

  const { size } = await Deno.stat(output);
  console.log(
    `生成完了: ${output}（${(size / 1024 / 1024).toFixed(1)} MB）`,
  );
  return 0;
}

if (import.meta.main) {
  Deno.exit(await main());
}
