---
id: TASK-60
title: TASK-54 のラベル改善定数をレビュー済み改良値へ更新する
status: To Do
assignee: []
created_date: '2026-07-24 16:01'
labels:
  - 'area:src-labels'
dependencies: []
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: TASK-54（密集地域のラベル視認性改善）は暴走ジョブが中間版の定数（LABEL_BACKGROUND_COLOR alpha 210 / LABEL_BACKGROUND_PADDING [4,3] / COLLISION_SIZE_SCALE 2.2）で finalize し PR #66 として main へマージした。一方、mainagent のレビューを通過した改良版（alpha 200 / [3,2] / 2.6。alpha は下の塗り・境界線の透け、padding は密集地帯でのパネル同士の重なり抑制、sizeScale はズーム 5〜6 でラベルが消えすぎない上限を実測して決めた値。根拠コメント付き）はブランチ worktree-agent-aed8eab35fba74dc8（コミット c0e1a77）に残っている。この改良値と実測根拠コメント・テスト（背景色の暖色系条件 r>=g>=b、padding 上限 <=8px 等）を main に適用する。
発見契機: TASK-54 マージ後のレビュー差分確認（agent-loop 二重実行インシデントの復旧作業中）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/labels.ts の 3 定数が改良値（alpha 200 / padding [3,2] / sizeScale 2.6）と実測根拠コメント付きで更新され、c0e1a77 のテスト強化分が取り込まれている
- [ ] #2 deno test が green（既存テスト含む）
- [ ] #3 実機スクリーンショット（密集 3 箇所）で TASK-54 の AC 相当の判読性が維持されている
<!-- AC:END -->
