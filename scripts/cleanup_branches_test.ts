import { assertEquals } from "@std/assert";
import {
  canForceRemoveWorktree,
  claimTagRef,
  type CleanupPlan,
  isAgentWorktreePath,
  isLoopBranch,
  type MergedBranch,
  parseClaimTagNumbers,
  parseMergedBranches,
  parseWorktreeList,
  planClaimTagCleanup,
  planCleanup,
  type WorktreeEntry,
  type WorktreeRemoval,
} from "./cleanup_branches.ts";

const MAIN_COMMIT = "b6b2664bab24863a46f58f980943fc7f1c31a222";
const SELF = "/repo/.claude/worktrees/agent-self";

function worktree(
  overrides: Partial<WorktreeEntry> & { path: string },
): WorktreeEntry {
  return {
    head: "0".repeat(40),
    branch: null,
    locked: false,
    prunable: false,
    bare: false,
    isMain: false,
    ...overrides,
  };
}

function removal(path: string, force = true): WorktreeRemoval {
  return { path, force };
}

function branch(
  overrides: Partial<MergedBranch> & { name: string },
): MergedBranch {
  return { commit: "1".repeat(40), worktreePath: "", ...overrides };
}

function plan(
  overrides: Partial<Parameters<typeof planCleanup>[0]> = {},
): CleanupPlan {
  return planCleanup({
    worktrees: [],
    branches: [],
    currentWorktree: SELF,
    mainCommit: MAIN_COMMIT,
    ...overrides,
  });
}

// --- parseWorktreeList -------------------------------------------------

Deno.test("parseWorktreeList は porcelain 出力を worktree エントリへ分解する", () => {
  const porcelain = [
    "worktree /repo",
    "HEAD aaaa",
    "branch refs/heads/main",
    "",
    "worktree /repo/.claude/worktrees/agent-1",
    "HEAD bbbb",
    "branch refs/heads/worktree-agent-1",
    "",
  ].join("\n");

  assertEquals(parseWorktreeList(porcelain), [
    worktree({ path: "/repo", head: "aaaa", branch: "main", isMain: true }),
    worktree({
      path: "/repo/.claude/worktrees/agent-1",
      head: "bbbb",
      branch: "worktree-agent-1",
    }),
  ]);
});

Deno.test("parseWorktreeList は locked / prunable / detached / bare を読み取る", () => {
  const porcelain = [
    "worktree /repo",
    "bare",
    "",
    "worktree /repo/detached",
    "HEAD cccc",
    "detached",
    "",
    "worktree /repo/.claude/worktrees/agent-2",
    "HEAD dddd",
    "branch refs/heads/worktree-agent-2",
    "locked claude agent agent-2 (pid 123)",
    "",
    "worktree /repo/.claude/worktrees/agent-3",
    "HEAD eeee",
    "branch refs/heads/worktree-agent-3",
    "prunable gitdir file points to non-existent location",
    "",
  ].join("\n");

  const entries = parseWorktreeList(porcelain);
  assertEquals(entries.length, 4);
  assertEquals(entries[0].bare, true);
  assertEquals(entries[0].isMain, true);
  assertEquals(entries[1].branch, null);
  assertEquals(entries[2].locked, true);
  assertEquals(entries[3].prunable, true);
});

// --- parseMergedBranches -----------------------------------------------

Deno.test("parseMergedBranches は NUL 区切りの for-each-ref 出力を分解する", () => {
  const output = [
    `main\0${MAIN_COMMIT}\0/repo`,
    `task-99-peak-markers\0cccc\0`,
    `worktree-agent-1\0dddd\0/repo/.claude/worktrees/agent-1`,
  ].join("\n");

  assertEquals(parseMergedBranches(output), [
    branch({ name: "main", commit: MAIN_COMMIT, worktreePath: "/repo" }),
    branch({ name: "task-99-peak-markers", commit: "cccc" }),
    branch({
      name: "worktree-agent-1",
      commit: "dddd",
      worktreePath: "/repo/.claude/worktrees/agent-1",
    }),
  ]);
});

// --- 対象判定 ----------------------------------------------------------

Deno.test("isLoopBranch は task-N-* / issue-N-* / worktree-agent-* のみを対象にする", () => {
  assertEquals(isLoopBranch("task-112-loop-cleanup"), true);
  assertEquals(isLoopBranch("issue-165-agent-loop-issue"), true);
  assertEquals(isLoopBranch("worktree-agent-a8d27b0e"), true);
  assertEquals(isLoopBranch("main"), false);
  assertEquals(isLoopBranch("feat/20260722-235030"), false);
  assertEquals(isLoopBranch("docs/claude-md-task-conventions"), false);
  assertEquals(isLoopBranch("task-foo"), false);
  assertEquals(isLoopBranch("issue-foo"), false);
});

