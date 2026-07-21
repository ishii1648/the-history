---
id: TASK-34
title: ベースマップに地形（起伏・陰影）表現を追加する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 15:10'
updated_date: '2026-07-21 16:29'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: MapLibre の raster-dem ソース + hillshade レイヤーで陰影起伏を追加する。DEM は AWS Terrain Tiles（terrarium エンコーディング、オープンデータ・attribution 必要）をヨーロッパ bbox・z0〜8 に限定してローカル PMTiles 化し（data/europe-dem.pmtiles、コミットしない・dist へ任意コピー）、既存 europe.pmtiles と同じ同一オリジン配信に載せる。
2. データ抽出（サブ作業 A）: scripts/extract-dem.ts 新規。EUROPE_BBOX × z0..8 のタイル列挙（Web メルカトルのタイル座標計算は純粋関数 + テスト）→ terrarium PNG を取得 → PMTiles v3 アーカイブを書き出す。PMTiles v3 ライタは最小実装（ヘッダ・Hilbert tileId・ルート/リーフディレクトリの varint 符号化・gzip）を TS で実装しテストする。書き出し後に pmtiles CLI（verify/show）で妥当性を確認。TS 実装が過大と判明した場合の代替（Python pmtiles ライタ利用）はコミットメッセージと task notes に判断を記録して可。
3. 表示（サブ作業 B）: src/basemap.ts に raster-dem ソース（pmtiles://…/europe-dem.pmtiles, encoding terrarium）と hillshade レイヤーを追加。描画順は landcover の上・water の下（勢力塗り・ラベル・河川の視認性を損なわない不透明度に調整、AC#2）。attribution に Terrain Tiles（Mapzen/AWS Open Data, 出典表記義務）を追加し、フッターにも追記。DEM pmtiles が無い/取得失敗時は hillshade なしで従来表示を維持（AC#4 のフォールバック整合。ソース欠如がスタイル全体を壊さないことを確認し、必要なら任意付与に設計）。config.ts に DEM URL 定数。
4. A/B 間の契約: 配信 URL "/europe-dem.pmtiles"（dist 直下・任意コピー）、encoding terrarium、maxzoom 8。担当ファイルは互いに素（A: scripts/extract-dem*.ts, scripts/build.ts の任意コピー対象 +テスト, deno.json / B: src/basemap.ts +テスト, src/config.ts, index.html）。
5. 並列化判定（タスク内）: 並列可（A/B は契約で分離・独立にテスト可能）。worktree isolation で 2 subagent 並列起動。
6. TDD（両者 red→green）→ mainagent 統合レビュー → fmt/lint/test/build green → DEM 生成実行 → 目視確認（アルプスの陰影・各レイヤー視認性・初期ロード体感、AC#1〜3）→ PR → CI → finalization → マージ
<!-- SECTION:PLAN:END -->
