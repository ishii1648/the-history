---
id: TASK-147
title: main.ts の地物レイヤー builder 群を src/feature_layers.ts へ抽出する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-29 15:57'
updated_date: '2026-07-29 18:55'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/main-ts-inventory.md の U4（河川・山岳・都市 builder + labelLayerBaseProps、約 700 行）と ADR-0029・TASK-144/145/146 の抽出パターンを読む
2. TDD red: メモ化の参照同値（ホバー連続移動で再計算なし = TASK-50/136 契約）を含む契約テストを先に書く
3. src/feature_layers.ts へ context 引数の純関数群として抽出。main.ts は配線のみ
4. CDP（ポート 8147）で verify:smoke / mobile 無変更 PASS + ホバー/クリックの非退行確認
5. fmt / lint / test / build green。main.ts 行数 before/after を報告

並列化判定: 見送り（理由: 単一モジュール抽出）
<!-- SECTION:PLAN:END -->
