---
id: TASK-55
title: ドイツ（HRE域内）の都市表示密度を調査・改善する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 13:00'
updated_date: '2026-07-24 16:10'
labels: []
dependencies:
  - TASK-27
  - TASK-54
ordinal: 53000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望: ドイツ（神聖ローマ帝国域内）の都市をもっと表示できないか。現状のデータパイプライン（TASK-27, scripts/build-cities.ts）は Historical Urban Population（Reba, Reitsma & Seto 2016, chandler.csv, CC BY 4.0）を出典とし、ヨーロッパ bbox 内で年ごとに人口上位 CITIES_PER_YEAR（=20）件のみを採用している。人口ランキングは地中海沿岸・ビザンツ/オスマン圏・イベリア半島等の大都市が優位になりやすく、中世のドイツ語圏（HRE 域内）は人口規模で見劣りするため採用都市数が少なくなっている可能性が高い。調査観点: (1) 現行データで HRE 域内（bbox または HRE feature 内）の都市が年代ごとに何件採用されているか実測する (2) 採用件数を増やす（CITIES_PER_YEAR の引き上げ）か、地域別の最低表示件数を設ける（例: HRE 域内で最低 N 件を人口ランキングとは別に確保する）か、追加データソース（chandler.csv 以外でドイツ都市を補強できるデータ）が必要かを比較検討する (3) 表示都市数が増えることによる画面の混雑・ラベル密度への影響（TASK-54 の密集地域対策と関連）も考慮する。対応方針を決めたうえで実装する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 現状のデータで年代ごとに HRE 域内に採用されている都市数の実態が調査・記録されている
- [x] #2 改善方針（採用数引き上げ・地域別最低件数確保・追加データソースのいずれか、または組み合わせ）が比較検討のうえ決定され、実装プランに記録されている
- [x] #3 改善後、代表年代（例 1500 年）で HRE 域内の都市表示数がユーザーが体感できる程度に増えている
- [x] #4 都市数増加によるラベル密度・視認性への悪影響がないか確認する（TASK-54 との整合）
- [x] #5 データ処理ロジックの変更にテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 実態調査（AC #1）: scripts/build-cities.ts と data/cities.json を機械走査し、年代ごとの HRE 域内（対象年代の HRE/独語圏 bbox 近似）採用都市数を記録する。chandler.csv の候補プールにあるドイツ都市の規模（採用漏れの件数）も確認する。
2. 方針比較（AC #2）: (a) CITIES_PER_YEAR 引き上げ — 全域で増えるため人口優位の地中海圏が先に増え、目的（HRE 域内）への効きが薄い。(b) 地域別最低件数 — HRE 域内で最低 N 件を人口順に確保。局所目標に直結しパイプラインの複雑化も限定的。(c) 追加データソース — 出典・ライセンス管理の複雑化に対して見合わない。基本線は (b)（必要に応じ (a) を小幅併用）とし、調査結果で N を確定して記録する。
3. 出自の注記: この比較検討の骨子は、暴走していた daemon ジョブ（停止済み）が中断時に残した未コミットプランを引き継いだもの。実装しかけの diff（build-cities.ts/tests/name-ja、コード 259 行 + データ再生成）は参考資料として subagent に渡すが、TDD で正規に実装し直し、採否はレビューで判断する。
4. TDD（AC #5）: 選定ロジック（地域最低確保）のテストを先行（red→green）。data/cities.json は手書きせずパイプライン再生成。新規都市の日本語表記は name-ja.json に追加。
5. 検証（AC #3/#4）: ヘッドレス CDP で 1500 年ドイツ周辺の改善前後スクリーンショットを比較。都市数の体感増と、TASK-54 の背景パネル・間引き強化の下でラベル密集が破綻しないことを確認する。
6. 並列化判定: 見送り（理由: パイプライン変更 → データ再生成 → 表示確認が逐次依存し、独立サブ作業に分割できない）。実装は単一 subagent（worktree isolation）に委譲し mainagent がレビュー。
7. deno fmt/lint/test/build green → PR（TASK-55 明記）→ CI green → finalization → マージ → マージ後動作確認。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実態調査（AC #1、subagent 実測。HRE 域内 = bbox [5.5,45.5,17,55] 近似）:
| 年 | before | after | 域内候補プール |
|---|---|---|---|
| 900 | 2 | 2 | 2（全候補採用） |
| 1000 | 0 | 6 | 8 |
| 1100 | 0 | 4 | 4（全候補採用） |
| 1200 | 1 | 6 | 21 |
| 1279/1300 | 1 | 6 | 20 |
| 1400 | 1 | 6 | 19 |
| 1492/1500/1530 | 1 | 6 | 29–30 |
| 1600 | 1 | 6 | 29 |
| 1650 | 0 | 6 | 27 |
| 1700–1815 | 1–3 | 6 | 33–46 |
| 1880–1914 | 3–5 | 6 | 119–123 |
N=6 の根拠（AC #2）: 総数 20 の 3 割で体感差が明確・1200 年以降の候補プール（19 件以上）が安定して満たせる・総数据え置きのため TASK-54 のラベル密度対策に逆行しない。候補不足年（900/1100）は無理に埋めず全候補のみ。
TDD 証跡（AC #5）: (1) 定数未実装の TS2305 で red → 実装 green (2) 生成物テストが『1000 年の域内 0 件』で red → build-cities 再生成で green (3) rename テスト red → CITY_RENAMES 追加で green。deno test 559 passed。
表示検証（AC #3/#4）: CDP スクリーンショットで 1500 年ドイツ周辺がプラハのみ → 5 都市に増加、TASK-54 背景パネル下で破綻なし。注: subagent worktree には europe.pmtiles が無くフォールバックベースマップでの検証のため、マージ後動作確認で本番ビルドを再確認する。軽微な観察: 1500 年 z6 でウィーンのラベルがオーストリア大公領ラベル末尾にわずかに重なる（既存の衝突挙動の範囲）。
選外の帰結: 総数据え置き方針により Antwerp/Barcelona/Bologna 等 18 都市が年によって表示から外れる（プラン記録済み方針の帰結）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
都市選定パイプラインに HRE_REGION_BBOX [5.5,45.5,17,55] と HRE_REGION_MIN_CITIES=6 の地域別最低件数確保を追加（総数 20 は据え置き、域外の人口最下位と入れ替え）。900〜1700 年に 0〜1 件だった HRE 域内都市が 1500 年で 6 件（プラハ・ケルン・ニュルンベルク・アウクスブルク等）に増加。検証エビデンス: Notes の年代別調査数表（AC #1）、方針比較と N=6 の根拠（AC #2）、CDP スクリーンショット before/after で体感差と TASK-54 対策下のラベル非破綻（AC #3/#4）、TDD red→green 3 件 + deno test 559 passed（AC #5）。方式判断はタスク限りのためコード内コメントと Notes に記録し decision 化は見送り。
<!-- SECTION:FINAL_SUMMARY:END -->
