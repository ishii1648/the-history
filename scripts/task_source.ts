/**
 * タスク取得の TaskSource 抽象（TASK-139、背景は docs/adr/0031）。
 * - 環境変数 `TASK_SOURCE=backlog|github` でタスクの読み取り元を切り替える。
 *   未設定・空文字は backlog（従来どおりローカル backlog/tasks/*.md）で既定不変。
 * - github ソースは `gh issue list --state all --limit 1000
 *   --json number,title,state,stateReason,labels,body` の 1 コールで全件取得する
 *   （search API は 30 req/min 制限があるため使わない）。
 * - `--json-file <path>` を渡すと gh を起動せず、同形式の JSON ファイルから
 *   読み取る（ネットワーク非依存の検証用）。
 * - Issue → TaskMeta 変換・LOOP-META パース・status 導出は純粋関数として
 *   エクスポートし、フィクスチャ JSON でテストする。選定ルール
 *   （bug 最優先 → ordinal → ID、依存の終端判定）は next_task.ts /
 *   next_tasks.ts の既存純粋関数をそのまま共有する。
 */

import { parse } from "@std/yaml";
import { readTasks, type TaskMeta, TASKS_DIR } from "./next_task.ts";

/** タスクの読み取り元の種別 */
export type TaskSourceKind = "backlog" | "github";

/** backlog ソースの終端ステータス（従来の既定と同一） */
export const BACKLOG_TERMINAL_STATUSES = ["Done"];

/**
 * github ソースの終端ステータス。closed は理由を問わず依存解決として扱う
 * （COMPLETED → Done / NOT_PLANNED → 取りやめ。AC#3 の「依存が未クローズなら
 * 候補から除外」の裏返し）。
 */
export const GITHUB_TERMINAL_STATUSES = ["Done", "取りやめ"];

/** `gh issue list --json number,title,state,stateReason,labels,body` の 1 要素 */
export interface GhIssue {
  number: number;
  title: string;
  /** "OPEN" | "CLOSED"（gh の出力どおり大文字） */
  state: string;
  /** closed の理由。"COMPLETED" | "NOT_PLANNED" | "" | null */
  stateReason: string | null;
  labels: { name: string }[];
  body: string | null;
}

/** Issue 本文の LOOP-META（HTML コメント内 YAML 断片）から取り出すメタ情報 */
export interface LoopMeta {
  /** 依存 Issue の "#N" 形式 ID の配列 */
  dependsOn: string[];
  /** Issue 番号順を上書きする ordinal（無指定は null） */
  ordinal: number | null;
}

const EMPTY_LOOP_META: LoopMeta = { dependsOn: [], ordinal: null };
const LOOP_META_PATTERN = /<!--\s*LOOP-META\r?\n([\s\S]*?)-->/;

/**
 * Issue 本文から LOOP-META（HTML コメント内 YAML 断片）をパースする（純粋関数）。
 * - depends-on: "#N" のクォート形式のみ依存として採用する（YAML では # が
 *   コメント開始のためクォート無しは値にならない。テンプレートの規約と同一）。
 *   数値要素は "#N" へ正規化する。
 * - ordinal: 数値のみ採用し、それ以外（null・文字列等）は null。
 * - ブロック欠落・YAML 破損は既定値（依存なし・ordinal null）に落とす。
 */
export function parseLoopMeta(body: string): LoopMeta {
  const match = body.match(LOOP_META_PATTERN);
  if (!match) return { ...EMPTY_LOOP_META };

  let data: unknown;
  try {
    data = parse(match[1]);
  } catch {
    return { ...EMPTY_LOOP_META };
  }
  if (typeof data !== "object" || data === null) {
    return { ...EMPTY_LOOP_META };
  }

  const record = data as Record<string, unknown>;
  const rawDeps = record["depends-on"];
  const dependsOn: string[] = [];
  if (Array.isArray(rawDeps)) {
    for (const dep of rawDeps) {
      if (typeof dep === "number" && Number.isInteger(dep)) {
        dependsOn.push(`#${dep}`);
      } else if (typeof dep === "string" && /^#\d+$/.test(dep)) {
        dependsOn.push(dep);
      }
      // それ以外（クォート漏れで空になった値・"TASK-N" 等）は無視する
    }
  }

  const rawOrdinal = record["ordinal"];
  const ordinal = typeof rawOrdinal === "number" ? rawOrdinal : null;

  return { dependsOn, ordinal };
}

/**
 * Issue の state / stateReason / status:in-progress ラベルからタスクの
 * ステータスを導出する（純粋関数）。
 * - open → "To Do"、open + status:in-progress ラベル → "In Progress"
 * - closed NOT_PLANNED → "取りやめ"、それ以外の closed → "Done"
 *   （state はラベルより優先する）
 */
export function statusOf(issue: GhIssue): string {
  if (issue.state === "CLOSED") {
    return issue.stateReason === "NOT_PLANNED" ? "取りやめ" : "Done";
  }
  const inProgress = issue.labels.some(
    (label) => label.name === "status:in-progress",
  );
  return inProgress ? "In Progress" : "To Do";
}

