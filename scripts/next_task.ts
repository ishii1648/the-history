/**
 * 自律タスク選択スクリプト。
 * - backlog/tasks/*.md の YAML frontmatter から id / status / ordinal / dependencies / labels を読み取る
 * - status が "To Do" かつ依存タスクが全て終端ステータスのものを候補とし、
 *   label "bug" を含むタスクを最優先 → ordinal 昇順（null は最後）→ ID の数値部分昇順で
 *   次に着手すべきタスクを選ぶ
 * - CLI として実行すると次タスクの ID（例: TASK-2）を stdout に出力する（候補なしなら出力なし）
 */

import { parse } from "@std/yaml";

export const TASKS_DIR = "backlog/tasks";
const DEFAULT_TERMINAL_STATUSES = ["Done"];
const DEFAULT_ACTIVE_STATUSES = ["In Progress"];

/** backlog タスク markdown の frontmatter から抽出するメタ情報 */
export interface TaskMeta {
  id: string;
  status: string;
  ordinal: number | null;
  dependencies: string[];
  labels: string[];
}

/** markdown の YAML frontmatter（`---` 区切り）から TaskMeta を取り出す（純粋関数） */
export function parseTaskFrontmatter(markdown: string): TaskMeta | null {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  let data: unknown;
  try {
    data = parse(match[1]);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;

  const record = data as Record<string, unknown>;
  const { id, status, ordinal, dependencies, labels } = record;
  if (typeof id !== "string" || id === "") return null;

  return {
    id,
    status: typeof status === "string" ? status : "",
    ordinal: typeof ordinal === "number" ? ordinal : null,
    dependencies: Array.isArray(dependencies)
      ? dependencies.filter((dep): dep is string => typeof dep === "string")
      : [],
    labels: Array.isArray(labels)
      ? labels.filter((label): label is string => typeof label === "string")
      : [],
  };
}

/** タスク ID の数値部分を取り出す（純粋関数）。数値がなければ Infinity */
function taskIdNumber(id: string): number {
  const match = id.match(/(\d+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

/** label "bug" を含むタスクを最優先 → ordinal 昇順（null は最後）→ ID の数値部分昇順の比較（純粋関数） */
export function compareTasks(a: TaskMeta, b: TaskMeta): number {
  const aIsBug = a.labels.includes("bug");
  const bIsBug = b.labels.includes("bug");
  if (aIsBug !== bIsBug) return aIsBug ? -1 : 1;

  const aOrdinal = a.ordinal ?? Number.POSITIVE_INFINITY;
  const bOrdinal = b.ordinal ?? Number.POSITIVE_INFINITY;
  if (aOrdinal !== bOrdinal) return aOrdinal - bOrdinal;
  return taskIdNumber(a.id) - taskIdNumber(b.id);
}

/**
 * 着手可能な候補タスクを抽出する（純粋関数）。
 * 候補 = status が "To Do" かつ dependencies の全てが tasks 内に存在し
 * terminalStatuses に含まれるステータスであるタスク。
 */
export function selectCandidates(
  tasks: TaskMeta[],
  terminalStatuses: string[] = DEFAULT_TERMINAL_STATUSES,
): TaskMeta[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  return tasks.filter((task) =>
    task.status === "To Do" &&
    task.dependencies.every((dep) => {
      const depTask = byId.get(dep);
      return depTask !== undefined && terminalStatuses.includes(depTask.status);
    })
  );
}

/**
 * 次に着手すべきタスクを選ぶ（純粋関数）。
 * 候補（selectCandidates 参照）の中から label "bug" を含むタスクを
 * 最優先で選ぶ（compareTasks 参照）。候補がなければ null。
 */
export function selectNextTask(
  tasks: TaskMeta[],
  terminalStatuses: string[] = DEFAULT_TERMINAL_STATUSES,
): TaskMeta | null {
  const candidates = selectCandidates(tasks, terminalStatuses);
  candidates.sort(compareTasks);
  return candidates[0] ?? null;
}

/**
 * 進行中のタスクが存在するか判定する（純粋関数）。
 * tasks 内に activeStatuses に含まれるステータスのタスクが 1 つでもあれば true。
 * 直列実行規約のため、進行中タスクがある間は次タスクを起動しない判定に使う。
 */
export function hasActiveTask(
  tasks: TaskMeta[],
  activeStatuses: string[] = DEFAULT_ACTIVE_STATUSES,
): boolean {
  return tasks.some((task) => activeStatuses.includes(task.status));
}

/** backlog/tasks/*.md を読み込み TaskMeta の一覧にする */
export async function readTasks(dir: string): Promise<TaskMeta[]> {
  const tasks: TaskMeta[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (!entry.isFile || !entry.name.endsWith(".md")) continue;
    const markdown = await Deno.readTextFile(`${dir}/${entry.name}`);
    const meta = parseTaskFrontmatter(markdown);
    if (meta) tasks.push(meta);
  }
  return tasks;
}

if (import.meta.main) {
  const tasks = await readTasks(TASKS_DIR);
  // 直列実行規約: 進行中タスクの finalization が済むまで次タスクを起動しない
  if (!hasActiveTask(tasks)) {
    const next = selectNextTask(tasks);
    if (next) {
      console.log(next.id);
    }
  }
}
