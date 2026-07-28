import { assertEquals } from "@std/assert";
import { type TaskMeta } from "./next_task.ts";
import { extractAreas, selectNextTasks } from "./next_tasks.ts";

function task(overrides: Partial<TaskMeta> & { id: string }): TaskMeta {
  return {
    status: "To Do",
    ordinal: null,
    dependencies: [],
    labels: [],
    ...overrides,
  };
}

Deno.test("extractAreas は area: プレフィクスのラベルから領域名を取り出す", () => {
  assertEquals(
    extractAreas(["area:docs", "bug", "area:workflow"]),
    ["docs", "workflow"],
  );
});

Deno.test("extractAreas は area ラベルがなければ空配列を返す", () => {
  assertEquals(extractAreas(["bug", "enhancement"]), []);
});

Deno.test("extractAreas は重複した領域名を除去する", () => {
  assertEquals(extractAreas(["area:docs", "area:docs"]), ["docs"]);
});

Deno.test("extractAreas は領域名が空の area: ラベルを無視する", () => {
  assertEquals(extractAreas(["area:", "area:docs"]), ["docs"]);
});

Deno.test("selectNextTasks は area が互いに素なタスクを複数選択する", () => {
  const tasks = [
    task({
      id: "TASK-28",
      ordinal: 1000,
      labels: ["area:docs", "area:workflow"],
    }),
    task({ id: "TASK-29", ordinal: 2000, labels: ["area:scripts"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [
      { id: "TASK-28", areas: ["docs", "workflow"] },
      { id: "TASK-29", areas: ["scripts"] },
    ],
    skipped: [],
  });
});

Deno.test("selectNextTasks は area が交差するタスクを reason 付きでスキップする", () => {
  const tasks = [
    task({ id: "TASK-29", ordinal: 1000, labels: ["area:src-main"] }),
    task({ id: "TASK-30", ordinal: 2000, labels: ["area:src-main"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-29", areas: ["src-main"] }],
    skipped: [
      { id: "TASK-30", reason: "area conflict: src-main (TASK-29)" },
    ],
  });
});

Deno.test("selectNextTasks の交差 reason は候補側 areas の並びで最初に交差した area と先行タスク ID を示す", () => {
  const tasks = [
    task({ id: "TASK-1", ordinal: 1000, labels: ["area:docs"] }),
    task({ id: "TASK-2", ordinal: 2000, labels: ["area:scripts"] }),
    task({
      id: "TASK-3",
      ordinal: 3000,
      labels: ["area:scripts", "area:docs"],
    }),
  ];
  assertEquals(selectNextTasks(tasks).skipped, [
    { id: "TASK-3", reason: "area conflict: scripts (TASK-2)" },
  ]);
});

Deno.test("selectNextTasks は area 未付与タスクが先頭候補なら単独集合として確定する", () => {
  const tasks = [
    task({ id: "TASK-5", ordinal: 1000 }),
    task({ id: "TASK-6", ordinal: 2000, labels: ["area:docs"] }),
    task({ id: "TASK-7", ordinal: 3000, labels: ["area:scripts"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-5", areas: [] }],
    skipped: [],
  });
});

Deno.test("selectNextTasks は area 未付与タスクが 2 件目以降なら reason 付きでスキップする", () => {
  const tasks = [
    task({ id: "TASK-6", ordinal: 1000, labels: ["area:docs"] }),
    task({ id: "TASK-5", ordinal: 2000 }),
    task({ id: "TASK-7", ordinal: 3000, labels: ["area:scripts"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [
      { id: "TASK-6", areas: ["docs"] },
      { id: "TASK-7", areas: ["scripts"] },
    ],
    skipped: [{ id: "TASK-5", reason: "no area labels" }],
  });
});

Deno.test("selectNextTasks は area が互いに素な bug 候補を複数選択する", () => {
  const tasks = [
    task({ id: "TASK-20", ordinal: 20000, labels: ["bug", "area:scripts"] }),
    task({ id: "TASK-21", ordinal: 21000, labels: ["bug", "area:data"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [
      { id: "TASK-20", areas: ["scripts"] },
      { id: "TASK-21", areas: ["data"] },
    ],
    skipped: [],
  });
});

Deno.test("selectNextTasks は bug 群内でも area 交差のスキップを適用する", () => {
  const tasks = [
    task({ id: "TASK-20", ordinal: 20000, labels: ["bug", "area:scripts"] }),
    task({ id: "TASK-21", ordinal: 21000, labels: ["bug", "area:scripts"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-20", areas: ["scripts"] }],
    skipped: [
      { id: "TASK-21", reason: "area conflict: scripts (TASK-20)" },
    ],
  });
});

Deno.test("selectNextTasks は In Progress のタスクがあれば空集合を返す", () => {
  const tasks = [
    task({ id: "TASK-1", status: "In Progress", ordinal: 1000 }),
    task({ id: "TASK-2", ordinal: 2000, labels: ["area:docs"] }),
  ];
  assertEquals(selectNextTasks(tasks), { tasks: [], skipped: [] });
});

Deno.test("selectNextTasks は依存が未完了・backlog に存在しないタスクを候補から除外する", () => {
  const tasks = [
    task({ id: "TASK-1", ordinal: 1000, labels: ["area:docs"] }),
    task({
      id: "TASK-2",
      ordinal: 2000,
      labels: ["area:scripts"],
      dependencies: ["TASK-1"],
    }),
    task({
      id: "TASK-3",
      ordinal: 3000,
      labels: ["area:data"],
      dependencies: ["TASK-99"],
    }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-1", areas: ["docs"] }],
    skipped: [],
  });
});

Deno.test("selectNextTasks は To Do 以外のステータスを候補から除外する", () => {
  const tasks = [
    task({
      id: "TASK-1",
      status: "Done",
      ordinal: 1000,
      labels: ["area:docs"],
    }),
    task({
      id: "TASK-2",
      ordinal: 2000,
      labels: ["area:docs"],
      dependencies: ["TASK-1"],
    }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-2", areas: ["docs"] }],
    skipped: [],
  });
});

Deno.test("selectNextTasks は ordinal 昇順・同値なら ID 数値昇順で走査する", () => {
  const tasks = [
    task({ id: "TASK-8", ordinal: 5000, labels: ["area:docs"] }),
    task({ id: "TASK-6", ordinal: 5000, labels: ["area:docs"] }),
    task({ id: "TASK-4", ordinal: 9000, labels: ["area:scripts"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [
      { id: "TASK-6", areas: ["docs"] },
      { id: "TASK-4", areas: ["scripts"] },
    ],
    skipped: [
      { id: "TASK-8", reason: "area conflict: docs (TASK-6)" },
    ],
  });
});

Deno.test("selectNextTasks は ordinal 欠落（null）のタスクを ordinal ありより後に走査する", () => {
  const tasks = [
    task({ id: "TASK-5", ordinal: null, labels: ["area:docs"] }),
    task({ id: "TASK-7", ordinal: 7000, labels: ["area:docs"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-7", areas: ["docs"] }],
    skipped: [
      { id: "TASK-5", reason: "area conflict: docs (TASK-7)" },
    ],
  });
});

Deno.test("selectNextTasks は候補がなければ空の結果を返す", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Done", ordinal: 1000 }),
  ];
  assertEquals(selectNextTasks(tasks), { tasks: [], skipped: [] });
});

Deno.test("selectNextTasks は Done 以外の終端ステータスも依存解決として扱える", () => {
  const tasks = [
    task({ id: "TASK-1", status: "Archived", ordinal: 1000 }),
    task({
      id: "TASK-2",
      ordinal: 2000,
      labels: ["area:docs"],
      dependencies: ["TASK-1"],
    }),
  ];
  assertEquals(selectNextTasks(tasks, ["Done", "Archived"]), {
    tasks: [{ id: "TASK-2", areas: ["docs"] }],
    skipped: [],
  });
});

Deno.test("selectNextTasks の結果は契約どおりの JSON 1 行に直列化できる", () => {
  const tasks = [
    task({ id: "TASK-29", ordinal: 1000, labels: ["area:src-main"] }),
    task({
      id: "TASK-28",
      ordinal: 2000,
      labels: ["area:docs", "area:workflow"],
    }),
    task({ id: "TASK-30", ordinal: 3000, labels: ["area:src-main"] }),
  ];
  assertEquals(
    JSON.stringify(selectNextTasks(tasks)),
    '{"tasks":[{"id":"TASK-29","areas":["src-main"]},' +
      '{"id":"TASK-28","areas":["docs","workflow"]}],' +
      '"skipped":[{"id":"TASK-30","reason":"area conflict: src-main (TASK-29)"}]}',
  );
});

// ---- TASK-114: area の細分化（scripts / data） ----
// 粗い area:scripts / area:data を細分化しても selectNextTasks のロジックは
// 変わらない（文字列一致で交差を見るだけ）ことと、細分化によって従来は
// 衝突扱いだった組み合わせが並列に選ばれるようになることを固定する。
// 区分と対応パスの目安は docs/development-style.md 4.2 章。

Deno.test("TASK-114: 細分化した scripts の area は互いに交差せず並列に選ばれる", () => {
  // 細分化前はどちらも area:scripts で TASK-2 がスキップされていた組み合わせ。
  // 実例: ループ支援ツール（next_tasks.ts）とビルドパイプライン
  // （build-cliopatria-fiefs.ts）は origin/main で一度も同一 PR に現れない。
  const tasks = [
    task({ id: "TASK-1", ordinal: 1000, labels: ["area:scripts-loop"] }),
    task({ id: "TASK-2", ordinal: 2000, labels: ["area:scripts-fiefs"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [
      { id: "TASK-1", areas: ["scripts-loop"] },
      { id: "TASK-2", areas: ["scripts-fiefs"] },
    ],
    skipped: [],
  });
});

Deno.test("TASK-114: 細分化した data の area は互いに交差せず並列に選ばれる", () => {
  const tasks = [
    task({ id: "TASK-1", ordinal: 1000, labels: ["area:data-base"] }),
    task({ id: "TASK-2", ordinal: 2000, labels: ["area:data-features"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [
      { id: "TASK-1", areas: ["data-base"] },
      { id: "TASK-2", areas: ["data-features"] },
    ],
    skipped: [],
  });
});

Deno.test("TASK-114: 同じ細分化 area どうしは従来どおり衝突し reason に細分化名が出る", () => {
  // 細分化は「実ファイルが競合しうる単位」に合わせたので、同じ area を持つ
  // タスク同士は引き続き直列になる。skipped の reason には細分化後の名前が出る。
  const tasks = [
    task({ id: "TASK-1", ordinal: 1000, labels: ["area:scripts-fiefs"] }),
    task({
      id: "TASK-2",
      ordinal: 2000,
      labels: ["area:scripts-fiefs", "area:data-fiefs"],
    }),
  ];
  assertEquals(selectNextTasks(tasks).skipped, [
    { id: "TASK-2", reason: "area conflict: scripts-fiefs (TASK-1)" },
  ]);
});

Deno.test("TASK-114: 粗い area:scripts と細分化 area は文字列が違うため交差しない", () => {
  // docs/development-style.md が「粗い area:scripts / area:data は使わない」と
  // 定めている理由。混在させると実際には競合するタスクが並列に選ばれてしまう。
  const tasks = [
    task({ id: "TASK-1", ordinal: 1000, labels: ["area:scripts"] }),
    task({ id: "TASK-2", ordinal: 2000, labels: ["area:scripts-fiefs"] }),
  ];
  assertEquals(selectNextTasks(tasks).skipped, []);
});

// ---- TASK-115: bug は候補の絞り込みではなく優先順位で表す ----
// 「bug 最優先」は compareTasks が bug を先頭に置くことで担保されるため、候補
// 集合から非 bug を除外する必要はない。除外をやめることで bug 1 件と area が
// 非交差の非 bug タスクを同じイテレーションで処理できる。規約は
// docs/development-style.md 4.1 章のルール 2（順序であって排他ではない）。

Deno.test("TASK-115: bug 候補があっても area が非交差の非 bug 候補は除外されない", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 1000, labels: ["area:docs"] }),
    task({
      id: "TASK-20",
      ordinal: 20000,
      labels: ["bug", "area:scripts-loop"],
    }),
    task({ id: "TASK-21", ordinal: 21000, labels: ["bug", "area:data-base"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [
      { id: "TASK-20", areas: ["scripts-loop"] },
      { id: "TASK-21", areas: ["data-base"] },
      { id: "TASK-2", areas: ["docs"] },
    ],
    skipped: [],
  });
});

Deno.test("TASK-115: 返る集合の先頭は ordinal が大きくても bug 候補になる", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 1000, labels: ["area:docs"] }),
    task({
      id: "TASK-20",
      ordinal: 20000,
      labels: ["bug", "area:scripts-loop"],
    }),
  ];
  assertEquals(selectNextTasks(tasks).tasks[0], {
    id: "TASK-20",
    areas: ["scripts-loop"],
  });
});

Deno.test("TASK-115: bug と area が交差する非 bug 候補は従来どおりスキップされる", () => {
  const tasks = [
    task({ id: "TASK-2", ordinal: 1000, labels: ["area:scripts-loop"] }),
    task({
      id: "TASK-20",
      ordinal: 20000,
      labels: ["bug", "area:scripts-loop"],
    }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-20", areas: ["scripts-loop"] }],
    skipped: [
      { id: "TASK-2", reason: "area conflict: scripts-loop (TASK-20)" },
    ],
  });
});

Deno.test("TASK-115: bug 群内の順序は ordinal → ID 昇順のまま非 bug より前に並ぶ", () => {
  const tasks = [
    task({ id: "TASK-1", ordinal: 500, labels: ["area:docs"] }),
    task({ id: "TASK-30", ordinal: 3000, labels: ["bug", "area:data-base"] }),
    task({
      id: "TASK-22",
      ordinal: 2000,
      labels: ["bug", "area:scripts-loop"],
    }),
    task({ id: "TASK-21", ordinal: 2000, labels: ["bug", "area:src-labels"] }),
  ];
  assertEquals(selectNextTasks(tasks).tasks.map((selected) => selected.id), [
    "TASK-21",
    "TASK-22",
    "TASK-30",
    "TASK-1",
  ]);
});

Deno.test("TASK-115: 先頭の bug が area 未付与なら従来どおり単独集合で確定する", () => {
  // 保守的フォールバックは bug でも変わらない（変更範囲が不明なため直列）。
  const tasks = [
    task({ id: "TASK-20", ordinal: 20000, labels: ["bug"] }),
    task({ id: "TASK-2", ordinal: 1000, labels: ["area:docs"] }),
  ];
  assertEquals(selectNextTasks(tasks), {
    tasks: [{ id: "TASK-20", areas: [] }],
    skipped: [],
  });
});
