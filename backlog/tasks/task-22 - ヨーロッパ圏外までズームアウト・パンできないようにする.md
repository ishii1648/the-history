---
id: TASK-22
title: ヨーロッパ圏外までズームアウト・パンできないようにする
status: To Do
assignee: []
created_date: '2026-07-21 13:16'
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
