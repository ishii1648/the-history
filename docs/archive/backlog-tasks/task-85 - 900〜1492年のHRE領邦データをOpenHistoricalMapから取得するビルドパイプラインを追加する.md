---
id: TASK-85
title: 900〜1492年のHRE領邦データをOpenHistoricalMapから取得するビルドパイプラインを追加する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 12:07'
updated_date: '2026-07-26 13:55'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:docs'
dependencies: []
ordinal: 79000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-37（Done, 2026-07-23）は「900〜1492 年の HRE 領邦を表示できるオープンデータは存在しない」と結論したが、OpenHistoricalMap（OHM）についての判断は OHM Wiki の自己申告（In progress, recruiting helpers）に基づくもので、実際に Overpass へクエリを投げていなかった。その後 TASK-70 で OHM 取得パイプライン（scripts/build-france-fiefs.ts）が動くようになったため実測したところ、900〜1492 年の帝国域内に領邦データが実在することを確認した。TASK-37 の結論を覆し、これを取り込む。

## 実測結果（2026-07-26）

帝国中核域 bbox（south 45.5 / west 5.5 / north 55.0 / east 19.0）に boundary=administrative の全リレーション（34,005 件）を取得し、admin_level と start_date / end_date で年代別に集計した結果:

| 年 | admin_level 2〜5 の有効件数 | 主な中身 |
| ---: | ---: | --- |
| 900 | 16 | Lotharingia、Duchy of Saxony、Westphalia / Eastphalia / Angria |
| 1000 | 33 | 部族大公領がフルセット（Bavaria / Saxony / Swabia / Franconia / Thuringia / Carinthia / Upper・Lower Lotharingia / March of Meissen / Billung March） |
| 1100 | 45 | 上記 + Duchy of Bohemia・Burgraviate of Nuremberg・司教領 |
| 1200 | 50 | 大公領は Swabia のみ（1180 年の Welf 失脚による解体でデータ側の期間も終了）。司教領・帝国都市が中心 |
| 1279 | 86 | Duchy of Austria が登場、帝国都市が急増 |
| 1300 | 112 | County of Holland・Duchy of Pomerania-Stettin・Duchy of Saxe-Wittenberg・Dauphine of Viennois |
| 1400 | 144 | Austria・Berg・Guelders・Luxembourg・Brandenburg・Electorate of Saxony・Cleves |
| 1492 | 158 | 1500 年の Roller データとほぼ同等の充実度 |

ジオメトリが実在することも、既存の `relationGeometry()`（scripts/build-france-fiefs.ts）に通して確認済み。頂点数は現行の europe_<year>.geojson より細かい:

- 1000 Duchy of Bavaria = 1 polygon / 189 頂点
- 1000 Duchy of Saxony = 1 polygon / 186 頂点
- 1000 Duchy of Swabia = 1 polygon / 103 頂点
- 1000 March of Meissen = 1 polygon / 236 頂点
- 1400 Duchy of Austria = 1 polygon / 8,185 頂点
- 1400 Electorate of Saxony(-Wittenberg) = 74 polygon / 1,434 頂点（飛び地が忠実に収録されている）
- 1400 Duchy of Luxembourg = 66 polygon / 4,502 頂点

## 実装時に解決が必要な既知の論点（鵜呑みにせず実装時に再検証すること）

- 帝国都市のノイズ: 1400 年の admin_level 4 の 109 件は大半が Free Imperial City で、地図上では点に近い微小ポリゴンになる。許可リストで除外する方針が要る。
- bbox 外の混入: デンマークの Herred、北イタリアの Plebis、ハンガリーの county が bbox に含まれる。TASK-70 と同じく name:en の許可リストで絞る。
- 飛び地の粒度: Luxembourg 66 / Saxony 74 ポリゴンは細かすぎるため、簡略化と微小破片の除去が要る（TASK-81 と同種の課題）。
- 1200 年の谷: 大公領の解体後・領邦形成の前で面の被覆が薄い。年代によっては収録を見送り既知の制限に残す判断があり得る。
- 出典の断層: 1500〜1700 は Roller（CC BY-NC-SA 4.0）、900〜1492 は OHM（CC0 1.0）となり、1492 と 1500 の間で形状が飛ぶ可能性がある。全年代を OHM に統一する選択肢もある（1500 年時点でも 168 件ある）が、Roller は査読を経た学術データであり単純な置き換えが妥当とは限らない。採否と根拠を記録すること。

## ライセンス

