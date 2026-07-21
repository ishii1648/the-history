import { assert, assertEquals } from "@std/assert";
import {
  buildBundleArgs,
  findNodeImports,
  getDataCopyTargets,
  getOptionalCopyTargets,
  getStaticCopyTargets,
  neutralizeNodeImports,
} from "./build.ts";

Deno.test("getStaticCopyTargets は index.html / app.css / vendor CSS を dist/ にコピーする対象を返す", () => {
  const targets = getStaticCopyTargets("dist");
  assertEquals(targets, [
    { from: "index.html", to: "dist/index.html" },
    { from: "app.css", to: "dist/app.css" },
    { from: "vendor/maplibre-gl.css", to: "dist/vendor/maplibre-gl.css" },
  ]);
});

Deno.test("getStaticCopyTargets は distDir を反映する", () => {
  const targets = getStaticCopyTargets("out");
  assertEquals(targets, [
    { from: "index.html", to: "out/index.html" },
    { from: "app.css", to: "out/app.css" },
    { from: "vendor/maplibre-gl.css", to: "out/vendor/maplibre-gl.css" },
  ]);
});

Deno.test("getOptionalCopyTargets は data/europe.pmtiles を dist/ にコピーする対象を返す", () => {
  const targets = getOptionalCopyTargets("dist");
  assertEquals(targets, [
    { from: "data/europe.pmtiles", to: "dist/europe.pmtiles" },
  ]);
});

Deno.test("getOptionalCopyTargets は distDir を反映する", () => {
  const targets = getOptionalCopyTargets("out");
  assertEquals(targets, [
    { from: "data/europe.pmtiles", to: "out/europe.pmtiles" },
  ]);
});

Deno.test("getDataCopyTargets は index.json / colors.json と各年代 GeoJSON を dist/data/ にコピーする対象を返す", () => {
  const targets = getDataCopyTargets("dist", [900, 1000]);
  assertEquals(targets, [
    { from: "data/index.json", to: "dist/data/index.json" },
    { from: "data/colors.json", to: "dist/data/colors.json" },
    { from: "data/europe_900.geojson", to: "dist/data/europe_900.geojson" },
    { from: "data/europe_1000.geojson", to: "dist/data/europe_1000.geojson" },
  ]);
});

Deno.test("getDataCopyTargets は distDir を反映する", () => {
  const targets = getDataCopyTargets("out", [1492]);
  assertEquals(targets, [
    { from: "data/index.json", to: "out/data/index.json" },
    { from: "data/colors.json", to: "out/data/colors.json" },
    { from: "data/europe_1492.geojson", to: "out/data/europe_1492.geojson" },
  ]);
});

Deno.test("findNodeImports は node: の静的 import specifier を重複なく列挙する", () => {
  const code = [
    `import * as WorkerThreads from "node:worker_threads";`,
    `import ChildProcess from "node:child_process";`,
    `import * as stream from "node:stream";`,
    `import * as WorkerThreads2 from "node:worker_threads";`,
    `import { GeoJsonLayer } from "@deck.gl/layers";`,
  ].join("\n");
  assertEquals(findNodeImports(code), [
    "node:child_process",
    "node:stream",
    "node:worker_threads",
  ]);
});

Deno.test("findNodeImports は re-export（export ... from）の node: も検出する", () => {
  const code =
    `export * from "node:stream";\nexport { x } from 'node:child_process';`;
  assertEquals(findNodeImports(code), [
    "node:child_process",
    "node:stream",
  ]);
});

Deno.test("findNodeImports は node: 静的 import が無ければ空配列を返す", () => {
  const code = [
    `import { MapboxOverlay } from "@deck.gl/mapbox";`,
    `const s = "node:stream is just a string literal, not an import";`,
  ].join("\n");
  assertEquals(findNodeImports(code), []);
});

Deno.test("neutralizeNodeImports は namespace import を空オブジェクト束縛に置換する", () => {
  const out = neutralizeNodeImports(
    `import * as WorkerThreads from "node:worker_threads";`,
  );
  assertEquals(findNodeImports(out), []);
  // 束縛名は残す（WorkerThreads.parentPort 等の参照が undefined になるだけで落ちない）
  assert(out.includes("const WorkerThreads = {}"));
});

Deno.test("neutralizeNodeImports は default import を空オブジェクト束縛に置換する", () => {
  const out = neutralizeNodeImports(
    `import ChildProcess from "node:child_process";`,
  );
  assertEquals(findNodeImports(out), []);
  assert(out.includes("const ChildProcess = {}"));
});

Deno.test("neutralizeNodeImports は named import を分割束縛に置換する", () => {
  const out = neutralizeNodeImports(
    `import { Readable, Writable as W } from "node:stream";`,
  );
  assertEquals(findNodeImports(out), []);
  assert(out.includes("Readable"));
  assert(out.includes("Writable: W") || out.includes("Writable:W"));
});

Deno.test("neutralizeNodeImports は副作用 import を除去する", () => {
  const out = neutralizeNodeImports(`import "node:worker_threads";\nfoo();`);
  assertEquals(findNodeImports(out), []);
  assert(out.includes("foo();"));
});

Deno.test("neutralizeNodeImports は node: 以外の import を保持する", () => {
  const code =
    `import { GeoJsonLayer } from "@deck.gl/layers";\nimport * as s from "node:stream";\n`;
  const out = neutralizeNodeImports(code);
  assertEquals(findNodeImports(out), []);
  assert(out.includes(`import { GeoJsonLayer } from "@deck.gl/layers";`));
});

Deno.test("neutralizeNodeImports は import より前で参照される束縛でも TDZ にならない（先頭で宣言）", () => {
  // import は巻き上げられるため、元コードは import 文より前で束縛を参照できる。
  // 在 place の const 置換だと TDZ で ReferenceError になるので、スタブは先頭へ宣言する。
  const code = [
    `__reExport(exports, worker_threads_star);`,
    `import * as worker_threads_star from "node:worker_threads";`,
  ].join("\n");
  const out = neutralizeNodeImports(code);
  assertEquals(findNodeImports(out), []);
  const declIdx = out.indexOf("const worker_threads_star = {}");
  const useIdx = out.indexOf("__reExport(exports, worker_threads_star)");
  assert(declIdx >= 0 && useIdx >= 0 && declIdx < useIdx);
});

Deno.test("neutralizeNodeImports は複数行に散在する node: import を全て処理する", () => {
  const code = [
    `import * as WorkerThreads from "node:worker_threads";`,
    `import * as worker_threads_star from "node:worker_threads";`,
    `import ChildProcess from "node:child_process";`,
    `import * as stream from "node:stream";`,
    `const x = 1;`,
  ].join("\n");
  const out = neutralizeNodeImports(code);
  assertEquals(findNodeImports(out), []);
  assert(out.includes("const x = 1;"));
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
