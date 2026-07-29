---
id: TASK-147
title: main.ts の地物レイヤー builder 群を src/feature_layers.ts へ抽出する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-29 15:57'
updated_date: '2026-07-29 19:14'
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
- [x] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [x] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [x] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [x] #4 メモ化の参照同値が維持されている（ホバー連続移動で riverLabelAnchors 等の再計算が走らない）
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- src/feature_layers.ts（915 行）: labelLayerBaseProps は純関数 export、12 builder + memoizeLatest 13 は createFeatureLayerBuilders ファクトリ closure（module-scope 可変状態ゼロ）。FeatureLayerContext は year・4 データストア・nameJa・zoomStep・hover/selected 6 変数の値スナップショット
- メモ化共有: main が起動時 1 度だけファクトリを呼び、公開 memoized* を同一インスタンスのまま installDebugHooks へ注入。「builder 実行後に同引数で strictEquals」をテストで assert し別キャッシュ化を構造的に検出
- 型のみの差分: labels.ts の number[] を deck.gl Color へ適合させる textStyleProps アダプタ（値不変。新モジュールはテスト経由で型検査されるため）
- red（TS2307）→ green 13 テスト。verify:smoke / mobile 無変更 PASS。CDP: ヴェネツィア・アルプス山脈・マッターホルン 4478m・ライン川 hover/click + 出典表示の非退行、河畔都市で rivers が picking に勝つのは PICKING_PRIORITY どおりの既存仕様
- main.ts 2,572 → 1,882 行（-690）。1680 passed（mainagent 独立検証）・fmt/lint/build green
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
地物レイヤー 12 builder + メモ化 13 を createFeatureLayerBuilders ファクトリへ抽出（decision-29 シリーズ 4/7）。メモ化の同一インスタンス共有と参照同値をテストで構造的に担保し、verify 無変更 PASS + CDP 非退行。main.ts -690 行、red → green、1680 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