OHM は CC0 1.0（パブリックドメイン）。GPL-3.0 派生の europe_<year>.geojson とも CC BY-NC-SA 4.0 の hre_<year>.geojson とも混合制約はないが、出典管理の一貫性のため TASK-70 と同じく独立ファイルとして生成する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 対象年ごとに OHM 由来の HRE 領邦 GeoJSON が data/ に生成される
- [x] #2 生成物に Free Imperial City と bbox 外の行政区画（デンマークの Herred・北イタリアの Plebis・ハンガリーの county）が含まれない
- [x] #3 年代ごとに採用した領邦の許可リストと、収録を見送った年代・領邦の根拠がコード内に記録されている
- [x] #4 出典・ライセンス（OpenHistoricalMap / CC0 1.0）が data/index.json 相当の出典記録に反映されている
- [x] #5 1 ファイルあたりのサイズ上限を超えず、簡略化後も飛び地の微小破片が残らない
- [x] #6 ネットワークに依存しない単体テストが追加され deno test が green
- [x] #7 docs/data-inventory が新データを反映して更新されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 取得パイプライン: TASK-70 の scripts/build-france-fiefs.ts の流儀（Overpass クエリ・relationGeometry・許可リスト・キャッシュ）を踏襲し、900〜1492 年の HRE 領邦を OHM から取得する scripts/build-hre-ohm.ts（仮称）を新設。独立ファイル data/hre_<year>.geojson 系として生成（既存 Roller 由来 1500〜1700 とは出典断層を跨いで混合しない）。
2. フィルタ設計: name:en 許可リスト（bbox 外の Herred / Plebis / ハンガリー county 除外）+ Free Imperial City 除外。年代ごとの採用領邦と見送り根拠をコード内に記録（AC#2/#3）。1200 年の谷は被覆を実測し、収録可否と known-limitations 掲載を判断。
3. 品質処理: TASK-81 の clean-polygons を通し、簡略化 + 微小破片除去でサイズ上限内に収める（AC#5）。
4. 出典: data/index.json 相当 + docs/data-inventory に OHM / CC0 1.0 を反映（AC#4/#7）。
5. TDD: フィルタ・許可リスト・簡略化のネットワーク非依存単体テストを先に red で固定（AC#6）。
6. Roller 置換の是非（1500 年以降を OHM に統一するか）は本タスクでは行わず、比較根拠のみ記録して現状維持（Roller は査読済み学術データ）。finalization で decision 記録（データソース採用）を行う。
7. 全チェック green → PR → CI → finalization → マージ。表示側の対応は本タスクのスコープ外（データ生成まで）。

並列化判定（タスク内）: 見送り（理由: クエリ設計 → フィルタ → 品質処理 → 出典記録が直列依存の単一パイプライン構築のため。単一 subagent に委譲）。
タスク間並列: なし（TASK-87 は area:scripts 競合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: data/hre_fiefs_{1000,1100,1200,1279,1300,1400,1492}.geojson の 7 年代を生成（deno task で再現可能）。件数実査 1000=19 / 1200=26 / 1492=73。
- AC#2: 許可リスト 98 件（admin_level 4/5 限定）+ hreFiefExclusionReason の二重防波堤で帝国都市・Herred・Plebis・ハンガリー県を構造的に排除（単体テストで検証）。
- AC#3: 採用リスト・900 年見送り（帝国成立前・6 件のみ）・1200 年収録（谷だが 1279 年より被覆広）の根拠を scripts/build-hre-fiefs.ts 冒頭に記録。
- AC#4/#7: docs/data-inventory/README.md に OHM / CC0 1.0 の出典・取得方法を追記。
- AC#5: 58〜175 KB で上限内。clean-polygons + removePinchPoints で自己交差ゼロ・微小破片なしをテスト検証。
- AC#6: フィクスチャ方式のネットワーク非依存テストで deno test 870 passed。
- Roller 統一案の却下根拠（査読済み・時系列整合）をコードと decision-17 に記録。TASK-37 の結論訂正を decision-17 に記録。
- 全チェック: fmt/lint clean、build green、verify:smoke PASS（表示側スコープ外・回帰なし）、PR #95 CI green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-37 の結論を実測で覆し、1000〜1492 の 7 年代の HRE 領邦を OHM（CC0）から生成するパイプライン scripts/build-hre-fiefs.ts を追加。許可リスト + 除外理由の二重防波堤でノイズを排除し、clean-polygons 拡張（removePinchPoints）で自己交差ゼロを維持、全ファイルがサイズ上限内。Roller は査読済みデータとして維持し採否根拠を decision-17 に記録。ネットワーク非依存テストで 870 passed・CI green（PR #95）。
<!-- SECTION:FINAL_SUMMARY:END -->
