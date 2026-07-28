---
id: TASK-133
title: モバイル端末で DEM hillshade を抑制して GPU メモリ消費を下げる
status: To Do
assignee: []
created_date: '2026-07-28 16:44'
labels:
  - 'area:src-basemap'
dependencies:
  - TASK-131
type: enhancement
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/basemap.ts は terrarium エンコーディングの DEM PMTiles を hillshade レイヤーの入力に使っており、ベースマップタイルに加えて DEM タイルのテクスチャを GPU に載せる。デスクトップでは起伏表現の価値が高いが、小画面のモバイルでは判読への寄与が小さい割に GPU メモリと帯域を消費し、deck.gl のポリゴン・ライン・ラベルと合わせて描画が破綻する要因になりうる。端末条件に応じて hillshade を無効化またはズーム範囲を絞る。無効化の判定基準は実測を踏まえて決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 端末条件（画面サイズ等）に応じて DEM hillshade レイヤーを含めるかどうかを切り替えられる
- [ ] #2 判定基準と根拠がコメントで説明され、判定ロジックが純粋関数として切り出される
- [ ] #3 hillshade を外した場合でもベースマップ・勢力ポリゴン・ラベルの表示が破綻しない
- [ ] #4 デスクトップでの表示は従来どおり hillshade を含む
- [ ] #5 hillshade 無効時に DEM PMTiles のリクエストが発生しないことを確認する
- [ ] #6 判定ロジックのテストが先に書かれている
<!-- AC:END -->
