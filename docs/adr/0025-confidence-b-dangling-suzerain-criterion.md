---
status: accepted
date: '2026-07-27 17:38'
---

# decision-25: 確度 B の帰属は「宙に浮いた宗主」を判定基準にして propertyFixes で正規化する

## Context

TASK-103 の横断監査（`docs/data-inventory/base-attribution-audit.md` §3）は
「どちらの表記も一理あるが年代間で一貫していない」帰属を確度 B として 7 件
挙げた。確度 A（明確な誤り・TASK-104）と違い、B は史実の当否だけでは採否を
決められない。decision-19 は「宗主補正は歴史的に明白な関係に限る」としており、
名目的宗主権のように解釈の割れるものを補正の根拠にはできないためである。

一方で放置にも実害がある。色キー（`src/powers.ts colorKeyFor` = `NAME|SUBJECTO`）
は宗主名を含むので、宗主表記が年代で揺れると同じ勢力の色が年代切替で変わる。
着手前に全 20 年代を実測したところ、複数年代に現れる `NAME` のうち **30 件**で
色キーが揺れ、うち大半で実際に色が変わっていた。代表例:

| 勢力    | 実測した色の揺れ                                                       |
| ------- | ---------------------------------------------------------------------- |
| Spain   | 1600 `#77c598` → 1650 / 1700 `#b0d194` → 1715 `#77c598`               |
| Hanover | 1715 / 1783 `#adcda2` → 1800 `#94d1a6` → 1815 `#adcda2`               |
| Armenia | 1000 `#cdb1a2` → 1100 `#c87e8e`（ビザンツ従属色）→ 1200 `#cdb1a2`     |

さらに 1279 年は `Ilkhanate` / `Khanate of the Golden Horde` /
`Other Rus Principalities` / `Seljuk Caliphate` の 4 勢力が同一の
`#d194b5`（`Mongol Empire` 従属色）で塗られ、互いに区別できなくなっていた。

## Decision

**確度 B の帰属は、史実の当否ではなく次の 2 条件の連言で採否を決める。両方を
満たすものだけを `propertyFixes` で正規化し、片方しか満たさないものは
known-limitations に記載して現状維持とする。**

1. **宗主名がその年代に勢力として存在しない**（宙に浮いた宗主）。上流の
   `SUBJECTO` / `PARTOF` が指す名前が同年の `NAME` にも他年代の `NAME` にも
   無い状態。この場合、宗主キー（`src/suzerain_extent.ts resolveSuzerainKey`）
   の union は本体の無い外枠を描き、色キーは実在しない勢力の従属色を割り当てる。
   これは解釈の問題ではなくデータの不整合なので、decision-20 の「上流が持つ
   値の誤りの訂正」に当たる。
2. **上流自身が隣接年代で別の表記を使っている**。同じ体制・同じ関係を上流が
   年代ごとに違う書き方で持っている（`Spain` 1600 → `Spanish Habsburg` 1650 /
   1700 → `Spain` 1715 など）。どちらへ寄せるかを史実判断ではなく
   「上流の多数派の表記」で決められるので、decision-23 の条件 2（上書き先は
   上流の語彙に限る）を満たす。

寄せ先は **同年に `NAME` として実在する勢力**に限る。新しい宗主名を作らない
（宙に浮いた宗主を別の宙に浮いた宗主に置き換えない）。同年に実在する適切な
宗主がいない場合は独立（自己参照）へ寄せる。これは TASK-104 の A-3
（ノヴゴロド）・A-4（ブルー／ホワイト・ホルド）で確立した扱いと同じ。

`PARTOF` も同時に書き換える。描画には使われない（`scripts/build-data.ts`
`resolveName` の `NAME` 空時フォールバックのみ）が、`SUBJECTO` とだけ食い違う
値が残ると後続の監査で誤検出の元になる。「宙に浮いた宗主の文字列は全年代の
どのプロパティにも残らない」を回帰テストで固定できる形にしておく。

## Consequences

