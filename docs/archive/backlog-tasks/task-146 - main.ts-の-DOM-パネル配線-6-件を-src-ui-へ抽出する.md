---
id: TASK-146
title: main.ts の DOM パネル配線 6 件を src/ui/ へ抽出する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-29 15:56'
updated_date: '2026-07-29 18:51'
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
- [x] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [x] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [x] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [x] #4 不変条件の非退行: デバッグフック名・データローダの縮退契約・メモ化の参照同値（該当するもの）
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- src/ui/ 構成: dom.ts（UiDocument / UiKeydownSource の最小構造型）+ info_panel / footer / known_limitations / notes / loading / timeline。各 setup はハンドル（showTooltip / reflectYear / render 等）を返し、main.ts は生成・注入・12 箇所の呼び出しのみ
- 注入設計: viewportSize・getNotesData 等の getter、loading の onRetry/onClose、timeline の onRequestYear（= switchYear コールバック）で循環 import 回避。decision-29 の module-scope 可変状態なしを維持
- 縮退契約: 要素欠如時の warn 文言（1 字不変）+ no-op をテストで完全一致固定。意図的変更は outside-click の typeof Node ガード 1 点（Deno テスト防御、ブラウザ挙動不変）
- red（TS2307）→ green 44 テスト（fake_dom によるハンドル形状・配置・出典 dl・reveal/reflect・reducer 同期・トースト文言・二重発火防止）。実 DOM 依存（instanceof Node・getBoundingClientRect・実マウス picking）は CDP 担保に切り分け
- CDP（8146）: verify:smoke / mobile 無変更 PASS + 専用チェック 18 項目 all PASS（ツールチップ/パネル/閉じる・タイムライン ← キーと端 disabled・解説 Escape・既知の制限 17 項目と outside-click・footer・未キャッシュ年スピナー・404 年トースト）。環境起因の quirk 2 点（HEAD でも再現 = 非リグレッション）を記録
- main.ts 3,019 → 2,572 行（-447）。deno check の既存 6 エラーは増減なし。1664 passed（mainagent 独立検証）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
DOM パネル配線 6 件をハンドル返却型 + 依存注入で src/ui/ へ抽出（decision-29 シリーズ 3/7）。縮退契約（warn 文言・no-op）を完全一致テストで固定し、verify 無変更 PASS + CDP 18 項目で全パネル動作を確認。main.ts -447 行、red → green 44 テスト、1664 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
