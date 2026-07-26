import {
  assertEquals,
  assertMatch,
  assertRejects,
  assertThrows,
} from "@std/assert";
import {
  DEFAULT_PORT,
  DEFAULT_ROOT,
  formatPortInUseMessage,
  parseLsofPids,
  parsePsOutput,
  parseServeArgs,
  PortInUseError,
  type ServeFn,
  type ServerHandle,
  startServer,
} from "./serve.ts";

// ---- parseServeArgs ----

Deno.test("parseServeArgs: 引数なしなら既定ポート・既定ルート・フォールバック無効", () => {
  assertEquals(parseServeArgs([]), {
    port: DEFAULT_PORT,
    autoPort: false,
    root: DEFAULT_ROOT,
    help: false,
  });
});

Deno.test("parseServeArgs: --port <n> でポートを上書きできる", () => {
  assertEquals(parseServeArgs(["--port", "8011"]).port, 8011);
});

Deno.test("parseServeArgs: --port=<n> 形式も受け付ける", () => {
  assertEquals(parseServeArgs(["--port=8011"]).port, 8011);
});

Deno.test("parseServeArgs: --auto-port で空きポートへのフォールバックを有効化する", () => {
  assertEquals(parseServeArgs(["--auto-port"]).autoPort, true);
});

Deno.test("parseServeArgs: --root で配信ディレクトリを上書きできる", () => {
  assertEquals(parseServeArgs(["--root", "public"]).root, "public");
});

Deno.test("parseServeArgs: --help は help フラグを立てる", () => {
  assertEquals(parseServeArgs(["--help"]).help, true);
});

Deno.test("parseServeArgs: 数値でない --port は usage 付きで例外を投げる", () => {
  assertThrows(() => parseServeArgs(["--port", "abc"]), Error, "Usage:");
});

Deno.test("parseServeArgs: 範囲外の --port は usage 付きで例外を投げる", () => {
  assertThrows(() => parseServeArgs(["--port", "70000"]), Error, "Usage:");
});

Deno.test("parseServeArgs: 未知のオプションは usage 付きで例外を投げる", () => {
  assertThrows(() => parseServeArgs(["--nope"]), Error, "Usage:");
});

// ---- 占有プロセス特定のパース ----

Deno.test("parseLsofPids: lsof -t の出力を PID 配列にする", () => {
  assertEquals(parseLsofPids("90136\n90137\n"), [90136, 90137]);
});

Deno.test("parseLsofPids: 空出力・非数値行は無視する", () => {
  assertEquals(parseLsofPids("\n  \nnot-a-pid\n42\n"), [42]);
});

Deno.test("parseLsofPids: 同一 PID の重複を除去する", () => {
  assertEquals(parseLsofPids("90136\n90136\n"), [90136]);
});

Deno.test("parsePsOutput: ps の pid/command 行を占有プロセス情報にする", () => {
  assertEquals(
    parsePsOutput("  90136 deno run --allow-net scripts/serve.ts\n"),
    [{ pid: 90136, command: "deno run --allow-net scripts/serve.ts" }],
  );
});

Deno.test("parsePsOutput: ヘッダ的な非数値行は無視する", () => {
  assertEquals(parsePsOutput("PID COMMAND\n42 deno\n"), [
    { pid: 42, command: "deno" },
  ]);
});

// ---- formatPortInUseMessage ----

