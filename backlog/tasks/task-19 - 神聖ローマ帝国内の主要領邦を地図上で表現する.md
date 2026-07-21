---
id: TASK-19
title: 神聖ローマ帝国内の主要領邦を地図上で表現する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 12:09'
updated_date: '2026-07-21 13:03'
labels: []
dependencies: []
references:
  - 'https://github.com/aourednik/historical-basemaps'
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザ動作確認での指摘: 神聖ローマ帝国が全年代（1000〜1715）で単一ポリゴン表示になっており、内部の領邦が一切分からない。

原因調査結果: 取得元データ aourednik/historical-basemaps（ピン留めコミット 62d8f1a・最新 master とも）が HRE を単一 feature（NAME=Holy Roman Empire）で表現しており、内部領邦のポリゴンが上流に存在しない。データパイプライン（scripts/build-data.ts）の問題ではなくデータソースの限界。

対応の方向性: HRE 内部の主要諸侯（選帝侯クラス: オーストリア（ハプスブルク）、ブランデンブルク、ザクセン、バイエルン、ボヘミア、プファルツ等）を表現できるオープンデータの調査・選定、または最小限の手作業キュレーション GeoJSON をオーバーレイとして統合する。ライセンス（現状 GPL-3.0 派生）との整合も確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HRE が存在するスナップショット年代のうち少なくとも代表的な年代（例: 1500）で、主要諸侯（オーストリア・ブランデンブルク・ザクセン・バイエルン・ボヘミアを含む）が個別の色・ポリゴンで識別できる
- [x] #2 HRE 全体の外縁境界も引き続き視認できる（領邦表示によって帝国の範囲が分からなくならない）
- [x] #3 追加データの出典・ライセンスが data/index.json またはフッター表記に反映されている
- [x] #4 追加・変更したデータ処理ロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. データソース調査（済・subagent による Web 調査）: HRE 領邦粒度 × 1500 年前後を満たすオープンデータは ETH Zürich の Roller データセット（Spatio-temporal data on territories of the HRE, DOI 10.3929/ethz-b-000472583, CC BY-NC-SA 4.0, Shapefile/WGS84, 558 features）が唯一。必須 5 領邦（オーストリア・ブランデンブルク・ザクセン・バイエルン・ボヘミア）+ 選帝侯を含むことを実データ取得で確認済み。次点 OpenHistoricalMap（CC0）は 1500 年時点の必須領邦 4/5 が未収録で不採用。HistoGIS は帝国クライス粒度のみで不採用。
2. ライセンス方針: CC BY-NC-SA の NC 条項があるため、GPL-3.0 派生の europe_<year>.geojson には統合せず、別ファイル data/hre_<year>.geojson のオーバーレイとして分離する（コレクション扱い・削除/差し替え可能な可逆構成）。出典・ライセンスはフッターに明記（AC#3）。
3. 対象年代: データの実カバー範囲（Schindling & Walter 1500-1650 準拠）に合わせ、スナップショット 1500・1530・1600・1650 に限定する。AC#1 の最低ライン（代表年代 1500）を満たす。
4. 色設計: 既存の属領色は「宗主国色の明度シフト」のため領邦が全て同色になる。buildColorMap を拡張し、宗主国 Holy Roman Empire の属領は NAME ベースの独立プロービング色を割り当てる（キーは既存規則どおり "NAME|Holy Roman Empire" で、クライアント側 colorKeyFor は無変更）。HRE 外縁は既存の単一 feature を残し、領邦レイヤーを上に重ねることで維持（AC#2）。
5. 並列化判定: 並列可（独立サブ作業 2 件、worktree isolation で subagent を並列起動）
   - subagent A（データ）: scripts/build-hre.ts 新規（ETH DSpace bitstream から shp/dbf 取得・年代有効期間フィルタ・宗派期間の重複行 dedup・主要領邦の選定と英語名リネーム・properties {NAME, SUBJECTO: Holy Roman Empire} 付与・simplify で軽量化 → data/hre_<year>.geojson 生成）、scripts/build-colors.ts の独立色拡張と colors.json 再生成、scripts/build.ts の copy 対象追加、deno.json task 追加。担当: scripts/build-hre.ts / build-hre_test.ts / build-colors.ts / build-colors_test.ts / build.ts / build_test.ts / data/hre_*.geojson / data/colors.json / deno.json
   - subagent B（表示）: src/config.ts に HRE_OVERLAY_YEARS=[1500,1530,1600,1650]、src/powers.ts に hreUrlFor / hasHreOverlay / base+overlay 同時ロード対応、src/main.ts に領邦用 GeoJsonLayer（powers の上・同一ホバー/クリック挙動）、index.html フッターに ETH データの出典・ライセンス表記。担当: src/config.ts / powers.ts / powers_test.ts / main.ts / index.html
   - A/B 間の契約: URL "/data/hre_<year>.geojson"（year ∈ {1500,1530,1600,1650}）、properties は NAME（英語名）/ SUBJECTO="Holy Roman Empire"、colors.json キーは "NAME|Holy Roman Empire"。担当ファイルは互いに素。
