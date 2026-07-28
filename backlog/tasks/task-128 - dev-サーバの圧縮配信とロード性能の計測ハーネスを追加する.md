---
id: TASK-128
title: dev サーバの圧縮配信とロード性能の計測ハーネスを追加する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 16:42'
updated_date: '2026-07-28 17:31'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 現状把握: dev サーバの実装（deno task dev の実体）と CDP ハーネス（scripts/verify/cdp.ts）を読む
2. TDD red: 圧縮対象判定（拡張子/Content-Type → gzip/brotli/無圧縮）の純粋関数テストを先に書く（AC#7）
3. dev サーバ: Accept-Encoding に応じたテキスト系（html/css/js/json/geojson）の圧縮配信。pmtiles 等は二重圧縮しない（AC#1/#2）
4. 計測ハーネス: CDP で初期ロード所要時間・転送量（圧縮後/非圧縮換算）・年代切替 1 回の追加転送量と時間・全年代切替後の JS heap を取得し、gitignore 済みパスへ JSON 出力（AC#3〜#6）
5. deno fmt --check / lint / test / build green + 実測 1 回を回して JSON 出力を確認

並列化判定: 見送り（理由: 計測ハーネスは圧縮配信の効果検証と一体で、転送量の取得経路が dev サーバの応答ヘッダに依存する。担当ファイルも scripts/ 配下で近接し分割の利得が薄い）
<!-- SECTION:PLAN:END -->