Deno.test("isAgentWorktreePath は .claude/worktrees 配下のみを対象にする", () => {
  assertEquals(isAgentWorktreePath("/repo/.claude/worktrees/agent-1"), true);
  assertEquals(isAgentWorktreePath("/repo"), false);
  assertEquals(isAgentWorktreePath("/repo@feat-20260721-115903"), false);
  assertEquals(isAgentWorktreePath("/repo/.claude/worktrees"), false);
});

// --- canForceRemoveWorktree（--force を許す範囲の固定・AC #3） -----------

Deno.test("canForceRemoveWorktree は loop の使い捨て足場だけを対象にする", () => {
  assertEquals(
    canForceRemoveWorktree(
      worktree({
        path: "/repo/.claude/worktrees/agent-1",
        branch: "worktree-agent-1",
      }),
      SELF,
    ),
    true,
  );
});

Deno.test("canForceRemoveWorktree は locked な worktree（実行中の subagent）を拒否する", () => {
  assertEquals(
    canForceRemoveWorktree(
      worktree({
        path: "/repo/.claude/worktrees/agent-busy",
        branch: "worktree-agent-busy",
        locked: true,
      }),
      SELF,
    ),
    false,
  );
});

Deno.test("canForceRemoveWorktree は .claude/worktrees 外（他セッション）を拒否する", () => {
  for (
    const entry of [
      worktree({ path: "/repo", branch: "main", isMain: true }),
      worktree({ path: "/repo", branch: "main", bare: true, isMain: true }),
      worktree({ path: "/repo@feat-20260721-115903", branch: "main" }),
      worktree({
        path: "/elsewhere/worktrees/agent-1",
        branch: "worktree-agent-1",
      }),
      worktree({ path: "/repo/.claude/worktrees", branch: "worktree-agent-1" }),
    ]
  ) {
    assertEquals(canForceRemoveWorktree(entry, SELF), false, entry.path);
  }
});

Deno.test("canForceRemoveWorktree は自分自身の worktree を拒否する", () => {
  assertEquals(
    canForceRemoveWorktree(
      worktree({ path: SELF, branch: "worktree-agent-self" }),
      SELF,
    ),
    false,
  );
});

Deno.test("canForceRemoveWorktree は worktree-agent-* 以外がチェックアウトされた worktree を拒否する", () => {
  for (
    const entry of [
      worktree({
        path: "/repo/.claude/worktrees/agent-1",
        branch: "task-118-cleanup-force",
      }),
      worktree({ path: "/repo/.claude/worktrees/agent-1", branch: "main" }),
      worktree({ path: "/repo/.claude/worktrees/agent-1", branch: null }),
    ]
  ) {
    assertEquals(canForceRemoveWorktree(entry, SELF), false, `${entry.branch}`);
  }
});

// --- planCleanup: worktree ---------------------------------------------

Deno.test("planCleanup は .claude/worktrees 配下の未使用 worktree を削除対象にする", () => {
  const result = plan({
    worktrees: [
      worktree({ path: "/repo", branch: "main", isMain: true }),
      worktree({
        path: "/repo/.claude/worktrees/agent-1",
        branch: "worktree-agent-1",
      }),
    ],
  });
  assertEquals(result.worktrees, [removal("/repo/.claude/worktrees/agent-1")]);
});

Deno.test("planCleanup は agent worktree でも detached / タスクブランチには force を立てない", () => {
  const result = plan({
    worktrees: [
      worktree({ path: "/repo/.claude/worktrees/agent-1", branch: null }),
      worktree({
        path: "/repo/.claude/worktrees/agent-2",
        branch: "task-118-cleanup-force",
      }),
    ],
  });
  assertEquals(result.worktrees, [
    removal("/repo/.claude/worktrees/agent-1", false),
    removal("/repo/.claude/worktrees/agent-2", false),
  ]);
});

Deno.test("planCleanup は force 対象を canForceRemoveWorktree が真の worktree に限る（AC #3）", () => {
  const worktrees = [
    worktree({ path: "/repo", branch: "main", isMain: true }),
    worktree({ path: "/repo@feat-20260721-115903", branch: "main" }),
    worktree({ path: SELF, branch: "worktree-agent-self" }),
    worktree({
      path: "/repo/.claude/worktrees/agent-busy",
      branch: "worktree-agent-busy",
      locked: true,
    }),
    worktree({
      path: "/repo/.claude/worktrees/agent-done",
      branch: "worktree-agent-done",
    }),
  ];
  const result = plan({ currentWorktree: SELF, worktrees });

  assertEquals(
    result.worktrees.filter((item) => item.force).map((item) => item.path),
    ["/repo/.claude/worktrees/agent-done"],
  );
  for (const item of result.worktrees) {
    const entry = worktrees.find((w) => w.path === item.path)!;
    assertEquals(item.force, canForceRemoveWorktree(entry, SELF), item.path);
  }
});

