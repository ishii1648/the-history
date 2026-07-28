---
id: TASK-120
title: フランス王国内の封土をホバー/クリックしてもフランス王国の外枠が表示されない
status: To Do
assignee: []
created_date: '2026-07-28 14:45'
updated_date: '2026-07-28 14:50'
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
2. フランス王国領内の封土（例: County of Anjou、County of Angoulême、County of Blôis、Royal Domain of France）にカーソルを合わせる／クリックする。

## 期待挙動

神聖ローマ帝国と同様に、フランス王国の領土全体が臙脂の外枠（勢力圏の外枠）で囲まれ、「この封土がフランス王国のどの範囲の内側にあるか」が一目で分かる。

## 実際の挙動

封土そのものは緑青で強調される（TASK-90 のアクティブ強調）が、フランス王国の外枠はまったく描画されない。封土がフランス王国のどこに位置するのかが読み取れない。

## 発見契機

ユーザーによる動作確認報告（2026-07-28）。

## 対象範囲

フランス王権の封土に限る。レイヤーとしては `france-fiefs`（OHM 由来）と、`cliopatria-fiefs` のうち仏封土（1000/1100/1200 の County of Blôis・Champagne・Flanders・Toulouse・Vermandois、Duchy of Aquitaine・Gascony、Royal Domain of France など）が該当する。伊諸侯領（`italy-fiefs`）は本タスクの対象外（TASK-121）。

## 調査済みの事実

- 外枠の対象レイヤーは `src/suzerain_extent.ts` の `EXTENT_SOURCE_LAYER_IDS` で `powers`（base）と `hre-powers` の 2 つに限定されている。`france-fiefs` / `italy-fiefs` / `cliopatria-fiefs` は含まれないため、`suzerainExtentKey()` が常に null を返し外枠が出ない。
- HRE で機能しているのは、`data/hre_fiefs_flat_*.geojson` の各 feature が `SUBJECTO: "Holy Roman Empire"` を持ち、かつ `hre-powers` が対象レイヤーに入っているため。`resolveSuzerainKey()` が帝国キーへ解決され、base 側の HRE 本体＋従属勢力の union が外枠になる。
- `data/france_fiefs_flat_*.geojson` の properties は `NAME` / `ADMIN_LEVEL` / `OHM_RELATION_ID` / `START_DATE` / `END_DATE` のみで、`SUBJECTO`・`PARTOF` を持たない。`data/cliopatria_fiefs_flat_1000/1100/1200.geojson` の仏封土も同様に `SUBJECTO` を持たない（同ファイルの 1279 以降に現れる HRE 領邦 3〜4 件だけが `SUBJECTO: "Holy Roman Empire"` を持つ）。そのため仮に対象レイヤーへ追加しても、宗主キーは封土自身の NAME に解決され、base に一致する feature がなく外枠は空になる。`suzerain_extent.ts` の冒頭コメントにも「仏諸侯領は宗主プロパティ自体を持たないので入力にもできない」と現状が明記されている。
- したがって修正には (a) 仏封土に宗主を与える経路（ビルド時の `SUBJECTO` 付与、または `data/name-overrides.json` の `suzerains` 拡張。現状 `suzerains` は `{"Britany": "France"}` の 1 件のみ）と、(b) 外枠の対象レイヤー拡張の両方が必要になる見込み。どちらの経路を採るかは着手時に判断する。
- `cliopatria-fiefs` を対象レイヤーへ追加した場合、`SUBJECTO` を既に持つ Cliopatria 由来の HRE 領邦（1279/1300/1400/1492）も同時に外枠が出るようになる。これは望ましい副作用だが、HRE 側の外枠に退行が出ていないことは確認する（Cliopatria 由来 HRE 領邦の AC を参照）。
- 封土の帰属は史実として自明でないものがある（例: Flanders 伯は仏王の封臣だが帝国側にも領地を持つ、Aquitaine は 1154 年以降アンジュー帝国側）。宗主付与は歴史的に明白な関係に限り、判断が割れるものは付与を見送って理由を Implementation Notes に残す。
- 関連: TASK-30（HRE 外枠の初出）・TASK-94（宗主-封臣関係への一般化）・TASK-101（ノルマンディー帰属の是正）・TASK-110（Cliopatria 採用）・TASK-121（伊諸侯領の同種 bug）・decision-19（外枠は SUBJECTO 由来の宗主キー union、宗主補正は歴史的に明白な関係に限る）。封土 → 王権の従属関係をどこまでデータとして持たせるかは decision-19 の方針との整合を確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 仏諸侯領レイヤーの feature を picking したときに宗主キーがフランス王国へ解決され、その外枠が構築されることを検証する再現テストが追加され、修正前は red である
- [ ] #2 修正により `deno test` が green になる
- [ ] #3 目視確認: 1000/1100/1200/1279/1300 年でフランス王国内の封土をホバー・クリックすると、フランス王国の領土全体が臙脂の外枠で囲まれる
- [ ] #4 目視確認: 封土自身の緑青のアクティブ強調と外枠が同時に成立し、どの封土を指しているかの識別が失われない
- [ ] #5 フランス以外の勢力（HRE・独立勢力）および仏王権に属さない領邦で、従来の外枠挙動に退行がない
- [ ] #6 目視確認: Cliopatria 由来の仏封土（1000/1100/1200 の County of Blôis・Royal Domain of France など）でも同じ外枠が表示される
- [ ] #7 Cliopatria 由来の HRE 領邦（1279/1300/1400/1492）で HRE の外枠が従来どおり、または新たに正しく表示される
<!-- AC:END -->
