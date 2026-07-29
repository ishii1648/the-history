---
id: TASK-88
title: OHMに存在しない仏諸侯領を県ポリゴン合成で補うかを判断し採用時は出典を区別して描画する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 12:14'
updated_date: '2026-07-26 15:33'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:src-main'
dependencies:
  - TASK-80
  - TASK-87
ordinal: 82000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-87 で許可リストを広げても、南フランスと中央部の諸侯領の空白は埋まらない。これらは OHM に実データが存在しないことを実測で確認済みで、埋めるには本リポジトリでジオメトリを作る（＝これまでやっていない種類の作業）必要がある。採否そのものが判断事項なので、本タスクの最初の成果物は decision の記録とする。

## 実測で確定した欠落（2026-07-26）

FRANCE_BBOX の boundary=administrative 全 4,897 リレーションを名前で全走査した結果:

- Toulouse / Foix / Armagnac / Auvergne / Bourbon / Nevers: 該当リレーションが 1 件も存在しない（中世・近世を通じて）
- Provence: 1487 年以降のみ（relation 2892604、1487 .. 1791-09-20）
- County of Flanders: 1237 年以降のみ（relation 2891983、1237 .. 1384-01-30）
- Duchy of Aquitaine / Duchy of Gascony: 1137-04-09 .. 1214-09-28 のみ
- 王領（domaine royal）: 該当なし。Kingdom of France は admin_level 2 の 1 ポリゴンのみ

アンシャン・レジーム期の province として同名の面が OHM にあれば合成の材料にできるかを確認したが、Provence と Dauphiné 以外は収録されていない。したがって OHM 内で代替できる材料は無い。

## 合成の材料になり得るもの（要検証）

現代の県（département）ポリゴンを組み合わせる方式が考えられる。中世の伯領・公領は史料や事典で「現在の○○県にあたる」という形で記述されることが多く、どの県を union するかというテキストの判断に落とせば、成果物はコード上のリストとしてレビュー・訂正が可能になる。座標そのものを生成する方式（検証不能）とは性質が異なる。

- 候補ソース: gregoiredavid/france-geojson（régions / départements / arrondissements / cantons / communes。出典は IGN Admin Express COG + INSEE、ライセンスは Licence Ouverte で再配布・改変とも可）
- 王領（domaine royal）は「Kingdom of France のポリゴンから他の全諸侯領を差し引いた残余」として幾何演算のみで生成できるが、史実の王領は飛び地の集合であり単純な差分とは一致しない。残余であることを明示しない限り誤解を招く。

## 判断が必要な論点

- そもそも本リポジトリでジオメトリを作るのか。現行の運用は全データに出典とライセンスを feature 単位で記録しており、自作ジオメトリはそこに新しい出典カテゴリを作ることになる。data/name-ja.json と data/notes.json という自前データの前例はあるが、いずれもテキストでありジオメトリではない。
- 採用する場合、出典のあるデータと自作データが地図上で同じ見た目になってはならない。TASK-80 が概略境界の描き分けを導入するため、その仕組みに「合成データ」の段階を足す形が自然（本タスクを TASK-80 に依存させている理由）。
- 県境と中世の伯領の境界は当然一致しない。県合成の粒度で許容できるかは、TASK-80 の調査で確認された事実（取得元 historical-basemaps の BORDERPRECISION は全 feature が 1 = 概略であり、既存の表示済み境界も全て概略）を踏まえて判断する。
- 見送る場合は、空白が残ることを known-limitations で説明し続ける現状維持となる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 県ポリゴン合成による諸侯領の自作を採用するか見送るかの判断が backlog decision として記録されている（判断材料と却下した選択肢を含む）
- [ ] #2 採用する場合: どの県を組み合わせたかのリストがコード上に残り、レビューと訂正が可能になっている
- [ ] #3 採用する場合: 合成由来の諸侯領が出典のあるデータと視覚的に区別できる（目視確認）
- [ ] #4 採用する場合: 出典が本リポジトリ由来であることと元の県データの出典・ライセンスが記録されている
- [x] #5 見送る場合: known-limitations.json の記述が現状の空白を説明する内容に更新されている
- [x] #6 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. フェーズ 1（調査・推奨）: subagent が判断材料を整理する — (i) 県合成の技術検証（gregoiredavid/france-geojson のライセンス・粒度、Toulouse 等の県対応リストの作成可能性）、(ii) decision-14（出典なき座標合成はしない）との整合性の分析、(iii) TASK-80 の概略境界表現に「合成データ」段を足すコスト、(iv) 見送り時の known-limitations 更新案。推奨と根拠を報告させ、実装はまだ行わない。
2. フェーズ 2（判断）: mainagent が推奨を審査し採否を決定、backlog decision に記録（AC#1）。
3. フェーズ 3（実装）: 決定した側の AC（採用なら #2〜#4、見送りなら #5）を同じ subagent に実装させる。TDD 必須。
4. 全チェック green → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 判断が実装内容を規定するため直列。フェーズ分割で mainagent の判断を挟む）。
タスク間並列: next-tasks の集合判定により TASK-90（area:app）・TASK-91（area:src-rivers）と並列実行（本タスクは area:scripts,data,src-main）。worktree isolation で衝突回避。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: 採否判断を decision-18 として記録（判断材料 = IoU 28.5〜41.6% / 空白充填 12.7〜27.7% / 既存 OHM データとの重なり 6,306 km² / 頂点密度 4 倍と TASK-80 の概略表現の矛盾 / decision-14 の本旨。却下した選択肢 = 部分採用 C1・全面採用 C2・参考表示トグル C3・別ソース再調査 C4 の比較表を含む）。mainagent が調査報告（フェーズ 1）を審査して決定した。
- AC#2/#3/#4: 「採用する場合」の条件付き AC のため見送り決定により非該当（チェックせず。理由を本 notes に記録）。
- AC#5: known-limitations の france-fiefs-missing-territories に県合成案の検討・却下・実測値・1790 年再編による非対応・出典方針を追記（新規 ID なし・1 件集約、回帰ガードテスト付き）。TDD red（『県…に言及していない』AssertionError）→ green。
- AC#6: deno test 931 passed。fmt/lint/build green、PR #101 CI green。
- docs/data-inventory/README.md §3.4 に実測表と再現手順（curl / Overpass 4,923 件ゼロヒット）を追記。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
現代県ポリゴン合成による中世諸侯領の自作を定量調査（IoU 28.5〜41.6%・空白充填 12.7〜27.7%・既存データ汚染 6,306 km²）のうえ全面見送りと判断し、decision-18 に記録。known-limitations と data-inventory を実測値・再現手順つきで更新し、出典なきジオメトリを混ぜない方針（decision-14）の一貫性を維持。TDD red→green（931 passed）、CI green（PR #101）。
<!-- SECTION:FINAL_SUMMARY:END -->
