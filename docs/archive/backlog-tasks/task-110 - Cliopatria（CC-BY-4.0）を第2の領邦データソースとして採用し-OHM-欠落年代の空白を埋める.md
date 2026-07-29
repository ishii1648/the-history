---
id: TASK-110
title: Cliopatria（CC BY 4.0）を第2の領邦データソースとして採用し OHM 欠落年代の空白を埋める
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 13:34'
updated_date: '2026-07-27 19:38'
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
- [x] #1 Cliopatria 採用の可否と適用範囲が backlog decision として記録されている（判断材料・却下した選択肢・decision-14 および decision-18 との関係を含む）
- [x] #2 採用する場合: Cliopatria 由来の領邦データがコミットまたは DOI でピン留めされたソースから決定的に生成され、生成ロジックがネットワーク非依存の deno test でテストされている
- [x] #3 採用する場合: Cliopatria 由来 feature をクリックすると TASK-109 の仕組みで出典（Cliopatria・CC BY 4.0・DOI）が表示され、OHM 由来 feature と区別できる
- [x] #4 採用する場合: 既存の OHM 由来諸侯領および base 勢力との重なりが排他化され、二重塗りが発生しない（目視確認）
- [x] #5 採用する場合: 1000/1100 年のフランスにアキテーヌ公領・トゥールーズ伯領・王領が、1279〜1492 年の帝国にバイエルン公領が表示される（目視確認）
- [x] #6 適用後に残る空白（1200 年の帝国中核、1200/1279 年のザクセン後継領邦、Bourbon 等）が実測値つきで known-limitations.json と docs/data-inventory に記録されている
- [x] #7 採用する場合: CC BY 4.0 の帰属要件を満たす出典表記がフッターの attribution に追加されている
- [x] #8 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 位置づけ

TASK-88 が「空白を埋める唯一の整合的な道は出典のあるデータの獲得」と記録し
（decision-18 で県ポリゴン合成を却下）、その別タスクとして起票されたもの。
**採用可否と適用範囲の判断（AC #1）が本体**で、採用するなら実装まで行う。

起票時に実データをダウンロードして充填内容を実測済み（タスク説明参照）。
判断材料は揃っているので、残る判断は主に次の 3 点。

1. **適用範囲**: 仏諸侯領に限るか、帝国領邦（バイエルン・ブランデンブルク・
   ボヘミア・ザクセン）まで広げるか
2. **年代区間の選択規則**: `FromYear`/`ToYear` が不規則（1279 年は
   [1279-1284]、1300 年は [1294-1304]、Duchy of Brittany は [990-1146]）。
   スナップショット年に対しどの区間を採るかを**決定的に**決める必要がある
3. **複合体・残余カテゴリの扱い**: 丸括弧付き feature（例:
   `(Kingdom of France)` = 封臣を含む王国全体）や
   `Holy Roman Empire Minor States` をそのまま描くと巨大な塗りが既存レイヤーを
   覆う

## データ契約（サブ作業をまたぐ唯一の取り決め）

- 生成物: `data/cliopatria_fiefs_<year>.geojson` と、アプリが読む派生
  `data/cliopatria_fiefs_flat_<year>.geojson`
  （**TASK-109 の教訓: アプリが読むのは flat の方。metadata は両方に載せる**）
- properties: 既存 fief（`france_fiefs_*` 等）と同型
- `metadata`: TASK-109 の契約に従う。`source` = Cliopatria を示す名、
  `license` = `CC BY 4.0`、`commit` に GitHub SHA か DOI、`borderPrecision` は
  データ側が決める（論文自身が「境界は必然的に概略で解釈の余地がある」と
  明記しているのでそれを反映する）
- 配信 URL の定数と対象年代の配列を `src/` から参照できる形で公開する

## 並列化判定（タスク内）

**並列化する（subagent 2 本を worktree isolation で起動）**。上の契約を先に
確定したことで、生成側と表示側が互いのファイルに触れずに進められるため
（TASK-99 / TASK-109 で機能した形）。

| 担当 | 触るファイル | 成果物 |
| --- | --- | --- |
| A: データ + 判断 | `scripts/` / `data/` / `docs/data-inventory/` / `backlog/decisions/` | 採用可否の decision（AC #1）・生成スクリプトとテスト（AC #2）・排他化（AC #4 のデータ側）・残る空白の記録（AC #6） |
| B: 表示 | `src/` / `index.html`（attribution のみ） | レイヤー追加・picking・重ね順（AC #3・#4 の表示側）・CC BY 4.0 の帰属表記（AC #7） |

`docs/app-spec.md` は**両者とも触らない**（mainagent が統合時に書く）。
実機確認（AC #4・#5）は統合後に mainagent が行う。

**TASK-109 の教訓を両者に渡す**: アプリが実際にロードするのは派生ファイルで、
元ファイルにだけ metadata があっても出典表示は成立しない。

## タスク間並列

