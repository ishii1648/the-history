---
id: TASK-120
title: フランス王国内の封土をホバー/クリックしてもフランス王国の外枠が表示されない
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 14:45'
updated_date: '2026-07-28 15:57'
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
- [x] #1 仏諸侯領レイヤーの feature を picking したときに宗主キーがフランス王国へ解決され、その外枠が構築されることを検証する再現テストが追加され、修正前は red である
- [x] #2 修正により `deno test` が green になる
- [x] #3 目視確認: 1000/1100/1200/1279/1300 年でフランス王国内の封土をホバー・クリックすると、フランス王国の領土全体が臙脂の外枠で囲まれる
- [x] #4 目視確認: 封土自身の緑青のアクティブ強調と外枠が同時に成立し、どの封土を指しているかの識別が失われない
- [x] #5 フランス以外の勢力（HRE・独立勢力）および仏王権に属さない領邦で、従来の外枠挙動に退行がない
- [x] #6 目視確認: Cliopatria 由来の仏封土（1000/1100/1200 の County of Blôis・Royal Domain of France など）でも同じ外枠が表示される
- [x] #7 Cliopatria 由来の HRE 領邦（1279/1300/1400/1492）で HRE の外枠が従来どおり、または新たに正しく表示される
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 判断が要る点（起票時の調査で 2 経路まで絞られている）

修正には **(a) 仏封土に宗主を与える経路**と **(b) 外枠の対象レイヤー拡張**の両方が
必要。(b) は `EXTENT_SOURCE_LAYER_IDS` への追加で自明だが、**(a) をどちらの
機構でやるかが本体**。

### decision-20 の棲み分けに照らす

decision-20 は「**上流が持っている値が誤っている** → ビルド時の `propertyFixes`
で訂正 / **上流がその関係そのものを欠いている** → ランタイム側の `suzerains` で
追加」と定めている。

OHM 由来の仏封土は `SUBJECTO` / `PARTOF` を**そもそも持たない**（`NAME` /
`ADMIN_LEVEL` / `OHM_RELATION_ID` / `START_DATE` / `END_DATE` のみ）。
これは「関係そのものを欠いている」に当たるので、**decision-20 の字義では
`suzerains` が担当**になる。

### ただし `suzerains` は色にも効く

`data/name-overrides.json` の `suzerains` は `src/suzerain_extent.ts` だけでなく
**`scripts/build-colors.ts` も読む**。仏封土に宗主を足すと `colorKeyFor` の
キーが `NAME` から `NAME|France` に変わり、**諸侯領の配色が全面的に変わる
可能性がある**。これは TASK-71 で決めた諸侯領の見た目（藍紫の細い境界線と
独立した色）を壊しうる。

**着手時にこの波及を実測してから経路を決めること。** 色が変わってしまうなら、
外枠だけに効く経路（`suzerain_extent.ts` 側で解決する第 3 の道）を検討する。

### decision-19 との整合

decision-19 は「宗主補正は**歴史的に明白な関係に限る**」。封土の帰属には自明で
ないものがある（Flanders 伯は仏王の封臣だが帝国側にも領地を持つ、Aquitaine は
1154 年以降アンジュー帝国側）。**判断が割れるものは付与を見送り、理由を
Implementation Notes に残す**。

## 副作用として期待されるもの

`cliopatria-fiefs` を対象レイヤーへ追加すると、`SUBJECTO` を既に持つ
Cliopatria 由来の HRE 領邦（1279/1300/1400/1492）も外枠が出るようになる。
これは望ましい副作用（AC #7）だが、HRE 側の外枠に退行が無いことを確認する。

## 手順（TDD）

1. `suzerains` 経路の色への波及を実測する（`build-colors.ts` を読み、仏封土に
   宗主を足した場合の `colors.json` の差分を試算する）。
2. 経路を決め、根拠を記録する。
3. 再現テストを先に書いて red を確認（AC #1）→ 実装 → green。
4. 目視確認（AC #3・#4・#6・#7）と退行確認（AC #5）。

## 並列化判定（タスク内）

**見送り**（理由: 宗主を与える経路の決定が先で、それが決まらないとデータ側も
表示側も書けない。判断と実装が直列）。

## タスク間並列

