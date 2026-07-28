/**
 * ロード性能計測ハーネス（TASK-128、deno task verify:perf で使用）。
 *
 * ヘッドレス CDP（scripts/verify/cdp.ts）経由で以下を無人計測し、gitignore
 * 済みのパス（scripts/verify/checks/.perf-*.json）へ JSON で書き出す:
 *   1. 初期ロード: アプリ操作可能（__getYear が初期年代を返す）までの所要時間・
 *      圧縮後の総転送量（Resource Timing の transferSize 合計）・非圧縮換算
 *      サイズ（decodedBodySize 合計）
 *   2. 年代切替: SNAPSHOT_YEARS の全年代を順に切り替え、1 回あたりの所要時間と
 *      追加転送量（切替前後の Resource Timing 差分）
 *   3. 全年代切替後の JS heap 使用量（performance.memory）
 *
 * 計測はすべてページ内の Resource Timing / performance.memory を evaluate で
 * 読むだけで完結させ、CDP Network ドメインへの依存を増やさない（cdp.ts の
 * CdpApi をそのまま使う）。
 *
 * before/after 比較の使い方:
 *   deno task serve --port 8128 &
 *   PERF_OUT=scripts/verify/checks/.perf-before.json \
 *     deno task verify:perf http://localhost:8128/
 *   （変更を適用して再ビルド）
 *   PERF_OUT=scripts/verify/checks/.perf-after.json \
 *     deno task verify:perf http://localhost:8128/
 *   PERF_OUT 未指定時は UTC タイムスタンプ付きファイル名で出力する。
 */
import type { CdpApi } from "../cdp.ts";
import { INITIAL_YEAR, SNAPSHOT_YEARS } from "../../../src/config.ts";

// ---- 純ロジック（perf_test.ts でユニットテストする関数群） ----

/** Resource Timing エントリのうち転送量計測に使うフィールド。 */
export interface ResourceSizes {
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
}

/** リソース群の転送量サマリ。 */
export interface ResourceSummary {
  count: number;
  /** ヘッダ込みの実転送バイト数（圧縮後）。 */
  transferBytes: number;
  /** 圧縮後の body バイト数。 */
  encodedBodyBytes: number;
  /** 非圧縮換算の body バイト数。 */
  decodedBodyBytes: number;
}

/** Resource Timing エントリ群の転送量を合算する（欠損フィールドは 0 扱い）。 */
export function summarizeResources(
  entries: readonly ResourceSizes[],
): ResourceSummary {
  const summary: ResourceSummary = {
    count: entries.length,
    transferBytes: 0,
    encodedBodyBytes: 0,
    decodedBodyBytes: 0,
  };
  for (const e of entries) {
    summary.transferBytes += e.transferSize ?? 0;
    summary.encodedBodyBytes += e.encodedBodySize ?? 0;
    summary.decodedBodyBytes += e.decodedBodySize ?? 0;
  }
  return summary;
}

/**
 * 年代切替の巡回対象を返す。初期表示済みの年代だけを除いた全スナップショット
 * 年代（昇順のまま）。初期年代を含めると 2 回目の表示（キャッシュヒット）が
 * 混ざり「1 回あたりの追加転送量」の計測を汚すため除外する。
 */
export function yearsToCycle(
  snapshotYears: readonly number[],
  initialYear: number,
): number[] {
  return snapshotYears.filter((y) => y !== initialYear);
}

/** 年代切替 1 回分の計測値。 */
export interface YearSwitchMetrics {
  durationMs: number;
  transferBytes: number;
  decodedBodyBytes: number;
}

/** 年代切替計測の平均（1 回あたり）を返す。空なら null。 */
export function averageYearSwitch(
  switches: readonly YearSwitchMetrics[],
): YearSwitchMetrics | null {
  if (switches.length === 0) return null;
  const avg = (f: (s: YearSwitchMetrics) => number) =>
    Math.round(switches.reduce((sum, s) => sum + f(s), 0) / switches.length);
  return {
    durationMs: avg((s) => s.durationMs),
    transferBytes: avg((s) => s.transferBytes),
    decodedBodyBytes: avg((s) => s.decodedBodyBytes),
  };
}

