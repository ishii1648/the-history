---
id: TASK-5
title: 勢力圏ポリゴンレイヤー表示
status: To Do
assignee: []
created_date: '2026-07-20 04:23'
labels: []
dependencies:
  - TASK-2
  - TASK-3
  - TASK-4
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
年代スナップショットの勢力圏 GeoJSON を deck.gl でベースマップ上に塗り分け表示する。MVP スコープの中核。参照: docs/app-spec.md §3.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MapboxOverlay（interleaved）上の GeoJsonLayer 1 枚で勢力圏ポリゴンが描画される
- [ ] #2 塗り色は data/colors.json の割当を参照し、opacity 0.5 程度・白系の境界線で表示される
- [ ] #3 pickable が有効で、ホバー/クリックイベントが取得できる
- [ ] #4 GeoJsonLayer の data 差し替えのみで表示年代を切り替えられる（ベースマップは再生成されない）
<!-- AC:END -->
