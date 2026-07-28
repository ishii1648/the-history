---
id: TASK-126
title: excludeSuppressedFeatures がデッドコードになっている（TASK-122 の抑制方式変更の残骸）
status: To Do
assignee: []
created_date: '2026-07-28 16:37'
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
- [ ] #1 excludeSuppressedFeatures を削除するか残すかが根拠付きで判断されている
- [ ] #2 残す場合: アプリから呼ばれていないことと抑制の実装が labels.ts にあることが doc コメントに明記されている
- [ ] #3 suppressedPowerNames など現役の関数が失われていない
- [ ] #4 deno test が green
<!-- AC:END -->
