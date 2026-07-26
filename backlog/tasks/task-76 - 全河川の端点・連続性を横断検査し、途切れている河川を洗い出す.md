---
id: TASK-76
title: 全河川の端点・連続性を横断検査し、途切れている河川を洗い出す
status: To Do
assignee: []
created_date: '2026-07-26 08:42'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies:
  - TASK-75
type: spike
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-75（エルベ川の下流欠落）と同種の問題が他の河川にも無いかを網羅的に調べる。data/rivers.geojson の全 feature について端点・パート間の連続性・地図表示範囲との関係を機械的に検査し、途切れている河川を一覧化する。

事前調査で既に見えている候補（要検証・鵜呑みにしない。data/rivers.geojson は 48 features / 30 ユニーク名）:

EUROPE_BBOX（-25,34,60,72）による意図的クリップ（仕様上の想定内かの確認が必要）
| 河川 | ソース bbox | 出力 bbox | 切断辺 |
|---|---|---|---|
| Amu Darya | 58.32,36.95..68.21,44.43 | 58.32,42.27..60.00,44.43 | 東 60E |
| Euphrates | 37.85,30.90..47.47,40.18 | 37.85,34.00..42.51,40.18 | 南 34N（加えて東端 42.51 が自然終端でない可能性） |
| Tigris | 39.64,31.00..47.44,38.42 | 39.64,34.00..44.36,38.42 | 南 34N |

河口に届かず内陸で終端しているもの（ソース由来の欠落と推定）
- Elbe: 終端 9.784E（河口 約 8.6E）— TASK-75 で対応
- Oder: 終端 14.584E / 53.639N（シュチェチン潟）。バルト海口（シフィノウイシチェ 約 14.25E / 53.9N）に未到達
- Loire: 終端 -1.743E / 47.216N（ナント付近）。サン＝ナゼール河口 約 -2.2E に未到達。加えて原データにジオメトリが空（coordinates: []）の Loire / scalerank 5 feature が 1 件存在し、clipRiversToBbox → cleanLineGeometry で落ちている。Loire の一部区間が原データ側で欠損している可能性を示唆する
- 一方 Vistula（18.976,54.349 グダニスク）、Seine（0.439,49.473）、Tejo（-8.79）、Ebro（0.89）は概ね河口まで到達している

本タスクは調査（spike）であり、個々の河川の修正は含めない。検出された問題は、修正方針つきの個別タスクとして起票する。TASK-75 で確立した原因切り分け手順・検証テストの型を再利用すること（そのため TASK-75 に依存する）。

参考: scripts/build-rivers.ts、scripts/build-rivers_test.ts:267-299（SOURCE_RIVER_NAMES スナップショット）、scripts/build-data.ts:33（EUROPE_BBOX）、src/config.ts:32-35（MAP_MAX_BOUNDS）、src/known_limitations.ts。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 data/rivers.geojson の全 feature について、パート数・端点座標・パート間ギャップ距離・出力 bbox とソース bbox の差分を機械的に算出する検査手段が用意され、結果が再現可能な形で残っている
- [ ] #2 「途切れている」と判定された河川が一覧化され、各件について原因が (a) EUROPE_BBOX による意図的クリップ (b) Natural Earth ソース由来の欠落 (c) 生成パイプラインの不具合 のいずれかに分類されている
- [ ] #3 判定基準（何をもって途切れとみなすか。例: パート間ギャップの閾値、河口到達の判定方法）が明文化され、恣意的でないことが説明されている
- [ ] #4 調査結果が調査ドキュメントとして残され、(c) に分類された件および対応すべき (b) の件が個別の backlog タスクとして起票されている（起票不要と判断した件はその理由が記録されている）
- [ ] #5 将来のソース更新で新たな途切れが混入した場合に検知できる回帰テストを追加するか、追加しない場合はその判断理由が記録されている
<!-- AC:END -->
