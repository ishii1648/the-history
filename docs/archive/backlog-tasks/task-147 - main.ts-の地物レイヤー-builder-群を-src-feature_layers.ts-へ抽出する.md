---
id: TASK-147
title: main.ts の地物レイヤー builder 群を src/feature_layers.ts へ抽出する
status: To Do
assignee: []
created_date: '2026-07-29 15:57'
labels:
  - 'area:src-main'
  - 'area:src-layer-builders'
dependencies: []
ordinal: 128000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-29 / docs/main-ts-inventory.md の U4（順序 4）。河川・山岳（山脈/山峰）・都市の builder + メモ化 + labelLayerBaseProps（計約 700 行）を context 引数の純関数群として移す。メモ化の参照同値（TASK-50 / TASK-136: ホバー連続移動で属性再計算が走らない）を AC で担保する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [ ] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [ ] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [ ] #4 メモ化の参照同値が維持されている（ホバー連続移動で riverLabelAnchors 等の再計算が走らない）
<!-- AC:END -->
