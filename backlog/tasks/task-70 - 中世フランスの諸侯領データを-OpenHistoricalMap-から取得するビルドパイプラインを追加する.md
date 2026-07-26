---
id: TASK-70
title: 中世フランスの諸侯領データを OpenHistoricalMap から取得するビルドパイプラインを追加する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-26 07:14'
updated_date: '2026-07-26 07:20'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:docs'
dependencies: []
ordinal: 67000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（2026-07-26）: 中世フランスの諸侯（ノルマンディー公領・アキテーヌ公領・ブルゴーニュ公領・シャンパーニュ伯領など）の勢力図を地図で見たい。

現状: data/europe_<year>.geojson（historical-basemaps, GPL-3.0）は中世フランスをほぼ一枚岩で持つ。実測では 1000/1100 年が `Kingdom of France` + `Britany` のみ、1200 年に `Comté de Toulouse` が加わり、1279/1300 年は `France` + `Britany` のみ。諸侯領は France に飲み込まれている。HRE 領邦データ（ETH Roller, TASK-19/37/68）はフランスを一切カバーせず、対象も 1500 年以降のみ。

調査済み（2026-07-26、Overpass API 実測）: OpenHistoricalMap が唯一の実用的なオープンソース。エンドポイント https://overpass-api.openhistoricalmap.org/api/interpreter に対し bbox (40.0,-6.5,52.5,10.5) で boundary=administrative のリレーションを取得すると 4,893 件が返る。各リレーションは start_date / end_date タグを持ち（形式は `0918` や `1493-05-23`）、年でのフィルタが決定的に行える。`out geom` でメンバー way のジオメトリも取得可能なことを検証済み（下記 12 件で欠損 way は County of Bar と Duchy of Burgundy の各 2 本のみ）。

1200 年時点で有効な admin_level 3〜4 のフランス諸侯領（実測・カッコ内は outer way の総頂点数）: Duchy of Brittany 939-1547 (2443) / Duchy of Aquitaine 1137-1214 (1641) / Duchy of Gascony 1137-1214 (9515) / Duchy of Normandy 1195-1204 (1527) / Duchy of Burgundy 918-1361 (488) / County of Champagne 1102-1314 (168) / County of Poitou 934-1422 (927) / County of Anjou 861-1360 (91) / County of Maine 832-1537 (88) / County of Alençon 1055-1414 (38) / County of Bar 1033-1354 (2689) / County of Ponthieu 926-1696 (147)。1279/1300 年には County of Flanders 1237-1384 と County of Artois 1237- が加わる。1000/1100 年も Brittany / Burgundy / Normandy（admin_level 3）と Anjou / Maine / Poitou / Vendôme / Nantes / Angoulême / La Marche / Tours 等（admin_level 4）が有効。

欠落も実測で確定している（Overpass の全期間名前検索で 0 件）: Comté de Toulouse（南仏最大の諸侯）、Foix / Armagnac / Auvergne / Bourbon / Nevers、王領（domaine royal）。Provence は 1487 年（フランス併合後）以降のポリゴンのみ。Flanders は 1237 年以降のみで 1200 年時点が空白。Aquitaine / Gascony は 1214 年で切れ以降の継続ポリゴンが無い。データ品質も一様ではなく、出典が Droysen の 1886 年歴史地図帳のものや fixme タグ付きのリレーションが多数含まれる。

ライセンス: OHM は CC0（Overpass レスポンスの copyright フィールドで確認済み）。CC BY-NC-SA の HRE 領邦データと異なり GPL-3.0 派生の europe_<year>.geojson とファイル分離する法的必要はない（decision-2 の制約対象外）。ただし出典表示は docs/data-inventory と UI 双方で行う。

代替案の検討結果: Euratlas Georeferenced Historical Vector Data は諸侯レベルまで網羅した最高品質だが有償かつ再配布制限があり OSS リポジトリにコミットできない（TASK-37 の結論と同じ）。Wikimedia Commons の地図を自前でジオリファレンス・デジタイズする案は品質を制御できるが工数が過大。よって「OHM から取れるものだけを入れ、欠落を明示する」方針をユーザーが選択した。

本タスクの範囲はデータ取得パイプラインとインベントリ更新まで。地図への描画と既知の制限表示は後続タスクで行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 scripts/ に OHM から中世フランス諸侯領を取得するビルドスクリプトが追加され、既存の build-hre.ts と同様に data/ 配下へ年代別 GeoJSON を決定的に生成できる（手作業でのデータ改変がない）
- [ ] #2 生成される GeoJSON の対象年は既存スナップショット年のうち OHM に有効データが存在する中世年代であり、各 feature が領邦名・admin_level・OHM リレーション ID・有効期間（start_date/end_date）を属性として持つ
- [ ] #3 年代フィルタが start_date/end_date の解釈（年のみ表記・年月日表記・end_date 欠損＝無期限）を含めて純粋関数として実装され、境界年（start_date と同じ年・end_date と同じ年）を含む単体テストがある
- [ ] #4 ジオメトリを取得できないメンバー way があるリレーションでも生成が失敗せず、欠損が検出可能な形で記録される
- [ ] #5 docs/data-inventory の README にデータソースとして OpenHistoricalMap（CC0）が追記され、年代別ファイルに取得できた諸侯領の一覧と、Toulouse・王領・Provence などの欠落が明記されている
- [ ] #6 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. start_date/end_date の年代フィルタ（年のみ・年月日・end_date 欠損=無期限、境界年含む）を純粋関数としてテスト先行（red→green）で実装する
2. scripts/build-france-fiefs.ts を追加: Overpass API (openhistoricalmap) へ bbox (40.0,-6.5,52.5,10.5) boundary=administrative クエリ → 年代フィルタ → data/france_fiefs_<year>.geojson を決定的に生成。feature 属性に領邦名・admin_level・OHM リレーション ID・start_date/end_date を持たせる
3. ジオメトリ欠損 way があっても生成を失敗させず、欠損を検出可能な形（ログ/メタデータ）で記録する
4. 対象年は既存スナップショット年のうち OHM に有効データがある中世年代（1000/1100/1200/1279/1300 を想定、実データで確定）
5. docs/data-inventory README に OpenHistoricalMap（CC0）を追記し、年代別の取得諸侯一覧と Toulouse・王領・Provence 等の欠落を明記する
6. deno fmt --check / lint / test / build green
並列化判定: 見送り（理由: docs のインベントリ更新は生成データの実結果に依存し、フィルタ関数とビルドスクリプトは同一モジュール群で密結合のため、ファイル競合なく独立検証可能なサブ作業に分割できない）
<!-- SECTION:PLAN:END -->
