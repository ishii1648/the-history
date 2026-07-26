/**
 * ヘッドレス Chrome + CDP（Chrome DevTools Protocol）による動作確認ハーネス。
 *
 * claude-in-chrome 拡張（可視ウィンドウ必須・ツール呼び出し毎に人間の承認確認
 * = HITL が発生する）に代わり、agent-loop の自律実行中に無人で動作確認を
 * 完結させるための標準手段。実 GPU の `--headless=new` で描画・requestAnimationFrame
 * が動作し、任意 JS 評価・座標指定クリック・キー入力・スクリーンショットを行える。
 *
 * 使い方（ライブラリとして）:
 *   import { DEFAULT_APP_URL, launch } from "./cdp.ts";
 *   const api = await launch();
 *   await api.navigate(DEFAULT_APP_URL);  // dev サーバの既定ポートに追従する
 *   await api.waitForAppReady();
 *   ...
 *   await api.close();
 *
 * 使い方（CLI として）:
 *   deno run -A scripts/verify/cdp.ts <url> <checkScript.ts>
 *   引数順は任意（http(s):// で始まる引数を URL、それ以外を checkScript と
 *   みなす）。標準スモークは `deno task verify:smoke <url>` で起動できる
 *   （checkScript は deno.json のタスク定義に含まれる）。
 *   checkScript.ts は `export async function run(api: CdpApi) { ... }` を
 *   export する。
 *
 * 制約（ヘッドレス検証で踏んだ落とし穴）:
 * - `document.visibilityState` に依存する分岐がある場合、ヘッドレスでも
 *   "visible" 扱いになるとは限らないため、可視性に依存しないロジックを使うこと。
 * - 実 GPU 描画のために `--disable-gpu` は付けない（付けると canvas が
 *   描画されない・スクリーンショットが真っ黒になる等の問題が起きる）。
 * - `window.__getYear()` はアプリの初期化完了前は初期値を返すレースが
 *   ある。`waitFor` で目的の値になるまで明示的に待つこと
 *   （`waitForAppReady` だけでは「関数が存在する」ことしか保証しない）。
 */

import { isAbsolute, join, toFileUrl } from "@std/path";
import { DEFAULT_PORT } from "../serve.ts";

/**
 * `deno task serve` が既定で配信する URL。ポート番号の定義元は
 * scripts/serve.ts の {@linkcode DEFAULT_PORT} 1 箇所とし、ここでは
 * リテラルを書かない（かつて 8011 と書かれてドリフトしていた: TASK-89）。
 */
export const DEFAULT_APP_URL = `http://localhost:${DEFAULT_PORT}/`;

const DEFAULT_CHROME_BIN =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Chrome バイナリパスを返す。環境変数 CHROME_BIN で上書きできる。 */
function resolveChromeBin(): string {
  return Deno.env.get("CHROME_BIN") ?? DEFAULT_CHROME_BIN;
}

export interface CdpApi {
  navigate(url: string): Promise<void>;
  evaluate<T = unknown>(expr: string): Promise<T>;
  waitFor(expr: string, timeoutMs?: number): Promise<void>;
  waitForAppReady(timeoutMs?: number): Promise<void>;
  click(x: number, y: number): Promise<void>;
  keys(key: string, count?: number): Promise<void>;
  screenshot(path: string): Promise<void>;
  close(): Promise<void>;
}

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

interface CdpTarget {
  type?: string;
  webSocketDebuggerUrl?: string;
}

interface EvaluateResult {
  result?: { value?: unknown };
  exceptionDetails?: {
    text?: string;
    exception?: { description?: string };
  };
}

// ---- 純ロジック（プロセス起動に依存せずユニットテスト可能な関数群） ----

/**
 * `/json/list` のターゲット一覧から、接続すべきページターゲットの
 * webSocketDebuggerUrl を選ぶ（type=page かつ webSocketDebuggerUrl を持つ
 * 最初のもの）。該当が無ければ例外を投げる。
 */
