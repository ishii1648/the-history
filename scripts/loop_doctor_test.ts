import { assertEquals, assertThrows } from "@std/assert";
import type { GhIssue } from "./task_source.ts";
import {
  diagnose,
  type DoctorInput,
  type Finding,
  type GhPr,
  hasUncheckedAcceptanceCriteria,
  parseClosingIssueRefs,
  parsePrsJson,
} from "./loop_doctor.ts";

// --- フィクスチャヘルパー ------------------------------------------------

function issue(
  overrides: Partial<GhIssue> & { number: number },
): GhIssue {
  return {
    title: `issue #${overrides.number}`,
    state: "OPEN",
    stateReason: null,
    labels: [{ name: "task" }],
    body: "## Acceptance Criteria\n\n- [x] AC1 done\n",
    ...overrides,
  };
}

function labels(...names: string[]): { name: string }[] {
  return names.map((name) => ({ name }));
}

function pr(overrides: Partial<GhPr> & { number: number }): GhPr {
  return { state: "MERGED", body: null, ...overrides };
}

function doctor(overrides: Partial<DoctorInput> = {}): Finding[] {
  return diagnose({ issues: [], prs: [], claims: [], ...overrides });
}

// --- parsePrsJson --------------------------------------------------------

Deno.test("parsePrsJson は gh pr list --json number,state,body の出力を分解する", () => {
  const text = JSON.stringify([
    { number: 12, state: "MERGED", body: "Closes #165" },
    { number: 13, state: "OPEN", body: null },
  ]);
  assertEquals(parsePrsJson(text), [
    { number: 12, state: "MERGED", body: "Closes #165" },
    { number: 13, state: "OPEN", body: null },
  ]);
});

Deno.test("parsePrsJson は形式不正をエラーにする", () => {
  assertThrows(() => parsePrsJson(`{"number":1}`));
  assertThrows(() => parsePrsJson(`[{"state":"MERGED"}]`));
  assertThrows(() => parsePrsJson(`[{"number":1}]`));
});

// --- parseClosingIssueRefs -----------------------------------------------

Deno.test("parseClosingIssueRefs は GitHub のクローズキーワードだけを拾う", () => {
  assertEquals(parseClosingIssueRefs("Closes #165"), [165]);
  assertEquals(parseClosingIssueRefs("closes #1 and fixes #2"), [1, 2]);
  assertEquals(parseClosingIssueRefs("Resolved #3\nFix #4"), [3, 4]);
  // 参照だけではクローズされない
  assertEquals(parseClosingIssueRefs("see #4 / related to #5"), []);
  // "closes" 直後に "#N" が続く形のみ（issue URL 形式は運用で使わない）
  assertEquals(parseClosingIssueRefs("closes issue #6"), []);
});

Deno.test("parseClosingIssueRefs は重複を除き出現順を保つ", () => {
  assertEquals(parseClosingIssueRefs("Closes #9, closes #7, fixes #9"), [9, 7]);
});

// --- hasUncheckedAcceptanceCriteria --------------------------------------

Deno.test("hasUncheckedAcceptanceCriteria は未チェックの checkbox を検出する", () => {
  assertEquals(hasUncheckedAcceptanceCriteria("- [ ] AC1 未検証"), true);
  assertEquals(hasUncheckedAcceptanceCriteria("  - [ ] AC2 インデント"), true);
  assertEquals(hasUncheckedAcceptanceCriteria("- [x] AC1 done"), false);
  assertEquals(hasUncheckedAcceptanceCriteria("本文に [ ] を含む文"), false);
  assertEquals(hasUncheckedAcceptanceCriteria(""), false);
});

// --- diagnose: open なのに Closes 指定 PR がマージ済み --------------------

Deno.test("diagnose はマージ済み PR が Closes 指定した open issue を検出する（修復不可）", () => {
  const findings = doctor({
    issues: [issue({ number: 165, state: "OPEN" })],
    prs: [pr({ number: 12, state: "MERGED", body: "TASK\n\nCloses #165" })],
  });
  assertEquals(findings, [{
    kind: "open-but-pr-merged",
    issue: 165,
    detail: "PR #12 (merged) closes #165 but the issue is still open",
    repair: null,
  }]);
});

Deno.test("diagnose は未マージ PR / closed issue への Closes を問題にしない", () => {
  assertEquals(
    doctor({
      issues: [issue({ number: 165, state: "OPEN" })],
      prs: [pr({ number: 12, state: "OPEN", body: "Closes #165" })],
    }),
    [],
  );
  assertEquals(
    doctor({
      issues: [
        issue({ number: 165, state: "CLOSED", stateReason: "COMPLETED" }),
      ],
      prs: [pr({ number: 12, state: "MERGED", body: "Closes #165" })],
    }),
    [],
  );
});

// --- diagnose: closed なのに AC 未チェック --------------------------------

Deno.test("diagnose は closed なのに AC 未チェックの task issue を検出する（修復不可）", () => {
  const findings = doctor({
    issues: [
      issue({
        number: 150,
        state: "CLOSED",
        stateReason: "COMPLETED",
        body: "## Acceptance Criteria\n\n- [x] AC1 done\n- [ ] AC2 未検証\n",
      }),
    ],
  });
  assertEquals(findings, [{
    kind: "closed-but-ac-unchecked",
    issue: 150,
    detail: "issue #150 is closed but has unchecked acceptance criteria",
    repair: null,
  }]);
});

