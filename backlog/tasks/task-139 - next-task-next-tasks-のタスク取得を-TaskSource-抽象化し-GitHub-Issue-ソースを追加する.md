---
id: TASK-139
title: next-task/next-tasks のタスク取得を TaskSource 抽象化し GitHub Issue ソースを追加する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 17:38'
updated_date: '2026-07-29 17:39'
labels:
  - 'area:scripts-loop'
dependencies:
  - TASK-138
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: backlog.md → GitHub Issue 移行シリーズの一部（背景・決定は TASK-137 の ADR を参照）。選定ロジック（compareTasks / selectCandidates / selectNextTask / hasActiveTask / selectNextTasks / extractAreas）は TaskMeta を入力とする純粋関数として分離済みで、ローカル FS 依存は readTasks のみ。この読み取り部を差し替え可能にし、GitHub Issue ソースを追加する。

確定事項:
- readTasks を TaskSource 抽象の背後に置き、環境変数 `TASK_SOURCE=backlog|github` で切り替える。本タスク時点の既定は backlog のまま（既定の切替は後続の起票切替タスクで行う）。
- GitHub ソースは `gh issue list --state all --limit 1000 --json number,title,state,stateReason,labels,body` の 1 コールで全件取得する。search API（30 req/min 制限）は使わない。REST 直叩きに変える場合は `pull_request` キーで PR を必ず除外する。
- Issue → TaskMeta 変換: id は `#N` 形式（既存の数値抽出ロジックと互換）、status は state/stateReason/`status:in-progress` ラベルから導出、dependencies と ordinal は本文の LOOP-META（HTML コメント内 YAML）からパース、ordinal 欠落時は Issue 番号を使う。`task` ラベルの無い issue は候補から除外する。
- 純粋関数（parseLoopMeta / issueToTaskMeta / statusOf 等）はフィクスチャ JSON でネットワーク非依存にテストする（TDD・red 先行）。`--json-file <path>` オプションで gh を起動せずに検証できるようにする。
- `deno task next-tasks` の JSON 出力契約（tasks/skipped）は変更しない。
- deno.json の next-task / next-tasks に `--allow-run=gh --allow-env` を追加する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TASK_SOURCE 未設定または backlog のとき従来どおりローカル md から選定され、既存テストが green のまま
- [ ] #2 TASK_SOURCE=github のとき gh issue list 由来の候補に同一の選定ルール（bug 最優先 → ordinal → ID）が適用される
- [ ] #3 LOOP-META の depends-on がパースされ、依存が未クローズの issue が候補から除外される
- [ ] #4 task ラベルの無い issue（needs-human 等）が候補に含まれない
- [ ] #5 変換・パースの純粋関数テストがネットワーク非依存で green
- [ ] #6 deno task next-tasks の JSON 出力契約（tasks/skipped）が維持されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scripts/next_tasks.ts / next_task.ts の構造（TaskMeta・readTasks・選定純粋関数）を読む
2. TDD red: parseLoopMeta / issueToTaskMeta / statusOf の純粋関数テストをフィクスチャ JSON で先に書く（AC#5）
3. TaskSource 抽象を導入し TASK_SOURCE=backlog|github で切替（既定 backlog 不変 = AC#1）。github は gh issue list 1 コール（--json、search API 不使用）。task ラベル必須・LOOP-META パース・依存未クローズ除外（AC#2〜#4）
4. --json-file オプションで gh 非起動の検証経路。next-tasks の JSON 出力契約は不変（AC#6）
5. deno.json の next-task(s) に --allow-run=gh --allow-env 追加。fmt / lint / test green

並列化判定: 見送り（理由: 単一スクリプト群の抽象化）
<!-- SECTION:PLAN:END -->
