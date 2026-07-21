---
id: TASK-31
title: agent-loop をタスク間並列実行に対応させる（残タスク全体の並列可能性判定）
status: To Do
assignee: []
created_date: '2026-07-21 14:55'
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
