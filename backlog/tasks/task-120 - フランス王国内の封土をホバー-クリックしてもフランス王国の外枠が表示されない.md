---
id: TASK-120
title: フランス王国内の封土をホバー/クリックしてもフランス王国の外枠が表示されない
status: To Do
assignee: []
created_date: '2026-07-28 14:45'
labels:
  - bug
  - 'area:src-suzerain-extent'
  - 'area:src-main'
  - 'area:data-base'
  - 'area:data-fiefs'
  - 'area:scripts-fiefs'
dependencies: []
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 再現手順

1. アプリを表示し、年代を 1000 / 1100 / 1200 / 1279 / 1300 のいずれかにする。
2. フランス王国領内の封土（例: County of Anjou、County of Angoulême、Duchy of Normandy）にカーソルを合わせる／クリックする。

## 期待挙動

神聖ローマ帝国と同様に、フランス王国の領土全体が臙脂の外枠（勢力圏の外枠）で囲まれ、「この封土がフランス王国のどの範囲の内側にあるか」が一目で分かる。

## 実際の挙動

封土そのものは緑青で強調される（TASK-90 のアクティブ強調）が、フランス王国の外枠はまったく描画されない。封土がフランス王国のどこに位置するのかが読み取れない。

## 発見契機

ユーザーによる動作確認報告（2026-07-28）。

## 調査済みの事実

- 外枠の対象レイヤーは `src/suzerain_extent.ts` の `EXTENT_SOURCE_LAYER_IDS` で `powers`（base）と `hre-powers` の 2 つに限定されている。`france-fiefs` / `italy-fiefs` / `cliopatria-fiefs` は含まれないため、`suzerainExtentKey()` が常に null を返し外枠が出ない。
- HRE で機能しているのは、`data/hre_fiefs_flat_*.geojson` の各 feature が `SUBJECTO: "Holy Roman Empire"` を持ち、かつ `hre-powers` が対象レイヤーに入っているため。`resolveSuzerainKey()` が帝国キーへ解決され、base 側の HRE 本体＋従属勢力の union が外枠になる。
- `data/france_fiefs_flat_*.geojson` の properties は `NAME` / `ADMIN_LEVEL` / `OHM_RELATION_ID` / `START_DATE` / `END_DATE` のみで、`SUBJECTO`・`PARTOF` を持たない。そのため仮に対象レイヤーへ追加しても、宗主キーは封土自身の NAME に解決され、base に一致する feature がなく外枠は空になる。`suzerain_extent.ts` の冒頭コメントにも「仏諸侯領は宗主プロパティ自体を持たないので入力にもできない」と現状が明記されている。
- したがって修正には (a) 仏諸侯領に宗主を与える経路（ビルド時の `SUBJECTO` 付与、または `data/name-overrides.json` の `suzerains` 拡張。現状 `suzerains` は `{"Britany": "France"}` の 1 件のみ）と、(b) 外枠の対象レイヤー拡張の両方が必要になる見込み。どちらの経路を採るかは着手時に判断する。
- 関連: TASK-30（HRE 外枠の初出）・TASK-94（宗主-封臣関係への一般化）・decision-19（外枠は SUBJECTO 由来の宗主キー union、宗主補正は歴史的に明白な関係に限る）。封土 → 王権の従属関係をどこまでデータとして持たせるかは decision-19 の方針との整合を確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 仏諸侯領レイヤーの feature を picking したときに宗主キーがフランス王国へ解決され、その外枠が構築されることを検証する再現テストが追加され、修正前は red である
- [ ] #2 修正により `deno test` が green になる
- [ ] #3 目視確認: 1000/1100/1200/1279/1300 年でフランス王国内の封土をホバー・クリックすると、フランス王国の領土全体が臙脂の外枠で囲まれる
- [ ] #4 目視確認: 封土自身の緑青のアクティブ強調と外枠が同時に成立し、どの封土を指しているかの識別が失われない
- [ ] #5 フランス以外の勢力（HRE・独立勢力）および仏王権に属さない領邦で、従来の外枠挙動に退行がない
<!-- AC:END -->
