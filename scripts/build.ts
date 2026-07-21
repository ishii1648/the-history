/**
 * dist/ ビルドスクリプト。
 * - src/main.ts を deno bundle でブラウザ向けにバンドルし dist/app.js を生成
 * - index.html / app.css を dist/ にコピー
 */

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

/** `deno bundle` に渡す引数一覧を返す（純粋関数） */
export function buildBundleArgs(entry: string, outFile: string): string[] {
  return ["bundle", "--platform", "browser", entry, "-o", outFile];
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

async function main(): Promise<void> {
  await Deno.mkdir(DIST_DIR, { recursive: true });
  await bundle(ENTRY, BUNDLE_OUT);
  await copyStaticFiles(DIST_DIR);
  await copyOptionalFiles(DIST_DIR);
  console.log(`ビルド完了: ${DIST_DIR}/`);
}

if (import.meta.main) {
  await main();
}
