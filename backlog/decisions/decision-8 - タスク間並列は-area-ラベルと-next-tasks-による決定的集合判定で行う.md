---
id: decision-8
title: タスク間並列は area ラベルと next-tasks による決定的集合判定で行う
date: '2026-07-21 15:52'
status: accepted
---
## Context

当初の規約はタスクの直列実行（1 イテレーション = 1 タスク）で、独立なタスク同士も待ち合わせが発生していた。タスク間並列を導入するには、dependencies の独立だけでは不十分で、変更ファイルの衝突（特に UI 系タスクの大半が触る src/main.ts）まで機械的・決定的に判定する必要がある（TASK-31）。

## Decision

各タスクに変更領域を表す `area:<領域>` ラベル（docs / workflow / scripts / data / src-main / src-<module>）を付与し、`deno task next-tasks`（scripts/next_tasks.ts）が「To Do かつ dependencies 全 Done」の候補から bug 最優先 → ordinal → ID の貪欲選択で area が互いに素なタスク集合を決定的に返す。area 未付与タスクは保守的に単独実行のみ。1 タスク = 1 PR・In Progress → Done 遷移の一意性は並列時も維持する。

## Consequences

- 並列可否の判断が人の裁量ではなくラベルとスクリプトで決まり、ループが自律的にタスク間並列を実行できる。
- タスク作成時に area ラベルの付与が必須の運用になる（未付与は直列フォールバックで安全側に倒れる）。
- ファイル衝突の粒度は area の定義に依存するため、src/ のモジュール分割が変わったら area 一覧（docs/development-style.md 4.2 章）の更新が必要。
- 関連タスク: TASK-31
