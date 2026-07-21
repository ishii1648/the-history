/**
 * 並列実行可能なタスク集合の決定的選定スクリプト。
 * - next_task.ts と同じ候補抽出（To Do かつ依存全終端）と bug 最優先規約を維持しつつ、
 *   `area:<領域>` ラベルでファイル衝突リスクを判定し、同時に着手してよいタスク集合を返す
 * - 選定規則:
 *   1. 候補 = status が "To Do" かつ dependencies が全て終端ステータスのタスク
 *   2. label "bug" を含む候補が 1 つ以上あれば候補を bug 群のみに絞る
 *   3. (ordinal 昇順, 同値は ID 数値昇順) で走査し貪欲に選択:
 *      - area を 1 つ以上持ち既選択のどの area とも交差しない → 選択
 *      - area 未付与 → 先頭候補としてのみ選択でき、その場合は単独集合で確定
 *        （保守的フォールバック）。2 件目以降ならスキップ（reason: no area labels）
 *      - area 交差 → スキップ（reason: area conflict: <area> (<先行 TASK-ID>)）
 *   4. In Progress のタスクが存在する間は「新規に開始してよい集合」として空を返す
 * - CLI として実行すると結果を JSON 1 行で stdout に出力する:
 *   {"tasks":[{"id":"TASK-28","areas":["docs"]},...],"skipped":[{"id":"TASK-30","reason":"..."},...]}
 */

import {
  compareTasks,
  hasActiveTask,
  readTasks,
  selectCandidates,
  type TaskMeta,
  TASKS_DIR,
} from "./next_task.ts";

/** 選定されたタスク（ID と担当ファイル領域） */
export interface SelectedTask {
  id: string;
  areas: string[];
}

/** スキップされたタスクとその理由 */
export interface SkippedTask {
  id: string;
  reason: string;
}

/** selectNextTasks の結果（そのまま JSON 直列化して出力する契約） */
export interface NextTasksResult {
  tasks: SelectedTask[];
  skipped: SkippedTask[];
}

/**
 * labels から `area:` プレフィクスのファイル領域名を取り出す（純粋関数）。
 * ラベルの出現順を保ち重複を除去する。領域名の妥当性検証はしないが、
 * 領域名が空の `area:` ラベルは area として扱わない。
 */
export function extractAreas(labels: string[]): string[] {
  const areas: string[] = [];
  for (const label of labels) {
    if (!label.startsWith("area:")) continue;
    const area = label.slice("area:".length);
    if (area === "" || areas.includes(area)) continue;
    areas.push(area);
  }
  return areas;
}

/**
 * 並列に着手してよいタスク集合を決定的に選ぶ（純粋関数）。
 * 決定性の担保: 候補を compareTasks（bug 最優先 → ordinal 昇順（null は最後）→
 * ID 数値昇順）で全順序に並べ、その順に貪欲走査するため、同じ入力からは
 * 常に同じ tasks / skipped（順序含む）が得られる。
 */
export function selectNextTasks(
  tasks: TaskMeta[],
  terminalStatuses?: string[],
): NextTasksResult {
  // In Progress がある間は新規に開始してよいタスクはない（next_task と同じ前提）
  if (hasActiveTask(tasks)) return { tasks: [], skipped: [] };

  let candidates = selectCandidates(tasks, terminalStatuses);
  // bug 最優先の維持: bug 候補があれば bug 群のみを対象にする
  if (candidates.some((task) => task.labels.includes("bug"))) {
    candidates = candidates.filter((task) => task.labels.includes("bug"));
  }
  // 群を絞った後は compareTasks の bug 優先は無効化され ordinal → ID 順になる
  candidates.sort(compareTasks);

  const selected: SelectedTask[] = [];
  const skipped: SkippedTask[] = [];
  // area → その area を最初に確保したタスク ID（衝突 reason 用）
  const areaOwner = new Map<string, string>();

  for (const candidate of candidates) {
    const areas = extractAreas(candidate.labels);

    if (areas.length === 0) {
      if (selected.length === 0) {
        // 保守的フォールバック: area 未付与タスクは衝突範囲が不明のため
        // 単独集合で確定し、以降の候補は走査しない
        return { tasks: [{ id: candidate.id, areas: [] }], skipped };
      }
      skipped.push({ id: candidate.id, reason: "no area labels" });
      continue;
    }

    const conflictArea = areas.find((area) => areaOwner.has(area));
    if (conflictArea !== undefined) {
      skipped.push({
        id: candidate.id,
        reason: `area conflict: ${conflictArea} (${
          areaOwner.get(conflictArea)
        })`,
      });
      continue;
    }

    selected.push({ id: candidate.id, areas });
    for (const area of areas) areaOwner.set(area, candidate.id);
  }

  return { tasks: selected, skipped };
}

if (import.meta.main) {
  const tasks = await readTasks(TASKS_DIR);
  console.log(JSON.stringify(selectNextTasks(tasks)));
}