export function pickPageTargetUrl(targets: CdpTarget[]): string {
  const target = targets.find((t) =>
    t.type === "page" && t.webSocketDebuggerUrl
  );
  if (!target?.webSocketDebuggerUrl) {
    throw new Error("No page target with webSocketDebuggerUrl found");
  }
  return target.webSocketDebuggerUrl;
}

/**
 * `Runtime.evaluate` のレスポンスから評価結果の値を取り出す。
 * 例外が発生していれば description（無ければ text）で Error を投げる。
 */
export function parseEvaluateResult<T = unknown>(
  res: { result?: EvaluateResult },
): T {
  const result = res.result as EvaluateResult ?? {};
  if (result.exceptionDetails) {
    const desc = result.exceptionDetails.exception?.description ??
      result.exceptionDetails.text ?? "unknown evaluation error";
    throw new Error(`evaluate() threw: ${desc}`);
  }
  return result.result?.value as T;
}

// キー入力で使う最小のキーコード表（検証スクリプトで必要なキーのみ）。
const KEY_CODES: Record<string, { keyCode: number; code: string }> = {
  ArrowDown: { keyCode: 40, code: "ArrowDown" },
  ArrowUp: { keyCode: 38, code: "ArrowUp" },
  ArrowLeft: { keyCode: 37, code: "ArrowLeft" },
  ArrowRight: { keyCode: 39, code: "ArrowRight" },
  Enter: { keyCode: 13, code: "Enter" },
  Tab: { keyCode: 9, code: "Tab" },
  Escape: { keyCode: 27, code: "Escape" },
};

/** キー名から keyCode/code を解決する。未対応キーは例外を投げる。 */
export function resolveKeyCode(
  key: string,
): { keyCode: number; code: string } {
  const mapped = KEY_CODES[key];
  if (!mapped) {
    throw new Error(`keys(): unsupported key "${key}"`);
  }
  return mapped;
}

/** waitFor に渡す式を `Boolean(...)` でラップする（真偽値化）。 */
export function buildWaitForExpr(expr: string): string {
  return `Boolean(${expr})`;
}

/** send() のデフォルトタイムアウト。呼び出し側の waitFor（10〜30s、1 回の
 * evaluate は即応答想定）と干渉しないよう、単発コマンドの応答としては十分
 * 長い 30s とする。 */
export const DEFAULT_SEND_TIMEOUT_MS = 30_000;

export interface CdpSession {
  /** CDP コマンドを送信する。応答・エラー応答・切断・タイムアウトのいずれかで
   * 必ず settle する（永久 pending にならない）。 */
  send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<CdpMessage>;
  /** 指定イベントの初回発火を待つ。切断時は reject される。 */
  once(method: string): Promise<unknown>;
  /** WebSocket の onmessage から生メッセージを渡す。 */
  handleMessage(data: string): void;
  /** WebSocket の onerror/onclose・プロセス死亡時に呼ぶ。pending の send と
   * once 待機を全て reject し、以降の send を即 reject にする。 */
  handleDisconnect(reason: string): void;
}

/**
 * CDP メッセージの送受信セッションを作る。WebSocket 実体から切り離してあり、
 * rawSend（送信関数）と handleMessage/handleDisconnect の呼び出しだけで
 * 動くため、プロセス起動なしでユニットテストできる。
 *
 * 信頼性の保証（TASK-62）:
 * - handleDisconnect() で pending の全 send / once 待機が reject される
 *   （Chrome プロセス死亡・WebSocket 切断で無期限ブロックしない）。
 * - 各 send にタイムアウト（既定 30s）を設け、応答が来ない場合も reject する。
 */
