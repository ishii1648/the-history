/**
 * agent-loop の後始末スクリプト（マージ済みタスクブランチ / subagent worktree /
 * クローズ済み issue の claim タグの削除）。
 *
 * 1 タスク = 1 ブランチ（+ subagent の worktree isolation 用ブランチ + 着手時の
 * claim タグ `refs/tags/claim/issue-<N>`）を作り続ける agent-loop 運用では、
 * マージ後に後始末をしないと refs が単調増加し、ブランチ一覧・worktree の状態
 * 把握や不整合調査のノイズになる（当初の動機は backlog.md のクロスブランチ
 * 走査の劣化（TASK-112）。backlog.md 撤去後も refs を溜めない運用は継続する。
 * `docs/development-style.md` 4.3.3 章）。
 *
 * 安全設計（他セッションのブランチ・worktree を誤って消さないための多重防御）:
 *   1. ブランチ削除に `-D` は使わない。git が拒否したものは skipped として報告する
 *   2. 削除対象は loop が生成した名前だけ（ブランチ: `task-<N>-*` / `issue-<N>-*` /
 *      `worktree-agent-*`、worktree: `.claude/worktrees/` 配下）。人手のブランチ・
 *      セッション worktree は触らない
 *   3. origin/main にマージ済みのブランチのみ削除する
 *   4. どこかの worktree にチェックアウト中のブランチは削除しない
 *      （同じ実行で削除する worktree の分は解放されるものとして扱う）
 *   5. locked な worktree（実行中の subagent が保持）と自分自身の worktree は削除しない
 *   6. tip が origin/main と同一のブランチは削除しない。着手直後でまだコミットが無い
 *      in-flight のタスクブランチが「マージ済み」に見えてしまうため
 *
 * claim タグ掃除（TASK-141 / #165）:
 *   二重着手ガードの権威である claim タグ（`refs/tags/claim/issue-<N>`）は、
 *   issue が PR の `Closes #N` でクローズされたあとは掃除対象になる。削除する
 *   のは **gh でクローズ済みと確認できた issue の claim だけ**で、open な issue
 *   の claim（着手中の権威）と issue 一覧に現れない番号の claim は絶対に消さない。
 *   gh / ls-remote が失敗した場合は claim 掃除だけを skipped にして、ブランチ・
 *   worktree の掃除は継続する。
 *
 * `git worktree remove --force` の扱い（TASK-118）:
 *   subagent には「commit / push はしない」と指示しているため、mainagent がパッチを
 *   取り出したあとの subagent worktree は未コミットの変更を抱えたまま終わる。つまり
 *   dirty は異常ではなく常態であり、`git worktree remove` の dirty 拒否を最後の砦に
 *   すると削除が一切進まない（TASK-112 の設計の欠陥）。
 *
 *   通常経路は mainagent 側で解決する（パッチ抽出直後に `git reset --hard` +
 *   `git clean -fd` で worktree を元に戻す。`.claude/skills/agent-loop/SKILL.md` 手順 2）。
 *   スクリプト側は取りこぼしの回収に徹し、`canForceRemoveWorktree` が真の worktree
 *   ＝「loop が生成した使い捨ての足場」に限って `--force` の再試行を許す。成果は
 *   mainagent がパッチとして取り出し済みで、worktree に残る変更は複製にすぎない。
 *
 * 使い方:
 *   deno task cleanup-branches           # dry-run（計画を表示するだけ）
 *   deno task cleanup-branches --apply   # 実際に削除する
 *   deno task cleanup-branches --apply --no-fetch   # ネットワーク省略
 *     （fetch に加え、origin への問い合わせが要る claim タグ掃除もスキップする）
 *
 * 結果は JSON 1 行で stdout に出力する（`forced` は --force で回収した worktree、
 * `claimTags` は削除した（dry-run では削除予定の）claim タグの issue 番号）:
 *   {"mode":"apply","worktrees":[...],"forced":[...],"branches":[...],
 *    "claimTags":[...],"skipped":[...],"refsBefore":20,"refsAfter":7}
 */

