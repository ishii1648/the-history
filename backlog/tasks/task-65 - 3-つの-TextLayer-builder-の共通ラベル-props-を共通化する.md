---
id: TASK-65
title: 3 つの TextLayer builder の共通ラベル props を共通化する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 05:43'
updated_date: '2026-07-25 05:52'
labels:
  - bug
  - 'area:src-main'
dependencies: []
ordinal: 62000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review CONFIRMED 指摘 #10（cleanup）。src/main.ts の buildRiverLabelLayer / buildCityLabelLayer / buildLabelLayer が背景パネル・フォント・衝突関連の同一 9 props を三重複製している。TASK-54 の中間版/最終版の混在で実際に片側だけ値が変わるドリフトが発生した実績があり、放置すると変更漏れでラベル種別間の見た目・間引き挙動が静かに不整合になる。期待: rivers レイヤーの riversLayerBaseProps()（TASK-53）と同様の共通 base props 関数へ抽出し、既存挙動を完全維持する（リファクタのみ）。発見契機: /code-review（TASK-54/60 の横断レビュー）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 共通 props が単一定義に抽出され、3 builder がそれを参照する（既存テスト全 green・挙動不変）
- [x] #2 実機スモーク（ラベル表示 3 種）で退行がない
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/main.ts の 3 TextLayer builder（国名/都市/河川）が複製する共通 9 props（背景パネル・フォント・縁取り・衝突関連）を riversLayerBaseProps() と同様の共通関数へ抽出。層固有の props（サイズ・色・priority・characterSet 等）は各 builder に残す。2. 挙動完全維持（リファクタのみ）: 既存テスト green + CDP スモークでラベル 3 種の表示確認。3. 並列化判定: 見送り（src/main.ts 単一ファイルの変更）。単一 subagent（worktree isolation）委譲。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/main.ts に labelLayerBaseProps() を新設し、国名・都市名・河川名の 3 TextLayer builder が三重複製していた共通 12 props（sizeUnits/フォント 4 種/背景パネル 3 種/衝突制御 3 種）を単一定義に集約（AC #1: 既存テスト 559 passed・値変更なしのリファクタ）。CDP 実機スモークで 1500 年 z6 ドイツ周辺のラベル 3 種が従来どおり背景パネル付きで表示されることを目視確認（AC #2）。PR #72 CI green。
<!-- SECTION:FINAL_SUMMARY:END -->
