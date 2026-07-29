import { assertEquals, assertThrows } from "@std/assert";
import { selectNextTask } from "./next_task.ts";
import { selectNextTasks } from "./next_tasks.ts";
import {
  BACKLOG_TERMINAL_STATUSES,
  type GhIssue,
  GITHUB_TERMINAL_STATUSES,
  issuesToTasks,
  issueToTaskMeta,
  parseIssuesJson,
  parseJsonFileArg,
  parseLoopMeta,
  resolveSourceKind,
  statusOf,
} from "./task_source.ts";

function issue(overrides: Partial<GhIssue> & { number: number }): GhIssue {
  return {
    title: `Issue #${overrides.number}`,
    state: "OPEN",
    stateReason: null,
    labels: [{ name: "task" }],
    body: "",
    ...overrides,
  };
}

// ---- parseLoopMeta（Issue 本文の HTML コメント内 YAML 断片） ----

Deno.test("parseLoopMeta は depends-on（#N クォート形式）と ordinal を取り出す", () => {
  const body = `<!-- LOOP-META
depends-on: ["#12", "#34"]
ordinal: 1000
-->

## Description

本文
`;
  assertEquals(parseLoopMeta(body), {
    dependsOn: ["#12", "#34"],
    ordinal: 1000,
  });
});

Deno.test("parseLoopMeta はテンプレート既定値（depends-on: [] / ordinal: null）を空依存・ordinal null として返す", () => {
  const body = `<!-- LOOP-META
depends-on: []
ordinal: null
-->
`;
  assertEquals(parseLoopMeta(body), { dependsOn: [], ordinal: null });
});

Deno.test("parseLoopMeta は LOOP-META ブロックが無い本文で既定値を返す", () => {
  assertEquals(parseLoopMeta("## Description\n\n本文のみ\n"), {
    dependsOn: [],
    ordinal: null,
  });
});

Deno.test("parseLoopMeta はクォート無しの #N（YAML コメント化）を依存として拾わない", () => {
  // YAML では # がコメント開始のため、クォート無しは値が空になる。
  // テンプレートがクォート必須を明記している規約をパーサ側でも固定する。
  const body = `<!-- LOOP-META
depends-on: [#12]
ordinal: null
-->
`;
  assertEquals(parseLoopMeta(body), { dependsOn: [], ordinal: null });
});

Deno.test("parseLoopMeta は数値の depends-on 要素を #N 形式へ正規化する", () => {
  const body = `<!-- LOOP-META
depends-on: [12, "#34"]
-->
`;
  assertEquals(parseLoopMeta(body), {
    dependsOn: ["#12", "#34"],
    ordinal: null,
  });
});

Deno.test("parseLoopMeta は #N 形式でない文字列の depends-on 要素を無視する", () => {
  const body = `<!-- LOOP-META
depends-on: ["TASK-12", "#34", ""]
-->
`;
  assertEquals(parseLoopMeta(body), { dependsOn: ["#34"], ordinal: null });
});

Deno.test("parseLoopMeta は壊れた YAML 断片で既定値を返す", () => {
  const body = `<!-- LOOP-META
depends-on: [
-->
`;
  assertEquals(parseLoopMeta(body), { dependsOn: [], ordinal: null });
});

Deno.test("parseLoopMeta は数値でない ordinal を null として扱う", () => {
  const body = `<!-- LOOP-META
ordinal: "1000"
-->
`;
  assertEquals(parseLoopMeta(body), { dependsOn: [], ordinal: null });
});

// ---- statusOf（state / stateReason / status:in-progress ラベルからの導出） ----

Deno.test("statusOf は open の issue を To Do とする", () => {
  assertEquals(statusOf(issue({ number: 1 })), "To Do");
});

Deno.test("statusOf は open かつ status:in-progress ラベル付きを In Progress とする", () => {
  assertEquals(
    statusOf(
      issue({
        number: 1,
        labels: [{ name: "task" }, { name: "status:in-progress" }],
      }),
    ),
    "In Progress",
  );
});

Deno.test("statusOf は closed COMPLETED を Done とする", () => {
  assertEquals(
    statusOf(issue({ number: 1, state: "CLOSED", stateReason: "COMPLETED" })),
    "Done",
  );
});

Deno.test("statusOf は closed NOT_PLANNED を 取りやめ とする", () => {
  assertEquals(
    statusOf(issue({ number: 1, state: "CLOSED", stateReason: "NOT_PLANNED" })),
    "取りやめ",
  );
});

Deno.test("statusOf は stateReason の無い closed を Done とする", () => {
  assertEquals(
    statusOf(issue({ number: 1, state: "CLOSED", stateReason: null })),
    "Done",
  );
});

