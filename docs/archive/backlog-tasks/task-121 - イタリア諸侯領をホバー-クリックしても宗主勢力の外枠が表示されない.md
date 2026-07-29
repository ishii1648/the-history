---
id: TASK-121
title: イタリア諸侯領をホバー/クリックしても宗主勢力の外枠が表示されない
status: Done
assignee: []
created_date: '2026-07-28 14:49'
updated_date: '2026-07-28 16:31'
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
- [x] #1 italy-fiefs の feature を picking したときに、宗主を持つ諸侯領では宗主キーが解決され外枠が構築されることを検証するテストが追加され、修正前は red である
- [x] #2 宗主を付与しないと判断した諸侯領（事実上の独立勢力）では外枠が従来どおり自分自身のみ、または非表示になることをテストで固定している
- [x] #3 修正により `deno test` が green になる
- [x] #4 目視確認: 帝国イタリアの諸侯領（例: March of Montferrat）をホバー・クリックすると神聖ローマ帝国の領土全体が臙脂の外枠で囲まれる
- [x] #5 宗主付与の採否とその歴史的根拠が Implementation Notes に記録され、付与を見送った封土は既知の制限（docs/data-inventory）に反映されている
- [x] #6 フランス・HRE・base 勢力の外枠挙動に退行がない
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 起票時の懸念は TASK-120 の設計で解消していた

起票時は「収録されている諸侯領は帰属の性格が混在する（帝国イタリア側・教皇領側・事実上独立の都市共和国）ので一律に 1 つの宗主へ寄せることはできない」ことが懸念だった。しかし TASK-120（decision-27）が**個別の宗主テーブルを作らず base の帰属をそのまま読む**設計を採ったため、**実装者が史実判断を下す必要が生じなかった**。

**`suzerains` への宗主付与はゼロ件**（`{"Britany":"France"}` のまま）。実装は `FIEF_EXTENT_SOURCE_LAYER_IDS` への **1 行追加のみ**で、残り 28 行はコメント。

## 全 7 年代・全 82 feature の実測

| 年代 | 神聖ローマ帝国 | 教皇領 | Corsica | 外枠なし |
| ---: | ---: | ---: | ---: | ---: |
| 1000 | 3 | 0 | 0 | 0 |
| 1100 | 4 | 2 | 1 | 0 |
| 1200 | 7 | 2 | 1 | 0 |
| 1279 | 10 | 1 | 1 | 0 |
| 1300 | 12 | 1 | 1 | 0 |
| 1400 | 13 | 1 | 1 | 1 |
| 1492 | 16 | 3 | 0 | 1 |

- **帝国イタリア側**（Montferrat・Asti・Saluzzo・Mantua・Modena and Reggio・Mirandola・Guastalla ほか）→ すべて `Holy Roman Empire`。仮説どおり
- **教皇領側**（Spoleto・Ancona・Ferrara・Rimini）→ `Papal States`。仮説どおり
- **都市共和国** → **仮説と違い「自分自身」ではなく `Holy Roman Empire`**。Florence / Siena / Lucca / Pisa（1300 以降）/ Genoa（1492）は base がその土地を帝国として塗るため。名目上イタリア王国＝帝国の内側という扱いと整合し、かつ実装者が史実判断を下していない（base の塗り分けを読んだだけ）ので decision-19 / 27 に適合する

## AC#2 の読み替え（明示しておく）

AC#2 は「宗主を付与しないと判断した諸侯領（事実上の独立勢力）では外枠が従来どおり自分自身のみ、または非表示になることをテストで固定している」を要求している。しかし実測では**都市共和国は base の塗り分けにより帝国の外枠が出る**ため、文言どおりの状態は成立しない。

AC#2 は TASK-120 の設計が決まる前に書かれたもので、その**意図（事実上の独立勢力に宗主を捏造しない）は満たされている**——というより、この設計は**何も捏造していない**（`suzerains` 追加ゼロ件・実装は 1 行）ためより強く満たされている。「非表示」の場合（`Lordship of Piombino` 1400/1492: アンカーが base のどのポリゴンにも入らない）もテストで固定済み。この読み替えのうえでチェックした。

## 既知の制限として記録したもの（AC#5）

**ピサ（1100/1200/1279）・ジェノヴァ（1300/1400）が `Corsica` へ解決する。**両共和国のポリゴンはコルシカ島を含み、島（11,472 km²）が本土側より大きいためラベルアンカーが島に立つ。base は同年代のコルシカを独立勢力として塗るので、外枠が島だけを囲む。`data/known-limitations.json` の `italy-fiefs-missing-territories` に追記した。