/** `git worktree list --porcelain` の 1 エントリ */
export interface WorktreeEntry {
  path: string;
  head: string | null;
  /** チェックアウト中のブランチ短縮名。detached / bare なら null */
  branch: string | null;
  locked: boolean;
  prunable: boolean;
  bare: boolean;
  /** porcelain 出力の先頭エントリ（= main worktree） */
  isMain: boolean;
}

/** origin/main にマージ済みのローカルブランチ */
export interface MergedBranch {
  name: string;
  commit: string;
  /** チェックアウト中の worktree パス。どこにも無ければ空文字 */
  worktreePath: string;
}

/** 削除を見送った対象とその理由 */
export interface SkippedItem {
  kind: "worktree" | "branch" | "claim-tag";
  name: string;
  reason: string;
}

/** 削除する worktree 1 件 */
export interface WorktreeRemoval {
  path: string;
  /**
   * 通常の `git worktree remove` が dirty で拒否されたとき `--force` で
   * 再試行してよいか。`canForceRemoveWorktree` の判定結果。
   */
  force: boolean;
}

/** 後始末の計画（worktree は path + force、branch は名前） */
export interface CleanupPlan {
  worktrees: WorktreeRemoval[];
  branches: string[];
  skipped: SkippedItem[];
}

/** planCleanup の入力 */
export interface PlanInput {
  worktrees: WorktreeEntry[];
  branches: MergedBranch[];
  /** このスクリプトを実行している worktree の絶対パス */
  currentWorktree: string;
  /** origin/main の tip コミット */
  mainCommit: string;
}

const AGENT_WORKTREE_SEGMENT = "/.claude/worktrees/";
const TASK_BRANCH_PATTERN = /^task-\d+-/;
const ISSUE_BRANCH_PATTERN = /^issue-\d+-/;
const AGENT_BRANCH_PATTERN = /^worktree-agent-/;

/**
 * loop が生成したブランチ名か（純粋関数）。
 * `task-<数字>-*`（移行前のタスクブランチ）・`issue-<数字>-*`（Issue 移行後の
 * タスクブランチ。TASK-141 / #165）・`worktree-agent-*`（subagent の worktree
 * isolation）のみを対象とし、人手の `feat/*` や `docs/*` は対象外にする。
 */
export function isLoopBranch(name: string): boolean {
  return TASK_BRANCH_PATTERN.test(name) || ISSUE_BRANCH_PATTERN.test(name) ||
    AGENT_BRANCH_PATTERN.test(name);
}

/**
 * subagent の worktree ディレクトリか（純粋関数）。
 * `.claude/worktrees/<name>` の形だけを対象にし、`.claude/worktrees` 自身や
 * リポジトリ本体・セッション worktree（`<repo>@feat-*` 等）は対象外にする。
 */
export function isAgentWorktreePath(path: string): boolean {
  const index = path.indexOf(AGENT_WORKTREE_SEGMENT);
  if (index < 0) return false;
  return path.slice(index + AGENT_WORKTREE_SEGMENT.length).length > 0;
}

/**
 * `git worktree remove --force` を許してよい worktree か（純粋関数）。
 *
 * 許すのは「loop が生成した使い捨ての足場」だけ。次のいずれかに当たれば拒否する:
 *   - main / bare worktree
 *   - `.claude/worktrees/` 配下でない（＝人手のセッション worktree・他の checkout）
 *   - 自分自身の worktree（実行中のこのプロセスの足元）
 *   - locked（実行中の subagent が保持している）
 *   - チェックアウト中が `worktree-agent-*` でない（detached や `task-N-*` は
 *     loop の足場ではないので、未コミットの作業が失われうる）
 *
 * この条件が崩れると他セッションの作業を破壊する。緩めるときは
 * `docs/development-style.md` 4.3.3 章と decision を必ず更新すること。
 */
export function canForceRemoveWorktree(
  entry: WorktreeEntry,
  currentWorktree: string,
): boolean {
  if (entry.isMain || entry.bare) return false;
  if (!isAgentWorktreePath(entry.path)) return false;
  if (entry.path === currentWorktree) return false;
  if (entry.locked) return false;
  if (entry.branch === null) return false;
  return AGENT_BRANCH_PATTERN.test(entry.branch);
}

