---
id: TASK-145
title: main.ts のデータ取得関数 10 件を src/data_loading.ts へ抽出する
status: To Do
assignee: []
created_date: '2026-07-29 15:56'
labels:
  - 'area:src-main'
  - 'area:src-data-loading'
dependencies: []
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-29 / docs/main-ts-inventory.md の U2（順序 2）。load* 10 関数（fetch + 縮退契約、約 190 行）を返り値型 + 汎用 fetchJson へ整理して移す。縮退契約（欠損時に warn して空で継続する挙動・warn 文言）は不変。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [ ] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [ ] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [ ] #4 縮退契約（warn 文言含む）が不変である
<!-- AC:END -->