Deno.test("statusOf は closed なら status:in-progress ラベルより state を優先する", () => {
  assertEquals(
    statusOf(
      issue({
        number: 1,
        state: "CLOSED",
        stateReason: "COMPLETED",
        labels: [{ name: "task" }, { name: "status:in-progress" }],
      }),
    ),
    "Done",
  );
});

// ---- issueToTaskMeta（Issue → TaskMeta 変換） ----

Deno.test("issueToTaskMeta は id を #N 形式にし LOOP-META から dependencies / ordinal を取り込む", () => {
  const converted = issueToTaskMeta(
    issue({
      number: 12,
      labels: [{ name: "task" }, { name: "area:scripts-loop" }],
      body:
        '<!-- LOOP-META\ndepends-on: ["#3"]\nordinal: 1000\n-->\n\n## Description\n',
    }),
  );
  assertEquals(converted, {
    id: "#12",
    status: "To Do",
    ordinal: 1000,
    dependencies: ["#3"],
    labels: ["task", "area:scripts-loop"],
  });
});

Deno.test("issueToTaskMeta は ordinal 欠落時に Issue 番号を ordinal として使う", () => {
  const converted = issueToTaskMeta(issue({ number: 42, body: "" }));
  assertEquals(converted?.ordinal, 42);
});

Deno.test("issueToTaskMeta は body が null でも変換できる", () => {
  const converted = issueToTaskMeta(issue({ number: 7, body: null }));
  assertEquals(converted, {
    id: "#7",
    status: "To Do",
    ordinal: 7,
    dependencies: [],
    labels: ["task"],
  });
});

Deno.test("issueToTaskMeta は task ラベルの無い issue（needs-human 等）に null を返す", () => {
  assertEquals(
    issueToTaskMeta(issue({ number: 9, labels: [{ name: "needs-human" }] })),
    null,
  );
});

// ---- parseIssuesJson（gh issue list --json 出力のフィクスチャ検証） ----

const FIXTURE_JSON = `[
  {
    "number": 6,
    "title": "bug: hover panel crash",
    "state": "OPEN",
    "stateReason": "",
    "labels": [
      { "id": "L1", "name": "task", "description": "", "color": "ededed" },
      { "id": "L2", "name": "bug", "description": "", "color": "d73a4a" },
      { "id": "L3", "name": "area:src-main", "description": "", "color": "ededed" }
    ],
    "body": "<!-- LOOP-META\\ndepends-on: []\\nordinal: 60000\\n-->\\n\\n## Description\\n"
  },
  {
    "number": 2,
    "title": "feat: base layer",
    "state": "OPEN",
    "stateReason": "",
    "labels": [
      { "id": "L1", "name": "task", "description": "", "color": "ededed" },
      { "id": "L4", "name": "area:data-base", "description": "", "color": "ededed" }
    ],
    "body": "<!-- LOOP-META\\ndepends-on: [\\"#1\\"]\\nordinal: null\\n-->\\n"
  },
  {
    "number": 1,
    "title": "chore: setup",
    "state": "CLOSED",
    "stateReason": "COMPLETED",
    "labels": [
      { "id": "L1", "name": "task", "description": "", "color": "ededed" }
    ],
    "body": "<!-- LOOP-META\\ndepends-on: []\\nordinal: null\\n-->\\n"
  },
  {
    "number": 3,
    "title": "feat: blocked by open dep",
    "state": "OPEN",
    "stateReason": "",
    "labels": [
      { "id": "L1", "name": "task", "description": "", "color": "ededed" },
      { "id": "L5", "name": "area:docs", "description": "", "color": "ededed" }
    ],
    "body": "<!-- LOOP-META\\ndepends-on: [\\"#2\\"]\\nordinal: null\\n-->\\n"
  },
  {
    "number": 4,
    "title": "needs-human: 仕様判断",
    "state": "OPEN",
    "stateReason": "",
    "labels": [
      { "id": "L6", "name": "needs-human", "description": "", "color": "ededed" }
    ],
    "body": ""
  },
  {
    "number": 5,
    "title": "feat: dep cancelled",
    "state": "OPEN",
    "stateReason": "",
    "labels": [
      { "id": "L1", "name": "task", "description": "", "color": "ededed" },
      { "id": "L7", "name": "area:workflow", "description": "", "color": "ededed" }
    ],
    "body": "<!-- LOOP-META\\ndepends-on: [\\"#8\\"]\\nordinal: null\\n-->\\n"
  },
  {
    "number": 8,
    "title": "chore: cancelled",
    "state": "CLOSED",
    "stateReason": "NOT_PLANNED",
    "labels": [
      { "id": "L1", "name": "task", "description": "", "color": "ededed" }
    ],
    "body": ""
  }
]`;

