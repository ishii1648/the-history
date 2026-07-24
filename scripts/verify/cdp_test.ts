import { assertEquals, assertThrows } from "@std/assert";
import {
  buildWaitForExpr,
  parseEvaluateResult,
  pickPageTargetUrl,
  resolveKeyCode,
} from "./cdp.ts";

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
