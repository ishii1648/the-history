/**
 * agent-loop の整合性診断スクリプト（loop-doctor。TASK-141 / #165）。
 *
 * タスク管理の GitHub Issue 移行（docs/adr/0031）で、着手〜finalization は
 * 「claim タグ push（権威）→ 実装 → AC チェック 1 回の本文編集 → PR の
 * `Closes #N` による自動クローズ → claim タグ掃除」という複数ステップに
 * 分かれ、途中の異常終了で不整合が残りうる。アトミック性を失った代償として、
 * 本スクリプトが不整合の検出・修復を明示的に担う。
 *
 * 検査する不整合パターン:
 *   - open-but-pr-merged:   `Closes #N` 指定 PR がマージ済みなのに issue が open
 *                           （Closes 記述漏れ・自動クローズ失敗の兆候。修復不可）
 *   - closed-but-ac-unchecked: closed（COMPLETED）なのに AC が未チェック
 *                           （finalization の AC チェック漏れ。修復不可）
 *   - stale-claim-tag:      closed issue に claim タグ `refs/tags/claim/issue-<N>`
 *                           が残存（--apply でタグ削除）。存在しない issue への
 *                           claim は検出のみ（自動削除しない）
 *   - claim-label-mismatch: advisory の `status:in-progress` ラベルと claim タグ
 *                           の不一致（--apply でラベルを claim に合わせる。
 *                           権威は常に claim タグ側）
 *
 * 診断は純粋関数 `diagnose` に切り出し、フィクスチャ JSON でテストする
 * （scripts/loop_doctor_test.ts）。入力は `--issues-json` / `--prs-json` /
 * `--claims` で注入でき、ネットワーク・gh 非依存で検証できる。
 *
 * 使い方（cleanup_branches.ts と同じ規約: dry-run 既定・--apply で修復）:
 *   deno task loop-doctor            # 診断のみ（修復コマンドは表示だけ）
 *   deno task loop-doctor --apply    # 修復可能な不整合を実際に修復する
 *   deno task loop-doctor --issues-json <path> --prs-json <path> --claims <path>
 *                                    # gh / git を起動せずフィクスチャで診断
 *
 * 結果は JSON 1 行で stdout に出力する:
 *   {"mode":"dry-run","findings":[{"kind":"...","issue":150,"detail":"...",
 *    "repair":{"argv":[...],"description":"..."}},...]}
 *   {"mode":"apply","findings":[...],"applied":[{"argv":[...],"ok":true},...]}
 */

import { type GhIssue, parseIssuesJson } from "./task_source.ts";
import { claimTagRef, parseClaimTagNumbers } from "./cleanup_branches.ts";

/** `gh pr list --json number,state,body` の 1 要素 */
export interface GhPr {
  number: number;
  /** "OPEN" | "CLOSED" | "MERGED"（gh の出力どおり大文字） */
  state: string;
  body: string | null;
}

/** 修復コマンド（argv 形式。--apply 時にそのまま実行される） */
export interface RepairCommand {
  argv: string[];
  description: string;
}

/** 検出した不整合の種別 */
export type FindingKind =
  | "open-but-pr-merged"
  | "closed-but-ac-unchecked"
  | "stale-claim-tag"
  | "claim-label-mismatch";

/** 検出した不整合 1 件。repair が null のものは自動修復しない */
export interface Finding {
  kind: FindingKind;
  issue: number;
  detail: string;
  repair: RepairCommand | null;
}

/** diagnose の入力（gh issue list / gh pr list / git ls-remote の結果を注入） */
export interface DoctorInput {
  issues: GhIssue[];
  prs: GhPr[];
  /** origin に存在する claim タグの issue 番号（parseClaimTagNumbers の結果） */
  claims: number[];
}

const IN_PROGRESS_LABEL = "status:in-progress";

/** 種別の表示順（診断結果の決定的な並びに使う） */
const KIND_ORDER: FindingKind[] = [
  "open-but-pr-merged",
  "closed-but-ac-unchecked",
  "stale-claim-tag",
  "claim-label-mismatch",
];

/**
 * `gh pr list --json number,state,body` の出力テキストを GhPr 一覧にする
 * （純粋関数）。形式不正は静かに握り潰さずエラーにする。
 */