Deno.test("formatPortInUseMessage: 占有 PID と停止コマンド・回避策を含む", () => {
  const msg = formatPortInUseMessage(8000, [
    { pid: 90136, command: "deno run --allow-net scripts/serve.ts" },
  ]);
  assertMatch(msg, /8000/);
  assertMatch(msg, /90136/);
  assertMatch(msg, /kill 90136/);
  assertMatch(msg, /lsof -nP -iTCP:8000 -sTCP:LISTEN/);
  assertMatch(msg, /--auto-port/);
  assertMatch(msg, /--port/);
  // 既存サーバの再利用という選択肢も提示する
  assertMatch(msg, /http:\/\/localhost:8000\//);
});

Deno.test("formatPortInUseMessage: 占有プロセスを特定できない場合も確認手順を出す", () => {
  const msg = formatPortInUseMessage(8000, []);
  assertMatch(msg, /特定できません/);
  assertMatch(msg, /lsof -nP -iTCP:8000 -sTCP:LISTEN/);
});

Deno.test("formatPortInUseMessage: スタックトレース調の文言を含まない", () => {
  const msg = formatPortInUseMessage(8000, [{ pid: 1, command: "deno" }]);
  assertEquals(msg.includes("AddrInUse"), false);
  assertEquals(msg.includes("    at "), false);
});

// ---- startServer（serve を注入して検証） ----

const stubHandle: ServerHandle = {
  finished: Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

function fakeServe(
  opts: { failOnPorts?: number[]; assignedPort?: number } = {},
): { serve: ServeFn; calls: number[] } {
  const calls: number[] = [];
  const serve: ServeFn = (options) => {
    calls.push(options.port);
    if (opts.failOnPorts?.includes(options.port)) {
      throw new Deno.errors.AddrInUse("Address already in use (os error 48)");
    }
    const bound = options.port === 0
      ? opts.assignedPort ?? 54321
      : options.port;
    options.onListen?.({ port: bound, hostname: "0.0.0.0" });
    return stubHandle;
  };
  return { serve, calls };
}

Deno.test("startServer: 空きポートなら起動し、起動 URL を標準出力に出す", async () => {
  const logs: string[] = [];
  const { serve, calls } = fakeServe();
  await startServer(
    { port: DEFAULT_PORT, autoPort: false, root: DEFAULT_ROOT, help: false },
    {
      serve,
      findOccupants: () => Promise.resolve([]),
      log: (m) => logs.push(m),
    },
  );
  assertEquals(calls, [DEFAULT_PORT]);
  assertMatch(logs.join("\n"), /http:\/\/localhost:8000\//);
});

Deno.test("startServer: ポート占有かつ既定（--auto-port なし）なら PortInUseError を投げる", async () => {
  const logs: string[] = [];
  const { serve, calls } = fakeServe({ failOnPorts: [DEFAULT_PORT] });
  const err = await assertRejects(
    () =>
      startServer(
        {
          port: DEFAULT_PORT,
          autoPort: false,
          root: DEFAULT_ROOT,
          help: false,
        },
        {
          serve,
          findOccupants: () =>
            Promise.resolve([{ pid: 90136, command: "deno run file-server" }]),
          log: (m) => logs.push(m),
        },
      ),
    PortInUseError,
  );
  assertMatch(err.message, /90136/);
  assertMatch(err.message, /kill 90136/);
  // 勝手に別ポートへ逃げない（起動試行は 1 回だけ）
  assertEquals(calls, [DEFAULT_PORT]);
});

Deno.test("startServer: --auto-port ならポート占有時に空きポートへフォールバックし、実ポートを出力する", async () => {
  const logs: string[] = [];
  const { serve, calls } = fakeServe({
    failOnPorts: [DEFAULT_PORT],
    assignedPort: 49152,
  });
  await startServer(
    { port: DEFAULT_PORT, autoPort: true, root: DEFAULT_ROOT, help: false },
    {
      serve,
      findOccupants: () => Promise.resolve([]),
      log: (m) => logs.push(m),
    },
  );
  assertEquals(calls, [DEFAULT_PORT, 0]);
  const out = logs.join("\n");
  assertMatch(out, /8000/); // 占有していた旨
  assertMatch(out, /http:\/\/localhost:49152\//);
});

Deno.test("startServer: AddrInUse 以外のエラーはそのまま伝播する", async () => {
  const serve: ServeFn = () => {
    throw new Deno.errors.PermissionDenied("nope");
  };
  await assertRejects(
    () =>
      startServer(
        {
          port: DEFAULT_PORT,
          autoPort: true,
          root: DEFAULT_ROOT,
          help: false,
        },
        { serve, findOccupants: () => Promise.resolve([]), log: () => {} },
      ),
    Deno.errors.PermissionDenied,
  );
});

// ---- 実ポートを塞いだ再現テスト（net 権限があるときのみ実行） ----

const netGranted = Deno.permissions.querySync({ name: "net" }).state ===
  "granted";

Deno.test({
  name: "再現: 実際にポートを塞いだ状態で起動すると PortInUseError になる",
  ignore: !netGranted,
  async fn() {
    const blocker = Deno.listen({ port: 0, hostname: "0.0.0.0" });
    const port = (blocker.addr as Deno.NetAddr).port;
    try {
      await assertRejects(
        () =>
          startServer(
            { port, autoPort: false, root: DEFAULT_ROOT, help: false },
            { log: () => {} },
          ),
        PortInUseError,
        String(port),
      );
    } finally {
      blocker.close();
    }
  },
});

Deno.test({
  name: "再現: --auto-port なら塞がれたポートでも別ポートで実際に起動する",
  ignore: !netGranted,
  async fn() {
    const blocker = Deno.listen({ port: 0, hostname: "0.0.0.0" });
    const port = (blocker.addr as Deno.NetAddr).port;
    const logs: string[] = [];
    try {
      const server = await startServer(
        { port, autoPort: true, root: DEFAULT_ROOT, help: false },
        { log: (m) => logs.push(m) },
      );
      const bound = logs.join("\n").match(/http:\/\/localhost:(\d+)\//)?.[1];
      assertEquals(typeof bound, "string");
      assertEquals(bound === String(port), false);
      await server.shutdown();
    } finally {
      blocker.close();
    }
  },
});
