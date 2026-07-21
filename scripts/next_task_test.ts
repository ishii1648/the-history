import { assertEquals } from "@std/assert";
import {
  hasActiveTask,
  parseTaskFrontmatter,
  selectNextTask,
  type TaskMeta,
} from "./next_task.ts";

function task(overrides: Partial<TaskMeta> & { id: string }): TaskMeta {
  return {
    status: "To Do",
    ordinal: null,
    dependencies: [],
    labels: [],
    ...overrides,
  };
}

Deno.test("parseTaskFrontmatter は id / status / ordinal / dependencies を取り出す", () => {
  const markdown = `---
id: TASK-3
title: 色割当の静的生成（data/colors.json）
status: To Do
assignee: []
created_date: '2026-07-20 04:22'
labels: []
dependencies:
  - TASK-2
ordinal: 3000
---

## Description

本文
`;
  assertEquals(parseTaskFrontmatter(markdown), {
    id: "TASK-3",
    status: "To Do",
    ordinal: 3000,
    dependencies: ["TASK-2"],
    labels: [],
  });
});

Deno.test("parseTaskFrontmatter は空の dependencies（インライン []）を空配列として扱う", () => {
  const markdown = `---
id: TASK-2
status: To Do
dependencies: []
ordinal: 2000
---
`;
  assertEquals(parseTaskFrontmatter(markdown), {
    id: "TASK-2",
    status: "To Do",
    ordinal: 2000,
    dependencies: [],
    labels: [],
  });
});

Deno.test("parseTaskFrontmatter は ordinal 欠落時に null を設定する", () => {
  const markdown = `---
id: TASK-9
status: To Do
dependencies: []
---
`;
  assertEquals(parseTaskFrontmatter(markdown), {
    id: "TASK-9",
    status: "To Do",
    ordinal: null,
    dependencies: [],
    labels: [],
  });
});

Deno.test("parseTaskFrontmatter は labels をインライン形式でパースする", () => {
  const markdown = `---
id: TASK-11
status: To Do
dependencies: []
ordinal: 1100
labels: [bug]
---
`;
  assertEquals(parseTaskFrontmatter(markdown), {
    id: "TASK-11",
    status: "To Do",
    ordinal: 1100,
    dependencies: [],
    labels: ["bug"],
  });
});

Deno.test("parseTaskFrontmatter は labels をブロック形式でパースする", () => {
  const markdown = `---
id: TASK-12
status: To Do
dependencies: []
ordinal: 1200
labels:
  - bug
---
`;
  assertEquals(parseTaskFrontmatter(markdown), {
    id: "TASK-12",
    status: "To Do",
    ordinal: 1200,
    dependencies: [],
    labels: ["bug"],
  });
});

Deno.test("parseTaskFrontmatter は labels 欠落時に空配列を設定する", () => {
  const markdown = `---
id: TASK-13
status: To Do
dependencies: []
ordinal: 1300
---
`;
  assertEquals(parseTaskFrontmatter(markdown), {
    id: "TASK-13",
    status: "To Do",
    ordinal: 1300,
    dependencies: [],
    labels: [],
  });
});

Deno.test("parseTaskFrontmatter は labels が配列でない場合に空配列を設定する", () => {
  const markdown = `---
id: TASK-14
status: To Do
dependencies: []
ordinal: 1400
labels: bug
---
`;
  assertEquals(parseTaskFrontmatter(markdown), {
    id: "TASK-14",
    status: "To Do",
    ordinal: 1400,
    dependencies: [],
    labels: [],
  });
});

Deno.test("parseTaskFrontmatter は frontmatter がない場合 null を返す", () => {
  assertEquals(parseTaskFrontmatter("# ただの markdown\n"), null);
});

Deno.test("parseTaskFrontmatter は id がない frontmatter に対して null を返す", () => {
  const markdown = `---
status: To Do
ordinal: 1000
---
`;
  assertEquals(parseTaskFrontmatter(markdown), null);
});

Deno.test("selectNextTask は To Do かつ依存が全て Done のタスクから ordinal 最小を選ぶ", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Done", ordinal: 1000 }),
    task({ id: "TASK-10", ordinal: 10000, dependencies: ["TASK-1"] }),
    task({ id: "TASK-2", ordinal: 2000 }),
    task({ id: "TASK-4", ordinal: 4000, dependencies: ["TASK-1"] }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-2");
});

