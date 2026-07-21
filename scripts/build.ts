/**
 * dist/ ビルドスクリプト。
 * - src/main.ts を deno bundle でブラウザ向けにバンドルし dist/app.js を生成
 * - index.html / app.css を dist/ にコピー
 */

import { SNAPSHOT_YEARS } from "../src/config.ts";
import { HRE_OVERLAY_YEARS } from "./build-hre.ts";

const ENTRY = "src/main.ts";
const DIST_DIR = "dist";
const BUNDLE_OUT = `${DIST_DIR}/app.js`;

/** dist/ にそのままコピーする静的ファイルの一覧を返す（純粋関数） */
export function getStaticCopyTargets(
  distDir: string,
): Array<{ from: string; to: string }> {
  return [
    { from: "index.html", to: `${distDir}/index.html` },
    { from: "app.css", to: `${distDir}/app.css` },
    { from: "vendor/maplibre-gl.css", to: `${distDir}/vendor/maplibre-gl.css` },
  ];
}

/**
 * 存在する場合のみ dist/ にコピーする任意ファイルの一覧を返す（純粋関数）。
 * data/europe.pmtiles は `deno task extract-pmtiles` で生成される成果物で、
 * CI 等の未生成環境ではスキップしてビルドは成功させる（警告表示のみ）。
 */
export function getOptionalCopyTargets(
  distDir: string,
): Array<{ from: string; to: string }> {
  return [
    { from: "data/europe.pmtiles", to: `${distDir}/europe.pmtiles` },
  ];
}

/**
 * 勢力圏レイヤーが参照する data/ 一式を dist/data/ にコピーする対象を返す（純粋関数）。
 * index.json・colors.json と各年代の GeoJSON。europe.pmtiles は別枠（dist 直下・任意）。
 * hreYears には HRE 主要領邦オーバーレイ（deno task build-hre で生成）の年代を渡す。
 */
export function getDataCopyTargets(
  distDir: string,
  years: readonly number[],
  hreYears: readonly number[],
): Array<{ from: string; to: string }> {
  const targets: Array<{ from: string; to: string }> = [
    { from: "data/index.json", to: `${distDir}/data/index.json` },
    { from: "data/colors.json", to: `${distDir}/data/colors.json` },
    // TASK-7: ホバー/クリックのラベル整形が SUBJECTO 正規化に使う renames マップ
    {
      from: "data/name-overrides.json",
      to: `${distDir}/data/name-overrides.json`,
    },
    // TASK-21: 主要河川オーバーレイ用の GeoJSON（deno task build-rivers で生成）
    { from: "data/rivers.geojson", to: `${distDir}/data/rivers.geojson` },
  ];
  for (const year of years) {
    targets.push({
      from: `data/europe_${year}.geojson`,
      to: `${distDir}/data/europe_${year}.geojson`,
    });
  }
  // TASK-19: HRE 主要領邦オーバーレイ用の GeoJSON（deno task build-hre で生成）
  for (const year of hreYears) {
    targets.push({
      from: `data/hre_${year}.geojson`,
      to: `${distDir}/data/hre_${year}.geojson`,
    });
  }
  return targets;
}

/** `deno bundle` に渡す引数一覧を返す（純粋関数） */
export function buildBundleArgs(entry: string, outFile: string): string[] {
  return ["bundle", "--platform", "browser", entry, "-o", outFile];
}

/**
 * バンドル出力コードに残っている `node:` 静的 import/re-export の specifier を
 * 重複なく昇順で返す（純粋関数）。
 *
 * ブラウザは `node:` specifier を解決できず、1 つでも残るとモジュールグラフ全体の
 * 評価が失敗して白画面になる（deck.gl → @loaders.gl の worker/child_process 由来）。
 * ビルド時にこれを検出してビルドを fail させ、「ビルド成功 = ブラウザで動く」を担保する。
 *
 * `import x from "node:.."` / `import * as x from "node:.."` / `import { y } from "node:.."`
 * / `export * from "node:.."` / `export { y } from "node:.."` / `import "node:.."` を拾う。
 * 文字列リテラル中の "node:" は `from`/`import` を伴わないため誤検出しない。
 */
export function findNodeImports(code: string): string[] {
  const re = /(?:\bfrom|\bimport)\s*["'](node:[^"']+)["']/g;
  const found = new Set<string>();
  for (const m of code.matchAll(re)) {
    found.add(m[1]);
  }
  return [...found].sort();
}

/** import 節（import と from の間）をトップレベルのカンマで分割する（波括弧内は保持） */
function splitImportClause(clause: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of clause) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (ch === "," && depth === 0) {
      segments.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim() !== "") segments.push(current);
  return segments.map((s) => s.trim()).filter((s) => s !== "");
}

/** `{ a, b as c }` を分割束縛 `{ a, b: c }` に変換する */
function braceToDestructure(brace: string): string {
  const inner = brace.slice(1, -1);
  const mapped = inner
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "")
    .map((p) => {
      const m = /^(\S+)\s+as\s+(\S+)$/.exec(p);
      return m ? `${m[1]}: ${m[2]}` : p;
    })
    .join(", ");
  return `{ ${mapped} }`;
}