export function createCdpSession(
  rawSend: (data: string) => void,
  opts: { sendTimeoutMs?: number } = {},
): CdpSession {
  const sendTimeoutMs = opts.sendTimeoutMs ?? DEFAULT_SEND_TIMEOUT_MS;
  let nextId = 1;
  let disconnectedReason: string | null = null;
  const pending = new Map<
    number,
    { resolve: (v: CdpMessage) => void; reject: (e: Error) => void }
  >();
  const timers = new Map<number, number>();
  const eventListeners = new Map<string, Array<(params: unknown) => void>>();
  const onceRejecters = new Set<(e: Error) => void>();

  function settle(id: number): void {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
    pending.delete(id);
  }

  function handleMessage(data: string): void {
    const msg = JSON.parse(data) as CdpMessage;
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (p) {
        settle(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error.message));
        } else {
          p.resolve(msg);
        }
      }
    } else if (msg.method) {
      const listeners = eventListeners.get(msg.method);
      if (listeners) {
        for (const l of [...listeners]) l(msg.params);
      }
    }
  }

  function handleDisconnect(reason: string): void {
    if (disconnectedReason !== null) return;
    disconnectedReason = reason;
    const err = new Error(`CDP connection lost (${reason})`);
    for (const [id, p] of [...pending]) {
      settle(id);
      p.reject(err);
    }
    for (const reject of [...onceRejecters]) reject(err);
    onceRejecters.clear();
    eventListeners.clear();
  }

  function send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<CdpMessage> {
    if (disconnectedReason !== null) {
      return Promise.reject(
        new Error(
          `CDP connection lost (${disconnectedReason}): cannot send ${method}`,
        ),
      );
    }
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      timers.set(
        id,
        setTimeout(() => {
          settle(id);
          reject(
            new Error(`CDP send timed out after ${sendTimeoutMs}ms: ${method}`),
          );
        }, sendTimeoutMs),
      );
      try {
        rawSend(JSON.stringify({ id, method, params }));
      } catch (e) {
        settle(id);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    });
  }

  function once(method: string): Promise<unknown> {
    if (disconnectedReason !== null) {
      return Promise.reject(
        new Error(
          `CDP connection lost (${disconnectedReason}): cannot wait for ${method}`,
        ),
      );
    }
    return new Promise((resolve, reject) => {
      const handler = (params: unknown) => {
        const arr = eventListeners.get(method);
        const idx = arr?.indexOf(handler) ?? -1;
        if (arr && idx >= 0) arr.splice(idx, 1);
        onceRejecters.delete(reject);
        resolve(params);
      };
      if (!eventListeners.has(method)) eventListeners.set(method, []);
      eventListeners.get(method)!.push(handler);
      onceRejecters.add(reject);
    });
  }

  return { send, once, handleMessage, handleDisconnect };
}

const CLI_USAGE =
  "Usage: deno run -A scripts/verify/cdp.ts <url> <checkScript.ts>\n" +
  "  (引数順は任意。http(s):// で始まる引数を URL、それ以外を checkScript と\n" +
  "   みなす。標準スモークは `deno task verify:smoke <url>`)";

/**
 * CLI 引数から url と checkScript パスを解決する。順不同で受け付ける
 * （`deno task verify:smoke <url>` はタスク定義の checkScript の後ろに URL が
 * 付くため）。重複する余分な引数は無視する。どちらかが欠ければ usage を含む
 * 例外を投げる。
 */
