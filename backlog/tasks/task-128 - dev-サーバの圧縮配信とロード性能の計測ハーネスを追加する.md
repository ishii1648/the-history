---
id: TASK-128
title: dev サーバの圧縮配信とロード性能の計測ハーネスを追加する
status: To Do
assignee: []
created_date: '2026-07-28 16:42'
labels:
  - 'area:scripts'
dependencies: []
type: enhancement
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
scripts/serve.ts は @std/http の serveDir をそのまま使っており無圧縮で配信する。一方 data/ は非圧縮で 9.4MB あり、本番の Cloudflare は brotli を自動適用するため、ローカルの体感と本番の実効転送量が大きく乖離する。さらに、後続のパフォーマンス改善（年代キャッシュの上限化・座標精度削減・モバイルでの DEM 抑制）の効果を数値で比較する基盤が現状存在しない。dev サーバに圧縮を入れて本番に近い条件を作り、CDP 経由で初期ロードと年代切替の所要時間・転送量・JS heap を測る検証スクリプトを追加する。このタスクは後続の性能改善タスクの前提となる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 dev サーバがテキスト系アセット（.html/.css/.js/.json/.geojson）を Accept-Encoding に応じて gzip または brotli で配信する
- [ ] #2 pmtiles など既に圧縮済みのバイナリは二重圧縮しない
- [ ] #3 CDP ハーネス経由で初期ロード完了までの所要時間・圧縮後の総転送量・非圧縮換算サイズを取得できる
- [ ] #4 年代切替 1 回あたりの追加転送量と所要時間を測定できる
- [ ] #5 全年代を順に切り替えた後の JS heap 使用量を取得できる
- [ ] #6 計測結果を gitignore されたパスへ JSON で出力し before/after の比較に使える
- [ ] #7 圧縮対象の判定ロジックが純粋関数として切り出され、テストが先に書かれている
<!-- AC:END -->
