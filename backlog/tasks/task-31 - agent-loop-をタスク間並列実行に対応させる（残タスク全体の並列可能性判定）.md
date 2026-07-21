---
id: TASK-31
title: agent-loop をタスク間並列実行に対応させる（残タスク全体の並列可能性判定）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 14:55'
updated_date: '2026-07-21 15:31'
labels: []
dependencies: []
ordinal: 27500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘: 並列化判定のルールがタスク内（サブ作業の subagent 並列）にしか適用されておらず、タスク間の並列実行は現行ルールで明示的に禁止されている（CLAUDE.md「タスクの直列実行は維持」「並行実行はしない」、agent-loop SKILL.md ガード「1 イテレーション = 1 タスク = 1 PR」、deno task next-task は単一タスクのみ返す）。これを改め、ループの各イテレーション開始時に残タスク全体（To Do かつ dependencies 全 Done）の並列可能性を判定し、並列可能なタスク集合があれば複数タスクを同時に実装するようルールとツールを変更する。判定基準は dependencies の独立だけでは不十分で、変更予定ファイルの重なり（例: 本プロジェクトでは UI 系タスクの大半が src/main.ts に触るため衝突リスクが高い）まで評価し、衝突リスクの高い対は直列に倒すこと。実行方式は同一セッションの mainagent がオーケストレータとなり、タスクごとに subagent + worktree isolation で並列実装し、タスクごとに個別 PR を作成する方向を想定（1 タスク = 1 PR は維持し、1 イテレーション = 1 タスクの制約を緩める）。変更対象: CLAUDE.md・docs/development-style.md 4 章・.claude/skills/agent-loop/SKILL.md・next-task スクリプト（並列可能なタスク集合を返す拡張）。bug 最優先ルール・ステータス遷移の一意性・CI/mergeability 監視（複数 PR の同時監視）・マージ順序と conflict 解消手順との整合も設計に含めること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 next-task 相当のスクリプトが、着手可能なタスク集合と並列実行可否（ファイル衝突リスク評価込み）を決定的に返す
- [ ] #2 agent-loop SKILL.md にタスク間並列実行の手順（並列判定・worktree isolation・タスクごとの個別 PR・複数 PR の CI/mergeability 同時監視・マージ順序）が定義されている
- [ ] #3 CLAUDE.md と docs/development-style.md の直列実行前提の記述が新ルールと矛盾なく更新されている
- [ ] #4 並列不可（ファイル衝突リスク高・依存あり）の場合は従来どおり直列実行にフォールバックすることが明記されている
- [ ] #5 bug 最優先ルールとステータス遷移の一意性（各タスクの In Progress → Done が曖昧にならないこと）が並列実行時も維持される
- [ ] #6 変更したスクリプトにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 設計方針: タスク間並列の可否判定を決定的にするため「area ラベル」規約を導入する。タスクに label `area:<領域>` を付与し（領域一覧と対応パスは docs/development-style.md に定義: docs / workflow(.claude ほか) / scripts / data / src-main(src/main.ts・index.html・app.css 等の UI 統合) / src-<module>(独立モジュール)）、area が互いに素なタスク同士のみ並列可とする。area 未付与タスクは保守的に「単独実行のみ」。
2. スクリプト（A/B 間の契約）: scripts/next_tasks.ts 新規（next_task.ts の純関数を再利用）。選定規則: 候補 = To Do かつ dependencies 全 Done。bug ラベル群があれば bug 群のみを候補にする（既存の bug 最優先を維持）。候補を (bug優先, ordinal, ID) 順に走査し、area が既選択タスクと交差しないものを貪欲に追加（決定的）。area 未付与タスクは先頭でのみ選択され集合を打ち切る。出力は JSON: {"tasks":[{"id":"TASK-28","areas":["docs","workflow"]}],"skipped":[{"id":"TASK-30","reason":"area conflict: src-main (TASK-29)"}]}。deno task next-tasks を追加。従来の next-task（単一）は互換維持。
3. ドキュメント/運用: agent-loop SKILL.md にタスク間並列イテレーションの手順（next-tasks による集合判定 → 各タスクを In Progress + プラン + 個別ブランチ task-N-slug + subagent/worktree で並列実装 → タスクごとに個別 PR → 複数 PR の CI/mergeability を単一 Monitor で同時監視 → ready になった PR から順にマージし、後続 PR の BEHIND/conflict は従来手順で解消）を定義。1 タスク = 1 PR・bug 最優先・ステータス遷移の一意性（In Progress/Done は各タスク個別に遷移）は維持し、「1 イテレーション = 1 タスク」の制約のみ緩める。並列不可（area 交差・未付与・依存あり）は従来どおり直列にフォールバック。CLAUDE.md と docs/development-style.md 4 章の直列前提記述を矛盾なく更新。既存 To Do タスクへ area ラベル付与（TASK-28: area:docs, area:workflow / TASK-29: area:src-main / TASK-30: area:src-main）。
4. 並列化判定: 並列可（独立サブ作業 2 件、worktree isolation）
   - subagent A（スクリプト）: scripts/next_tasks.ts / next_tasks_test.ts 新規、deno.json task 追加。担当: scripts/next_tasks*.ts / deno.json
   - subagent B（ドキュメント/運用）: .claude/skills/agent-loop/SKILL.md / CLAUDE.md / docs/development-style.md の更新、TASK-28〜30 への area ラベル付与（backlog CLI 使用、対象 3 ファイルのみ）。担当: 上記ドキュメント + backlog/tasks/task-{28,29,30}*.md（CLI 経由）
   - 契約: 上記 2 のスクリプト仕様（コマンド名・選定規則・JSON 形式）と area 領域一覧。担当ファイルは互いに素
5. TDD（A は red→green 必須）→ mainagent 統合レビュー → fmt/lint/test/build 全 green → next-tasks の実出力確認（TASK-28/29/30 で期待集合になるか）→ PR → CI → finalization → マージ → マージ後動作確認（次イテレーションから新ルール適用）
<!-- SECTION:PLAN:END -->
