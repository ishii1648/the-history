---
id: TASK-14
title: agent-loop skill に PR conflict 対応とマージブロック分析を追記
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 08:17'
updated_date: '2026-07-21 11:46'
labels: []
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR 作成後の自動化のうち、/agent-loop skill（.claude/skills/agent-loop/SKILL.md）に未記載の2点を補う。① main 先行による PR conflict の自動解消手順（main を取り込み conflict を解消して再 push、CI green を再確認）。② 自動修正不可なマージブロック（branch protection・権限不足・レビュー必須など）に遭遇した場合に、原因を分析して needs-human エスカレーション（原因・検討した選択肢・推奨対応を記載）でユーザに対応を依頼する手順。CI error の自動修正は既に SKILL.md に記載済みのため対象外。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 SKILL.md に PR conflict 検知と自動解消（main 取り込み→解消→再 push→CI green 再確認）の手順が追記されている
- [x] #2 SKILL.md に修正不可なマージブロックの原因分析と needs-human エスカレーション（原因・選択肢・推奨対応を記載）の手順が追記されている
- [x] #3 既存の CI red 対応・エスカレーション記述と矛盾なく統合されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-14-agent-loop-docs を origin/main から作成
2. 並列化判定: 見送り（理由: SKILL.md 単一ファイルへの文書追記のみで分割単位がない。subagent 1 体に委譲）
3. AC #1 の現状確認: TASK-15 で先行追記済みの mergeability 監視・conflict 自動解消手順が AC を満たすか確認し、不足があれば補完
4. AC #2: 自動修正不可なマージブロック（branch protection 要件・権限不足・レビュー必須等）の原因分析手順と needs-human エスカレーション（原因・検討した選択肢・推奨対応）を SKILL.md に追記
5. AC #3: 既存の CI red 対応・エスカレーション記述（手順 3/5）と矛盾なく統合されているかレビュー
6. deno fmt --check green（SKILL.md が fmt 対象なら）→ PR → CI 監視 → マージ → finalization
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC #1 は手順3（既存の CONFLICTING/DIRTY 検知→main取り込み→解消→再push→CI green再確認）で充足済みを確認、補完不要。AC #2 として手順3にマージブロックの自動修正可否の切り分け（BEHIND/strict protection・auto-merge無効=手動マージ代替=修正可 / 必須レビュー承認者不在・恒常的に満たせないstatus check・マージ権限不足=修正不可）を追記。手順5のエスカレーション条件に自動修正不可なマージブロックを追加し、issue記載項目を『原因・検討した選択肢・推奨対応』に統一。deno fmt --check green。
<!-- SECTION:NOTES:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-07-21 09:00
---
TASK-15 の PR #15 で実際に conflict が発生した対応として、AC #1 相当（mergeability 監視の必須化・CONFLICTING/DIRTY 検知時の main 取り込み→解消→再 push→CI green 再確認）を SKILL.md 手順 3 に先行追記済み。着手時は AC #1 を現状確認のうえ、残りの AC #2（修正不可なマージブロックの原因分析と needs-human エスカレーション）を中心に実装すること。
---
<!-- COMMENTS:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SKILL.md への追記を PR #25 で実装。検証エビデンス: (AC1) TASK-15 先行追記の mergeability 監視・conflict 自動解消手順（main 取り込み→解消→再 push→CI green 再確認）が AC を満たすことを現状確認（差分なし） (AC2) 手順 3 に自動修正可否の切り分け（gh pr view / branch protection API での原因分析、BEHIND=取り込み解消・auto-merge 無効=手動マージ代替・必須レビュー/権限不足=修正不可）と、修正不可時の needs-human エスカレーション（原因・検討した選択肢・推奨対応）を追記 (AC3) 手順 5 のエスカレーション条件に統合し重複・矛盾なし（mainagent レビューで確認）。TASK-2 の strict protection ブロック解消実績を根拠に記載。fmt/lint/test/build 全 green・CI green・MERGEABLE/CLEAN。
<!-- SECTION:FINAL_SUMMARY:END -->
