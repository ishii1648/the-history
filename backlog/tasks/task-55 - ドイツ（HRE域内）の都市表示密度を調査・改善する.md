---
id: TASK-55
title: ドイツ（HRE域内）の都市表示密度を調査・改善する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-24 13:00'
updated_date: '2026-07-24 15:52'
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