なし（`next-tasks` が TASK-110 の単独集合を返した）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（採用可否と適用範囲の decision）**: decision-26。採用し、用途を「OHM の欠落を埋める補完」に限定（OHM が同じ領邦を同じ年代で収録していれば常に OHM を優先）。decision-14 / decision-18 との関係も明記した。

**AC#2（決定的な生成とネットワーク非依存テスト）**: GitHub コミット SHA `ad28a691…`（v0.2.0）+ アーカイブの SHA-256 で毎回検証。`deno task build-cliopatria-fiefs` を 2 回流して 7 ファイルすべてがバイト単位で一致することを確認済み。`scripts/build-cliopatria-fiefs_test.ts` は 21 件でネットワーク非依存。

**AC#3（出典表示で OHM と区別できる）**: TASK-109 の仕組みで追加実装ほぼなしに成立。実機で `出典 Cliopatria (Seshat Global History Databank) / ライセンス CC BY 4.0 / 境界 史料地図のデジタイズ（概略。手描き地図の自動抽出を 0.07 度で平滑化）/ コミット DOI` を確認。

**AC#4（二重塗りが発生しない）**: `cliopatria_flat × {france,hre,italy}_flat / europe_flat` の残存重なりは最大 **0.034 km²**（既存レイヤー同士は 0.004〜0.074 km² なので同水準）。例外は 1000/1100 年の Vermandois × Lower Lotharingia の 1.83 km²（丸めで生じた 1 点接触のくびれを解いた副作用。Vermandois の 0.01%・差し渡し 1.3 km）。上限 8 km² の不変条件テストで恒久監視。`build-fief-dedupe.ts` の union にも追加して `europe_flat` / `base_outline` を再生成（外すと 1400/1492 のバイエルン下に base 塗りが残る）。

**AC#5（充填の目視確認）**: mainagent がヘッドレス CDP で確認。1000 年のフランスにアキテーヌ公領・ガスコーニュ公領・王領・シャンパーニュ伯領・ヴェルマンドワ伯領が表示され、以前の「王国一枚岩」が解消。1400 年に Duchy of Bavaria / Kingdom of Bohemia / Margraviate of Brandenburg、1492 年に Duchy of Bavaria / Electorate of Brandenburg / Electorate of Saxony / Kingdom of Bohemia が配信・表示されることを確認。

**AC#6（残る空白の記録）**: `data/known-limitations.json` に新規 3 件（`cliopatria-fiefs-precision` / `hre-fiefs-1200-core-missing` / `hre-fiefs-saxony-successors-1200-1279`）、既存 3 件も Cliopatria 前提に書き換え。`docs/data-inventory/README.md` §3.11 に実測値つきで記録。最大の空白は **1200 年の帝国中核 507,304 km²（帝国の 81.3%・被覆率 18.3% → 18.7% とほぼ動かない）**。

**AC#7（CC BY 4.0 の帰属表記）**: `index.html` の attribution に OHM の直後・地図の直前で追加。表記は `Cliopatria (Seshat Global History Databank) — Bennett, J., Mutch, E., Chalstrey, E. et al. (2025)「Cliopatria: A geospatial database of world-wide political entities from 3400BCE to 2024CE」Scientific Data（CC BY 4.0）`、リンクは DOI。

**AC#8**: `deno task test` = 1341 passed / 0 failed / 3 ignored（着手前 1298）。`deno fmt --check`（153 ファイル）green、`deno lint` は既存 4 件のみ、`deno task build` green。CI（PR #125）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

## 充填効果（実測。decision の裏づけ）

| 年 | 勢力 | OHM のみ | +Cliopatria |
| ---: | --- | ---: | ---: |
| 1000 | フランス王国 | 24.9% | **78.5%** |
| 1100 | フランス王国 | 26.2% | **78.4%** |
| 1200 | フランス王国 | 47.7% | **77.9%** |
| 1200 | トゥールーズ伯領 | 4.2% | **54.1%** |
| 1279 | 神聖ローマ帝国 | 16.7% | **30.9%** |
| 1300 | 神聖ローマ帝国 | 18.8% | **32.4%** |
| 1400 | 神聖ローマ帝国 | 27.0% | **45.8%** |
| 1492 | 神聖ローマ帝国 | 27.3% | **50.6%** |
| 1200 | 神聖ローマ帝国 | 18.3% | 18.7%（**変化なし**） |

## 上流の品質問題を 1 件検出して不採用にした

`County of Touraine`（1279/1300）。bbox が `0.90〜2.60E・45.56〜46.55N` でトゥール（0.69E・47.39N）を含まず、リムーザン〜マルシュ地方を覆う。OHM の `County of La Marche` と 7,272 km²（この feature の 73%）重なり、排他化後は 5 つの破片に砕ける。`properties.Wikipedia` は `Touraine` なので上流のジオメトリ側の取り違えと判断。**名前と土地が一致しない feature を足すのは空白のままより悪い**ため除外し、分類 `upstreamPlacementMismatch` として根拠を記録した。

