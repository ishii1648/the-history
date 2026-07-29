---
id: TASK-150
title: main.ts の概略境界同期を src/approximate_border_sync.ts へ抽出する
status: To Do
assignee: []
created_date: '2026-07-29 15:57'
labels:
  - 'area:src-main'
  - 'area:src-approximate-borders'
dependencies: []
ordinal: 131000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-29 / docs/main-ts-inventory.md の U7（順序 7）。syncApproximateBorders + 再入ガード + styledata 購読（計約 130 行）を移す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [ ] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [ ] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [ ] #4 styledata 再入時に二重同期しない挙動が維持されている
<!-- AC:END -->