/**
 * Issue を TaskMeta へ変換する（純粋関数）。
 * - id は "#N" 形式（既存の taskIdNumber の数値抽出と互換）
 * - dependencies / ordinal は LOOP-META から。ordinal 欠落時は Issue 番号
 * - `task` ラベルの無い issue（needs-human 等）は候補にしないため null を返す。
 *   依存先が task ラベル無しの場合は一覧に現れず未解決扱いとなる（保守的）。
 */
export function issueToTaskMeta(issue: GhIssue): TaskMeta | null {
  const labels = issue.labels.map((label) => label.name);
  if (!labels.includes("task")) return null;

  const meta = parseLoopMeta(issue.body ?? "");
  return {
    id: `#${issue.number}`,
    status: statusOf(issue),
    ordinal: meta.ordinal ?? issue.number,
    dependencies: meta.dependsOn,
    labels,
  };
}

/** Issue 一覧を TaskMeta 一覧にする（task ラベル無しは除外、純粋関数） */
export function issuesToTasks(issues: GhIssue[]): TaskMeta[] {
  const tasks: TaskMeta[] = [];
  for (const issue of issues) {
    const meta = issueToTaskMeta(issue);
    if (meta) tasks.push(meta);
  }
  return tasks;
}

/**
 * `gh issue list --json` の出力テキストを GhIssue 一覧にする（純粋関数）。
 * 形式不正（配列でない・number 欠落等）は静かに握り潰さずエラーにする。
 */
export function parseIssuesJson(text: string): GhIssue[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error("issues JSON must be an array");
  }
  return data.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`issues[${index}]: not an object`);
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.number !== "number") {
      throw new Error(`issues[${index}]: missing numeric "number"`);
    }
    if (typeof record.state !== "string") {
      throw new Error(`issues[${index}]: missing string "state"`);
    }
    const labels = Array.isArray(record.labels)
      ? record.labels
        .filter((label): label is { name: string } =>
          typeof label === "object" && label !== null &&
          typeof (label as Record<string, unknown>).name === "string"
        )
        .map((label) => ({ name: label.name }))
      : [];
    return {
      number: record.number,
      title: typeof record.title === "string" ? record.title : "",
      state: record.state,
      stateReason: typeof record.stateReason === "string"
        ? record.stateReason
        : null,
      labels,
      body: typeof record.body === "string" ? record.body : null,
    };
  });
}

/**
 * 環境変数 TASK_SOURCE の値からソース種別を決める（純粋関数）。
 * 未設定・空文字・"backlog" は backlog（既定不変）、"github" は github、
 * それ以外はタイポの黙殺を避けるためエラー。
 */
export function resolveSourceKind(value: string | undefined): TaskSourceKind {
  if (value === undefined || value === "" || value === "backlog") {
    return "backlog";
  }
  if (value === "github") return "github";
  throw new Error(
    `unknown TASK_SOURCE: ${value} (expected "backlog" or "github")`,
  );
}

/** CLI 引数から `--json-file <path>` / `--json-file=<path>` を取り出す（純粋関数） */
export function parseJsonFileArg(args: string[]): string | null {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--json-file") {
      return args[i + 1] ?? null;
    }
    if (arg.startsWith("--json-file=")) {
      return arg.slice("--json-file=".length);
    }
  }
  return null;
}

/** ソースから読み取ったタスク一覧と、そのソースでの終端ステータス */
export interface TaskSnapshot {
  tasks: TaskMeta[];
  terminalStatuses: string[];
}

/** gh issue list を 1 コール実行して JSON テキストを得る */
async function fetchIssuesJsonViaGh(): Promise<string> {
  const command = new Deno.Command("gh", {
    args: [
      "issue",
      "list",
      "--state",
      "all",
      "--limit",
      "1000",
      "--json",
      "number,title,state,stateReason,labels,body",
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();
  if (!output.success) {
    const stderr = new TextDecoder().decode(output.stderr).trim();
    throw new Error(`gh issue list failed (${output.code}): ${stderr}`);
  }
  return new TextDecoder().decode(output.stdout);
}

/**
 * TASK_SOURCE（env）と CLI 引数に従いタスク一覧を読み取る（切替点）。
 * next_task.ts / next_tasks.ts の main から呼ばれ、選定純粋関数へ渡す
 * TaskMeta 一覧と終端ステータスを返す。
 */
export async function loadTaskSnapshot(
  options: { env?: string; args?: string[] } = {},
): Promise<TaskSnapshot> {
  const kind = resolveSourceKind(
    options.env ?? Deno.env.get("TASK_SOURCE"),
  );

  if (kind === "backlog") {
    return {
      tasks: await readTasks(TASKS_DIR),
      terminalStatuses: BACKLOG_TERMINAL_STATUSES,
    };
  }

  const jsonFile = parseJsonFileArg(options.args ?? []);
  const text = jsonFile !== null
    ? await Deno.readTextFile(jsonFile)
    : await fetchIssuesJsonViaGh();
  return {
    tasks: issuesToTasks(parseIssuesJson(text)),
    terminalStatuses: GITHUB_TERMINAL_STATUSES,
  };
}