Deno.test("diagnose は NOT_PLANNED / task ラベル無し / 全チェック済みを問題にしない", () => {
  assertEquals(
    doctor({
      issues: [
        // 取りやめは AC 未チェックが正常
        issue({
          number: 1,
          state: "CLOSED",
          stateReason: "NOT_PLANNED",
          body: "- [ ] AC1",
        }),
        // task ラベルが無い issue（needs-human 等）は対象外
        issue({
          number: 2,
          state: "CLOSED",
          stateReason: "COMPLETED",
          labels: labels("needs-human"),
          body: "- [ ] AC1",
        }),
        // 全チェック済み
        issue({ number: 3, state: "CLOSED", stateReason: "COMPLETED" }),
      ],
    }),
    [],
  );
});

// --- diagnose: claim タグ残存 --------------------------------------------

Deno.test("diagnose は closed issue に残る claim タグを検出しタグ削除で修復する", () => {
  const findings = doctor({
    issues: [issue({ number: 150, state: "CLOSED", stateReason: "COMPLETED" })],
    claims: [150],
  });
  assertEquals(findings, [{
    kind: "stale-claim-tag",
    issue: 150,
    detail: "claim tag remains for closed issue #150",
    repair: {
      argv: [
        "git",
        "push",
        "origin",
        "--delete",
        "refs/tags/claim/issue-150",
      ],
      description: "delete claim tag for issue #150",
    },
  }]);
});

Deno.test("diagnose は存在しない issue の claim タグを検出するが自動削除しない", () => {
  const findings = doctor({ claims: [999] });
  assertEquals(findings, [{
    kind: "stale-claim-tag",
    issue: 999,
    detail: "claim tag refers to unknown issue #999",
    repair: null,
  }]);
});

Deno.test("diagnose は open issue の claim タグ（正常な着手中）を問題にしない", () => {
  assertEquals(
    doctor({
      issues: [
        issue({
          number: 165,
          state: "OPEN",
          labels: labels("task", "status:in-progress"),
        }),
      ],
      claims: [165],
    }),
    [],
  );
});

// --- diagnose: advisory ラベルと claim タグの不一致 -----------------------

Deno.test("diagnose は claim 無しの status:in-progress ラベルをラベル削除で修復する", () => {
  const findings = doctor({
    issues: [
      issue({
        number: 165,
        state: "OPEN",
        labels: labels("task", "status:in-progress"),
      }),
    ],
  });
  assertEquals(findings, [{
    kind: "claim-label-mismatch",
    issue: 165,
    detail: "status:in-progress label without claim tag on open issue #165",
    repair: {
      argv: [
        "gh",
        "issue",
        "edit",
        "165",
        "--remove-label",
        "status:in-progress",
      ],
      description: "remove stale status:in-progress label from issue #165",
    },
  }]);
});

Deno.test("diagnose はラベル無しの claim タグをラベル付与で修復する", () => {
  const findings = doctor({
    issues: [issue({ number: 165, state: "OPEN" })],
    claims: [165],
  });
  assertEquals(findings, [{
    kind: "claim-label-mismatch",
    issue: 165,
    detail: "claim tag without status:in-progress label on open issue #165",
    repair: {
      argv: [
        "gh",
        "issue",
        "edit",
        "165",
        "--add-label",
        "status:in-progress",
      ],
      description: "add advisory status:in-progress label to issue #165",
    },
  }]);
});

Deno.test("diagnose は closed issue に残る status:in-progress ラベルをラベル削除で修復する", () => {
  const findings = doctor({
    issues: [
      issue({
        number: 150,
        state: "CLOSED",
        stateReason: "COMPLETED",
        labels: labels("task", "status:in-progress"),
      }),
    ],
  });
  assertEquals(findings, [{
    kind: "claim-label-mismatch",
    issue: 150,
    detail: "status:in-progress label remains on closed issue #150",
    repair: {
      argv: [
        "gh",
        "issue",
        "edit",
        "150",
        "--remove-label",
        "status:in-progress",
      ],
      description: "remove stale status:in-progress label from issue #150",
    },
  }]);
});

// --- diagnose: 複合・決定性 ----------------------------------------------

Deno.test("diagnose は複数の不整合を issue 番号順・種別順で決定的に返す", () => {
  const input: DoctorInput = {
    issues: [
      // open + merged PR + claim 無しラベル → 2 findings
      issue({
        number: 165,
        state: "OPEN",
        labels: labels("task", "status:in-progress"),
      }),
      // closed + AC 未チェック + claim 残存 → 2 findings
      issue({
        number: 150,
        state: "CLOSED",
        stateReason: "COMPLETED",
        body: "- [ ] AC1",
      }),
    ],
    prs: [pr({ number: 12, state: "MERGED", body: "Closes #165" })],
    claims: [150],
  };
  const findings = diagnose(input);
  assertEquals(
    findings.map((f) => [f.issue, f.kind]),
    [
      [150, "closed-but-ac-unchecked"],
      [150, "stale-claim-tag"],
      [165, "open-but-pr-merged"],
      [165, "claim-label-mismatch"],
    ],
  );
  // 同じ入力からは常に同じ結果（決定性）
  assertEquals(diagnose(input), findings);
});

Deno.test("diagnose は不整合が無ければ空配列を返す", () => {
  assertEquals(
    doctor({
      issues: [
        issue({
          number: 165,
          state: "OPEN",
          labels: labels("task", "status:in-progress"),
        }),
        issue({ number: 150, state: "CLOSED", stateReason: "COMPLETED" }),
      ],
      prs: [pr({ number: 12, state: "MERGED", body: "Closes #150" })],
      claims: [165],
    }),
    [],
  );
});
