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
