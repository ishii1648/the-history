import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { DEFAULT_PORT } from "../serve.ts";
import {
  buildWaitForExpr,
  createCdpSession,
  DEFAULT_APP_URL,
  parseCliArgs,
  parseEvaluateResult,
  pickPageTargetUrl,
  resolveCheckScriptUrl,
  resolveKeyCode,
} from "./cdp.ts";

Deno.test("DEFAULT_APP_URL は dev サーバの既定ポート（scripts/serve.ts の DEFAULT_PORT）に追従する", () => {
  assertEquals(DEFAULT_APP_URL, `http://localhost:${DEFAULT_PORT}/`);
});

Deno.test("pickPageTargetUrl は type=page かつ webSocketDebuggerUrl を持つ最初のターゲットの URL を返す", () => {
  const targets = [
    { type: "background_page", webSocketDebuggerUrl: "ws://bg" },
    { type: "page", webSocketDebuggerUrl: "ws://page1" },
    { type: "page", webSocketDebuggerUrl: "ws://page2" },
  ];
  assertEquals(pickPageTargetUrl(targets), "ws://page1");
});

Deno.test("pickPageTargetUrl は type=page が webSocketDebuggerUrl を持たない場合スキップする", () => {
  const targets = [
    { type: "page" },
    { type: "page", webSocketDebuggerUrl: "ws://page2" },
  ];
  assertEquals(pickPageTargetUrl(targets), "ws://page2");
});

Deno.test("pickPageTargetUrl は該当ターゲットがなければ例外を投げる", () => {
  assertThrows(
    () => pickPageTargetUrl([{ type: "background_page" }]),
    Error,
    "No page target with webSocketDebuggerUrl found",
  );
});

Deno.test("parseEvaluateResult は正常時に result.value を返す", () => {
  const value = parseEvaluateResult<number>({
    result: { result: { value: 42 } },
  });
  assertEquals(value, 42);
});

Deno.test("parseEvaluateResult は exceptionDetails があれば例外の description で Error を投げる", () => {
  assertThrows(
    () =>
      parseEvaluateResult({
        result: {
          exceptionDetails: {
            exception: { description: "ReferenceError: foo is not defined" },
          },
        },
      }),
    Error,
    "ReferenceError: foo is not defined",
  );
});

Deno.test("parseEvaluateResult は description が無い場合 text にフォールバックする", () => {
  assertThrows(
    () =>
      parseEvaluateResult({
        result: {
          exceptionDetails: { text: "Uncaught exception" },
        },
      }),
    Error,
    "Uncaught exception",
  );
});

Deno.test("resolveKeyCode は既知のキーの keyCode/code を返す", () => {
  assertEquals(resolveKeyCode("ArrowDown"), { keyCode: 40, code: "ArrowDown" });
  assertEquals(resolveKeyCode("Enter"), { keyCode: 13, code: "Enter" });
});

Deno.test("resolveKeyCode は未対応キーで例外を投げる", () => {
  assertThrows(
    () => resolveKeyCode("F1"),
    Error,
    'keys(): unsupported key "F1"',
  );
});

Deno.test("buildWaitForExpr は式を Boolean(...) でラップする", () => {
  assertEquals(
    buildWaitForExpr("window.__getYear() === 1500"),
    "Boolean(window.__getYear() === 1500)",
  );
});

// ---- createCdpSession（send の reject 保証） ----

Deno.test("createCdpSession: 応答が来れば send は resolve する", async () => {
  const sent: string[] = [];
  const session = createCdpSession((data) => sent.push(data));
  const p = session.send("Page.enable");
  const { id } = JSON.parse(sent[0]) as { id: number };
  session.handleMessage(JSON.stringify({ id, result: { ok: true } }));
  const msg = await p;
  assertEquals(msg.id, id);
  assertEquals(msg.result, { ok: true });
});

Deno.test("createCdpSession: CDP エラー応答は reject される", async () => {
  const sent: string[] = [];
  const session = createCdpSession((data) => sent.push(data));
  const p = session.send("Runtime.evaluate");
  const { id } = JSON.parse(sent[0]) as { id: number };
  session.handleMessage(
    JSON.stringify({ id, error: { message: "Invalid expression" } }),
  );
  await assertRejects(() => p, Error, "Invalid expression");
});

Deno.test("createCdpSession: 切断時に pending の send が全て reject される", async () => {
  const session = createCdpSession(() => {});
  const p1 = session.send("Runtime.evaluate");
  const p2 = session.send("Page.captureScreenshot");
  session.handleDisconnect("WebSocket closed");
  await assertRejects(() => p1, Error, "CDP connection lost");
  await assertRejects(() => p2, Error, "CDP connection lost");
});

