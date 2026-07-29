/**
 * backlog タスクアーカイブから未終端タスクを GitHub Issue へ移行する（TASK-140）。
 *
 * - `docs/archive/backlog-tasks/*.md` の frontmatter を読み、status が
 *   To Do / In Progress のタスクのみ `gh issue create` で Issue 化する。
 *   旧 `backlog/archive/tasks/` 由来のファイル（backlog.md 上で取りやめ済み。
 *   status フィールドは To Do のまま残っている）は BACKLOG_ARCHIVED_FILES で
 *   明示的に除外する。
 * - Issue 本文 = LOOP-META（depends-on は移行で作られた Issue 番号へマップ、
 *   ordinal は旧 ordinal を保存）+ Description + AC（`- [ ] AC1` 記法へ変換。
 *   `#N` は Issue リンクに化けるため使わない）+ 旧 ID・アーカイブパスの footer。
 *   body はシェル置換によるテキスト破壊を避けるため必ず一時ファイル経由で
 *   `--body-file` で渡す。
 * - マップ不能な依存（移行対象外 = 終端ステータスの TASK-N）は depends-on に
 *   入れず本文に注記する。移行対象同士の依存はトポロジカル順に作成して解決する。
 * - In Progress だったタスクには `status:in-progress` ラベルを付与する。
 * - 作成後、アーカイブ md の frontmatter 直後に「移行先: #N」を書き戻す
 *   （相互リンク）。
 *
 * 使い方:
 *   deno task migrate-tasks-to-issues --dry-run  # gh を実行せず計画を表示
 *   deno task migrate-tasks-to-issues            # Issue 作成 + 相互リンク書き戻し
 */

import { parse } from "@std/yaml";

/** 移設後のアーカイブディレクトリ */
export const ARCHIVE_DIR = "docs/archive/backlog-tasks";

/**
 * 旧 `backlog/archive/tasks/` 由来のファイル名（移設コミット 2dbc017 時点）。
 * backlog.md のアーカイブは「取りやめ」に相当するため、status が非終端でも
 * Issue 化しない。
 */
export const BACKLOG_ARCHIVED_FILES: string[] = [
  "task-16 - E2E-検証用ダミー-bug.md",
  "task-69 - backlog-intake-skill-起票検証用サンプル（作成後アーカイブ）.md",
  "task-95 - フランス王国の外枠に諸侯領オーバーレイを取り込み名目版図として一体表示する.md",
];

/** アーカイブ md 1 件分のメタ情報と本文素材 */
export interface ArchivedTask {
  id: string;
  title: string;
  status: string;
  labels: string[];
  dependencies: string[];
  ordinal: number | null;
  /** SECTION:DESCRIPTION マーカー内（無ければ ## Description 見出し配下）の本文 */
  description: string;
  acItems: AcItem[];
  fileName: string;
}

/** Acceptance Criteria 1 項目（旧 `- [ ] #N 本文` 記法） */
export interface AcItem {
  checked: boolean;
  number: number;
  text: string;
}

const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/;

/** アーカイブ md をパースする（純粋関数）。frontmatter が無い・id 欠落は null */
export function parseArchivedTask(
  markdown: string,
  fileName: string,
): ArchivedTask | null {
  const match = markdown.match(FRONTMATTER_PATTERN);
  if (!match) return null;

  let data: unknown;
  try {
    data = parse(match[1]);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.id !== "string" || record.id === "") return null;

  return {
    id: record.id,
    title: typeof record.title === "string" ? record.title : "",
    status: typeof record.status === "string" ? record.status : "",
    labels: Array.isArray(record.labels)
      ? record.labels.filter((label): label is string =>
        typeof label === "string"
      )
      : [],
    dependencies: Array.isArray(record.dependencies)
      ? record.dependencies.filter((dep): dep is string =>
        typeof dep === "string"
      )
      : [],
    ordinal: typeof record.ordinal === "number" ? record.ordinal : null,
    description: extractDescription(markdown),
    acItems: extractAcItems(markdown),
    fileName,
  };
}

/** Description 本文を取り出す（SECTION マーカー優先、無ければ見出しから） */
function extractDescription(markdown: string): string {
  const marked = markdown.match(
    /<!-- SECTION:DESCRIPTION:BEGIN -->\r?\n([\s\S]*?)<!-- SECTION:DESCRIPTION:END -->/,
  );
  if (marked) return marked[1].trim();

  const heading = markdown.match(
    /^## Description\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m,
  );
  if (!heading) return "";
  return heading[1].replace(/<!--[\s\S]*?-->/g, "").trim();
}

