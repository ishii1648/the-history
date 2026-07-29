---
id: TASK-142
title: backlog.md を完全撤去する
status: To Do
assignee: []
created_date: '2026-07-28 17:39'
labels:
  - 'area:workflow'
dependencies:
  - TASK-141
ordinal: 123000
---

移行先: #171

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: backlog.md → GitHub Issue 移行シリーズの最終タスク（背景・決定は TASK-137 の ADR を参照）。agent-loop の Issue ベース運用が実走確認された後、backlog.md の残骸を撤去する。

確定事項:
- CLAUDE.md の BACKLOG.MD GUIDELINES ブロックと CRITICAL_INSTRUCTION の backlog 運用記述を削除し、Issue ベースのタスク駆動開発の記述に置き換える。
- `backlog/config.yml`・ルートの `Backlog.md`（board export 成果物）・残存する backlog 配下の空ディレクトリを削除する。
- `.claude/settings.json` / `settings.local.json` から `Bash(backlog *)` 系の許可を削除する。
- deno.json の fmt.exclude から `backlog/` を外し、`docs/archive/` を追加する。
- README.md と docs/development-style.md の開発フロー記述から backlog CLI 依存を除去する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/archive/ 以外に backlog CLI を前提とする記述・設定（backlog task / backlog instructions / config.yml 参照等）が grep でヒットしない
- [ ] #2 CI が green のまま deno task next-tasks が Issue ソースで動作する
- [ ] #3 CLAUDE.md が GitHub Issue ベースのタスク駆動開発フローを記述している
<!-- AC:END -->
