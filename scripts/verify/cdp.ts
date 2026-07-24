/**
 * ヘッドレス Chrome + CDP（Chrome DevTools Protocol）による動作確認ハーネス。
 *
 * claude-in-chrome 拡張（可視ウィンドウ必須・ツール呼び出し毎に人間の承認確認
 * = HITL が発生する）に代わり、agent-loop の自律実行中に無人で動作確認を
 * 完結させるための標準手段。実 GPU の `--headless=new` で描画・requestAnimationFrame
 * が動作し、任意 JS 評価・座標指定クリック・キー入力・スクリーンショットを行える。
 *
 * 使い方（ライブラリとして）:
 *   import { launch } from "./cdp.ts";
 *   const api = await launch();
 *   await api.navigate("http://localhost:8011/");
 *   await api.waitForAppReady();
 *   ...
 *   await api.close();
 *
 * 使い方（CLI として）:
 *   deno run -A scripts/verify/cdp.ts <url> <checkScript.ts>
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

  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: CdpMessage) => void; reject: (e: Error) => void }
  >();
  const eventListeners = new Map<string, Array<(params: unknown) => void>>();

  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as CdpMessage;
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (p) {
        pending.delete(msg.id);
        if (msg.error) {
          p.reject(new Error(msg.error.message));
        } else {
          p.resolve(msg);
        }
      }
    } else if (msg.method) {
      const listeners = eventListeners.get(msg.method);
      if (listeners) {
        for (const l of listeners) l(msg.params);
      }
    }
  };

  function send(
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<CdpMessage> {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  function once(method: string): Promise<unknown> {
    return new Promise((resolve) => {
      const handler = (params: unknown) => {
        const arr = eventListeners.get(method)!;
        const idx = arr.indexOf(handler);
        if (idx >= 0) arr.splice(idx, 1);
        resolve(params);
      };
      if (!eventListeners.has(method)) eventListeners.set(method, []);
      eventListeners.get(method)!.push(handler);
    });
  }

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
  const [url, checkScriptPath] = Deno.args;
  if (!url || !checkScriptPath) {
    console.error(
      "Usage: deno run -A scripts/verify/cdp.ts <url> <checkScript.ts>",
    );
    Deno.exit(1);
  }
  const mod = await import(
    (checkScriptPath.startsWith("/")
      ? "file://"
      : "file://" + Deno.cwd() + "/") +
      checkScriptPath.replace(/^\.\//, "")
  );
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
