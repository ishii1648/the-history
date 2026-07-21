---
id: TASK-22
title: ヨーロッパ圏外までズームアウト・パンできないようにする
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 13:16'
updated_date: '2026-07-21 13:22'
labels: []
dependencies: []
ordinal: 22000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（agent-loop 実行中の報告）: 現状 MIN_ZOOM=3 ではヨーロッパ圏外（大西洋・アフリカ・中央アジア等）まで大きくズームアウトでき、データが存在しない領域が広く見えてしまう。地図の表示範囲をヨーロッパ域に制限したい。

実装の手がかり: src/config.ts の MIN_ZOOM と、MapLibre の maxBounds オプション（EUROPE_BBOX = [-25, 34, 60, 72] を流用可能）。ズーム下限の引き上げと表示可能範囲（maxBounds）の設定を組み合わせる想定。URL 状態復元（url_state.ts）の zoom/center バリデーションとの整合も確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ヨーロッパ域（EUROPE_BBOX 相当）の外へ地図の中心をパンできない
- [ ] #2 ヨーロッパ全域が一望できるズームより外側へズームアウトできない（ヨーロッパが画面の一部にしか表示されないほど引けない）
- [ ] #3 URL クエリで範囲外の center/zoom を与えた場合も表示が制限範囲内に収まる
- [ ] #4 変更したロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: MapLibre の maxBounds にヨーロッパ域（データの EUROPE_BBOX と同値 [-25,34]〜[60,72]）を設定し、圏外へのパンと圏外が見えるズームアウトを地図エンジン側で一括制限する。src/config.ts に MAP_MAX_BOUNDS を定数として追加（データ側 scripts/build-data.ts の EUROPE_BBOX と同値である旨を doc コメントで明記）。MIN_ZOOM は 4 に引き上げ（z3 はヨーロッパの外周が大きく見えるため。maxBounds 併用時は実効最小ズームは viewport に応じ自動でさらに制限される）。
2. URL 状態: url_state.ts の decodeState に center の bbox クランプを追加し、範囲外の center/zoom を与えても復元時に制限範囲へ収まることを純粋ロジックで保証する（AC#3）。maxBounds による実行時クランプと二重の防御。
3. 並列化判定: 見送り（理由: 変更は config.ts / main.ts / url_state.ts の小規模修正で相互依存し、独立にテスト可能なサブ作業に分割できない。単一 subagent に委譲）。
4. TDD: url_state_test / config 参照テストを先行（red）→ 実装 → green → fmt/lint/test/build 全 green → 目視確認（パン制限・ズームアウト制限・範囲外 URL 復元）→ PR → CI → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->