/** import 節を、同名の束縛を空オブジェクトで用意するスタブ文へ変換する */
function clauseToStub(clause: string): string {
  const stmts: string[] = [];
  for (const seg of splitImportClause(clause)) {
    const ns = /^\*\s+as\s+(.+)$/.exec(seg);
    if (ns) {
      stmts.push(`const ${ns[1].trim()} = {};`);
    } else if (seg.startsWith("{")) {
      stmts.push(`const ${braceToDestructure(seg)} = {};`);
    } else {
      stmts.push(`const ${seg} = {};`);
    }
  }
  return stmts.join(" ");
}

/**
 * バンドル出力中の `node:` 静的 import を、ブラウザで安全な空スタブ束縛に置換する（純粋関数）。
 *
 * deck.gl → @loaders.gl（worker-utils / loader-utils）が `node:worker_threads` などを
 * 静的 import するが、これらはブラウザ実行パスでは isBrowser 分岐で踏まれない。
 * import 文を残すとブラウザが specifier を解決できずモジュールグラフ全体の評価が失敗するため、
 * import を除去しつつ束縛名だけ `const X = {};` として残し、参照は undefined になるようにする。
 *
 * npm パッケージ内部の `node:` import は deno の import map で差し替えられないため、
 * バンドル後のこの後処理で対応する（deno.json のマップは npm 依存に届かない）。
 *
 * ES の import は巻き上げられるため、束縛は import 文より前の位置からも参照され得る
 * （実際に @loaders.gl は `__reExport(..., worker_threads_star)` を import 行の前で呼ぶ）。
 * 在 place で const に置換すると TDZ で ReferenceError になるため、スタブ束縛は
 * 元の import 文を除去したうえでファイル先頭にまとめて宣言し、巻き上げ相当を再現する。
 */
export function neutralizeNodeImports(code: string): string {
  const stubs: string[] = [];
  // import <clause> from "node:..."; → 束縛スタブを収集し、その場は除去する
  const withClause = /import\s+([^;"']*?)\s+from\s*["']node:[^"']+["']\s*;?/g;
  let out = code.replace(withClause, (_m, clause: string) => {
    stubs.push(clauseToStub(clause));
    return "";
  });
  // 副作用 import "node:...";（束縛なし）は丸ごと除去する
  const sideEffect = /import\s*["']node:[^"']+["']\s*;?/g;
  out = out.replace(sideEffect, "");
  if (stubs.length === 0) return out;
  return `${stubs.join("\n")}\n${out}`;
}

async function bundle(entry: string, outFile: string): Promise<void> {
  const args = buildBundleArgs(entry, outFile);
  const command = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "inherit",
    stderr: "inherit",
  });
  const { success, code } = await command.output();
  if (!success) {
    throw new Error(
      `deno ${args.join(" ")} が失敗しました (exit code ${code})`,
    );
  }
}

async function copyStaticFiles(distDir: string): Promise<void> {
  for (const { from, to } of getStaticCopyTargets(distDir)) {
    // dist/vendor/ など、コピー先の親ディレクトリを先に作成する
    const parentDir = to.slice(0, to.lastIndexOf("/"));
    await Deno.mkdir(parentDir, { recursive: true });
    await Deno.copyFile(from, to);
  }
}

async function copyOptionalFiles(distDir: string): Promise<void> {
  for (const { from, to } of getOptionalCopyTargets(distDir)) {
    try {
      await Deno.copyFile(from, to);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) {
        throw error;
      }
      console.warn(
        `警告: ${from} が見つからないためコピーをスキップします` +
          `（ベースマップ表示には \`deno task extract-pmtiles\` での生成が必要）`,
      );
    }
  }
}

async function copyDataFiles(distDir: string): Promise<void> {
  await Deno.mkdir(`${distDir}/data`, { recursive: true });
  for (
    const { from, to } of getDataCopyTargets(
      distDir,
      SNAPSHOT_YEARS,
      HRE_OVERLAY_YEARS,
    )
  ) {
    await Deno.copyFile(from, to);
  }
}

/**
 * バンドル出力の `node:` 静的 import を中和し、残存が無いことを保証する。
 * 残っているとブラウザで module graph 全体の評価が失敗する（白画面）ため、
 * 中和後も 1 つでも残ればビルドを fail させ「ビルド成功 = ブラウザで動く」を担保する。
 */
async function stripNodeImports(outFile: string): Promise<void> {
  const original = await Deno.readTextFile(outFile);
  const before = findNodeImports(original);
  if (before.length === 0) return;

  const neutralized = neutralizeNodeImports(original);
  const remaining = findNodeImports(neutralized);
  if (remaining.length > 0) {
    throw new Error(
      `${outFile} に中和しきれない node: 静的 import が残りました: ` +
        `${
          remaining.join(", ")
        }。neutralizeNodeImports が未対応の import 形の` +
        `可能性があります（ブラウザ実行時の白画面を防ぐため対応が必要）`,
    );
  }
  await Deno.writeTextFile(outFile, neutralized);
  console.log(`node: 静的 import を中和しました: ${before.join(", ")}`);
}

async function main(): Promise<void> {
  await Deno.mkdir(DIST_DIR, { recursive: true });
  await bundle(ENTRY, BUNDLE_OUT);
  await stripNodeImports(BUNDLE_OUT);
  await copyStaticFiles(DIST_DIR);
  await copyDataFiles(DIST_DIR);
  await copyOptionalFiles(DIST_DIR);
  console.log(`ビルド完了: ${DIST_DIR}/`);
}

if (import.meta.main) {
  await main();
}