/** `git worktree list --porcelain` の出力を分解する（純粋関数） */
export function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  let current: WorktreeEntry | null = null;

  for (const rawLine of porcelain.split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") continue;

    const spaceIndex = line.indexOf(" ");
    const key = spaceIndex < 0 ? line : line.slice(0, spaceIndex);
    const value = spaceIndex < 0 ? "" : line.slice(spaceIndex + 1);

    if (key === "worktree") {
      current = {
        path: value,
        head: null,
        branch: null,
        locked: false,
        prunable: false,
        bare: false,
        isMain: entries.length === 0,
      };
      entries.push(current);
      continue;
    }
    if (current === null) continue;

    switch (key) {
      case "HEAD":
        current.head = value;
        break;
      case "branch":
        current.branch = value.replace(/^refs\/heads\//, "");
        break;
      case "locked":
        current.locked = true;
        break;
      case "prunable":
        current.prunable = true;
        break;
      case "bare":
        current.bare = true;
        break;
    }
  }

  return entries;
}

/**
 * `git for-each-ref --format='%(refname:short)%00%(objectname)%00%(worktreepath)'`
 * 相当の NUL 区切り出力を分解する（純粋関数）。
 */
export function parseMergedBranches(output: string): MergedBranch[] {
  const branches: MergedBranch[] = [];
  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const [name, commit, worktreePath] = line.split("\0");
    if (!name || !commit) continue;
    branches.push({ name, commit, worktreePath: worktreePath ?? "" });
  }
  return branches;
}

// --- claim タグ掃除（TASK-141 / #165） -----------------------------------

const CLAIM_TAG_REF_PREFIX = "refs/tags/claim/issue-";

/** issue 番号から claim タグの完全 ref を組み立てる（純粋関数） */
export function claimTagRef(issue: number): string {
  return `${CLAIM_TAG_REF_PREFIX}${issue}`;
}

/**
 * `git ls-remote origin 'refs/tags/claim/issue-*'` の出力から claim タグの
 * issue 番号を取り出す（純粋関数）。annotated tag の peeled 行（`^{}`）や
 * claim 以外の ref は無視し、昇順・重複なしで決定的に返す。
 */
export function parseClaimTagNumbers(lsRemote: string): number[] {
  const numbers = new Set<number>();
  for (const rawLine of lsRemote.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    const ref = line.split("\t")[1];
    if (ref === undefined || !ref.startsWith(CLAIM_TAG_REF_PREFIX)) continue;
    const suffix = ref.slice(CLAIM_TAG_REF_PREFIX.length);
    if (!/^\d+$/.test(suffix)) continue;
    numbers.add(Number(suffix));
  }
  return [...numbers].sort((a, b) => a - b);
}

/** claim タグ掃除の計画（deletions は issue 番号） */
export interface ClaimTagPlan {
  deletions: number[];
  skipped: SkippedItem[];
}

/**
 * 削除してよい claim タグを決める（純粋関数）。
 * **クローズ済みと確認できた issue の claim だけ**を削除対象にする。open な
 * issue の claim は着手中の権威そのものなので絶対に消さない。issue 一覧に
 * 現れない番号は「取り漏れ」と区別できないため、これも消さない（保守的）。
 * 入力順を保つため、同じ入力からは常に同じ計画が得られる。
 *
 * @param claims claim タグが存在する issue 番号（parseClaimTagNumbers の結果）
 * @param issueStates issue 番号 → state（gh の出力どおり "OPEN" / "CLOSED"）
 */
export function planClaimTagCleanup(
  claims: number[],
  issueStates: Map<number, string>,
): ClaimTagPlan {
  const deletions: number[] = [];
  const skipped: SkippedItem[] = [];
  for (const claim of claims) {
    const state = issueStates.get(claim);
    if (state === "CLOSED") {
      deletions.push(claim);
    } else if (state === "OPEN") {
      skipped.push({
        kind: "claim-tag",
        name: `claim/issue-${claim}`,
        reason: "issue is still open",
      });
    } else {
      skipped.push({
        kind: "claim-tag",
        name: `claim/issue-${claim}`,
        reason: "issue state unknown",
      });
    }
  }
  return { deletions, skipped };
}

/**
 * 削除してよい worktree / ブランチを決める（純粋関数）。
 * 入力順を保つため、同じ入力からは常に同じ計画が得られる。
 */
