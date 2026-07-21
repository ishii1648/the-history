---
id: TASK-14
title: agent-loop skill に PR conflict 対応とマージブロック分析を追記
status: To Do
assignee: []
created_date: '2026-07-21 08:17'
updated_date: '2026-07-21 09:00'
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
- [ ] #1 SKILL.md に PR conflict 検知と自動解消（main 取り込み→解消→再 push→CI green 再確認）の手順が追記されている
- [ ] #2 SKILL.md に修正不可なマージブロックの原因分析と needs-human エスカレーション（原因・選択肢・推奨対応を記載）の手順が追記されている
- [ ] #3 既存の CI red 対応・エスカレーション記述と矛盾なく統合されている
<!-- AC:END -->

## Comments

<!-- COMMENTS:BEGIN -->
author: @claude
created: 2026-07-21 09:00
---
TASK-15 の PR #15 で実際に conflict が発生した対応として、AC #1 相当（mergeability 監視の必須化・CONFLICTING/DIRTY 検知時の main 取り込み→解消→再 push→CI green 再確認）を SKILL.md 手順 3 に先行追記済み。着手時は AC #1 を現状確認のうえ、残りの AC #2（修正不可なマージブロックの原因分析と needs-human エスカレーション）を中心に実装すること。
---
<!-- COMMENTS:END -->