同種の検査を収録した全 feature に実施し、他は名前どおりの位置にあることを確認済み（1279/1300 年の `County of Auvergne` の北仏 594 km² 飛び地はブーローニュ伯位を兼ねたオーヴェルニュ伯家の所領、1400 年の `Duchy of Bavaria` のオランダ側 4,700 km² はバイエルン＝シュトラウビング家のホラント領で、いずれも史実に沿う）。

## テスト期待値の変更を mainagent が独立に検証した

データ側から `src/approximate_borders_test.ts:293` の固定座標差し替えを依頼された。期待値を変える変更は実装の退行を隠す方向に働きうるので、mainagent が実データで次を確認してから入れた。

- 消えた区間の中点 `(1.82668, 44.67682)` が `cliopatria_fiefs_flat_1200` の `County of Toulouse` に**含まれる**
- 旧 `base_outline_1200`（origin/main 版）には当該区間が**存在した**
- 置き換え候補 `[5.34626,44.06078]〜[5.34626,45.09594]`（114.5 km 垂直線）が新しい `base_outline_1200` の**最強段（very-long）に実在する**
- Burgandy ↔ HRE の 1 本は**残存**

再生成の不具合ではなく諸侯領オーバーレイに覆われて base 輪郭から切り出された、という説明どおり（TASK-86 と同型）。

## 並列作業での連携

表示側が「Cliopatria レイヤーには仏諸侯領と帝国領邦が同居するので、レイヤー一律の色だと凡例が破れる」ことに気づき feature 単位の出し分けを実装した。これはデータ側の `SUBJECTO` の綴りに依存するため mainagent が実行中のデータ側へ確認を中継し、`"Holy Roman Empire"` で既存 `hre_fiefs` と完全一致することを実データで確認した。TASK-109 で経験した「テストは通るが実機で空欄」型の取りこぼしを、今回は事前に潰せた。

## mainagent が加えた変更

`docs/app-spec.md` §5.2 に TASK-110 の節を追加（用途の限定・独立レイヤーにした理由・feature 単位の色分けが要る理由・残る空白の記録先）。並列担当の衝突を避けるため両者に触らせず、統合時に mainagent が書いた。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Cliopatria（Seshat Global History Databank・CC BY 4.0）を第 2 の領邦データソースとして採用し、OHM 由来の諸侯領の欠落を埋めた（decision-26）。用途は「OHM の欠落を埋める補完」に限定し、OHM が同じ領邦を同じ年代で収録していれば常に OHM を優先する（Cliopatria の境界は 0.07 度平滑化で頂点密度が OHM の 1/4〜1/7）。decision-14 / decision-18 が禁じるのは「出典を持たない座標の合成」で、県 union を却下した理由は座標の出所ではなく編集判断が形状の主要部分を決めることだったのに対し、Cliopatria は上流の座標をそのまま使い頂点を 1 つも作らず、選別が年代区間の包含判定と静的許可リストだけで決まり変種が存在しないため抵触しない。適用は仏 17 領邦（1000/1100/1200/1279/1300）+ 帝国 4 領邦（1279/1300/1400/1492）。丸括弧付きの複合体・家門・Holy Roman Empire Minor States（1279 年 518,669 km² の残余カテゴリ）は不採用。上流の品質問題も 1 件検出し、County of Touraine（bbox がトゥールを含まずリムーザン〜マルシュを覆い OHM の La Marche と 73% 重なる）を除外した。レイヤーは独立させる（1 つの FeatureCollection に 2 出典を混ぜると TASK-109 の出典パネルが読む metadata が 2 出典・2 ライセンスを主張し CC BY 4.0 の帰属要件を満たせない）。Cliopatria レイヤーには仏諸侯領と帝国領邦が同居するため、色はレイヤー一律ではなく SUBJECTO ?? PARTOF === "Holy Roman Empire" で feature ごとに出し分ける（一律だと 1400/1492 で Cliopatria 由来のバイエルンだけ藍紫・隣の OHM 由来領邦は臙脂という凡例の破れが同一画面に出る）。充填効果は 1000 年フランス 24.9% → 78.5%、1200 年トゥールーズ伯領 4.2% → 54.1%、1492 年帝国 27.3% → 50.6%。1200 年の帝国は 18.3% → 18.7% とほぼ動かず 507,304 km²（帝国の 81.3%）の空白が残るため known-limitations と docs に実測値つきで記録した。検証: 両側とも TDD で red → green、deno test 1341 passed / 0 failed（着手前 1298）、fmt --check / lint / build green、再生成の決定性をバイト一致で確認、残存重なり最大 0.034 km²（上限 8 km² のテストで恒久監視）、mainagent がヘッドレス CDP で 1000 年フランスの充填と 1400/1492 年のバイエルン表示・出典パネルの切り替わりを確認、テスト期待値の変更（approximate_borders_test の固定座標）も実データで消失理由まで検証してから適用、CI（PR #125）green。
<!-- SECTION:FINAL_SUMMARY:END -->