export function planCleanup(input: PlanInput): CleanupPlan {
  const { worktrees, branches, currentWorktree, mainCommit } = input;
  const skipped: SkippedItem[] = [];

  const worktreesToRemove: WorktreeRemoval[] = [];
  for (const entry of worktrees) {
    const skip = (reason: string) => {
      skipped.push({ kind: "worktree", name: entry.path, reason });
    };

    if (entry.isMain || entry.bare) {
      skip("main worktree");
      continue;
    }
    if (!isAgentWorktreePath(entry.path)) {
      skip("not an agent worktree (outside .claude/worktrees)");
      continue;
    }
    if (entry.path === currentWorktree) {
      skip("current worktree");
      continue;
    }
    if (entry.locked) {
      skip("locked (in use by another session)");
      continue;
    }
    if (entry.prunable) {
      skip("prunable (handled by git worktree prune)");
      continue;
    }
    worktreesToRemove.push({
      path: entry.path,
      force: canForceRemoveWorktree(entry, currentWorktree),
    });
  }

  // 同じ実行で削除する worktree が保持していたブランチは解放されるものとして扱う
  const freedWorktrees = new Set(worktreesToRemove.map((item) => item.path));

  const branchesToDelete: string[] = [];
  for (const entry of branches) {
    const skip = (reason: string) => {
      skipped.push({ kind: "branch", name: entry.name, reason });
    };

    if (!isLoopBranch(entry.name)) {
      skip("not a loop-generated branch");
      continue;
    }
    if (entry.commit === mainCommit) {
      // 着手直後でまだコミットが無いブランチ。origin/main の tip そのものなので
      // 「マージ済み」に見えるが、他セッションが実装中の可能性がある
      skip("no commits of its own (tip == origin/main)");
      continue;
    }
    if (entry.worktreePath !== "" && !freedWorktrees.has(entry.worktreePath)) {
      skip(`checked out at ${entry.worktreePath}`);
      continue;
    }
    branchesToDelete.push(entry.name);
  }

  return { worktrees: worktreesToRemove, branches: branchesToDelete, skipped };
}

// --- 以下は I/O を伴う実行部（単体テスト対象外） -----------------------

interface GitResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

