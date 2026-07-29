import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { parseLoopMeta } from "./task_source.ts";
import {
  type ArchivedTask,
  BACKLOG_ARCHIVED_FILES,
  buildGhCreateArgs,
  buildIssueBody,
  formatAcItem,
  insertMigrationLink,
  parseArchivedTask,
  parseIssueNumberFromOutput,
  selectMigratable,
  topoSortMigratable,
} from "./migrate-tasks-to-issues.ts";

const FIXTURE_FILE = "task-901 - フィクスチャタスク.md";

const FIXTURE = `---
id: TASK-901
title: フィクスチャタスク（\`gh\` 検証用）
status: To Do
assignee: []
created_date: '2026-07-28 17:39'
labels:
  - 'area:scripts-loop'
  - 'area:workflow'
dependencies:
  - TASK-900
  - TASK-1
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: 移行スクリプトの検証用フィクスチャ。

確定事項:
- \`gh issue create --body-file\` で起票する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 新規タスクが Issue として起票できる
- [x] #2 済んだ項目はチェック済みのまま移る
- [ ] #3 深い依存も解決される
<!-- AC:END -->
`;

function task(overrides: Partial<ArchivedTask>): ArchivedTask {
  return {
    id: "TASK-901",
    title: "フィクスチャタスク",
    status: "To Do",
    labels: ["area:workflow"],
    dependencies: [],
    ordinal: 1000,
    description: "説明",
    acItems: [{ checked: false, number: 1, text: "AC 本文" }],
    fileName: FIXTURE_FILE,
    ...overrides,
  };
}

// ---- parseArchivedTask（frontmatter + SECTION マーカー + AC ブロック） ----

Deno.test("parseArchivedTask は frontmatter・Description・AC 項目を取り出す", () => {
  const parsed = parseArchivedTask(FIXTURE, FIXTURE_FILE);
  assertEquals(parsed, {
    id: "TASK-901",
    title: "フィクスチャタスク（`gh` 検証用）",
    status: "To Do",
    labels: ["area:scripts-loop", "area:workflow"],
    dependencies: ["TASK-900", "TASK-1"],
    ordinal: 121000,
    description:
      "背景: 移行スクリプトの検証用フィクスチャ。\n\n確定事項:\n- `gh issue create --body-file` で起票する。",
    acItems: [
      {
        checked: false,
        number: 1,
        text: "新規タスクが Issue として起票できる",
      },
      { checked: true, number: 2, text: "済んだ項目はチェック済みのまま移る" },
      { checked: false, number: 3, text: "深い依存も解決される" },
    ],
    fileName: FIXTURE_FILE,
  });
});

Deno.test("parseArchivedTask は SECTION マーカーが無くても見出しから Description を取り出す", () => {
  const markdown = `---
id: TASK-2
title: 旧形式
status: In Progress
labels: []
dependencies: []
ordinal: 2000
---

## Description

古い形式の説明。

## Acceptance Criteria

- [ ] #1 動く
`;
  const parsed = parseArchivedTask(markdown, "task-2 - 旧形式.md");
  assertEquals(parsed?.description, "古い形式の説明。");
  assertEquals(parsed?.acItems, [{ checked: false, number: 1, text: "動く" }]);
});

Deno.test("parseArchivedTask は frontmatter の無い markdown に null を返す", () => {
  assertEquals(parseArchivedTask("# ただの文書\n", "readme.md"), null);
});

// ---- formatAcItem（`- [ ] #N` → `- [ ] ACN` 変換） ----

Deno.test("formatAcItem は #N 記法を ACN 記法へ変換する", () => {
  assertEquals(
    formatAcItem({ checked: false, number: 1, text: "起票できる" }),
    "- [ ] AC1 起票できる",
  );
  assertEquals(
    formatAcItem({ checked: true, number: 4, text: "済み項目" }),
    "- [x] AC4 済み項目",
  );
});

// ---- selectMigratable（非終端のみ・backlog アーカイブ由来は除外） ----

Deno.test("selectMigratable は To Do / In Progress のみ選び Done を除外する", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Done", fileName: "task-1 - a.md" }),
    task({ id: "TASK-2", status: "To Do", fileName: "task-2 - b.md" }),
    task({ id: "TASK-3", status: "In Progress", fileName: "task-3 - c.md" }),
  ];
  assertEquals(selectMigratable(tasks).map((entry) => entry.id), [
    "TASK-2",
    "TASK-3",
  ]);
});

Deno.test("selectMigratable は旧 backlog/archive/tasks 由来（取りやめ済み）を status が非終端でも除外する", () => {
  // backlog.md のアーカイブは「取りやめ」に相当するが status フィールドは
  // To Do のまま残っている。ファイル名の照合で除外する。
  assert(BACKLOG_ARCHIVED_FILES.length >= 3);
  const tasks = BACKLOG_ARCHIVED_FILES.map((fileName, index) =>
    task({ id: `TASK-${800 + index}`, status: "To Do", fileName })
  );
  assertEquals(selectMigratable(tasks), []);
});

// ---- topoSortMigratable（依存が先・ordinal → ID の決定的順序） ----

Deno.test("topoSortMigratable は依存タスクを先に並べる", () => {
  const tasks = [
    task({
      id: "TASK-2",
      dependencies: ["TASK-1"],
      ordinal: 100,
      fileName: "task-2 - b.md",
    }),
    task({ id: "TASK-1", ordinal: 900, fileName: "task-1 - a.md" }),
  ];
  assertEquals(topoSortMigratable(tasks).map((entry) => entry.id), [
    "TASK-1",
    "TASK-2",
  ]);
});

