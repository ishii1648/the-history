---
id: TASK-110
title: Cliopatria（CC BY 4.0）を第2の領邦データソースとして採用し OHM 欠落年代の空白を埋める
status: To Do
assignee: []
created_date: '2026-07-27 13:34'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:src-main'
  - 'area:docs'
dependencies:
  - TASK-109
references:
  - 'https://github.com/Seshat-Global-History-Databank/cliopatria'
  - 'https://doi.org/10.5281/zenodo.14714684'
  - 'https://www.nature.com/articles/s41597-025-04516-9'
documentation:
  - docs/data-inventory/README.md
ordinal: 103000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

OHM 由来の諸侯領データには年代・地域による大きな欠落があり、たとえば 1000/1100 年のフランスはアキテーヌ公領もトゥールーズ伯領も王領も表示されず王国一枚岩に、1200〜1492 年の帝国はバイエルン公領が一度も表示されない。史実と明らかに異なる地図になっている。

TASK-88 は現代県ポリゴンの union でこれを埋める案を却下し（decision-18）、そのうえで「空白を埋める唯一の整合的な道は出典のあるデータの獲得（OHM への上流貢献・別データセットの調査 = 検討する場合は別タスク）」と記録した。本タスクがその別タスクにあたる。

## 候補データセット（2026-07-27 に実データをダウンロードして実測）

Cliopatria（Seshat Global History Databank）

- ライセンス: CC BY 4.0
- 出典: Bennett, J., Mutch, E., Chalstrey, E. (2024) Cliopatria - A geospatial database of world-wide political entities from 3400BCE to 2024CE. Nature Scientific Data. DOI 10.5281/zenodo.14714684
- 配布: GitHub Seshat-Global-History-Databank/cliopatria の cliopatria.geojson.zip（44MB、展開 165MB、13,765 feature）。Zenodo にもリリース版あり
- スキーマ: Name / FromYear / ToYear / Area / Type（POLITY または RELATION）/ Wikipedia / Wikidata / SeshatID / Components / MemberOf。名前を丸括弧で囲んだ feature は従属政体を含む複合体を表す（例: 1000 年の (Kingdom of France) 420,259km2 は封臣を含む王国全体、Kingdom of France 49,071km2 は王領そのもの）
- 由来と限界: 2014 年に手描きトレースされた歴史地図画像群を Python で自動抽出したもので、0.07 度に平滑化済み。論文自身が「境界は必然的に概略で解釈の余地がある」「過去に遡るほど不確かさが増す」と明記している。複数史料の突き合わせではなく単一系統のデジタイズである点に注意

### 実測した充填内容（仏）

decision-18 が「OHM に該当リレーションが存在しない」と記録した領邦のほとんどを収録している。

- County of Toulouse: 1000 年 21,359km2 / 1100 年 52,864 / 1200 年 52,816
- 王領（単独 feature の Kingdom of France）: 1000 年 49,071 / 1100 年 21,966 / 1200 年 37,024
- Duchy of Aquitaine: 1000 年 106,377 / 1100 年 141,788（OHM は 1137-04-09〜1214-09-28 のみ）
- Duchy of Gascony 1000 年 40,078、County of Auvergne 1279/1300/1400 年 19,408、County of Foix 1279 年 4,515、County of Armagnac 1279 年 6,985、County of Nevers 1100 年 12,490 と 1300 年 13,355
- Blois / Vermandois / Vexin / Rouergue / Perigord / Touraine も収録
- 収録なし: Bourbon

ジオメトリの位置も妥当。1000 年の Duchy of Aquitaine の bbox は -2.21,44.19〜4.36,47.20（ポワトゥー〜リムーザン帯）、Kingdom of France は 1.43,46.09〜5.59,50.58（イル・ド・フランス〜オルレアネ〜シャンパーニュ）。

### 実測した充填内容（帝国）