export function parseCliArgs(
  args: string[],
): { url: string; checkScriptPath: string } {
  const url = args.find((a) => /^https?:\/\//.test(a));
  const checkScriptPath = args.find((a) => !/^https?:\/\//.test(a));
  if (!url || !checkScriptPath) {
    throw new Error(CLI_USAGE);
  }
  return { url, checkScriptPath };
}

/**
 * checkScript のパスを dynamic import 可能な file:// URL 文字列にする。
 * 素朴な文字列連結ではなく `toFileUrl` を使うことで、空白等を含むパスでも
 * 正しくパーセントエンコードされる。
 */
export function resolveCheckScriptUrl(
  path: string,
  cwd: string = Deno.cwd(),
): string {
  const absolute = isAbsolute(path) ? path : join(cwd, path);
  return toFileUrl(absolute).href;
}

// ---- プロセス起動・CDP 通信（副作用あり） ----

function findFreePort(): Promise<number> {
  const listener = Deno.listen({ port: 0 });
  const port = (listener.addr as Deno.NetAddr).port;
  listener.close();
  return Promise.resolve(port);
}

async function waitForCdpReady(
  port: number,
  timeoutMs = 15000,
): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://localhost:${port}/json/version`);
      if (res.ok) {
        await res.body?.cancel();
        return;
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`CDP endpoint not ready on port ${port}: ${lastErr}`);
}

export async function launch(): Promise<CdpApi> {
  const port = await findFreePort();
  const userDataDir = await Deno.makeTempDir({ prefix: "cdp-verify-" });

  const cmd = new Deno.Command(resolveChromeBin(), {
    args: [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      "--window-size=1600,900",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    stdout: "null",
    stderr: "null",
  });
  const process = cmd.spawn();

  await waitForCdpReady(port);

  const listRes = await fetch(`http://localhost:${port}/json/list`);
  const targets = await listRes.json() as CdpTarget[];
  const wsUrl = pickPageTargetUrl(targets);

  const ws = new WebSocket(wsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = (e) => reject(e);
  });

  // send() が永久 pending にならないよう、切断（onerror/onclose・Chrome
  // プロセス死亡による WebSocket close）とタイムアウトで必ず reject する
  // セッションに委譲する（TASK-62）。
  const session = createCdpSession((data) => ws.send(data));
  ws.onmessage = (ev) => session.handleMessage(String(ev.data));
  ws.onerror = () => session.handleDisconnect("WebSocket error");
  ws.onclose = () => session.handleDisconnect("WebSocket closed");
  const { send, once } = session;

  await send("Page.enable");
  await send("Runtime.enable");

  async function navigate(url: string): Promise<void> {
    const loaded = once("Page.loadEventFired");
    await send("Page.navigate", { url });
    await loaded;
  }

  async function evaluate<T = unknown>(expr: string): Promise<T> {
    const res = await send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: true,
    });
    return parseEvaluateResult<T>(res);
  }

  async function waitFor(expr: string, timeoutMs = 10000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const ok = await evaluate<boolean>(buildWaitForExpr(expr));
      if (ok) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`waitFor timed out after ${timeoutMs}ms: ${expr}`);
  }

  async function waitForAppReady(timeoutMs = 30000): Promise<void> {
    await waitFor(
      "window.__getYear && document.querySelector('.loading-spinner')?.hidden !== false",
      timeoutMs,
    );
  }

  async function click(x: number, y: number): Promise<void> {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
    await send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x,
      y,
      button: "left",
      clickCount: 1,
    });
  }

  async function keys(key: string, count = 1): Promise<void> {
    const mapped = resolveKeyCode(key);
    for (let i = 0; i < count; i++) {
      await send("Input.dispatchKeyEvent", {
        type: "rawKeyDown",
        key,
        code: mapped.code,
        windowsVirtualKeyCode: mapped.keyCode,
        nativeVirtualKeyCode: mapped.keyCode,
      });
      await send("Input.dispatchKeyEvent", {
        type: "keyUp",
        key,
        code: mapped.code,
        windowsVirtualKeyCode: mapped.keyCode,
        nativeVirtualKeyCode: mapped.keyCode,
      });
    }
  }

  async function screenshot(path: string): Promise<void> {
    const res = await send("Page.captureScreenshot", { format: "png" });
    const data = (res.result as { data: string }).data;
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    await Deno.writeFile(path, bytes);
  }

  async function close(): Promise<void> {
    try {
      ws.close();
    } catch {
      // ignore
    }
    try {
      process.kill("SIGTERM");
    } catch {
      // ignore
    }
    try {
      await process.status;
    } catch {
      // ignore
    }
    try {
      await Deno.remove(userDataDir, { recursive: true });
    } catch {
      // ignore
    }
  }

  return {
    navigate,
    evaluate,
    waitFor,
    waitForAppReady,
    click,
    keys,
    screenshot,
    close,
  };
}

// ---- CLI エントリポイント ----
if (import.meta.main) {
  let cli: { url: string; checkScriptPath: string };
  try {
    cli = parseCliArgs(Deno.args);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    Deno.exit(1);
  }
  const { url, checkScriptPath } = cli;
  const mod = await import(resolveCheckScriptUrl(checkScriptPath));
  if (typeof mod.run !== "function") {
    console.error(`checkScript must export an async function run(api)`);
    Deno.exit(1);
  }
  const api = await launch();
  try {
    await api.navigate(url);
    await mod.run(api);
  } finally {
    await api.close();
  }
}
