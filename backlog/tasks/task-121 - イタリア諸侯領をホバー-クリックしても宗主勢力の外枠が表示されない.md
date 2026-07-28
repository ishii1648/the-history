---
id: TASK-121
title: イタリア諸侯領をホバー/クリックしても宗主勢力の外枠が表示されない
status: To Do
assignee: []
created_date: '2026-07-28 14:49'
labels:
  - bug
  - 'area:src-suzerain-extent'
  - 'area:data-base'
  - 'area:data-fiefs'
  - 'area:scripts-fiefs'
  - 'area:docs'
dependencies:
  - TASK-120
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 再現手順

1. アプリを表示し、年代を 1000〜1492 のいずれかにする。
2. イタリア半島の諸侯領（例: Duchy of Spoleto、March of Montferrat、Duchy of Ferrara、Republic of Genoa）にカーソルを合わせる／クリックする。

## 期待挙動

神聖ローマ帝国と同様に、その諸侯領が属する宗主勢力（帝国イタリア＝神聖ローマ帝国、教皇領など）の領土全体が臙脂の外枠で囲まれ、封土がどの勢力圏の内側にあるかが読み取れる。歴史的に宗主を持たない事実上の独立勢力（海洋共和国など）については、従来どおり外枠を出さない（＝自分自身だけを囲む）判断も可とする。

## 実際の挙動

諸侯領そのものは緑青で強調されるが、宗主勢力の外枠はまったく描画されない。

## 発見契機

TASK-120（フランス王国の外枠が出ない bug）の調査中に、同じ構造的原因が `italy-fiefs` にもあることを確認した（2026-07-28 のユーザー報告に対する調査）。

## 調査済みの事実

- 外枠の対象レイヤーは `src/suzerain_extent.ts` の `EXTENT_SOURCE_LAYER_IDS` で `powers` と `hre-powers` に限定されており、`italy-fiefs` は含まれない。
- `data/italy_fiefs_flat_*.geojson` の properties は `NAME` / `OHM_NAME` / `ADMIN_LEVEL` / `OHM_RELATION_ID` / `START_DATE` / `END_DATE` のみで、`SUBJECTO`・`PARTOF` を 1 件も持たない（全 7 年代を確認）。したがって対象レイヤーへ追加するだけでは宗主キーが封土自身の NAME に解決され、外枠は空になる。
- 収録されている諸侯領は帰属の性格が混在する。帝国イタリア側（County of Asti、March of Montferrat、Marquisate of Saluzzo、Margraviate of Mantua、Duchy of Modena and Reggio など）、教皇領・教皇の宗主権が絡むもの（Duchy of Spoleto、Republic of Ancona など）、事実上独立していた都市共和国（Republic of Genoa / Pisa / Siena / Lucca / Florence）が同一レイヤーに並ぶ。一律に 1 つの宗主へ寄せることはできない。
- decision-19 は「宗主補正は歴史的に明白な関係に限る」と定めている。判断が割れる封土は宗主を付与せず、その判断根拠を Implementation Notes と `docs/data-inventory` の既知の制限に残す方針で進める。
- TASK-120 で `src/suzerain_extent.ts` の `EXTENT_SOURCE_LAYER_IDS` と仏封土の宗主付与経路が先に変更されるため、本タスクはその成果に乗る（dependencies: TASK-120）。

## 対象範囲

`italy-fiefs` レイヤーのみ。フランス王権の封土と Cliopatria 由来の HRE 領邦は TASK-120 の対象。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 italy-fiefs の feature を picking したときに、宗主を持つ諸侯領では宗主キーが解決され外枠が構築されることを検証するテストが追加され、修正前は red である
- [ ] #2 宗主を付与しないと判断した諸侯領（事実上の独立勢力）では外枠が従来どおり自分自身のみ、または非表示になることをテストで固定している
- [ ] #3 修正により `deno test` が green になる
- [ ] #4 目視確認: 帝国イタリアの諸侯領（例: March of Montferrat）をホバー・クリックすると神聖ローマ帝国の領土全体が臙脂の外枠で囲まれる
- [ ] #5 宗主付与の採否とその歴史的根拠が Implementation Notes に記録され、付与を見送った封土は既知の制限（docs/data-inventory）に反映されている
- [ ] #6 フランス・HRE・base 勢力の外枠挙動に退行がない
<!-- AC:END -->
