---
id: TASK-145
title: main.ts のデータ取得関数 10 件を src/data_loading.ts へ抽出する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-29 15:56'
updated_date: '2026-07-29 17:52'
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
- [x] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [x] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [x] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [x] #4 縮退契約（warn 文言含む）が不変である
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/main-ts-inventory.md の U2（load* 10 関数・約 190 行）と decision-29・TASK-144 の抽出パターン（debug_hooks.ts）を読む
2. TDD red: src/data_loading.ts の縮退契約（欠損時 warn + 空継続、warn 文言不変）と返り値型のテストを先に書く
3. 抽出実装: 汎用 fetchJson へ整理、main.ts は注入・配線のみに
4. CDP（ポート 8145）で起動・年代切替・縮退経路（存在しない年の 404 等は該当があれば）の非退行確認
5. fmt / lint / test / build green。main.ts の行数削減を報告

並列化判定: 見送り（理由: 単一モジュール抽出）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- load* 10 関数を src/data_loading.ts（269 行）へ抽出。FetchLike 依存注入 + 共通 fetchJson。返り値型: colors/nameJa は Record、overrides/fiefDedupe/rivers/mountains/peaks は失敗時に EMPTY_* の同一参照（メモ化キー安定性維持）、notes は null 許容、cities/limitations は型付き
- decision-29 準拠: module-scope 可変状態なし。main.ts は initPowerLayer 内の Promise.all 分割代入と成功時フック（revealNotesToggle / revealKnownLimitations）のみ残置
- 縮退契約: warn 文言 10 件を完全一致文字列で assert（実装は移設のみで 1 文字も不変）。内部エラー文言（years が不正または空 等）も維持
- red（TS2307）→ green 33 テスト。verify:smoke / mobile 無変更 PASS + CDP で 1000/1300/1500 の 4 オーバーレイ系統・都市/山岳/山峰件数の反映を確認
- main.ts 3,178 → 3,019 行（-159）。deno check の既存 6 エラーは HEAD と同一で増減なし
- 1589 passed（mainagent 独立検証）・fmt/lint/build green
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
データ取得 10 関数を返り値型 + fetch 依存注入で src/data_loading.ts へ抽出（decision-29 シリーズ 2/7）。縮退契約（warn 文言・空データ同一参照）を完全一致テストで固定し、verify 無変更 PASS。main.ts -159 行、red → green 33 テスト、1589 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