- Duchy of Bavaria: 1279 年 35,323 / 1300 年 35,301 / 1400 年 47,598 / 1492 年 36,100。OHM 側は 0962-1100 と 1505-1623 のみで 1100〜1505 が完全欠落（帝国 bbox の name:en 一致 174 リレーションを全件確認済み）
- Margraviate / Electorate of Brandenburg: 1279/1300/1400/1492 年（OHM の Electorate of Brandenburg は 1648 年以降のみ）
- Kingdom of Bohemia: 1279/1300/1400/1492 年
- Electorate of Saxony: 1400 年 5,458 / 1492 年 34,252（OHM 側は 1485 年のライプツィヒ分割で切れる）
- 1200 年は収録なし。Cliopatria は 1200 年の帝国を Holy Roman Empire 879,279km2 の一枚岩でモデル化しており内部領邦が 0 件。HRE_FIEF_YEAR_1200_NOTE が記録している 1200 年の帝国中核（バイエルン・ザクセン・フランケン・チューリンゲン）の空白は残る
- ザクセン公領が 1200/1279 年に無いこと自体は 1180 年のゲルンハウゼン裁定による解体を反映しており史実に沿う。後継の Saxe-Wittenberg は 1300 年、Electorate of Saxony(-Wittenberg) は 1400 年に既に表示されている

### 頂点密度

Cliopatria の Duchy of Aquitaine は 69 頂点、OHM 版（1200 年）は 330 頂点。TASK-88 が県合成を却下した理由の 1 つ（頂点密度が周囲の 4 倍で TASK-80 の概略表現と正面衝突する）とは逆に、Cliopatria は 4〜7 倍粗く、src/approximate_borders.ts の「頂点密度が低い区間ほどにじませて薄く描く」表現と整合する。

## 実装時に判断する点

- 年代区間の選択規則。FromYear/ToYear が不規則（1279 年は [1279-1284]、1300 年は [1294-1304]、Duchy of Brittany は [990-1146]）で、スナップショット年に対しどの区間を採るかを決定的に決める必要がある
- 既存レイヤーとの重なりの優先順（OHM 優先か Cliopatria 優先か）。scripts/build-fief-flat.ts の幾何排他化を流用できるか
- 丸括弧付きの複合体 feature と Holy Roman Empire Minor States のような残余カテゴリの扱い（そのまま描くと巨大な塗りが既存レイヤーを覆う）
- ファイル分離の要否（decision-2）。CC BY 4.0 は GPL-3.0 派生とも CC BY-NC-SA とも混合制約が無いが、出典表示の一貫性のため独立ファイルとするか
- ビルド時に 44MB を取得するコストと、コミット固定の方法（GitHub のコミット SHA か Zenodo の DOI か）
- 適用範囲を仏諸侯領に限るか、帝国領邦（バイエルン・ブランデンブルク・ボヘミア）まで広げるか
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Cliopatria 採用の可否と適用範囲が backlog decision として記録されている（判断材料・却下した選択肢・decision-14 および decision-18 との関係を含む）
- [ ] #2 採用する場合: Cliopatria 由来の領邦データがコミットまたは DOI でピン留めされたソースから決定的に生成され、生成ロジックがネットワーク非依存の deno test でテストされている
- [ ] #3 採用する場合: Cliopatria 由来 feature をクリックすると TASK-109 の仕組みで出典（Cliopatria・CC BY 4.0・DOI）が表示され、OHM 由来 feature と区別できる
- [ ] #4 採用する場合: 既存の OHM 由来諸侯領および base 勢力との重なりが排他化され、二重塗りが発生しない（目視確認）
- [ ] #5 採用する場合: 1000/1100 年のフランスにアキテーヌ公領・トゥールーズ伯領・王領が、1279〜1492 年の帝国にバイエルン公領が表示される（目視確認）
- [ ] #6 適用後に残る空白（1200 年の帝国中核、1200/1279 年のザクセン後継領邦、Bourbon 等）が実測値つきで known-limitations.json と docs/data-inventory に記録されている
- [ ] #7 採用する場合: CC BY 4.0 の帰属要件を満たす出典表記がフッターの attribution に追加されている
- [ ] #8 deno test が green
<!-- AC:END -->