Deno.test("planCleanup は locked な worktree を削除しない（他セッションが使用中）", () => {
  const result = plan({
    worktrees: [
      worktree({
        path: "/repo/.claude/worktrees/agent-1",
        branch: "worktree-agent-1",
        locked: true,
      }),
    ],
  });
  assertEquals(result.worktrees, []);
  assertEquals(result.skipped, [{
    kind: "worktree",
    name: "/repo/.claude/worktrees/agent-1",
    reason: "locked (in use by another session)",
  }]);
});

Deno.test("planCleanup は自分自身の worktree を削除しない", () => {
  const result = plan({
    currentWorktree: SELF,
    worktrees: [
      worktree({ path: SELF, branch: "worktree-agent-self" }),
    ],
  });
  assertEquals(result.worktrees, []);
  assertEquals(result.skipped, [{
    kind: "worktree",
    name: SELF,
    reason: "current worktree",
  }]);
});

Deno.test("planCleanup は main worktree と .claude/worktrees 外の worktree を削除しない", () => {
  const result = plan({
    worktrees: [
      worktree({ path: "/repo", branch: "main", isMain: true }),
      worktree({ path: "/repo@feat-20260721-115903", branch: "main" }),
    ],
  });
  assertEquals(result.worktrees, []);
  assertEquals(result.skipped, [
    { kind: "worktree", name: "/repo", reason: "main worktree" },
    {
      kind: "worktree",
      name: "/repo@feat-20260721-115903",
      reason: "not an agent worktree (outside .claude/worktrees)",
    },
  ]);
});

Deno.test("planCleanup は prunable な worktree を remove 対象にしない（prune が処理する）", () => {
  const result = plan({
    worktrees: [
      worktree({
        path: "/repo/.claude/worktrees/agent-1",
        branch: "worktree-agent-1",
        prunable: true,
      }),
    ],
  });
  assertEquals(result.worktrees, []);
  assertEquals(result.skipped, [{
    kind: "worktree",
    name: "/repo/.claude/worktrees/agent-1",
    reason: "prunable (handled by git worktree prune)",
  }]);
});

// --- planCleanup: branch -----------------------------------------------

Deno.test("planCleanup はマージ済みで未チェックアウトのタスクブランチを削除対象にする", () => {
  const result = plan({
    branches: [
      branch({ name: "task-99-peak-markers", commit: "cccc" }),
      branch({ name: "task-117-popover-overflow", commit: "dddd" }),
    ],
  });
  assertEquals(result.branches, [
    "task-99-peak-markers",
    "task-117-popover-overflow",
  ]);
  assertEquals(result.skipped, []);
});

Deno.test("planCleanup は main と loop 由来でないブランチを削除しない", () => {
  const result = plan({
    branches: [
      branch({ name: "main", commit: "cccc" }),
      branch({ name: "feat/20260722-235030", commit: "dddd" }),
    ],
  });
  assertEquals(result.branches, []);
  assertEquals(result.skipped, [
    { kind: "branch", name: "main", reason: "not a loop-generated branch" },
    {
      kind: "branch",
      name: "feat/20260722-235030",
      reason: "not a loop-generated branch",
    },
  ]);
});

Deno.test("planCleanup は tip が origin/main と同一のブランチを削除しない（着手直後の in-flight）", () => {
  const result = plan({
    branches: [branch({ name: "task-112-loop-cleanup", commit: MAIN_COMMIT })],
  });
  assertEquals(result.branches, []);
  assertEquals(result.skipped, [{
    kind: "branch",
    name: "task-112-loop-cleanup",
    reason: "no commits of its own (tip == origin/main)",
  }]);
});

Deno.test("planCleanup は他 worktree がチェックアウト中のブランチを削除しない", () => {
  const result = plan({
    worktrees: [
      worktree({
        path: "/repo/.claude/worktrees/agent-busy",
        branch: "worktree-agent-busy",
        locked: true,
      }),
    ],
    branches: [
      branch({
        name: "worktree-agent-busy",
        commit: "cccc",
        worktreePath: "/repo/.claude/worktrees/agent-busy",
      }),
    ],
  });
  assertEquals(result.branches, []);
  assertEquals(
    result.skipped.filter((item) => item.kind === "branch"),
    [{
      kind: "branch",
      name: "worktree-agent-busy",
      reason: "checked out at /repo/.claude/worktrees/agent-busy",
    }],
  );
});

