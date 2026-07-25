---
id: TASK-64
title: agent-loop のブラウザ不可環境向け代替検証手順が docs から消えている
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 05:43'
updated_date: '2026-07-25 05:47'
labels:
  - bug
  - 'area:workflow'
  - 'area:docs'
dependencies: []
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review CONFIRMED 指摘 #7。TASK-58 のヘッドレス CDP 標準化の際、.claude/skills/agent-loop/SKILL.md と docs/development-style.md から『ブラウザ操作が不可能な環境ではビルド成果物・データ出力のスモークチェック（生成物の存在・件数・スキーマ等の機械的確認）で代替する』というフォールバックが削除された。Chrome を起動できない環境（バイナリ欠如・CI 的サンドボックス）で agent-loop がマージ後動作確認に到達すると、文書化された検証経路がなくループが停止するか HITL に落ちる。期待: ヘッドレス CDP → 機械的スモークチェックの順のフォールバック連鎖として復活させる。発見契機: /code-review（TASK-57/58/59 docs の横断レビュー）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SKILL.md と development-style.md にブラウザ不可時の機械的スモークチェック代替が復活している
- [x] #2 deno fmt --check green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. SKILL.md 手順 4 と development-style.md 4.3.1 に『ヘッドレス CDP が使えない（Chrome 起動不可）環境ではビルド成果物・データ出力の機械的スモークチェックで代替する』フォールバック連鎖を復活させる。2. 並列化判定: 見送り（docs 2 箇所の小追記のみ）。mainagent 直接実装（docs タスク前例）。3. deno fmt → PR → CI green → finalization → マージ。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SKILL.md 手順 4 と docs/development-style.md 4.3.1 に、Chrome を起動できない環境向けの機械的スモークチェック代替（ビルド成果物・データ出力の存在・件数・スキーマ確認）をフォールバック連鎖（ヘッドレス CDP → 機械的スモーク）として復活させた（AC #1: 両ファイルの追記を grep で確認）。deno fmt --check green・PR #71 CI green（AC #2）。
<!-- SECTION:FINAL_SUMMARY:END -->