6. TDD: 各 subagent がテスト先行（red→green）。統合後 mainagent レビュー → 全チェック green → PR → CI 監視 → 目視確認（1500 で領邦の色分け・HRE 外縁・ツールチップ）→ finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: dev サーバ + Chrome で 1500 年を目視確認。Austria・Brandenburg・Bohemia・Bavaria・Electoral/Ducal Saxony・Palatinate・Mainz・Trier・Cologne・Württemberg・Hesse・Salzburg が個別色ポリゴンで識別可能。1650 では領邦構成の年代差（ザクセン選帝侯領の拡大、Hesse-Kassel/Darmstadt 分割）も反映されることを確認。ツールチップは「Bohemia — Holy Roman Empire 領」形式で表示。
- AC#2: 領邦オーバーレイ表示中も HRE 外縁の白境界線と帝国全体の塗りが維持されることを 1500/1650 のスクリーンショットで確認。非対象年（1700）は従来どおり単一表示。
- AC#3: フッターに「帝国領邦: ETH Zürich (Roller)（CC BY-NC-SA 4.0）」を DOI リンク付きで表示（目視確認 + basemap/index.html のコード）。CC BY-NC-SA データは GPL-3.0 派生の europe_<year>.geojson と別ファイル（data/hre_<year>.geojson）に分離。
- AC#4: deno fmt --check / deno lint / deno test（246 passed / 0 failed）/ deno task build 全 green。PR #29 の CI pass。
- 実装: subagent 2 並列（worktree isolation、データ側 3b72b7a / 表示側 4e608c3）+ TDD。mainagent レビューで HRE_OVERLAY_YEARS の定義元を src/config.ts に統一（fa81ca3）。
- 留意点: colors.json 再生成で既存 60 キーの色がプロービング連鎖のずれにより変化（決定的割当・全色相異は維持）。ETH データの欠損は HRE_RANGE_OVERRIDES で補正（Bayern 1500-1806 近似等）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ETH Zürich Roller データセット（DOI 10.3929/ethz-b-000472583, CC BY-NC-SA 4.0, bitstream UUID ピン留め）から scripts/build-hre.ts で主要領邦 15 勢力を抽出し data/hre_{1500,1530,1600,1650}.geojson を生成。buildColorMap に独立色化拡張（HRE 配下は NAME ベースのプロービング色）を加え、フロントは base+overlay の複合ローダと hre-powers レイヤーで powers の上に重ねる。NC ライセンスのため GPL 派生データとはファイル分離し出典をフッターに明記。検証は deno test 246 passed・CI pass・Chrome での 1500/1650/1700 目視確認。
<!-- SECTION:FINAL_SUMMARY:END -->
