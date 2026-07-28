---
id: TASK-138
title: GitHub Issue タスク管理の受け皿を準備する（ラベル・テンプレート・permissions）
status: To Do
assignee: []
created_date: '2026-07-28 17:38'
labels:
  - 'area:workflow'
dependencies: []
ordinal: 119000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: backlog.md → GitHub Issue 移行シリーズの一部。タスク状態の単一ストアを GitHub Issue にするため、リポジトリ側の受け皿を先に整備する。移行の背景・決定は TASK-137 の ADR を参照。

確定事項:
- ラベルを作成する: `task`（タスク判別・タスク issue に必須。needs-human 等の非タスク issue を選定候補から除外するため）、`status:in-progress`（In Progress 表示用）、`area:*`（docs/development-style.md 4.2 章の全領域）。`bug` は GitHub 既定ラベルを流用する。
- status 表現: To Do = open、In Progress = open + `status:in-progress`、Done = closed(COMPLETED)、取りやめ = closed(NOT_PLANNED)。
- Issue 本文規約: HTML コメントの LOOP-META ブロック（`depends-on: #N` / `ordinal: N`、YAML 断片）+ Description + Acceptance Criteria。AC 記法は `- [ ] AC1 ...` とする（`#N` は Issue へのリンクに化けるため禁止）。Implementation Plan / Notes / Final Summary は Issue 本文ではなくコメントに投稿する（本文の read-modify-write を finalization の AC チェック 1 回に限定し、上書き競合を避けるため）。
- Projects v2 は使わない。ordinal は Issue 番号で代替し、順序を上書きしたい場合のみ LOOP-META に書く。
- `.github/ISSUE_TEMPLATE/` に task 用・bug 用テンプレート、`.github/pull_request_template.md`（`Closes #` 欄付き）を新設する。bug テンプレートは development-style.md 2 章の bug intake フォーマット（再現手順・期待挙動・実際の挙動・発見契機）を反映する。
- `.claude/settings.json` の permissions に `gh issue list/view/create/edit/comment`・`gh label list` を粒度別に追加する。`gh issue delete` と `gh issue close` は許可しない（クローズは PR の `Closes #N` 自動クローズに任せる設計のため）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 gh label list で task・status:in-progress・development-style 4.2 章の全 area ラベルが確認できる
- [ ] #2 Issue テンプレート（task/bug）が LOOP-META・Description・AC の本文規約を含み、AC 記法が AC1 形式である
- [ ] #3 PR テンプレートに Closes # 欄がある
- [ ] #4 settings.json の permissions が gh issue の必要サブコマンドのみを許可し delete/close を含まない
<!-- AC:END -->
