---
id: TASK-68
title: 1700年の HRE 内主要領邦をオーバーレイ表示する（Roller データの 1650 境界外挿）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-25 05:58'
updated_date: '2026-07-25 07:07'
labels:
  - 'area:src-main'
  - 'area:data'
dependencies: []
ordinal: 65000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー報告: タイムラインを 1650 から 1700 に動かすとプロイセン（ブランデンブルク）・ザクセン・バイエルンなどドイツ諸侯が地図から消える。調査結果（2026-07-25、.outputs/claude/hre-1700-overlay-gap.md）: 1700 は「HRE 領邦オーバーレイ（ETH Roller、src/config.ts の HRE_OVERLAY_YEARS=[1500,1530,1600,1650]）の終了後」かつ「ベースマップ historical-basemaps がドイツ諸邦を個別収録し始める 1715 より前」の唯一の空白年で、HRE が単一ポリゴンになる。Prussia 自体は 1700 ベースマップに存在するが東プロイセン飛び地のみで消えたように見える。実現可能性は検証済み: scripts/build-hre.ts の buildYearCollection(raw, 1700) を実データで実行すると 1650 と同一の 14 領邦が返る（Roller の行は end 欠損=無期限扱いが多く、Bayern/Sachsen は HRE_RANGE_OVERRIDES で 1806 まで延長済み）。境界形状は 1650 年時点の近似となる（1653 ヒンターポンメルン・1680 マクデブルク獲得などは未反映）ため、known-limitations への注記を併せて行う。この外挿は既存 HRE_RANGE_OVERRIDES と同じ「領域継続性がある場合の近似延長」ポリシーの範囲内。代替オープンデータが存在しない点は TASK-37 の調査結論（Euratlas 商用・HistoGIS はクライス粒度・OpenHistoricalMap 未成熟）と同じ。1715 以降への拡張はベースマップ側 Brandenburg/Prussia とオーバーレイの二重表示になるため本タスクでは行わない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1700 年スナップショットで HRE 内主要領邦（1650 と同じ 14 領邦）がオーバーレイ表示され、1500〜1650 年と同様の色分け・ラベル・称号付き日本語表記・域内範囲強調が一貫している
- [ ] #2 data/hre_1700.geojson は既存の build-hre パイプライン（HRE_OVERLAY_YEARS への 1700 追加）で再現可能に生成され、手作業でのデータ改変がない
- [ ] #3 1700 年の領邦境界が 1650 年時点の近似である旨が known-limitations（UI の既知の制限表示）に年代連動で明記される
- [ ] #4 1715 以降の年にはオーバーレイが表示されないこと（ベースマップの Brandenburg/Prussia との二重表示回避）がテストで保証され、deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/config.ts の HRE_OVERLAY_YEARS に 1700 を追加し、scripts/build-hre.ts パイプラインで data/hre_1700.geojson を再生成（手作業改変なし。事前調査で 1650 と同一 14 領邦が返ることは検証済み）。
2. known-limitations に『1700 年の領邦境界は 1650 年時点の近似（1653 ヒンターポンメルン・1680 マクデブルク獲得など未反映）』を年代連動（1700 のみ active）で追加。
3. TDD: (a) 1700 が overlay 対象・1715 以降が対象外であることを config/データ生成のテストで固定（AC #4 red→green） (b) hre_1700.geojson の 14 領邦・スキーマをテストで固定。
4. 実機確認: CDP で 1650→1700 切替時に領邦オーバーレイが維持されること・1715 で消えること・称号付き日本語表記/域内強調の一貫（AC #1）をスクリーンショット確認。
5. 並列化判定: 見送り（理由: config 1 行 + データ再生成 + 制限注記 + テストが単一パイプラインの逐次変更で分割の意味がない）。単一 subagent（worktree isolation）委譲。
6. deno fmt/lint/test/build green → PR（TASK-68 明記）→ CI → finalization → マージ → マージ後確認。
<!-- SECTION:PLAN:END -->
