---
id: TASK-146
title: main.ts の DOM パネル配線 6 件を src/ui/ へ抽出する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-29 15:56'
updated_date: '2026-07-29 18:05'
labels:
  - 'area:src-main'
  - 'area:src-ui-panels'
dependencies: []
ordinal: 127000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-29 / docs/main-ts-inventory.md の U3（順序 3）。setupInfoUI・setupFooter・setupKnownLimitationsUI・setupNotesUI・setupTimeline・ローディング/エラー UI（計約 520 行）をハンドル返却型へ整理して src/ui/ へ移す。switchYear はコールバック注入にする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [ ] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [ ] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [ ] #4 不変条件の非退行: デバッグフック名・データローダの縮退契約・メモ化の参照同値（該当するもの）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/main-ts-inventory.md の U3（DOM パネル 6 件・約 520 行）と decision-29・TASK-144/145 の抽出パターンを読む
2. TDD red: 各 setup* のハンドル返却型の契約テストを先に書く
3. src/ui/ へ抽出（setupInfoUI / setupFooter / setupKnownLimitationsUI / setupNotesUI / setupTimeline / ローディング・エラー UI）。switchYear はコールバック注入。module-scope 可変状態なし
4. CDP（ポート 8146）で verify:smoke / mobile 無変更 PASS + 各パネルの開閉動作確認
5. fmt / lint / test / build green。main.ts の行数削減を報告

並列化判定: 見送り（理由: 単一シリーズの抽出。パネル間で共有する DOM ヘルパの設計が一体）
<!-- SECTION:PLAN:END -->
