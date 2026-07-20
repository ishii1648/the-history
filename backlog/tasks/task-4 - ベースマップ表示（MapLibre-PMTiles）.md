---
id: TASK-4
title: ベースマップ表示（MapLibre + PMTiles）
status: To Do
assignee: []
created_date: '2026-07-20 04:23'
labels: []
dependencies:
  - TASK-1
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Protomaps 配布の PMTiles をベースマップとして表示する。歴史地図の下地として地形・海岸線・河川のみを描画し、現代の国境・都市名・道路は非表示にする。参照: docs/app-spec.md §2.2, §3.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MapLibre 初期化時に PMTiles プロトコルが登録され、ベースマップが表示される
- [ ] #2 スタイル定義で地形・海岸線・河川のみが表示され、現代の国境・地名・道路レイヤーは非表示である
- [ ] #3 タイル取得失敗時に OpenFreeMap へフォールバックする
- [ ] #4 ヨーロッパ域を抽出した europe.pmtiles の生成手順（pmtiles extract）が整備されている
<!-- AC:END -->