async function runCommand(bin: string, args: string[]): Promise<GitResult> {
  const command = new Deno.Command(bin, {
    args,
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

function git(...args: string[]): Promise<GitResult> {
  return runCommand("git", args);
}

/**
 * origin の claim タグと gh の issue 状態から claim タグ掃除の計画を立てる。
 * gh / ls-remote が使えない場合は削除ゼロ + skipped 理由を返し、呼び出し側の
 * ブランチ・worktree 掃除を巻き添えにしない。
 */
async function gatherClaimTagPlan(network: boolean): Promise<ClaimTagPlan> {
  const skipAll = (reason: string): ClaimTagPlan => ({
    deletions: [],
    skipped: [{ kind: "claim-tag", name: "claim/issue-*", reason }],
  });

  if (!network) return skipAll("skipped (--no-fetch)");

  const lsRemote = await git("ls-remote", "origin", "refs/tags/claim/issue-*");
  if (!lsRemote.ok) {
    return skipAll(`git ls-remote failed: ${lsRemote.stderr}`);
  }
  const claims = parseClaimTagNumbers(lsRemote.stdout);
  if (claims.length === 0) return { deletions: [], skipped: [] };

  const issues = await runCommand("gh", [
    "issue",
    "list",
    "--state",
    "all",
    "--limit",
    "1000",
    "--json",
    "number,state",
  ]);
  if (!issues.ok) return skipAll(`gh issue list failed: ${issues.stderr}`);

  const states = new Map<number, string>();
  try {
    for (const entry of JSON.parse(issues.stdout) as unknown[]) {
      const record = entry as Record<string, unknown>;
      if (
        typeof record.number === "number" && typeof record.state === "string"
      ) {
        states.set(record.number, record.state);
      }
    }
  } catch (error) {
    return skipAll(`gh issue list returned invalid JSON: ${error}`);
  }
  return planClaimTagCleanup(claims, states);
}

async function countRefs(): Promise<number> {
  const { stdout } = await git("for-each-ref", "--format=%(refname)");
  return stdout.split("\n").filter((line) => line.trim() !== "").length;
}

async function main(args: string[]): Promise<number> {
  const apply = args.includes("--apply");
  const fetch = !args.includes("--no-fetch");

  if (fetch) {
    // origin 側で削除済みのブランチを落とし、origin/main を最新にしてから
    // マージ済み判定を行う（GitHub の deleteBranchOnMerge は有効化済み）
    const result = await git("fetch", "--prune");
    if (!result.ok) {
      console.error(`git fetch --prune failed: ${result.stderr}`);
      return 1;
    }
  }

  const refsBefore = await countRefs();

  const mainCommit = (await git("rev-parse", "origin/main")).stdout.trim();
  if (mainCommit === "") {
    console.error("origin/main not found");
    return 1;
  }
  const currentWorktree = (await git("rev-parse", "--show-toplevel")).stdout
    .trim();

  const worktrees = parseWorktreeList(
    (await git("worktree", "list", "--porcelain")).stdout,
  );
  const branches = parseMergedBranches(
    (await git(
      "branch",
      "--merged",
      "origin/main",
      "--format=%(refname:short)%00%(objectname)%00%(worktreepath)",
    )).stdout,
  );

  const plan = planCleanup({
    worktrees,
    branches,
    currentWorktree,
    mainCommit,
  });
  // claim タグ掃除は origin への問い合わせ（ls-remote / gh）が要るため、
  // --no-fetch（ネットワーク省略）ではスキップする
  const claimPlan = await gatherClaimTagPlan(fetch);
  plan.skipped.push(...claimPlan.skipped);

  if (!apply) {
    console.log(JSON.stringify({
      mode: "dry-run",
      ...plan,
      claimTags: claimPlan.deletions,
      refsBefore,
    }));
    return 0;
  }

  const removedWorktrees: string[] = [];
  const forcedWorktrees: string[] = [];
  for (const { path, force } of plan.worktrees) {
    const result = await git("worktree", "remove", path);
    if (result.ok) {
      removedWorktrees.push(path);
      continue;
    }
    // subagent worktree は「パッチ抽出済みで dirty」が常態なので、loop の
    // 使い捨て足場に限り --force で回収する（TASK-118）。それ以外は従来どおり
    // git の拒否を尊重し、skipped に理由付きで残す。
    if (!force) {
      plan.skipped.push({
        kind: "worktree",
        name: path,
        reason: result.stderr,
      });
      continue;
    }
    const forced = await git("worktree", "remove", "--force", path);
    if (forced.ok) {
      removedWorktrees.push(path);
      forcedWorktrees.push(path);
    } else {
      plan.skipped.push({
        kind: "worktree",
        name: path,
        reason: forced.stderr,
      });
    }
  }
  await git("worktree", "prune");

  const deletedBranches: string[] = [];
  for (const name of plan.branches) {
    // -D は使わない。未マージ・チェックアウト中のブランチは git が拒否する
    const result = await git("branch", "-d", name);
    if (result.ok) deletedBranches.push(name);
    else plan.skipped.push({ kind: "branch", name, reason: result.stderr });
  }

  const deletedClaimTags: number[] = [];
  for (const issue of claimPlan.deletions) {
    const ref = claimTagRef(issue);
    const result = await git("push", "origin", "--delete", ref);
    if (!result.ok) {
      plan.skipped.push({
        kind: "claim-tag",
        name: `claim/issue-${issue}`,
        reason: result.stderr,
      });
      continue;
    }
    deletedClaimTags.push(issue);
    // fetch で複製されたローカルタグも合わせて消す（無ければ失敗を無視）
    await git("tag", "-d", `claim/issue-${issue}`);
  }

  const refsAfter = await countRefs();
  console.log(JSON.stringify({
    mode: "apply",
    worktrees: removedWorktrees,
    forced: forcedWorktrees,
    branches: deletedBranches,
    claimTags: deletedClaimTags,
    skipped: plan.skipped,
    refsBefore,
    refsAfter,
  }));
  return 0;
}

if (import.meta.main) {
  Deno.exit(await main(Deno.args));
}
