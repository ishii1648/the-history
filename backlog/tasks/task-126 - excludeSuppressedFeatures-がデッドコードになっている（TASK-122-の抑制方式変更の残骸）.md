---
id: TASK-126
title: excludeSuppressedFeatures がデッドコードになっている（TASK-122 の抑制方式変更の残骸）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:37'
updated_date: '2026-07-29 17:00'
labels:
  - 'area:src-fief-dedupe'
  - 'area:src-main'
dependencies: []
priority: low
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

TASK-122（低ズームでは諸侯領ラベルを出さず国名だけにする）で、TASK-78 の base ラベル抑制の適用点を変更した。

- **変更前**: `excludeSuppressedFeatures` が FeatureCollection から抑制対象の feature を落とす
- **変更後**: `buildLabelData` が `LabelDatum.suppressed = true` の印を付け、`filterPowerLabelsByZoom` がズーム段に応じて実際に出すかを決める

理由は、諸侯領ラベルを低ズームで隠すと抑制された base 勢力のラベルも出ず、その土地のラベルが 1 つも無くなるため（1000〜1300 年の Britany 等）。

## 問題

この変更により **`src/fief_dedupe.ts` の `excludeSuppressedFeatures` が未使用の export になった**。`src/main.ts` からの唯一の呼び出しが消えている。

関数と `src/fief_dedupe_test.ts` のテストは残っており `deno lint` も通るが、**「これが base ラベル抑制の実装だ」と誤読される危険**がある。実際の抑制は `src/labels.ts` の `filterPowerLabelsByZoom` が担っている。

**発見契機**: TASK-122 の実装 subagent が申し送り、mainagent がイテレーション末にバッチ起票した。

## 判断が要る点

- **削除するか、純粋ユーティリティとして残すか。**残す場合は「現在アプリからは呼ばれていない」ことと、抑制の実装が `labels.ts` に移ったことを doc コメントに明記する必要がある
- `fief_dedupe_test.ts` の該当テストも同時に扱う
- `suppressedPowerNames`（同じファイルの別関数）は引き続き使われているので消さないこと

## 関連

TASK-78（base ラベル抑制の導入）・TASK-122（抑制方式の変更）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 excludeSuppressedFeatures を削除するか残すかが根拠付きで判断されている
- [x] #2 残す場合: アプリから呼ばれていないことと抑制の実装が labels.ts にあることが doc コメントに明記されている
- [x] #3 suppressedPowerNames など現役の関数が失われていない
- [x] #4 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/fief_dedupe.ts の excludeSuppressedFeatures の参照を全走査し、アプリから呼ばれていないことを確認
2. 判断: 削除を第一候補（TASK-122 で抑制の実装が labels.ts の suppressed マーキング + filterPowerLabelsByZoom に移っており、残すと「これが抑制の実装」と誤読される。suppressedPowerNames は現役なので残す）。根拠を記録
3. TDD: 削除に伴う fief_dedupe_test.ts の該当テスト削除と、suppressedPowerNames の現役テスト維持を確認
4. deno fmt --check / lint / test / build green

並列化判定: 見送り（理由: 単一関数の削除判断のみ）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- 判断: 削除。アプリ経路の参照ゼロ（定義本体・自テスト 3 件・labels.ts の歴史コメントのみ）を全走査で確認。main.ts は TASK-122 の suppressedPowerNames → buildLabelData 方式に移行済みで、残置は「これが抑制の実装」との誤読リスクのみ。git 履歴で復元可能
- AC#2 は「残す場合」の条件付き AC のため、削除選択により空満足（歴史的経緯は fief_dedupe.ts / labels.ts の doc コメントに TASK-126 参照付きで残した）
- 現役 API（suppressedPowerNames / parseFiefDedupeTable / coverageFor 等）とテスト・main.ts の参照は無傷。TASK-122 の抑制実装は labels_test.ts（805〜897 行）で担保済みを確認
- fmt / lint / test（1492 passed = -3 は削除テスト）/ build green（mainagent 独立検証）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
デッドコード excludeSuppressedFeatures を専用 helper・テストごと削除（-77 行）。アプリ経路の参照ゼロを全走査で確認し、抑制の実装が labels.ts にある旨を doc コメントで明示。現役 API は無傷、1492 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