/**
 * 計測結果 JSON の出力先を決める。環境変数 PERF_OUT があればそれを、無ければ
 * UTC タイムスタンプ付きの既定パスを返す。既定パスは .gitignore の
 * `scripts/verify/checks/.perf-*.json` に一致し、リポジトリにコミットされない。
 */
export function resolveOutPath(
  getEnv: (key: string) => string | undefined,
  now: Date,
): string {
  const override = getEnv("PERF_OUT");
  if (override) return override;
  const stamp = now.toISOString().replace(/\.\d+Z$/, "Z").replaceAll(
    /[-:]/g,
    "",
  );
  return `scripts/verify/checks/.perf-${stamp}.json`;
}

// ---- ブラウザ内評価式 ----

/** Resource Timing の件数（切替前後の差分計測に使う）。 */
const RESOURCE_COUNT_EXPR = 'performance.getEntriesByType("resource").length';

/** index 以降の Resource Timing エントリを転送量フィールドだけ抜き出す式。 */
function resourceSliceExpr(from: number): string {
  return `performance.getEntriesByType("resource").slice(${from})` +
    ".map((e) => ({ transferSize: e.transferSize, " +
    "encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize }))";
}

/** Navigation Timing（ドキュメント自身の転送量・ロードイベント時刻）。 */
const NAVIGATION_EXPR = "(() => {" +
  'const n = performance.getEntriesByType("navigation")[0];' +
  "return n ? { transferSize: n.transferSize, " +
  "encodedBodySize: n.encodedBodySize, decodedBodySize: n.decodedBodySize, " +
  "domContentLoadedEventEnd: n.domContentLoadedEventEnd, " +
  "loadEventEnd: n.loadEventEnd } : null;" +
  "})()";

/** JS heap 使用量（Chrome 固有の performance.memory。無ければ null）。 */
const JS_HEAP_EXPR = "(() => {" +
  "const m = performance.memory;" +
  "return m ? { usedJSHeapSize: m.usedJSHeapSize, " +
  "totalJSHeapSize: m.totalJSHeapSize, jsHeapSizeLimit: m.jsHeapSizeLimit } " +
  ": null;" +
  "})()";

/**
 * ネットワーク完了時刻（navigation 起点の ms）。ドキュメントの loadEventEnd と
 * 全リソースの responseEnd の最大値で、ポーリング粒度に依存しない精密な
 * 「初期ロード完了までの所要時間」として使う。
 */
const NETWORK_QUIET_MS_EXPR = "(() => {" +
  'const nav = performance.getEntriesByType("navigation")[0];' +
  'const ends = performance.getEntriesByType("resource")' +
  ".map((e) => e.responseEnd);" +
  "return Math.max(nav ? nav.loadEventEnd : 0, 0, ...ends);" +
  "})()";

/**
 * アプリの初期ロードが進行した状態。__getYear の存在（バンドル実行済み）に
 * 加え、ローディングスピナーが非表示（初期年代データのロード完了）かつ
 * リソースが最低限フェッチ済みであることを見る。スピナーは HTML 初期状態でも
 * hidden のため、単体では「ロード開始前」と区別できない（リソース数の下限と
 * 後段のネットワーク静止判定で補う）。
 */
const READY_MIN_RESOURCES = 6;
const READY_EXPR = "window.__getYear && " +
  'document.getElementById("loading-spinner")?.hidden === true && ' +
  `performance.getEntriesByType("resource").length >= ${READY_MIN_RESOURCES}`;

/** api.waitFor（500ms 間隔）より細かい 100ms 間隔のポーリング待機。 */
async function waitUntil(
  api: CdpApi,
  expr: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await api.evaluate<boolean>(`Boolean(${expr})`)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`waitUntil timed out after ${timeoutMs}ms: ${expr}`);
}

/**
 * ネットワーク静止（Resource Timing の件数が idlePolls 回連続で不変）まで
 * 待つ。スピナー消灯後に遅れて届くフォント・ラベル等の取りこぼしを防ぐ。
 */
async function waitForNetworkIdle(
  api: CdpApi,
  { pollMs = 200, idlePolls = 5, timeoutMs = 30_000 } = {},
): Promise<void> {
  const start = Date.now();
  let last = -1;
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    const count = await api.evaluate<number>(RESOURCE_COUNT_EXPR);
    stable = count === last ? stable + 1 : 0;
    last = count;
    if (stable >= idlePolls) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(`waitForNetworkIdle timed out after ${timeoutMs}ms`);
}

