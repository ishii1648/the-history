---
id: TASK-6
title: タイムラインスライダー
status: To Do
assignee: []
created_date: '2026-07-20 04:23'
labels: []
dependencies:
  - TASK-5
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
画面下部の離散スライダーで 20 の実在年代を切り替えられるようにする。参照: docs/app-spec.md §5.1
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 目盛りはデータが実在する 20 年代のみで、間の年は選択できない
- [ ] #2 ドラッグ / 目盛りクリック / 前後ボタン / キーボード ← → の全操作で年代を切り替えられる
- [ ] #3 現在年が大きく表示される
- [ ] #4 年代切替時に GeoJSON を fetch（取得済みはメモリキャッシュ）してレイヤーを差し替える
- [ ] #5 切替時に deck.gl の transitions でポリゴンがフェードする
<!-- AC:END -->
