---
id: TASK-55
title: ドイツ（HRE域内）の都市表示密度を調査・改善する
status: To Do
assignee: []
created_date: '2026-07-24 13:00'
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
- [ ] #1 現状のデータで年代ごとに HRE 域内に採用されている都市数の実態が調査・記録されている
- [ ] #2 改善方針（採用数引き上げ・地域別最低件数確保・追加データソースのいずれか、または組み合わせ）が比較検討のうえ決定され、実装プランに記録されている
- [ ] #3 改善後、代表年代（例 1500 年）で HRE 域内の都市表示数がユーザーが体感できる程度に増えている
- [ ] #4 都市数増加によるラベル密度・視認性への悪影響がないか確認する（TASK-54 との整合）
- [ ] #5 データ処理ロジックの変更にテストがあり deno test が green
<!-- AC:END -->
