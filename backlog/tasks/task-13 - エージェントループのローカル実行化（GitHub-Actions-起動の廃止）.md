---
id: TASK-13
title: エージェントループのローカル実行化（GitHub Actions 起動の廃止）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 07:26'
updated_date: '2026-07-21 07:27'
labels: []
dependencies:
  - TASK-12
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-12 で整備した外側ループは GitHub Actions 上で claude-code-action がセッションを起動する前提だったが、ローカルの Claude Code セッション自身が次タスク選択から finalization までを連続実行する方式に作り直す。CI や GitHub のステータスは Actions のトリガーではなく、セッションが Monitor ツールや PR activity 購読（MCP）で監視する。次タスク選択の決定的ルールと scripts/next_task.ts はそのまま利用する。参照: docs/development-style.md 4 章
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 .github/workflows/agent-loop.yml が削除されている
- [ ] #2 .claude/commands/agent-loop.md が存在し、ローカルセッションが next-task 判定 → 標準タスクフロー → CI 監視（Monitor / PR activity 購読）→ マージ → finalization → 次タスクへ、を繰り返すループ手順を定義している
- [ ] #3 ループの停止条件（着手可能タスクなし・needs-human エスカレーション時）が定義されている
- [ ] #4 docs/development-style.md 4.2 がローカル実行前提の記述に更新され、AGENT_LOOP_ENABLED / CLAUDE_CODE_OAUTH_TOKEN の設定要件が削除されている
- [ ] #5 CLAUDE.md の外側ループの記述が agent-loop.yml 参照からローカルループ参照に更新されている
- [ ] #6 deno fmt --check / lint / test が green である
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. .github/workflows/agent-loop.yml を削除
2. .claude/commands/agent-loop.md を新規作成: ローカルセッションが回すループ（next-task 判定 → 標準タスクフロー → PR → Monitor/PR購読で CI 監視 → green でマージ → finalization → 次タスク）と停止条件（候補なし / needs-human）を定義
3. docs/development-style.md 4.2 をローカル実行前提に書き換え（Actions 起動・AGENT_LOOP_ENABLED・CLAUDE_CODE_OAUTH_TOKEN の記述を削除、Monitor/PR activity 購読による監視を明記）
4. CLAUDE.md の agent-loop.yml 参照を /agent-loop（ローカルループ）に更新
5. deno fmt/lint/test green 確認 → mainagent レビュー → PR（TASK-13 明記）→ CI green → マージ → finalization
補足: コードロジックの変更はなく docs/コマンド定義のみのため新規テストは不要（next_task.ts のテスト 28 件は既存のまま green を維持）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
agent-loop.yml を削除し、.claude/commands/agent-loop.md（/agent-loop コマンド）としてローカルセッション主導のループを定義。docs 4.2 をローカル実行前提（Monitor ツール / PR activity 購読による CI 監視、AGENT_LOOP_ENABLED・CLAUDE_CODE_OAUTH_TOKEN 要件の削除）に書き換え、CLAUDE.md の参照を更新。コードロジック変更なしのため新規テストなし。deno fmt --check / lint / test green、grep で旧方式（claude-code-action / AGENT_LOOP_ENABLED / agent-loop.yml）への参照が backlog 履歴以外に残っていないことを確認。
<!-- SECTION:NOTES:END -->
