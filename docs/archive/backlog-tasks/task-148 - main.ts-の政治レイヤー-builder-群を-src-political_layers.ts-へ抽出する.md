---
id: TASK-148
title: main.ts の政治レイヤー builder 群を src/political_layers.ts へ抽出する
status: To Do
assignee: []
created_date: '2026-07-29 15:57'
labels:
  - 'area:src-main'
  - 'area:src-layer-builders'
dependencies:
  - TASK-147
ordinal: 129000
---

移行先: #166

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-29 / docs/main-ts-inventory.md の U5（順序 5、U4 に依存）。buildPowerLayer・勢力ラベル builder（memoizedPowerLabelData 等）・勢力圏外枠 builder（計約 240 行 + 定数）を移す。fillTransitionMs・powerHighlight の状態は main.ts に残す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [ ] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [ ] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [ ] #4 描画順 = picking 優先順の整合検証（renderLayers）が無変更で通る
<!-- AC:END -->
