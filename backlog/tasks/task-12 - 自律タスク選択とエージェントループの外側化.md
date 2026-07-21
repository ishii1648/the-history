---
id: TASK-12
title: 自律タスク選択とエージェントループの外側化
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 07:05'
updated_date: '2026-07-21 07:11'
labels: []
dependencies:
  - TASK-11
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ループエンジニアリング方針では人間が開発フローに入らないことを原則とするが、現状は次に着手するタスクの選択と着手指示が人間依存になっている。次タスク選択を決定的なルールとしてコード化し、PR マージを起点に次タスクの実装セッションが自動起動する外側ループを整備することで、人の介入を例外時のみに限定する。参照: docs/development-style.md
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/development-style.md に次タスク選択ルール（status が To Do かつ dependencies が全て Done のタスクのうち ordinal 最小を選ぶ）が明文化されている
- [ ] #2 scripts/next_task.ts が backlog CLI 非依存で次タスク ID を決定的に出力し、deno task next-task で実行できる
- [ ] #3 次タスク選択ロジックにユニットテストが先行して書かれ、deno test が green である
- [ ] #4 .github/workflows/agent-loop.yml が main への push を起点に次タスクを判定し、ready タスクなし・既存 task-N-* ブランチあり・無効化時は安全に何もせず終了する
- [ ] #5 人の介入を例外時（AC 曖昧・CI 恒常 red・仕様判断）に限定するエスカレーション規約が docs に明文化されている
- [ ] #6 CLAUDE.md に次タスク選択の決定化ルールと自律ループ運用が追記されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 現行ブランチ claude/loop-engineering-task-selection-dxydmt 上で作業（セッション指定ブランチ。PR タイトル・説明に TASK-12 を明記して追跡性を担保する）
2. テスト先行: scripts/next_task_test.ts を作成し red を確認（frontmatter パース・ready 判定・ordinal 最小選択・除外条件）
3. scripts/next_task.ts を実装（backlog CLI 非依存の純粋関数 + CLI エントリポイント）。実装は subagent に委譲し、mainagent がレビュー
4. deno.json に next-task タスクを追加し deno test green を確認
5. .github/workflows/agent-loop.yml を作成（main push 起点、next_task.ts で判定、ready なし・既存 task-N-* ブランチ・AGENT_LOOP_ENABLED != true なら何もせず終了、claude-code-action で次タスクセッション起動）
6. docs/development-style.md に次タスク選択ルール・外側ループ運用・エスカレーション規約を追記、CLAUDE.md に決定化ルールを追記
7. deno fmt/lint/test/build green 確認 → mainagent レビュー収束 → PR 作成（TASK-12 明記）→ CI green 確認
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
テスト先行（red確認）→ subagent 実装 → mainagent レビューで hasActiveTask（In Progress 中はループ停止）を指摘・修正させ収束。scripts/next_task.ts + next_task_test.ts（12+3=15件）、deno task next-task 追加、@std/yaml 導入。agent-loop.yml（AGENT_LOOP_ENABLED オプトイン・二重着手ガード・claude-code-action 起動）、docs/development-style.md 4〜5章、CLAUDE.md 追記。deno fmt/lint/test(28 passed)/build 全て green。
<!-- SECTION:NOTES:END -->