export function parsePrsJson(text: string): GhPr[] {
  const data = JSON.parse(text);
  if (!Array.isArray(data)) {
    throw new Error("prs JSON must be an array");
  }
  return data.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`prs[${index}]: not an object`);
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.number !== "number") {
      throw new Error(`prs[${index}]: missing numeric "number"`);
    }
    if (typeof record.state !== "string") {
      throw new Error(`prs[${index}]: missing string "state"`);
    }
    return {
      number: record.number,
      state: record.state,
      body: typeof record.body === "string" ? record.body : null,
    };
  });
}

/**
 * PR 本文から GitHub のクローズキーワードで参照される issue 番号を取り出す
 * （純粋関数）。`close(s|d)` / `fix(es|ed)` / `resolve(s|d)` の直後の `#N` のみを
 * クローズ指定とみなし、単なる参照（`see #N` 等）は含めない。重複を除き
 * 出現順を保つ。
 */
export function parseClosingIssueRefs(body: string): number[] {
  const pattern = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi;
  const refs: number[] = [];
  for (const match of body.matchAll(pattern)) {
    const n = Number(match[1]);
    if (!refs.includes(n)) refs.push(n);
  }
  return refs;
}

/** 本文に未チェックの checkbox（`- [ ]`）が残っているか（純粋関数） */
export function hasUncheckedAcceptanceCriteria(body: string): boolean {
  return /^[ \t]*[-*] \[ \]/m.test(body);
}

function hasLabel(issue: GhIssue, name: string): boolean {
  return issue.labels.some((label) => label.name === name);
}

/**
 * 不整合を診断する（純粋関数）。
 * 結果は issue 番号昇順 → KIND_ORDER 順で並べ、同じ入力からは常に同じ
 * findings（順序含む）が得られる。
 */
export function diagnose(input: DoctorInput): Finding[] {
  const issueByNumber = new Map<number, GhIssue>(
    input.issues.map((issue) => [issue.number, issue]),
  );
  const claims = new Set(input.claims);
  const findings: Finding[] = [];

  // 1. open なのに Closes 指定 PR がマージ済み（自動クローズが働いていない）
  for (const pr of input.prs) {
    if (pr.state !== "MERGED") continue;
    for (const ref of parseClosingIssueRefs(pr.body ?? "")) {
      const issue = issueByNumber.get(ref);
      if (issue === undefined || issue.state !== "OPEN") continue;
      findings.push({
        kind: "open-but-pr-merged",
        issue: ref,
        detail:
          `PR #${pr.number} (merged) closes #${ref} but the issue is still open`,
        repair: null,
      });
    }
  }

  for (const issue of input.issues) {
    const inProgress = hasLabel(issue, IN_PROGRESS_LABEL);
    const claimed = claims.has(issue.number);

    if (issue.state === "CLOSED") {
      // 2. closed（COMPLETED）なのに AC 未チェック（finalization 漏れ）
      if (
        issue.stateReason !== "NOT_PLANNED" &&
        hasLabel(issue, "task") &&
        hasUncheckedAcceptanceCriteria(issue.body ?? "")
      ) {
        findings.push({
          kind: "closed-but-ac-unchecked",
          issue: issue.number,
          detail:
            `issue #${issue.number} is closed but has unchecked acceptance criteria`,
          repair: null,
        });
      }
      // 3. closed issue に claim タグが残存（掃除漏れ。削除して修復）
      if (claimed) {
        findings.push({
          kind: "stale-claim-tag",
          issue: issue.number,
          detail: `claim tag remains for closed issue #${issue.number}`,
          repair: {
            argv: [
              "git",
              "push",
              "origin",
              "--delete",
              claimTagRef(issue.number),
            ],
            description: `delete claim tag for issue #${issue.number}`,
          },
        });
      }
      // closed issue に advisory ラベルが残存（外して修復）
      if (inProgress) {
        findings.push({
          kind: "claim-label-mismatch",
          issue: issue.number,
          detail:
            `${IN_PROGRESS_LABEL} label remains on closed issue #${issue.number}`,
          repair: {
            argv: [
              "gh",
              "issue",
              "edit",
              String(issue.number),
              "--remove-label",
              IN_PROGRESS_LABEL,
            ],
            description:
              `remove stale ${IN_PROGRESS_LABEL} label from issue #${issue.number}`,
          },
        });
      }
      continue;
    }

    // 4. advisory ラベルと claim タグの不一致（権威は claim タグ側）
    if (inProgress && !claimed) {
      findings.push({
        kind: "claim-label-mismatch",
        issue: issue.number,
        detail:
          `${IN_PROGRESS_LABEL} label without claim tag on open issue #${issue.number}`,
        repair: {
          argv: [
            "gh",
            "issue",
            "edit",
            String(issue.number),
            "--remove-label",
            IN_PROGRESS_LABEL,
          ],
          description:
            `remove stale ${IN_PROGRESS_LABEL} label from issue #${issue.number}`,
        },
      });
    } else if (!inProgress && claimed) {
      findings.push({
        kind: "claim-label-mismatch",
        issue: issue.number,
        detail:
          `claim tag without ${IN_PROGRESS_LABEL} label on open issue #${issue.number}`,
        repair: {
          argv: [
            "gh",
            "issue",
            "edit",
            String(issue.number),
            "--add-label",
            IN_PROGRESS_LABEL,
          ],
          description:
            `add advisory ${IN_PROGRESS_LABEL} label to issue #${issue.number}`,
        },
      });
    }
  }

  // 存在しない issue への claim タグ（issue 一覧に無い番号）。削除は保守的に
  // 自動化しない（issue 一覧の取り漏れと区別できないため、人が確認して消す）
  for (const claim of input.claims) {
    if (issueByNumber.has(claim)) continue;
    findings.push({
      kind: "stale-claim-tag",
      issue: claim,
      detail: `claim tag refers to unknown issue #${claim}`,
      repair: null,
    });
  }

  findings.sort((a, b) =>
    a.issue - b.issue ||
    KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)
  );
  return findings;
}

