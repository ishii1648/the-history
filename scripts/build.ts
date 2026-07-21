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
    await Deno.copyFile(from, to);
  }
}

async function main(): Promise<void> {
  await Deno.mkdir(DIST_DIR, { recursive: true });
  await bundle(ENTRY, BUNDLE_OUT);
  await copyStaticFiles(DIST_DIR);
  console.log(`ビルド完了: ${DIST_DIR}/`);
}

if (import.meta.main) {
  await main();
}