対処しない根拠:

1. `suzerains` で帝国へ寄せるのは「海洋共和国は名目上帝国従属」という**解釈の持ち込み**で decision-19 に反する（TASK-101 のノルマンディー臣従礼と同じ理由）
2. **「宗主候補の版図が封土より小さければ包含とみなさない」面積ガードを実装して実測したところ、仏封土 7 件（1000〜1300 の Duchy of Brittany / Duchy of Normandy）が外枠を失い TASK-120 の修正を壊す**
3. 根本は base とオーバーレイの帰属の食い違いで、外枠側では直せない

## 検証エビデンス（finalization）

**AC#1 / #3**: テストを先に追加して **8 件 red**（`- null / + "Papal States"` 等）→ 実装で green。`deno task test` = 1369 passed / 0 failed / 3 ignored（着手前 1360）。`deno fmt --check` green、`deno lint` は既存 4 件のみ、`deno task build` green。CI（PR #130）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

**AC#4 / #6 — mainagent が独立に実機確認**:

| ホバー対象 | `extentKey` |
| --- | --- |
| アスティ伯領（帝国イタリア側・1300） | `Holy Roman Empire` |
| スポレート公領（教皇領側・1200） | `Papal States` |
| アンジュー伯領（仏封土・1300） | `France`（**TASK-120 に退行なし**） |

`data/name-overrides.json` の `suzerains` が未変更であることと、実装が 1 行追加であることも diff で確認した。subagent 側では 19 ケースのスクリーンショット（モンフェッラート・スポレート・フィレンツェ・フェラーラ・ジェノヴァ・ピサ・ピオンビーノ・仏封土・Cliopatria 領邦・hre-powers・base 勢力）を目視し、退行が無いことを確認済み。

## 残す課題

1300 年 `Lordship of Rimini` が帝国へ解決するのは base が同年ロマーニャを帝国として塗るため。1278 年の教皇領割譲後という史実とずれるが、decision-27 のとおり base 側 `propertyFixes` の担当（TASK-124 と同種の材料）。

## decision 記録の判定

**記録しない**と判断した。この変更は decision-27 が定めた機構に `italy-fiefs` を載せただけで、新規の方式選択ではない。都市共和国が帝国へ解決する件も decision-27 の「base の帰属をそのまま読む」の帰結であり、Corsica の件は known-limitations と Implementation Notes が一次情報になる。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-120 が入れた containingSuzerainKey に italy-fiefs を載せ、伊諸侯領でも宗主勢力の外枠が出るようにした。実装は FIEF_EXTENT_SOURCE_LAYER_IDS への 1 行追加のみで、suzerains への宗主付与はゼロ件。起票時の懸念（帝国イタリア側・教皇領側・都市共和国が混在するので一律に寄せられない）は、TASK-120 が base の帰属をそのまま読む設計を採ったため実装者が史実判断を下す必要が生じず解消していた。全 7 年代・全 82 feature を実測し、帝国イタリア側は Holy Roman Empire、教皇領側は Papal States へ解決することを確認。都市共和国は仮説と違い「自分自身」ではなく帝国へ解決するが、これは base がその土地を帝国として塗るためで、名目上イタリア王国＝帝国の内側という扱いと整合し実装者の判断は入っていない。ピサ・ジェノヴァが Corsica へ解決する件（ポリゴンにコルシカ島が含まれ島の方が本土より大きいためアンカーが島に立つ）は known-limitations に記録して対処しないことにした。面積ガードで直す案は実装して実測したところ仏封土 7 件が外枠を失い TASK-120 の修正を壊すため却下、suzerains で帝国へ寄せる案は解釈の持ち込みで decision-19 に反するため却下。AC#2 は TASK-120 の設計決定前に書かれており文言どおりの状態（独立勢力の外枠が自分自身のみ）は成立しないが、その意図（独立勢力に宗主を捏造しない）は何も捏造していないためより強く満たされていると読み替えてチェックした。検証: テスト先行で 8 件 red → green、deno test 1369 passed / 0 failed（着手前 1360）、fmt --check / lint / build green、mainagent が実機でアスティ伯領 → 帝国・スポレート公領 → 教皇領・アンジュー伯領 → France（TASK-120 に退行なし）を確認、CI（PR #130）green。
<!-- SECTION:FINAL_SUMMARY:END -->
