import { assertEquals } from "@std/assert";
import { buildBundleArgs, getStaticCopyTargets } from "./build.ts";

Deno.test("getStaticCopyTargets は index.html と app.css を dist/ にコピーする対象を返す", () => {
  const targets = getStaticCopyTargets("dist");
  assertEquals(targets, [
    { from: "index.html", to: "dist/index.html" },
    { from: "app.css", to: "dist/app.css" },
  ]);
});

Deno.test("getStaticCopyTargets は distDir を反映する", () => {
  const targets = getStaticCopyTargets("out");
  assertEquals(targets, [
    { from: "index.html", to: "out/index.html" },
    { from: "app.css", to: "out/app.css" },
  ]);
});

Deno.test("buildBundleArgs は src/main.ts を dist/app.js にバンドルするコマンド引数を返す", () => {
  const args = buildBundleArgs("src/main.ts", "dist/app.js");
  assertEquals(args, [
    "bundle",
    "--platform",
    "browser",
    "src/main.ts",
    "-o",
    "dist/app.js",
  ]);
});
