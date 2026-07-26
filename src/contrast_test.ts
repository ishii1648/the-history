import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import {
  compositeOver,
  contrastRatio,
  relativeLuminance,
  type Rgb,
} from "./contrast.ts";

const WHITE: Rgb = [255, 255, 255];
const BLACK: Rgb = [0, 0, 0];

Deno.test("relativeLuminance: 白は 1、黒は 0", () => {
  assertAlmostEquals(relativeLuminance(WHITE), 1, 1e-9);
  assertAlmostEquals(relativeLuminance(BLACK), 0, 1e-9);
});

Deno.test("contrastRatio: 白黒は 21:1、同色は 1:1、順序に依存しない", () => {
  assertAlmostEquals(contrastRatio(WHITE, BLACK), 21, 1e-6);
  assertAlmostEquals(contrastRatio(BLACK, WHITE), 21, 1e-6);
  assertAlmostEquals(contrastRatio(WHITE, WHITE), 1, 1e-9);
});

Deno.test("contrastRatio: WCAG の既知の値と一致する（#767676 on white は 4.54）", () => {
  assertAlmostEquals(contrastRatio([118, 118, 118], WHITE), 4.54, 0.01);
});

Deno.test("compositeOver: alpha 255 は前景そのもの、0 は背景そのもの", () => {
  assertEquals(compositeOver([10, 20, 30, 255], WHITE), [10, 20, 30]);
  assertEquals(compositeOver([10, 20, 30, 0], WHITE), [255, 255, 255]);
});

Deno.test("compositeOver: alpha 中間は線形補間になる", () => {
  const mid = compositeOver([0, 0, 0, 128], WHITE);
  const expected = 255 * (1 - 128 / 255);
  for (const ch of mid) assertAlmostEquals(ch, expected, 1e-9);
});

Deno.test("compositeOver: 半透明を重ねるほど前景色へ近づく", () => {
  const bg: Rgb = [240, 230, 205];
  const light = compositeOver([46, 110, 102, 64], bg);
  const heavy = compositeOver([46, 110, 102, 214], bg);
  assert(relativeLuminance(heavy) < relativeLuminance(light));
  assert(relativeLuminance(light) < relativeLuminance(bg));
});
