---
id: TASK-21
title: 主要河川がどのズームでも描画されない（仕様違反）を修正する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 12:09'
updated_date: '2026-07-21 12:16'
labels:
  - bug
dependencies: []
references:
  - 'https://www.naturalearthdata.com/downloads/50m-physical-vectors/'
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザ動作確認での指摘: 重要河川（ライン川・ドナウ川等）が地図上で分からない。docs/app-spec.md §2.2 は「地形・海岸線・河川」の表示を仕様としており、河川が描画されないのは仕様違反。

原因調査結果: src/basemap.ts は water_river / water_stream レイヤーを採用しているが、@protomaps/basemaps 5.7.2 のレイヤー定義は water_river が minzoom 9、water_stream が minzoom 14。一方アプリの MAX_ZOOM は 8（src/config.ts）で、PMTiles 抽出（scripts/extract-pmtiles.ts）も --maxzoom=8 で切り出している。つまり河川ラインは原理的に一度も描画されない。また Protomaps タイルの低ズームには河川ライン形状がそもそも含まれない可能性が高く、minzoom を下げるだけでは解決しない見込み。Natural Earth の rivers_lake_centerlines（10m/50m, パブリックドメイン）等の別ソースをオーバーレイする、または抽出 maxzoom とアプリズーム上限の見直しを含めて検討すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 初期ズーム（z4）〜z8 の範囲で、ライン川・ドナウ川・エルベ川など欧州の主要河川が視認できる
- [ ] #2 河川データを追加した場合、出典・ライセンスがフッターまたは data/index.json に反映されている
- [ ] #3 追加・変更したロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 原因確認（済）: @protomaps/basemaps の water_river は minzoom 9 / water_stream は minzoom 14、アプリ MAX_ZOOM=8・PMTiles 抽出 --maxzoom=8 のため河川ラインは描画されない。低ズームの Protomaps タイルには河川ライン形状自体が含まれないため、minzoom 変更ではなく Natural Earth 50m rivers_lake_centerlines（パブリックドメイン）のオーバーレイで対応する。
2. 並列化判定: 並列可（独立サブ作業 2 件、worktree isolation で subagent を並列起動）
   - subagent A（データ）: scripts/build-rivers.ts 新規（nvkelso/natural-earth-vector の pinned commit から ne_50m_rivers_lake_centerlines.geojson を取得 → EUROPE_BBOX クリップ → 主要河川フィルタ → simplify/truncate でサイズ制限 → data/rivers.geojson 生成・コミット）、scripts/build.ts の copy 対象へ data/rivers.geojson 追加。担当ファイル: scripts/build-rivers.ts / scripts/build-rivers_test.ts / scripts/build.ts / scripts/build_test.ts / data/rivers.geojson / deno.json
   - subagent B（表示）: src/basemap.ts の buildBasemapStyle に geojson ソース "rivers"（data: "/data/rivers.geojson", attribution: Natural Earth）と line レイヤーを追加（z4〜z8 で視認できる色・幅）、index.html フッターへ出典追記。担当ファイル: src/basemap.ts / src/basemap_test.ts / index.html
   - A/B 間の契約: 配信 URL "/data/rivers.geojson"・source id "rivers"。担当ファイルは互いに素で衝突しない。成果物は mainagent が task ブランチへ統合し conflict は PR で解消する
3. TDD: 各 subagent がテスト先行（red 確認 → green）で実装する
4. mainagent が統合レビュー → deno fmt --check / lint / test / build 全 green → PR 作成（TASK-21 明記）→ CI 監視 → finalization → マージ → マージ後動作確認（z4〜z8 で主要河川の視認確認）
<!-- SECTION:PLAN:END -->