Deno.test("parseIssuesJson は gh issue list --json 形式のフィクスチャを GhIssue 一覧にする", () => {
  const issues = parseIssuesJson(FIXTURE_JSON);
  assertEquals(issues.length, 7);
  assertEquals(issues[0].number, 6);
  assertEquals(issues[0].labels.map((label) => label.name), [
    "task",
    "bug",
    "area:src-main",
  ]);
});

Deno.test("parseIssuesJson は配列でない JSON にエラーを投げる", () => {
  assertThrows(() => parseIssuesJson(`{"number": 1}`), Error, "array");
});

Deno.test("parseIssuesJson は number の無い要素にエラーを投げる", () => {
  assertThrows(
    () => parseIssuesJson(`[{"state": "OPEN"}]`),
    Error,
    "number",
  );
});

// ---- github 由来 TaskMeta への選定ルール適用（既存純粋関数の共有） ----

Deno.test("issuesToTasks は task ラベルの無い issue を除外し全 task issue を変換する", () => {
  const tasks = issuesToTasks(parseIssuesJson(FIXTURE_JSON));
  assertEquals(tasks.map((task) => task.id), [
    "#6",
    "#2",
    "#1",
    "#3",
    "#5",
    "#8",
  ]);
});

Deno.test("selectNextTask は github 由来 TaskMeta にも bug 最優先 → ordinal → ID を適用する", () => {
  // #6 は bug ラベル付きで ordinal 60000 だが最優先で選ばれる
  const tasks = issuesToTasks(parseIssuesJson(FIXTURE_JSON));
  assertEquals(selectNextTask(tasks, GITHUB_TERMINAL_STATUSES)?.id, "#6");
});

Deno.test("selectNextTasks は github 由来候補で依存未クローズの issue を除外し JSON 出力契約を維持する", () => {
  const tasks = issuesToTasks(parseIssuesJson(FIXTURE_JSON));
  const result = selectNextTasks(tasks, GITHUB_TERMINAL_STATUSES);
  // #2 は依存 #1 が closed COMPLETED なので候補、#3 は依存 #2 が open なので除外、
  // #5 は依存 #8 が closed NOT_PLANNED（取りやめ）なので候補、#4 は task ラベル無しで不在
  assertEquals(result, {
    tasks: [
      { id: "#6", areas: ["src-main"] },
      { id: "#2", areas: ["data-base"] },
      { id: "#5", areas: ["workflow"] },
    ],
    skipped: [],
  });
  assertEquals(
    JSON.stringify(result),
    '{"tasks":[{"id":"#6","areas":["src-main"]},' +
      '{"id":"#2","areas":["data-base"]},' +
      '{"id":"#5","areas":["workflow"]}],"skipped":[]}',
  );
});

Deno.test("selectNextTasks は github 由来でも status:in-progress の issue がある間は空集合を返す", () => {
  const issues = parseIssuesJson(FIXTURE_JSON).map((entry) =>
    entry.number === 2
      ? {
        ...entry,
        labels: [...entry.labels, { name: "status:in-progress" }],
      }
      : entry
  );
  assertEquals(
    selectNextTasks(issuesToTasks(issues), GITHUB_TERMINAL_STATUSES),
    { tasks: [], skipped: [] },
  );
});

// ---- ソース切替（TASK_SOURCE / --json-file） ----

Deno.test("resolveSourceKind は未設定・空文字・backlog を backlog とする（既定不変）", () => {
  assertEquals(resolveSourceKind(undefined), "backlog");
  assertEquals(resolveSourceKind(""), "backlog");
  assertEquals(resolveSourceKind("backlog"), "backlog");
});

Deno.test("resolveSourceKind は github を github とする", () => {
  assertEquals(resolveSourceKind("github"), "github");
});

Deno.test("resolveSourceKind は未知の値にエラーを投げる", () => {
  assertThrows(() => resolveSourceKind("jira"), Error, "TASK_SOURCE");
});

Deno.test("parseJsonFileArg は --json-file <path> と --json-file=<path> を受け付ける", () => {
  assertEquals(parseJsonFileArg(["--json-file", "issues.json"]), "issues.json");
  assertEquals(parseJsonFileArg(["--json-file=issues.json"]), "issues.json");
  assertEquals(parseJsonFileArg([]), null);
});

Deno.test("terminalStatuses はソースごとに定義される（backlog: Done / github: Done・取りやめ）", () => {
  assertEquals(BACKLOG_TERMINAL_STATUSES, ["Done"]);
  assertEquals(GITHUB_TERMINAL_STATUSES, ["Done", "取りやめ"]);
});