/** AC 項目を取り出す（AC:BEGIN/END ブロック優先、無ければ見出しセクション） */
function extractAcItems(markdown: string): AcItem[] {
  const block = markdown.match(/<!-- AC:BEGIN -->([\s\S]*?)<!-- AC:END -->/) ??
    markdown.match(
      /^## Acceptance Criteria\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m,
    );
  if (!block) return [];

  const items: AcItem[] = [];
  for (const line of block[1].split("\n")) {
    const item = line.match(/^- \[([ x])\] #(\d+) (.*)$/);
    if (!item) continue;
    items.push({
      checked: item[1] === "x",
      number: Number(item[2]),
      text: item[3].trim(),
    });
  }
  return items;
}

/** AC 項目を Issue 用の `- [ ] ACN 本文` 記法にする（純粋関数）。 */
export function formatAcItem(item: AcItem): string {
  return `- [${item.checked ? "x" : " "}] AC${item.number} ${item.text}`;
}

/**
 * 移行対象（status が To Do / In Progress）を選ぶ（純粋関数）。
 * 旧 backlog/archive/tasks 由来（取りやめ済み）はファイル名照合で除外する。
 */
export function selectMigratable(tasks: ArchivedTask[]): ArchivedTask[] {
  return tasks.filter((task) =>
    (task.status === "To Do" || task.status === "In Progress") &&
    !BACKLOG_ARCHIVED_FILES.includes(task.fileName)
  );
}

/** タスク ID の数値部分（無ければ Infinity） */
function taskIdNumber(id: string): number {
  const match = id.match(/(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/** ordinal 昇順（null は最後）→ ID 数値昇順の決定的比較 */
function compareByOrdinal(a: ArchivedTask, b: ArchivedTask): number {
  const aOrdinal = a.ordinal ?? Number.POSITIVE_INFINITY;
  const bOrdinal = b.ordinal ?? Number.POSITIVE_INFINITY;
  if (aOrdinal !== bOrdinal) return aOrdinal - bOrdinal;
  return taskIdNumber(a.id) - taskIdNumber(b.id);
}

/**
 * 移行対象同士の依存を解決できる作成順に並べる（純粋関数）。
 * Kahn 法のトポロジカルソート。同時に着手可能なものは ordinal → ID の
 * 決定的順序で取り出す。移行対象外への依存は制約にしない（本文注記で扱う）。
 * 循環があった場合は残りを ordinal 順で末尾に足す（作成は止めない）。
 */
export function topoSortMigratable(tasks: ArchivedTask[]): ArchivedTask[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const pendingDeps = new Map<string, Set<string>>();
  for (const task of tasks) {
    pendingDeps.set(
      task.id,
      new Set(task.dependencies.filter((dep) => byId.has(dep))),
    );
  }

  const sorted: ArchivedTask[] = [];
  const remaining = new Set(tasks.map((task) => task.id));
  while (remaining.size > 0) {
    const ready = [...remaining]
      .map((id) => byId.get(id)!)
      .filter((task) => pendingDeps.get(task.id)!.size === 0)
      .sort(compareByOrdinal);
    if (ready.length === 0) {
      // 循環: 残りを決定的順序でそのまま出す
      sorted.push(
        ...[...remaining].map((id) => byId.get(id)!).sort(compareByOrdinal),
      );
      break;
    }
    for (const task of ready) {
      sorted.push(task);
      remaining.delete(task.id);
      for (const deps of pendingDeps.values()) deps.delete(task.id);
    }
  }
  return sorted;
}

/**
 * Issue 本文を組み立てる（純粋関数）。
 * - LOOP-META: depends-on は issueNumbers（TASK-N → 移行先 Issue 番号）で
 *   解決できたもののみ "#N" クォート形式で入れる。ordinal は旧 ordinal。
 * - AC は `- [ ] ACN` 記法（`#N` は Issue リンクに化けるため禁止）。
 * - footer に旧 ID とアーカイブパス、マップ不能依存の注記を書く。
 */
export function buildIssueBody(
  task: ArchivedTask,
  issueNumbers: Map<string, number>,
): string {
  const mapped: string[] = [];
  const unmapped: string[] = [];
  for (const dep of task.dependencies) {
    const number = issueNumbers.get(dep);
    if (number !== undefined) {
      mapped.push(`"#${number}"`);
    } else {
      unmapped.push(dep);
    }
  }

  const lines: string[] = [
    "<!-- LOOP-META",
    `depends-on: [${mapped.join(", ")}]`,
    `ordinal: ${task.ordinal ?? "null"}`,
    "-->",
    "",
    "## Description",
    "",
    task.description,
    "",
    "## Acceptance Criteria",
    "",
    ...task.acItems.map(formatAcItem),
    "",
    "---",
    "",
    "backlog.md からの移行（TASK-140）:",
    "",
    `- 旧 ID: ${task.id}`,
    `- アーカイブ: ${ARCHIVE_DIR}/${task.fileName}`,
  ];
  if (unmapped.length > 0) {
    lines.push(
      `- 旧依存のうち ${
        unmapped.join("・")
      } は移行対象外（終端ステータス）のため Issue 番号へマップ不能。depends-on には含めていない`,
    );
  }
  return lines.join("\n") + "\n";
}

/**
 * `gh issue create` の引数を組み立てる（純粋関数）。
 * ラベルは task 固定 + 旧ラベルのうち `bug` / `area:*` を引き継ぎ、
 * In Progress には `status:in-progress` を付ける。
 */
export function buildGhCreateArgs(
  task: ArchivedTask,
  bodyFile: string,
): string[] {
  const labels = [
    "task",
    ...task.labels.filter((label) =>
      label === "bug" || label.startsWith("area:")
    ),
  ];
  if (task.status === "In Progress") labels.push("status:in-progress");

  return [
    "issue",
    "create",
    "--title",
    task.title,
    "--body-file",
    bodyFile,
    ...labels.flatMap((label) => ["--label", label]),
  ];
}

const MIGRATION_LINK_PATTERN = /^移行先: #\d+$/m;

/**
 * アーカイブ md の frontmatter 直後に「移行先: #N」を挿入する（純粋関数）。
 * 既に移行先の記載がある場合は変更しない（冪等）。
 */
export function insertMigrationLink(
  markdown: string,
  issueNumber: number,
): string {
  if (MIGRATION_LINK_PATTERN.test(markdown)) return markdown;
  const match = markdown.match(FRONTMATTER_PATTERN);
  if (!match) return markdown;
  const head = match[0].trimEnd();
  const rest = markdown.slice(match[0].length).replace(/^\r?\n*/, "");
  return `${head}\n\n移行先: #${issueNumber}\n\n${rest}`;
}

/** gh issue create の stdout（Issue URL）から Issue 番号を取り出す（純粋関数） */
export function parseIssueNumberFromOutput(output: string): number | null {
  const match = output.match(/\/issues\/(\d+)/);
  return match ? Number(match[1]) : null;
}

/** dry-run 表示用（setup-issue-labels.ts と同じ方針の最小クォート） */
function formatCommand(args: string[]): string {
  return ["gh", ...args]
    .map((arg) => /^[A-Za-z0-9_:./=-]+$/.test(arg) ? arg : `"${arg}"`)
    .join(" ");
}

async function readArchivedTasks(dir: string): Promise<ArchivedTask[]> {
  const tasks: ArchivedTask[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;
    if (entry.name === "README.md") continue;
    const markdown = await Deno.readTextFile(`${dir}/${entry.name}`);
    const task = parseArchivedTask(markdown, entry.name);
    if (task) tasks.push(task);
  }
  return tasks;
}

if (import.meta.main) {
  const dryRun = Deno.args.includes("--dry-run");
  const tasks = await readArchivedTasks(ARCHIVE_DIR);
  const migratable = topoSortMigratable(selectMigratable(tasks));
  console.log(
    `移行対象: ${migratable.length} 件（全 ${tasks.length} 件中、` +
      `旧 backlog アーカイブ由来 ${BACKLOG_ARCHIVED_FILES.length} 件は除外）`,
  );

  const issueNumbers = new Map<string, number>();
  let pseudoNumber = 9000; // dry-run 用の仮番号（実行時は gh の採番で決まる）

  for (const task of migratable) {
    const body = buildIssueBody(task, issueNumbers);

    if (dryRun) {
      pseudoNumber++;
      issueNumbers.set(task.id, pseudoNumber);
      console.log(
        `\n=== ${task.id}（${task.status}） → Issue #${pseudoNumber}（仮番号。実行時に採番）`,
      );
      console.log(formatCommand(buildGhCreateArgs(task, "<tmp-body-file>")));
      console.log("--- body ---");
      console.log(body);
      continue;
    }

    const bodyFile = await Deno.makeTempFile({
      prefix: "issue-body-",
      suffix: ".md",
    });
    try {
      await Deno.writeTextFile(bodyFile, body);
      const args = buildGhCreateArgs(task, bodyFile);
      const output = await new Deno.Command("gh", {
        args,
        stdout: "piped",
        stderr: "piped",
      }).output();
      const stdout = new TextDecoder().decode(output.stdout);
      if (!output.success) {
        const stderr = new TextDecoder().decode(output.stderr).trim();
        console.error(`失敗: ${task.id}\n${formatCommand(args)}\n${stderr}`);
        Deno.exit(1);
      }
      const issueNumber = parseIssueNumberFromOutput(stdout);
      if (issueNumber === null) {
        console.error(`Issue 番号を特定できない: ${task.id}\n${stdout}`);
        Deno.exit(1);
      }
      issueNumbers.set(task.id, issueNumber);

      // 相互リンク: アーカイブ md の frontmatter 直後に移行先を書き戻す
      const path = `${ARCHIVE_DIR}/${task.fileName}`;
      const markdown = await Deno.readTextFile(path);
      await Deno.writeTextFile(
        path,
        insertMigrationLink(markdown, issueNumber),
      );
      console.log(`${task.id} → #${issueNumber}（${task.status}）`);
    } finally {
      await Deno.remove(bodyFile).catch(() => {});
    }
  }

  if (!dryRun && migratable.length > 0) {
    console.log(
      "\n完了。アーカイブ md へ「移行先: #N」を書き戻した（要コミット）。",
    );
  }
}