Deno.test("topoSortMigratable は依存の無いタスク同士を ordinal 昇順（同値は ID 順）で並べる", () => {
  const tasks = [
    task({ id: "TASK-3", ordinal: 200, fileName: "task-3 - c.md" }),
    task({ id: "TASK-2", ordinal: 100, fileName: "task-2 - b.md" }),
    task({ id: "TASK-10", ordinal: 100, fileName: "task-10 - d.md" }),
  ];
  assertEquals(topoSortMigratable(tasks).map((entry) => entry.id), [
    "TASK-2",
    "TASK-10",
    "TASK-3",
  ]);
});

Deno.test("topoSortMigratable は移行対象外への依存があっても全件を返す", () => {
  const tasks = [
    task({
      id: "TASK-2",
      dependencies: ["TASK-999"],
      fileName: "task-2 - b.md",
    }),
  ];
  assertEquals(topoSortMigratable(tasks).map((entry) => entry.id), ["TASK-2"]);
});

// ---- buildIssueBody（LOOP-META・AC 変換・相互リンク footer） ----

Deno.test("buildIssueBody の LOOP-META は task_source の parseLoopMeta で読める（round-trip）", () => {
  const body = buildIssueBody(
    task({ dependencies: ["TASK-900"], ordinal: 121000 }),
    new Map([["TASK-900", 12]]),
  );
  assertEquals(parseLoopMeta(body), { dependsOn: ["#12"], ordinal: 121000 });
});

Deno.test("buildIssueBody は Description・AC1 記法・旧 ID とアーカイブパスの footer を含む", () => {
  const body = buildIssueBody(
    task({
      description: "説明本文",
      acItems: [
        { checked: false, number: 1, text: "起票できる" },
        { checked: true, number: 2, text: "済み" },
      ],
    }),
    new Map(),
  );
  assertStringIncludes(body, "## Description\n\n説明本文\n");
  assertStringIncludes(body, "- [ ] AC1 起票できる\n- [x] AC2 済み");
  assertStringIncludes(body, "旧 ID: TASK-901");
  assertStringIncludes(
    body,
    `アーカイブ: docs/archive/backlog-tasks/${FIXTURE_FILE}`,
  );
  // AC の #N 記法は Issue リンクに化けるため残してはならない
  assert(!/- \[[ x]\] #\d/.test(body));
});

Deno.test("buildIssueBody はマップ不能な TASK-N 依存を depends-on に入れず本文に注記する", () => {
  const body = buildIssueBody(
    task({ dependencies: ["TASK-900", "TASK-1"] }),
    new Map([["TASK-900", 12]]),
  );
  assertEquals(parseLoopMeta(body).dependsOn, ["#12"]);
  assertStringIncludes(body, "TASK-1");
  assertStringIncludes(body, "マップ不能");
});

Deno.test("buildIssueBody は ordinal 欠落時に LOOP-META の ordinal を null にする", () => {
  const body = buildIssueBody(task({ ordinal: null }), new Map());
  assertStringIncludes(body, "ordinal: null");
  assertEquals(parseLoopMeta(body).ordinal, null);
});

// ---- buildGhCreateArgs（label 組み立て・--body-file） ----

Deno.test("buildGhCreateArgs は task + area ラベルで gh issue create を組み立てる", () => {
  const args = buildGhCreateArgs(
    task({ labels: ["area:workflow", "area:docs"], title: "タイトル" }),
    "/tmp/body.md",
  );
  assertEquals(args, [
    "issue",
    "create",
    "--title",
    "タイトル",
    "--body-file",
    "/tmp/body.md",
    "--label",
    "task",
    "--label",
    "area:workflow",
    "--label",
    "area:docs",
  ]);
});

Deno.test("buildGhCreateArgs は bug ラベルを引き継ぎ In Progress に status:in-progress を付ける", () => {
  const args = buildGhCreateArgs(
    task({ labels: ["bug", "area:src-main"], status: "In Progress" }),
    "/tmp/body.md",
  );
  const labels = args
    .map((arg, index) => (args[index - 1] === "--label" ? arg : null))
    .filter((arg): arg is string => arg !== null);
  assertEquals(labels, [
    "task",
    "bug",
    "area:src-main",
    "status:in-progress",
  ]);
});

// ---- insertMigrationLink（アーカイブ md への相互リンク書き戻し） ----

Deno.test("insertMigrationLink は frontmatter 直後に 移行先: #N を挿入する", () => {
  const updated = insertMigrationLink(FIXTURE, 34);
  assert(
    updated.startsWith(FIXTURE.slice(0, FIXTURE.indexOf("\n\n## Description"))),
  );
  assertStringIncludes(updated, "---\n\n移行先: #34\n\n## Description");
  // 本文はそれ以外変えない
  assertEquals(
    updated.replace("\n移行先: #34\n", ""),
    FIXTURE,
  );
});

Deno.test("insertMigrationLink は既に移行先がある markdown を変更しない（冪等）", () => {
  const once = insertMigrationLink(FIXTURE, 34);
  assertEquals(insertMigrationLink(once, 56), once);
});

// ---- parseIssueNumberFromOutput（gh issue create の出力から番号を得る） ----

Deno.test("parseIssueNumberFromOutput は gh issue create が出力する URL から Issue 番号を取り出す", () => {
  assertEquals(
    parseIssueNumberFromOutput(
      "https://github.com/ishii1648/the-history/issues/123\n",
    ),
    123,
  );
});

Deno.test("parseIssueNumberFromOutput は URL が無い出力に null を返す", () => {
  assertEquals(parseIssueNumberFromOutput("Created issue\n"), null);
});