const SETTLE_MS = 500;

// ---- 本体 ----

export async function run(api: CdpApi): Promise<void> {
  // cdp.ts の CLI が既に 1 度 navigate 済みなので、そこから origin を得て
  // 計測用に再 navigate する（タイムラインを 0 から取り直すため）。
  const origin = await api.evaluate<string>("location.origin");
  const url = `${origin}/`;

  // CLI の 1 回目の navigate で温まった HTTP キャッシュを無効化してから
  // 再 navigate する（有効なままだと 304 revalidation だらけになり、
  // コールドロードの転送量を測れない）。
  await api.setCacheDisabled(true);

  // 1. 初期ロード
  const t0 = Date.now();
  await api.navigate(url);
  // Resource Timing のバッファ既定値（250 件）を超えて年代を巡回しても
  // エントリが落ちないよう先に広げる。
  await api.evaluate("performance.setResourceTimingBufferSize(100000)");
  await waitUntil(api, READY_EXPR, 60_000);
  const appReadyMs = Date.now() - t0;
  await waitForNetworkIdle(api);

  const navigation = await api.evaluate<
    | {
      transferSize: number;
      encodedBodySize: number;
      decodedBodySize: number;
      domContentLoadedEventEnd: number;
      loadEventEnd: number;
    }
    | null
  >(NAVIGATION_EXPR);
  const initialEntries = await api.evaluate<ResourceSizes[]>(
    resourceSliceExpr(0),
  );
  const initialResources = summarizeResources(initialEntries);
  const networkQuietMs = Math.round(
    await api.evaluate<number>(NETWORK_QUIET_MS_EXPR),
  );
  const initialLoad = {
    /** navigate 開始から操作可能（スピナー消灯）までの実測時間（粒度 100ms） */
    appReadyMs,
    /** navigation 起点で最後のリソース受信が完了した時刻（精密値） */
    networkQuietMs,
    navigation,
    resources: initialResources,
    /** ドキュメント + 全リソースの実転送量（圧縮後・ヘッダ込み） */
    totalTransferBytes: (navigation?.transferSize ?? 0) +
      initialResources.transferBytes,
    /** 非圧縮換算の合計サイズ */
    totalDecodedBytes: (navigation?.decodedBodySize ?? 0) +
      initialResources.decodedBodyBytes,
  };

  // 2. 年代切替（全年代を順に巡回し、1 回ごとに所要時間と追加転送量を計測）
  const yearSwitches: Array<
    YearSwitchMetrics & { year: number; resourceCount: number }
  > = [];
  for (const year of yearsToCycle(SNAPSHOT_YEARS, INITIAL_YEAR)) {
    const before = await api.evaluate<number>(RESOURCE_COUNT_EXPR);
    const start = Date.now();
    await api.evaluate(`window.__setYear(${year})`);
    await waitUntil(api, `window.__getYear() === ${year}`, 30_000);
    const durationMs = Date.now() - start;
    await new Promise((r) => setTimeout(r, SETTLE_MS));
    const entries = await api.evaluate<ResourceSizes[]>(
      resourceSliceExpr(before),
    );
    const summary = summarizeResources(entries);
    yearSwitches.push({
      year,
      durationMs,
      transferBytes: summary.transferBytes,
      decodedBodyBytes: summary.decodedBodyBytes,
      resourceCount: summary.count,
    });
  }

  // 3. 全年代切替後の JS heap
  const jsHeap = await api.evaluate<
    | {
      usedJSHeapSize: number;
      totalJSHeapSize: number;
      jsHeapSizeLimit: number;
    }
    | null
  >(JS_HEAP_EXPR);

  const report = {
    meta: {
      url,
      timestamp: new Date().toISOString(),
      userAgent: await api.evaluate<string>("navigator.userAgent"),
      initialYear: INITIAL_YEAR,
      cycledYears: yearsToCycle(SNAPSHOT_YEARS, INITIAL_YEAR),
    },
    initialLoad,
    yearSwitches,
    yearSwitchAverage: averageYearSwitch(yearSwitches),
    jsHeap,
  };

  const outPath = resolveOutPath((k) => Deno.env.get(k), new Date());
  await Deno.writeTextFile(outPath, JSON.stringify(report, null, 2) + "\n");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\n[PERF] wrote ${outPath}`);
}
