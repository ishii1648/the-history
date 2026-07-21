---
id: TASK-34
title: ベースマップに地形（起伏・陰影）表現を追加する
status: To Do
assignee: []
created_date: '2026-07-21 15:10'
updated_date: '2026-07-21 15:48'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:src-basemap'
dependencies:
  - TASK-4
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（教育用歴史地図を参考にしたデザイン検討より）: 現在のベースマップ（Protomaps ベクタ、TASK-4）は地形の起伏が表現されておらず、アルプス山脈のような歴史理解に重要な地理的障壁が視認できない。参考画像では山脈の陰影表現が「なぜ帝国の支配がイタリアに及びにくかったか」の理解を直感的に助けている。ベースマップに hillshade（陰影起伏）を追加し、山脈・平野の地形が読み取れるようにする。実装の手がかり: MapLibre は raster-dem ソース + hillshade レイヤーをネイティブサポートしており、DEM タイル（例: AWS Terrain Tiles / Terrarium 等のオープンデータ）を PMTiles 化してヨーロッパ域のみ同梱する方式が現行構成（同一オリジン配信、scripts/extract-pmtiles.ts）と整合する。注意点: (1) DEM データのサイズ増とロード時間への影響を評価し、必要 zoom 範囲（z4〜z8）に限定して抽出する (2) 勢力ポリゴンの半透明塗り・ラベル・河川の視認性を hillshade が損なわないよう描画順・不透明度を調整する (3) DEM データソースの出典・ライセンスを attribution に追加する (4) PMTiles 取得失敗時のフォールバック挙動（既存 FALLBACK_STYLE_URL 系統）を維持する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 アルプス山脈等の主要山地の起伏が地図上で視認でき、平野部と区別できる
- [ ] #2 勢力ポリゴン・ラベル・河川・HRE オーバーレイの視認性が hillshade 追加後も維持されている
- [ ] #3 DEM データはヨーロッパ域・必要 zoom 範囲に限定して抽出され、初期ロード時間の悪化が体感上許容範囲に収まっている
- [ ] #4 DEM データソースの出典・ライセンスが attribution に反映されている
- [ ] #5 PMTiles 取得失敗時のフォールバックが引き続き動作する
- [ ] #6 追加したデータ処理・スタイル構築ロジックにテストがあり deno test が green
<!-- AC:END -->
