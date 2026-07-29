---
id: TASK-149
title: main.ts の picking イベント処理を src/pick_handlers.ts へ抽出する
status: To Do
assignee: []
created_date: '2026-07-29 15:57'
labels:
  - 'area:src-main'
  - 'area:src-picking'
dependencies: []
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-29 / docs/main-ts-inventory.md の U6（順序 6）。pickedLabel/pickedMetadata・handlePickHover/Click 等（計約 370 行）を createPickHandlers(deps) に閉じ込め、選択/ホバー状態の getter をデバッグフックへ提供する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [ ] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [ ] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [ ] #4 ホバー/クリック/選択解除の全経路が CDP で非退行（河川・都市・山岳・勢力・諸侯領）
<!-- AC:END -->