Deno.test("planCleanup は同じ実行で削除する worktree のブランチは削除対象にする", () => {
  const result = plan({
    worktrees: [
      worktree({
        path: "/repo/.claude/worktrees/agent-1",
        branch: "worktree-agent-1",
      }),
    ],
    branches: [
      branch({
        name: "worktree-agent-1",
        commit: "cccc",
        worktreePath: "/repo/.claude/worktrees/agent-1",
      }),
    ],
  });
  assertEquals(result.worktrees, [removal("/repo/.claude/worktrees/agent-1")]);
  assertEquals(result.branches, ["worktree-agent-1"]);
});

// --- claim タグ掃除（TASK-141 / #165） -----------------------------------

Deno.test("claimTagRef は issue 番号から claim タグの完全 ref を組み立てる", () => {
  assertEquals(claimTagRef(165), "refs/tags/claim/issue-165");
});

Deno.test("parseClaimTagNumbers は ls-remote 出力から claim タグの issue 番号を取り出す", () => {
  const lsRemote = [
    `${"a".repeat(40)}\trefs/tags/claim/issue-165`,
    `${"b".repeat(40)}\trefs/tags/claim/issue-150`,
    // annotated tag の peeled 行・claim 以外の ref は無視する
    `${"c".repeat(40)}\trefs/tags/claim/issue-150^{}`,
    `${"d".repeat(40)}\trefs/tags/v1.0.0`,
    `${"e".repeat(40)}\trefs/heads/main`,
    `${"f".repeat(40)}\trefs/tags/claim/issue-abc`,
    "",
  ].join("\n");
  // 昇順・重複なしで決定的に返す
  assertEquals(parseClaimTagNumbers(lsRemote), [150, 165]);
});

Deno.test("planClaimTagCleanup はクローズ済み issue の claim タグだけを削除対象にする", () => {
  const states = new Map<number, string>([
    [150, "CLOSED"],
    [165, "OPEN"],
  ]);
  const result = planClaimTagCleanup([150, 165, 999], states);
  assertEquals(result.deletions, [150]);
  assertEquals(result.skipped, [
    {
      kind: "claim-tag",
      name: "claim/issue-165",
      reason: "issue is still open",
    },
    {
      kind: "claim-tag",
      name: "claim/issue-999",
      reason: "issue state unknown",
    },
  ]);
});

Deno.test("planClaimTagCleanup は未クローズ・状態不明の claim を絶対に削除しない", () => {
  // issue 状態が 1 件も取れない場合、削除対象は空になる（保守的）
  const result = planClaimTagCleanup([150, 165], new Map());
  assertEquals(result.deletions, []);
  assertEquals(result.skipped.length, 2);
  for (const item of result.skipped) {
    assertEquals(item.kind, "claim-tag");
    assertEquals(item.reason, "issue state unknown");
  }
});

Deno.test("planClaimTagCleanup は同じ入力から常に同じ計画を返す（決定性）", () => {
  const states = new Map<number, string>([[10, "CLOSED"], [11, "CLOSED"]]);
  assertEquals(
    planClaimTagCleanup([11, 10], states),
    planClaimTagCleanup([11, 10], states),
  );
  assertEquals(planClaimTagCleanup([11, 10], states).deletions, [11, 10]);
});

Deno.test("planCleanup は入力順を保った決定的な結果を返す", () => {
  const input = {
    worktrees: [
      worktree({ path: "/repo", branch: "main", isMain: true }),
      worktree({
        path: "/repo/.claude/worktrees/agent-2",
        branch: "worktree-agent-2",
      }),
      worktree({
        path: "/repo/.claude/worktrees/agent-1",
        branch: "worktree-agent-1",
      }),
    ],
    branches: [
      branch({ name: "task-99-peak-markers", commit: "cccc" }),
      branch({ name: "task-11-finalize-backlog", commit: "dddd" }),
    ],
    currentWorktree: "/repo/.claude/worktrees/agent-self",
    mainCommit: MAIN_COMMIT,
  };
  assertEquals(planCleanup(input), planCleanup(input));
  assertEquals(planCleanup(input).worktrees, [
    removal("/repo/.claude/worktrees/agent-2"),
    removal("/repo/.claude/worktrees/agent-1"),
  ]);
  assertEquals(planCleanup(input).branches, [
    "task-99-peak-markers",
    "task-11-finalize-backlog",
  ]);
});
