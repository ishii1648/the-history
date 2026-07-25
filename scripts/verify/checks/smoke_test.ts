import { assertEquals } from "@std/assert";
import { CANVAS_CENTER_EXPR } from "./smoke.ts";

/**
 * CANVAS_CENTER_EXPR をスタブ document で評価するヘルパー。
 * ブラウザ内評価と同じ式文字列を Function として実行し、rect 原点を
 * 考慮したビューポート座標が返ることを検証する。
 */
function evalCenterExpr(
  rect: { left: number; top: number; width: number; height: number },
): [number, number] {
  const stubDocument = {
    querySelector: () => ({ getBoundingClientRect: () => rect }),
  };
  const fn = new Function("document", `return ${CANVAS_CENTER_EXPR};`);
  return fn(stubDocument) as [number, number];
}

Deno.test("CANVAS_CENTER_EXPR: canvas が原点にある場合は width/2, height/2 を返す", () => {
  assertEquals(
    evalCenterExpr({ left: 0, top: 0, width: 1600, height: 900 }),
    [800, 450],
  );
});

Deno.test("CANVAS_CENTER_EXPR: canvas が原点以外にある場合も rect 原点を加味したビューポート座標を返す", () => {
  assertEquals(
    evalCenterExpr({ left: 100, top: 50, width: 200, height: 100 }),
    [200, 100],
  );
});