Deno.test("selectNextTask は依存が未完了のタスクを候補から除外する", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 2000 }),
    task({ id: "TASK-3", ordinal: 3000, dependencies: ["TASK-2"] }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-2");
});

Deno.test("selectNextTask は To Do 以外のステータスを候補から除外する", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Done", ordinal: 1000 }),
    task({ id: "TASK-2", status: "In Progress", ordinal: 2000 }),
    task({ id: "TASK-3", ordinal: 3000, dependencies: ["TASK-1"] }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-3");
});

Deno.test("selectNextTask は候補がなければ null を返す", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Done", ordinal: 1000 }),
    task({ id: "TASK-3", ordinal: 3000, dependencies: ["TASK-2"] }),
  ];
  assertEquals(selectNextTask(tasks), null);
});

Deno.test("selectNextTask は ordinal が同値なら数値 ID の小さい方を選ぶ", () => {
  const tasks = [
    task({ id: "TASK-8", ordinal: 5000 }),
    task({ id: "TASK-6", ordinal: 5000 }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-6");
});

Deno.test("selectNextTask は ordinal 欠落（null）のタスクを ordinal ありより後回しにする", () => {
  const tasks = [
    task({ id: "TASK-5", ordinal: null }),
    task({ id: "TASK-7", ordinal: 7000 }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-7");
});

Deno.test("selectNextTask は Done 以外の終端ステータスも依存解決として扱える", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Archived", ordinal: 1000 }),
    task({ id: "TASK-2", ordinal: 2000, dependencies: ["TASK-1"] }),
  ];
  assertEquals(selectNextTask(tasks, ["Done", "Archived"])?.id, "TASK-2");
});

Deno.test("selectNextTask は backlog に存在しない依存 ID を未完了として扱う", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 2000, dependencies: ["TASK-99"] }),
  ];
  assertEquals(selectNextTask(tasks), null);
});

Deno.test("selectNextTask は label bug のタスクを ordinal がどれだけ大きくても最優先で選ぶ", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 2000 }),
    task({ id: "TASK-20", ordinal: 20000, labels: ["bug"] }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-20");
});

Deno.test("selectNextTask は bug タスクが複数ある場合 bug 群内で ordinal 昇順を優先する", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 2000 }),
    task({ id: "TASK-30", ordinal: 30000, labels: ["bug"] }),
    task({ id: "TASK-15", ordinal: 15000, labels: ["bug"] }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-15");
});

Deno.test("selectNextTask は bug タスクが複数かつ ordinal 同値の場合 ID 数値昇順で選ぶ", () => {
  const tasks = [
    task({ id: "TASK-30", ordinal: 5000, labels: ["bug"] }),
    task({ id: "TASK-15", ordinal: 5000, labels: ["bug"] }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-15");
});

Deno.test("selectNextTask は bug タスクでも依存未完了なら選ばない", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 2000 }),
    task(
      {
        id: "TASK-20",
        ordinal: 20000,
        labels: ["bug"],
        dependencies: ["TASK-99"],
      },
    ),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-2");
});

Deno.test("selectNextTask は bug タスクでも status が To Do 以外なら選ばない", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 2000 }),
    task({
      id: "TASK-20",
      ordinal: 20000,
      labels: ["bug"],
      status: "In Progress",
    }),
  ];
  assertEquals(selectNextTask(tasks)?.id, "TASK-2");
});

Deno.test("hasActiveTask は In Progress のタスクがあれば true を返す", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Done", ordinal: 1000 }),
    task({ id: "TASK-2", status: "In Progress", ordinal: 2000 }),
  ];
  assertEquals(hasActiveTask(tasks), true);
});

Deno.test("hasActiveTask は In Progress のタスクがなければ false を返す", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Done", ordinal: 1000 }),
    task({ id: "TASK-2", ordinal: 2000 }),
  ];
  assertEquals(hasActiveTask(tasks), false);
});

Deno.test("hasActiveTask はアクティブ扱いのステータスを指定できる", () => {
  const tasks = [
    task({ id: "TASK-2", status: "Reviewing", ordinal: 2000 }),
  ];
  assertEquals(hasActiveTask(tasks, ["In Progress", "Reviewing"]), true);
});