なし（`next-tasks` が TASK-120 の単独集合を返した。非 bug の TASK-116 /
TASK-119 / TASK-122 は `src-main` 衝突でスキップ。**TASK-115 の変更により
非 bug も候補として評価されるようになった**が、今回は area が交差した）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 経路の判断（decision-27 に記録）

`suzerains` に封土名を足す案（decision-20 の字義）は**採らなかった**。`suzerains` は `src/suzerain_extent.ts` だけでなく `scripts/build-colors.ts` も読むため、配色への波及を実測した。

| 案 | `"|France"` キー数 / ユニーク色 | 無関係キーの変色 |
| --- | --- | ---: |
| A: `suzerains` に仏封土 33 件を足す | 39 件 → **ユニーク色 1 件**（全部 `#72a176`） | 118 |
| B: A + `France` を `INDEPENDENT_SUBJECT_SUZERAINS` へ | 39 件 → 39 色 | 57 |

案 A は属領規則（宗主国色の明度シフト）が全封土に適用され 33 件が単一色に潰れ、TASK-71 / decision-5 の設計と正面から衝突する。案 B は封土色を保てるが `Kingdom of France|France`（base のフランス本体）の色が変わり、フランスの属領（Algeria・Sardinia・Britany）も宗主色ファミリーから外れる。

代わりに `containingSuzerainKey()` で「その封土を包含する base 勢力」を宗主キーにする経路を採った。優先順は `suzerains` > `SUBJECTO` > 包含する base 勢力。**関係データを 1 つも足さず**、base が既に描いている包含関係を読むだけ。諸侯領は build パイプラインが base の内側を細分して作ったものなので、「包含する base 勢力＝その封土を含む勢力圏」は定義上の帰結にあたる。

## decision-19 に照らした帰属（個別の宗主テーブルは作っていない）

判断の主体を「実装者の史実解釈」から「base が既に描いている帰属」へ移したので、付与リストは存在しない。7 年代 × 全 128 feature の解決結果を実測し、既存 decision と整合することを確認した。

| 封土 | 解決結果 | 整合する既存判断 |
| --- | --- | --- |
| 1200 のアンジュー系（Anjou・Maine・Poitou・Angoulême・Nantes・Alençon・Perche・Gascony） | **Angevin Empire** | decision-19「アンジュー帝国は独立の複合勢力のまま扱う」 |
| 1000/1100 Duchy of Normandy | **自分自身** | TASK-101「臣従礼は名目に留まり宗主補正の基準に当たらない」 |
| Duchy of Brittany（全年） | **France** | 既存 `suzerains` の `Britany → France` を再利用 |
| County of Toulouse（1200） | **France** | base 自身が `SUBJECTO=France` を持つ |
| 1279/1300 Angoulême・Périgord・Armagnac | **England** | 1259 年パリ条約後の英領アキテーヌ |
| その他の仏封土 | **France** | base がフランス王国として塗る領域 |

**判断が割れる封土（Flanders・Aquitaine・Bar 等）に実装者が史実判断を下す必要が生じなかった**のがこの設計の要点で、decision-19 の「出典の無い関係を作らない」を最も強く満たす。

## 検証エビデンス（finalization）

**AC#1（再現テストが red）**: テスト 10 本（synthetic 6 + 実データ回帰 4）を先に追加し 13 件 red を確認（`1000 County of Anjou: null ≠ "France"` 等）→ 実装で green。

**AC#2**: `deno task test` = 1360 passed / 0 failed / 3 ignored（着手前 1350）。`deno fmt --check`（153 ファイル）green、`deno lint` は既存 4 件のみ、`deno task build` green、`deno task verify:smoke` PASS。CI（PR #128）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

**AC#3 / #4（mainagent が独立に目視）**: 1000 年アンジュー伯領のホバーで、封土自身が緑青のアクティブ塗り・フランス王国＋ブルターニュ全体が臙脂の外枠、の**両方が同時に成立**することをスクリーンショットで確認。`extentKey` は `France`。

**AC#5（退行なし）**: 1300 年の base フランスをホバーして `extentKey=France`、1279 年の帝国側で `extentKey=Holy Roman Empire`。subagent 側で 7 年代の base/hre 44〜59 件を全走査し従来どおりの解決を確認済み。

**AC#6**: Cliopatria 由来のフランス王領・ブロワ伯領でも同じフランス外枠が出ることを確認。

