---
id: TASK-17
title: 初期ロードで地図表示まで 20〜30 秒かかる（ローカル dev 環境）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 10:12'
updated_date: '2026-07-21 10:17'
labels:
  - bug
dependencies: []
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 再現手順
1. deno task build && deno task serve で dist を配信
2. ブラウザで http://localhost:8000 を開く

## 期待挙動
数秒以内にベースマップと勢力圏ポリゴンが表示される

## 実際の挙動
- ページロード後、約 15〜30 秒間グレー（MapLibre の背景のみ）の状態が続く
- その後ベースマップが描画され、さらに数秒後に勢力圏ポリゴンが表示される
- 2 回目以降のリロードでも同様（ブラウザキャッシュ有効でも再現）

## 発見契機
TASK-4 のマージ後動作確認で初回観測（10〜18 秒、backlog notes に記録）。TASK-5 の実装検証でも一貫して再現（20〜30 秒）。deck.gl 追加前から発生しているためベースマップ（PMTiles）読み込み経路が主因の可能性が高い。

## 調査の手がかり
- /europe.pmtiles への Range リクエスト（206）は成功している（deno file-server の Range 応答性能・直列処理が疑わしい）
- dist/app.js は 3.7MB（deck.gl 込み）。モジュール評価時間の寄与も切り分けること
- 本番想定（Cloudflare R2 + CDN）では発生しない可能性もある。その場合は dev 環境限定の緩和策（file-server 代替等）と TASK-9 のローディング UI で対応し、その判断根拠を記録して閉じてよい
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 初期表示までの所要時間の内訳（app.js 評価 / pmtiles fetch / タイルデコード / geojson+colors 取得）が計測され原因が特定されている
- [ ] #2 主因に対する修正または緩和策が実装され、ローカル dev での初期表示が体感で改善している（改善不能な場合は根拠を記録して wontfix 判断でも可）
- [ ] #3 修正した場合、目視確認で初期表示時間の改善を確認している
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-17-slow-initial-load を origin/main から作成
2. 並列化判定: 見送り（理由: 計測 → 原因特定 → 修正が逐次依存する調査型タスクで、独立サブ作業に分割できない。subagent 1 体に委譲し、ブラウザ計測は mainagent が担当）
3. mainagent 採取済みの初期データ: performance API で loadEvent=137ms、全リソース取得は高速（app.js 92ms・pmtiles Range 5-6ms/件）だが、最初の pmtiles fetch が t=30268ms、colors.json が t=36394ms。→ 0.1〜30 秒の間 JS メインスレッドが何かに費やされている（ネットワーク起因ではない）
4. subagent が main.ts / basemap 初期化経路に計測点（console.time / performance.mark）を追加し、モジュール評価・maplibre Map 生成・style ロード・worker 初期化・deck overlay 統合の各区間を計測
5. 原因を特定し修正（例: maplibre worker の初期化問題、バンドル構造起因の遅延、protocol 登録タイミング等）。TDD 可能なロジックはテスト付きで
6. mainagent がブラウザで改善を実測（AC #3）→ PR → CI → マージ → finalization
<!-- SECTION:PLAN:END -->