// --- 以下は I/O を伴う実行部（単体テスト対象外） -----------------------

interface CommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function run(argv: string[]): Promise<CommandResult> {
  const command = new Deno.Command(argv[0], {
    args: argv.slice(1),
    stdout: "piped",
    stderr: "piped",
  });
  const { success, stdout, stderr } = await command.output();
  return {
    ok: success,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr).trim(),
  };
}

function argValue(args: string[], name: string): string | null {
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name) return args[i + 1] ?? null;
    if (args[i].startsWith(`${name}=`)) return args[i].slice(name.length + 1);
  }
  return null;
}

async function readOrRun(
  path: string | null,
  argv: string[],
): Promise<string> {
  if (path !== null) return await Deno.readTextFile(path);
  const result = await run(argv);
  if (!result.ok) {
    throw new Error(`${argv.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout;
}

async function main(args: string[]): Promise<number> {
  const apply = args.includes("--apply");

  const issuesText = await readOrRun(argValue(args, "--issues-json"), [
    "gh",
    "issue",
    "list",
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,title,state,stateReason,labels,body",
  ]);
  const prsText = await readOrRun(argValue(args, "--prs-json"), [
    "gh",
    "pr",
    "list",
    "--state",
    "all",
    "--limit",
    "200",
    "--json",
    "number,state,body",
  ]);
  const claimsText = await readOrRun(argValue(args, "--claims"), [
    "git",
    "ls-remote",
    "origin",
    "refs/tags/claim/issue-*",
  ]);

  const findings = diagnose({
    issues: parseIssuesJson(issuesText),
    prs: parsePrsJson(prsText),
    claims: parseClaimTagNumbers(claimsText),
  });

  if (!apply) {
    console.log(JSON.stringify({ mode: "dry-run", findings }));
    return 0;
  }

  const applied: { argv: string[]; ok: boolean; stderr?: string }[] = [];
  for (const finding of findings) {
    if (finding.repair === null) continue;
    const result = await run(finding.repair.argv);
    applied.push(
      result.ok
        ? { argv: finding.repair.argv, ok: true }
        : { argv: finding.repair.argv, ok: false, stderr: result.stderr },
    );
  }

  console.log(JSON.stringify({ mode: "apply", findings, applied }));
  return 0;
}

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
