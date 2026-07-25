---
id: TASK-61
title: 都市選定の HRE 下限確保が年代・領域・訳データで誤っている
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-25 05:42'
updated_date: '2026-07-25 05:44'
labels:
  - bug
  - 'area:scripts'
  - 'area:data'
dependencies: []
ordinal: 58000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review CONFIRMED 指摘 #1/#2/#6 をまとめた bug。(a) HRE 域内最低件数確保（TASK-55）が全スナップショット年に無条件適用され、HRE 消滅後（1815〜1914）でも人口上位都市が置き換えられる。再現: data/cities.json の 1900 年に Barcelona（55.2万人）が無く Munich（49.9万人）がある。期待: 下限確保は HRE が存在する年代（〜1806 目安）に限定し、以降は純粋な人口上位選定へ戻す。(b) HRE_REGION_BBOX 西端 5.5E が歴史的 HRE 領の低地諸国を除外し、実 HRE 都市 Bruges（1279〜1500 の 5 スナップショット年で表示されていた）が全年代から消えた。期待: bbox 西端の再検討（例: 3.0E）等で低地諸国を包含するか、判断根拠を記録して bbox を是正する。(c) 選外都市の手書き日本語訳 12 件（Antwerp, Bruges, Barcelona 等）が name-ja.json から削除され、将来の再生成で都市が復帰したとき CI red / 英語フォールバック表示になる。期待: 訳を復元し、孤立キーテスト側を『都市の現行採用有無に依存しない』形へ調整する。発見契機: /code-review（PR #68/TASK-55 の横断レビュー）。
再現手順: deno task build-cities 後の data/cities.json を年代別に走査し、(a) 1815 以降の域内 6 件強制 (b) Bruges の不在 を確認する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 下限確保の適用年代の上限がテストで固定され、1815 以降は人口上位選定へ戻る（再現テスト red → 修正 green）
- [ ] #2 bbox 見直し（低地諸国の扱い）の判断と根拠が記録され、Bruges が HRE 存在年代で復帰する
- [ ] #3 削除された日本語訳 12 件が復元され、deno test green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TDD で 3 点を修正: (a) 下限確保の適用年代上限（HRE 消滅 1806 目安）を定数化し、超過年は純粋な人口上位選定へ戻す。(b) 領域定数の意味の是正: bbox 5.5E 西端は『HRE』を名乗るには低地諸国を欠く。名称を実態（独語圏近似）に合わせるか bbox を広げるかを、ユーザー要望（ドイツ域内の密度）と Bruges 復帰 AC の両立で判断し根拠を記録。Bruges 等の従来表示大都市の復帰には総数拡大（CITIES_PER_YEAR 20→上限 25 内）等の選択肢も比較する。(c) name-ja.json の削除訳 12 件を復元し、孤立キーテストとの整合を取る。
2. data/cities.json 再生成、1815 以降と 1400/1500 年の选定結果をテストで固定。
3. 並列化判定: 見送り（理由: 選定ロジック・データ・訳が単一パイプラインで逐次依存）。単一 subagent 委譲。
4. 実機確認は 1900 年（Barcelona 復帰）と 1500 年（Bruges 復帰 + ドイツ密度維持）の CDP スクリーンショット。
<!-- SECTION:PLAN:END -->