- TASK-107 は監査 §3 の対象 4 系統（B-1 / B-2 / B-3 / B-4）を**全て採用**した。
  いずれも条件 1・2 の両方を満たす。

  | #   | 対象                                    | 正規化                                                                    |
  | --- | --------------------------------------- | ------------------------------------------------------------------------- |
  | B-1 | 1279 / 1300 の `Mongol Empire` 宗主 6 件 | Ilkhanate・Golden Horde は独立へ、ルーシ諸公国は Golden Horde、ルーム・セルジュークは Ilkhanate へ |
  | B-2 | 1100 `Armenia`                          | `Byzantine Empire` → `Seljuk Empire`                                      |
  | B-3 | 1650 / 1700 の `Spanish Habsburg` 12 件  | Spain は独立へ、属領 5 件は `Spain` へ                                    |
  | B-4 | 1800 `Hanover`                          | `UK` → 独立                                                               |

- B-5（1800 `Algiers` / `Tunis` の `SUBJECTO=Ottoman Empire`）は条件 2 だけを
  満たし条件 1 を満たさない（`Ottoman Empire` は同年に `NAME` として実在する）
  ため、監査どおり **対応しない**。実在した名目的宗主権をどう描くかは解釈の
  問題で、decision-19 の「歴史的に明白」を満たさない。TASK-105 が
  known-limitations の `base-nominal-suzerainty` に記載済み。
  B-4 の同君連合と扱いが違うのは、同君連合がそもそも宗主 - 従属関係ではない
  （王冠が同一人物に帰属するだけで両国は対等）ためで、decision-19 が
  「アンジュー帝国のような複合勢力は補正しない」としている射程に入る。
- 実測した波及: `data/colors.json` は **+7 キー / -12 キー / 7 色入れ替え**。
  ベース名から `Spanish Habsburg` と `Mongol Empire` が消え、
  `Khanate of the Golden Horde` が独立勢力として加わるため、決定的プロービング
  （decision-5）の玉突きで無関係な 7 勢力（Navarre / Netherlands / Nogai Horde
  / Norway / Nothumbria / Novgorod / Astrakhan Khanate）の色が動いた。
  TASK-71 / TASK-86 / TASK-96 / TASK-106 と同じ既知の副作用。
- 色キーが揺れる `NAME` は **30 → 27** に減り、Spain（11 年代）・Hanover
  （4 年代）・Ilkhanate / Khanate of the Golden Horde（2 年代）は全年代で同色に
  なった。同一年代内で別勢力が同色になる衝突は 63 → 64 件と数の上では横ばい
  だが、内訳は改善している（1279 年の 4 勢力同色・1650 / 1700 年の 6 勢力同色・
  1783 / 1880 / 1900 年の Netherlands ＝ Russian Empire が解消し、新たに生じた
  のは地理的に離れた Norway ＝ Sardinia・Navarre ＝ Zayyanid Caliphate）。
- 回帰テストは `scripts/base-properties_test.ts` の
  `EXPECTED_CONSISTENCY_FIXES`、宙に浮いた宗主の全滅を固定する
  「宙に浮いた宗主が全年代のどのプロパティにも残っていない」、色キーの安定を
  固定する「Spain / Hanover の色キーが年代間で一貫する」、巻き込みを検出する
  「確度 B の正規化が対象外の年代・勢力へ波及していない」（B-5 の現状維持も
  ここで固定する）の 4 本。
- TASK-104 が 1700 年の Naples / Sardinia / Sicily に入れた `Spanish Habsburg`
  は本決定に合わせて `Spain` へ変えた。同様に、TASK-106 の `Ryazan` エントリに
  1279 年の宗主是正を同居させている。`applyPropertyFixes` は**上書き前**の
  `NAME` で対象を選ぶ（`props.NAME !== fix.name`）ため、`NAME` を変えた feature
  の他プロパティを後続エントリで直すことはできない。`NAME` 上書きと同じ
  feature への追加の是正は、同一エントリに書く。
- 条件 1 を満たす残りの「宙に浮いた宗主」（監査の検出器 D が挙げた 22 件のうち
  未処理分。例: 1783 / 1800 年の `United Kingdom.SUBJECTO="UK"`、1815 年の
  `Netherlands.SUBJECTO="United Kingdom of Netherlands"`）は、宗主関係の誤り
  ではなく略号・正式名称の表記ゆれなので `renames` の担当領域であり、本決定の
  射程外。別タスクで扱う。
