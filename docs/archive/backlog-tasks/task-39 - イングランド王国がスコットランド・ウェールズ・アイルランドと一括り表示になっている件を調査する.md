---
id: TASK-39
title: イングランド王国がスコットランド・ウェールズ・アイルランドと一括り表示になっている件を調査する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 14:04'
updated_date: '2026-07-23 14:11'
labels: []
dependencies: []
ordinal: 38000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘: 現在の地図表示でブリテン諸島が「イングランド・アイルランド」のように一つの勢力として一括り表示される年代があり、スコットランド・ウェールズ・アイルランドの個別の政治的実体（歴史的にはスコットランド王国、ウェールズ諸公国、アイルランドの諸王国等、時代によりイングランドとは独立した勢力）が地図上で区別できない。データ元 aourednik/historical-basemaps（TASK-2/TASK-4 で採用）の該当年代における features 分割の実態を調査し、(1) 上流データが元々これらを分離した feature として持っているが本プロジェクトの表示・フィルタ処理で統合されてしまっているのか、(2) 上流データ自体がブリテン諸島を単一 feature として扱っているためデータの限界なのかを切り分ける。(1) の場合は表示側の修正、(2) の場合は代替・補完データソースの調査（例: 歴史的なスコットランド/ウェールズ/アイルランドの領域を収録したオープンデータの有無）を行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 対象年代ごとに、ブリテン諸島（イングランド・スコットランド・ウェールズ・アイルランド）が現状どう表現されているか（分離 feature の有無・NAME 属性の実態）が調査され記録されている
- [x] #2 一括り表示の原因（上流データの限界か表示側の統合処理か）が特定されている
- [x] #3 表示側の問題であれば修正され、各年代で分離可能な範囲において個別勢力として表示される
- [x] #4 上流データの限界であれば、代替・補完データソースの調査結果（採用可否とその根拠）が final summary に記録されている
- [x] #5 対応内容に応じて日本語表記（name-ja.json）・色割当（colors.json）が整合している
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. データ実態調査（AC#1/#2）: 各 SNAPSHOT_YEARS の data/europe_<year>.geojson（および上流 aourednik/historical-basemaps の原データ）でブリテン諸島の features（NAME/SUBJECTO 属性）を機械的に列挙し、分離 feature の有無を年代別に記録。scripts/build-data.ts のフィルタ・統合処理（bbox クリップ・NAME 正規化・renames）で統合が起きていないかをコードで確認して原因を切り分ける。
2. 表示側の問題なら修正（AC#3）: TDD で red（該当年代でスコットランド等の feature が出力に存在することを期待するテスト）→ フィルタ/統合処理を修正して green。name-ja.json / colors.json の整合（AC#5）も同時に更新。
3. 上流データの限界なら（AC#4）: 代替・補完データの調査（TASK-37 の調査結果を再利用: Euratlas はライセンス不適合、OHM 未成熟等）を踏まえ、採否と根拠を final summary に記録して現状維持でクローズ。
4. 実機確認: 対応した場合は該当年代でブリテン諸島の表示を目視確認。
5. 並列化判定: 見送り（理由: 調査→切り分け→（条件付き）修正の逐次構造で、結果に依存しない独立サブ作業がない。調査は subagent に委譲、判断は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
調査結果（subagent による年代別実データ検証 + 上流直接突合、2026-07-23）:
- AC#1: 全 SNAPSHOT_YEARS の data/europe_<year>.geojson でブリテン諸島 features の NAME を列挙。900 年は七王国（Wessex/Mercia/Northumbria 等）+ Welsh + Scots + Picts が個別 feature。1000〜1500 は England（または Angevin Empire / English territory）+ Scotland の 2 実体。1530/1600/1650/1700 は「England and Ireland」単一 feature（1650/1700 は Scotland も単一領域化）。1715 以降は United Kingdom / Kingdom of Ireland で史実（1707/1801 合同）どおり。Wales は 900 年（Welsh）以外の全年代で独立 feature なし。
- AC#2: 原因は上流データの限界と確定。scripts/build-data.ts のパイプライン（fetch → clipToBbox → applyNameOverrides → shrinkToLimit）に feature の結合・統合・除外処理は存在せず（grep でも dissolve/merge/union なし）、ピン留めコミットの上流 world_<year>.geojson を 12 年代で直接 fetch して NAME 一覧がローカルと完全一致することを確認（Scottland→Scotland の誤字補正のみ差分）。「England and Ireland」の properties（SUBJECTO/PARTOF 含む）は上流そのまま。
- AC#3: 表示側の問題ではないため修正対象なし（条件不成立）。
- AC#4: 代替・補完データソースは TASK-37 の広範な調査結果を適用 — 年代×領域粒度を満たす Euratlas Periodis（Provinces にブリテン諸島の下位区分あり）は商用ライセンスで再配布不可、OpenHistoricalMap は CC0 志向だが未成熟、他候補は年代範囲外/粒度不足/入手不能。上流にない England/Ireland 分割ジオメトリの新規作成はデータのでっち上げに当たるため不採用。
- AC#5: 対応なし（現状維持）のため name-ja.json / colors.json は既存整合のまま変更不要。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ブリテン諸島の一括り表示（1530〜1700 の「England and Ireland」等）の原因を調査し、上流データ aourednik/historical-basemaps の限界と確定（ビルドパイプラインに統合処理なし、ピン留め上流と NAME 完全一致を 12 年代で直接検証）。900 年は七王国+Welsh+Scots が個別表示され、1715 以降の統合は史実（合同法）を反映。代替データは TASK-37 調査を適用し、ライセンス（Euratlas）・成熟度（OHM）の理由で採用不可。上流にない分割ジオメトリの自作はしない方針とし、現状維持でクローズ。コード変更なし。
<!-- SECTION:FINAL_SUMMARY:END -->