Deno.test("createCdpSession: 切断後の send は即 reject される", async () => {
  const session = createCdpSession(() => {});
  session.handleDisconnect("WebSocket error");
  await assertRejects(
    () => session.send("Page.enable"),
    Error,
    "CDP connection lost",
  );
});

Deno.test("createCdpSession: 応答が無ければ sendTimeoutMs で reject される", async () => {
  const session = createCdpSession(() => {}, { sendTimeoutMs: 20 });
  await assertRejects(
    () => session.send("Page.enable"),
    Error,
    "timed out",
  );
});

Deno.test("createCdpSession: once はイベント受信で resolve する", async () => {
  const session = createCdpSession(() => {});
  const p = session.once("Page.loadEventFired");
  session.handleMessage(
    JSON.stringify({ method: "Page.loadEventFired", params: { ts: 1 } }),
  );
  assertEquals(await p, { ts: 1 });
});

Deno.test("createCdpSession: 切断時に once の待機も reject される", async () => {
  const session = createCdpSession(() => {});
  const p = session.once("Page.loadEventFired");
  session.handleDisconnect("process exited");
  await assertRejects(() => p, Error, "CDP connection lost");
});

// ---- parseCliArgs（CLI 引数解決） ----

Deno.test("parseCliArgs: <url> <checkScript> の順で解決する", () => {
  assertEquals(
    parseCliArgs(["http://localhost:8000/", "scripts/verify/checks/smoke.ts"]),
    {
      url: "http://localhost:8000/",
      checkScriptPath: "scripts/verify/checks/smoke.ts",
    },
  );
});

Deno.test("parseCliArgs: <checkScript> <url> の順（deno task で URL が末尾に付く形）でも解決する", () => {
  assertEquals(
    parseCliArgs(["scripts/verify/checks/smoke.ts", "https://example.com/"]),
    {
      url: "https://example.com/",
      checkScriptPath: "scripts/verify/checks/smoke.ts",
    },
  );
});

Deno.test("parseCliArgs: 余分な重複引数は無視する（旧スタイル呼び出しの互換）", () => {
  assertEquals(
    parseCliArgs([
      "scripts/verify/checks/smoke.ts",
      "http://localhost:8000/",
      "scripts/verify/checks/smoke.ts",
    ]),
    {
      url: "http://localhost:8000/",
      checkScriptPath: "scripts/verify/checks/smoke.ts",
    },
  );
});

Deno.test("parseCliArgs: URL が無ければ usage エラーを投げる", () => {
  assertThrows(
    () => parseCliArgs(["scripts/verify/checks/smoke.ts"]),
    Error,
    "Usage:",
  );
});

Deno.test("parseCliArgs: checkScript が無ければ usage エラーを投げる", () => {
  assertThrows(
    () => parseCliArgs(["http://localhost:8000/"]),
    Error,
    "Usage:",
  );
});

// ---- resolveCheckScriptUrl（file:// URL 化） ----

Deno.test("resolveCheckScriptUrl: 相対パスを cwd 基準の file:// URL にする", () => {
  assertEquals(
    resolveCheckScriptUrl("checks/smoke.ts", "/repo"),
    "file:///repo/checks/smoke.ts",
  );
});

Deno.test("resolveCheckScriptUrl: ./ 始まりの相対パスも解決する", () => {
  assertEquals(
    resolveCheckScriptUrl("./checks/smoke.ts", "/repo"),
    "file:///repo/checks/smoke.ts",
  );
});

Deno.test("resolveCheckScriptUrl: 空白を含むパスをパーセントエンコードする", () => {
  assertEquals(
    resolveCheckScriptUrl("my checks/smoke test.ts", "/tmp/dir with space"),
    "file:///tmp/dir%20with%20space/my%20checks/smoke%20test.ts",
  );
});

Deno.test("resolveCheckScriptUrl: 絶対パスは cwd に依存せず file:// URL にする", () => {
  assertEquals(
    resolveCheckScriptUrl("/abs path/smoke.ts", "/ignored"),
    "file:///abs%20path/smoke.ts",
  );
});

Deno.test({
  name:
    "resolveCheckScriptUrl: 空白入り一時ディレクトリのスクリプトを実際に import できる",
  ignore: Deno.permissions.querySync({ name: "write" }).state !== "granted" ||
    Deno.permissions.querySync({ name: "read" }).state !== "granted",
  async fn() {
    const dir = await Deno.makeTempDir({ prefix: "cdp verify space " });
    try {
      const scriptPath = `${dir}/smoke check.ts`;
      await Deno.writeTextFile(
        scriptPath,
        "export function run() { return 'loaded'; }\n",
      );
      const mod = await import(resolveCheckScriptUrl(scriptPath));
      assertEquals(mod.run(), "loaded");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