**AC#7**: Cliopatria 由来の HRE 領邦（1279 バイエルン公領・1492 ボヘミア王国）で帝国全体の外枠が出る。1279/1300/1400/1492 の全 HRE 領邦を走査して `extentKey=Holy Roman Empire` を確認。

**mainagent が実データで裏取りした最重要の判断**: 1200 年アンジュー伯領の代表点 `(-0.533, 47.499)` は base の `Angevin Empire` の内側にあり、`Kingdom of France`（231,770 km²）には**含まれない**。France の外枠を出すと「封土を囲んでいない外枠」= 表示の嘘になるので、包含する側（アンジュー帝国）を出す設計が正しい。AC#3 の例示は 1200 年も含むが、1200 年のアンジュー伯領は base 上「フランス王国内の封土」ではないため、同年の成立確認はシャンパーニュ伯領で行った。

**`data/` は 1 バイトも変更していない**（`colors.json` 含む）ことを diff で確認。

**性能**: 解決 1 回 0.061ms（1200 年の 19 封土 × 200 回 = 3800 解決で 231ms）。`memoizeLatest` で 1 スロット覚えるため同一封土上の `mousemove` では再計算しない。

## 残す課題（イテレーション末にバッチ起票する）

**base の帰属誤りがそのまま外枠に出る。**1279/1300 年の Artois・Counts of Saint-Pol・Flanders は base が `Holy Roman Empire` として塗るため帝国の外枠が出るが、史実ではアルトワ・サンポルはフランス王領、フランドルもフランドル伯領本体はフランス王の封土。これは外枠機構の問題ではなく base 側の誤りなので、decision-20 に従って `propertyFixes` で正す別タスクとして起票する（TASK-103 の監査の続き）。

**伊諸侯領（`italy-fiefs`）は対象外のまま**（TASK-121）。ただし `FIEF_EXTENT_SOURCE_LAYER_IDS` に 1 行足すだけで同じ機構に載るため、TASK-121 は極めて小さくなる見込み。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
フランス王国内の封土をホバー/クリックしても勢力圏の外枠が出なかった bug を、諸侯領レイヤーの宗主キーを「その封土を包含する base 勢力」で解決する経路（containingSuzerainKey）を追加して直した。原因は外枠の対象レイヤーが powers と hre-powers に限定されていたことに加え、OHM / Cliopatria の仏封土が SUBJECTO をそもそも持たないことの 2 つが重なっていた。decision-20 の字義では suzerains の担当だが、suzerains は build-colors.ts も読むため実測すると仏封土 33 件を足した時点で属領規則により 33 件が単一色に潰れ（|France キー 39 件がユニーク色 1 件・無関係な 118 キーも変色）、TASK-71 / decision-5 の設計と衝突するので採らなかった。代わりに関係データを 1 つも足さず base が既に描いている包含関係を読む経路にした（decision-27）。諸侯領は build パイプラインが base の内側を細分して作ったものなので「包含する base 勢力＝その封土を含む勢力圏」は定義上の帰結にあたる。この設計は判断の主体を実装者の史実解釈から base の帰属へ移すため、帰属が割れる封土（Flanders・Aquitaine・Bar 等）に史実判断を下す必要がなく decision-19 を最も強く満たす。既存 decision もそのまま効き、1200 年のアンジュー系は Angevin Empire・1000/1100 の Normandy は自分自身へ解決する。検証: テスト 10 本を先行追加して 13 件 red → green、deno test 1360 passed / 0 failed（着手前 1350）、fmt --check / lint / build / verify:smoke green、data/ は colors.json 含め 1 バイトも未変更、mainagent が 1200 年アンジュー伯領の代表点が base の Angevin Empire の内側にあり Kingdom of France に含まれないことを実測して設計の正しさを裏取り、実機で緑青のアクティブ塗りと臙脂の外枠が同時成立することを目視、Cliopatria 由来の HRE 領邦で帝国外枠が出ることと base 側の退行が無いことを確認、CI（PR #128）green。残る課題として base の帰属誤り（1279/1300 の Artois・Saint-Pol・Flanders が帝国として塗られる）が外枠にそのまま出る点を別タスクへ送る。
<!-- SECTION:FINAL_SUMMARY:END -->
