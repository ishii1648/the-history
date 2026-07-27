---
id: TASK-109
title: クリック情報パネルに feature の出典・ライセンス・境界の確からしさを表示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 13:33'
updated_date: '2026-07-27 18:31'
labels:
  - 'area:src-main'
  - 'area:src-info'
  - 'area:data'
  - 'area:docs'
dependencies: []
references:
  - 'https://creativecommons.org/licenses/by/4.0/'
documentation:
  - docs/data-inventory/README.md
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

地図には出典もライセンスも確度も異なる複数系統のデータが同時に載っている（historical-basemaps GPL-3.0 の base 勢力、OpenHistoricalMap CC0 の仏・独・伊諸侯領、Natural Earth の河川・山岳、Reba et al. CC BY 4.0 の都市）。しかし現在のクリックパネルは名前 1 行しか表示していない（src/main.ts の setupInfoUI 内 panelLabel.textContent = label）。どの feature がどのデータセット由来で、その境界がどの程度の確からしさかをユーザが知る手段が無い。

TASK-80 は「全境界は概略」であることを描画（にじませ・薄く）と known-limitations で表現したが、これは地図全体に対する一般的な注意書きであり、個々の feature には紐づいていない。

出典の異なるデータをさらに重ねる（TASK-110 の Cliopatria 採用）ための前提として、feature 単位で出典・ライセンス・確からしさを開示できる仕組みを先に用意する。

## 対象

- クリックパネル（src/info.ts / src/main.ts の setupInfoUI）に、選択した feature の出典（データセット名・ライセンス・取得元・ピン留めコミットまたは DOI）を表示する
- 境界の確からしさの区分を表示する（例: 出典データそのままの境界 / 簡略化・平滑化済み / 概略）
- 各データの生成パイプラインが出典情報を feature または FeatureCollection に持たせる。france_fiefs_* と hre_fiefs_* は既に metadata を持つので、europe_* / italy_fiefs_* / rivers / cities / mountains の現状を確認して揃える
- フッターの attribution（TASK-26）との役割分担を整理する（フッター = 全体の帰属表示、パネル = 選択中 feature の出典）

## 実装時に判断する点

- 出典情報を feature ごとのプロパティに持たせるか、レイヤー ID から出典へのマップを表示層に持たせるか（ファイルサイズと保守性のトレードオフ）
- 確からしさの区分をいくつ設けるか。src/approximate_borders.ts が既に頂点密度から連続的な表現をしているため、離散ラベルとの整合をどう取るか
- 山岳の情報パネル（TASK-100）と表示項目・レイアウトが競合しないか。TASK-100 と同じ area を触るため実装順に注意する
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 勢力・諸侯領をクリックすると、名前に加えてその feature の出典データセット名とライセンスがパネルに表示される
- [x] #2 表示する出典情報は表示層のハードコードに閉じず、データまたはビルド生成物に由来する（出典が変わった場合に追従できる、または追従漏れをテストが検出する）
- [x] #3 境界の確からしさに関する注記が feature 単位で表示され、TASK-80 の概略境界の説明・描画と矛盾しない
- [x] #4 河川・都市・山岳など他の pick 対象をクリックしてもパネルが壊れず、出典欄の有無が適切に切り替わる
- [x] #5 出典表示の整形ロジックが DOM 非依存の純粋関数として deno test でテストされている
- [x] #6 docs/data-inventory/README.md に、パネルへ出す出典情報とデータの対応が記載されている
- [x] #7 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 現状（実測）

| データ | 出典 metadata |
| --- | --- |
| `france_fiefs_*` / `hre_fiefs_*` / `italy_fiefs_*` | **あり**（`metadata`: source / sourceUrl / license / year / featureCount ほか） |
| `europe_*` | **なし**（`index.json` の `source` に repo / commit / license はある） |
| `rivers` / `mountains` / `peaks` | **なし** |
| `cities.json` | `source` に description 等はあるが形式が違う |

諸侯領 3 系統が既に持っている `metadata` の形が事実上の前例なので、これに揃える。

## データ契約（サブ作業をまたぐ唯一の取り決め）

各 FeatureCollection の **`metadata`** に少なくとも次を持たせる。既存フィールドは温存する。

| キー | 型 | 意味 |
| --- | --- | --- |
| `source` | string | データセット名（パネルに出す表示名） |
| `sourceUrl` | string | 取得元 URL |
| `license` | string | ライセンス識別子（`GPL-3.0` / `CC0-1.0` / `CC-BY-4.0` / `Public Domain` 等） |
| `commit` | string（任意） | ピン留めコミット。無い場合は省略 |
| `borderPrecision` | string（任意） | 境界の確からしさの区分。**区分の設計は データ側の担当**（AC #3） |

`cities.json` は GeoJSON ではないので、同じキーを持つ `metadata` を別途持たせる。

**表示側はこの `metadata` を汎用に描画する**（`source` / `license` / `sourceUrl` /
`commit` / `borderPrecision` があれば出す、無ければ出さない）。区分の語彙を
表示側にハードコードしないことで、データ側が語彙を変えても表示側が壊れない。

## 並列化判定（タスク内）

**並列化する（subagent 2 本を worktree isolation で起動）**。上のデータ契約を
先に確定したことで、生成側と表示側が互いのファイルに触れずに進められ、
どちらも独立にテストできるため（TASK-99 で同じ形が機能した）。

| 担当 | 触るファイル | 成果物 |
| --- | --- | --- |
| A: データ | `scripts/build-*.ts` / それらのテスト / `data/` の生成物 / `docs/data-inventory/README.md` | 全データへの `metadata` 付与（AC #2・#6）と境界の確からしさの区分設計（AC #3） |
| B: 表示 | `src/info.ts` / `src/info_test.ts` / `src/main.ts` / `app.css` | パネルの出典表示（AC #1・#4）と整形の純粋関数（AC #5） |

B は A の生成物を待たず、契約どおりのフィクスチャに対して実装・テストする。
`docs/app-spec.md` は**両者とも触らない**（mainagent がレビュー時にまとめて書く）。
実機確認は両者の成果を統合してから mainagent が行う。

**TASK-100 との競合に注意**（AC の「実装順に注意」）: TASK-100 は既にマージ済みで
山岳のパネル表示（山脈 = 名称のみ / 山峰 = 名称 + 標高）が入っている。B は
`peakPickLabel` / `mountainPickLabel` の既存表示を壊さず、出典欄を足す形にする。

## タスク間並列

なし（`next-tasks` が TASK-109 の単独集合を返した）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（勢力・諸侯領で出典とライセンスが出る）**: mainagent がヘッドレス CDP で実データをクリックして確認した。

| クリック対象 | 出典 | ライセンス | 境界 | コミット |
| --- | --- | --- | --- | --- |
| ブルターニュ公領 / ノルマンディー公領 / アキテーヌ公領 | OpenHistoricalMap | CC0-1.0 | 史料に基づく復元（概略。測量された境界ではない） | （なし） |
| フランス王国 / ポーランド・リトアニア | historical-basemaps (aourednik) | GPL-3.0 | 概略（出典が全境界を概略と宣言） | `62d8f1a` |
| モンブラン | Natural Earth | Public Domain (Natural Earth) | **（行なし）** | `ca96624` |

**AC#2（ハードコードに閉じない・追従漏れを検出）**: `scripts/build-attribution.ts` の `DATA_ATTRIBUTIONS` は値を持たず既存のビルド定数（`SOURCE_COMMIT` / `RIVERS_SOURCE_COMMIT` / `OHM_SOURCE_LICENSE` / `HRE_SOURCE_DOI` 等）を束ねるだけで重複定義ゼロ。テストが 4 層で検出する: (a) 全データファイルの metadata と定数の一致、(b) `src/` の URL 定数から辿ったランタイムが実際にロードする全ファイルに出典があること、(c) `getDataCopyTargets` の全ファイルが出典を持つか理由付きの除外リストに載ること、(d) 「出典が全境界を概略と宣言」を名乗るファイルの `BORDERPRECISION` が実際に 1 だけであること。

**AC#3（境界の確からしさが feature 単位で表示され TASK-80 と矛盾しない）**: 4 区分（概略〈出典が全境界を概略と宣言〉/ 概略〈出典は確定境界を含むが簡略化により数 km の近似〉/ 史料に基づく復元 / 現代地形の簡略化）。どの区分も「概略」を含むか「歴史的境界ではない」と明示し精度の主張を含まないことをテストで固定した。

**AC#4（他の pick 対象で壊れず出典欄の有無が切り替わる）**: 山峰は「境界」欄なし（点データに区分を与えていない）、勢力・諸侯領は 3〜4 行、metadata を持たないデータでは出典ブロックごと非表示になり従来の名前 1 行に戻る。表示側のテストは metadata が `undefined` / `null` / 非オブジェクト / 契約キーを 1 つも持たない場合まで網羅。

**AC#5（DOM 非依存の純粋関数）**: `src/info.ts` の `sourceLines(metadata: unknown): SourceLine[]`。入力を `unknown` にして、呼び出し側がコレクションの `metadata` をそのまま渡せる形にした。テスト 13 ケース。

**AC#6（docs への記載）**: `docs/data-inventory/README.md` に §1.1 を新設（126 行）。キー定義表 / データ系統別の実値表 / 4 区分の根拠 / `BORDERPRECISION` 実測分布表と TASK-80 の説明との関係 / パイプライン実行順 / 出典を付けないファイルと理由。

**AC#7**: `deno task test` = 1298 passed / 0 failed / 3 ignored（着手前 1266）。`deno fmt --check`（151 ファイル）green、`deno lint` は既存 4 件のみ、`deno task build` green。CI（PR #124）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

**非破壊の確認**: `popover-overflow` チェック PASS、標準スモーク PASS。TASK-100 の山岳表示（山峰 = 名称 + 標高 / 山脈 = 名称のみ）は維持。生成物の差分は **81 ファイルすべて metadata のみ**（`features` を HEAD 版と突き合わせて確認）。

## 並列実装で見つかった落とし穴（最重要）

表示側の subagent が **「アプリが実際にロードするのは派生ファイル」**という事実を発見し、mainagent が実行中のデータ側へ中継した。

- 元ファイル `data/france_fiefs_1200.geojson` には source metadata が**あった**
- しかしアプリは `franceFiefDataUrlFor` → `/data/france_fiefs_flat_*`（派生）を読む
- `build-fief-flat.ts` / `build-fief-dedupe.ts` が自前のビルド metadata を書く際に **source / license を落としていた**

元ファイルにだけ metadata があっても AC#1 は達成できない。これは並列分割の境界（データ側 =「データに metadata を付ける」/ 表示側 =「metadata を描画する」）の狭間に落ちていた問題で、片方が気づいてもう片方に伝わらなければ「テストは通るが実機で空欄」という形で残っていた。派生側にも伝播させ、ランタイムが実際に読む全ファイルに出典があることをテスト (b) で固定した。

## TASK-80 の前提が部分的にしか成り立っていなかった

`src/approximate_borders.ts` のコメントは「採用データは全 feature の `BORDERPRECISION` が 1」としているが、実測すると**中世〜近世前半でのみ正しい**。

| 年代 | 分布 |
| --- | --- |
| 900〜1530 | 全件 1 |
| 1600 | 1:71 / 3:2 |
| 1650〜1715 | 3 主体 |
| 1783〜1914 | 3（1880 に 2 が 1 件） |

base の区分を 2 つに分け、混在ファイル（1600 等）は**精度を過大に主張しない側**へ倒した。TASK-80 のにじみ描画は全年に掛かる（`memoizedApproximateBorderData`）ので「線は概略」という結論は同じで、違うのは理由だけ。区分は定数ではなく `basePrecisionOf` がファイルの中身から決めるので、上流の宣言が変わっても追従する。

## mainagent が加えた変更

`docs/app-spec.md` §5.2 に出典表示の節を追加（出す 4 行と順序・表示層が語彙を解釈しないこと・欠けている行を出さないこと・点データに境界欄が付かない理由・コミットの 7 桁短縮・`.info-panel` にも TASK-117 と同じ高さ上限を入れたこと）。並列担当の衝突を避けるため両者に触らせず、統合時に mainagent が書いた。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
クリックパネルに feature 単位の出典（出典 / ライセンス / 境界の確からしさ / コミット）を表示できるようにした。各 FeatureCollection の metadata に出典を持たせ（scripts/build-attribution.ts が既存のビルド定数を束ねて付与する独立最終段）、src/info.ts の純粋関数 sourceLines が整形してパネルへ出す。表示層は語彙を解釈せず汎用に描画するので、境界の確からしさの区分をデータ側が増やしても表示側の変更は要らない。欠けている項目の行は出さないため metadata を持たないデータでもパネルは壊れない。実装はデータ側と表示側の 2 サブ作業に分けて subagent を worktree isolation で並列起動した。その過程で表示側が「アプリが実際にロードするのは派生ファイル（*_flat_* / base_fill_*）で、build-fief-flat.ts / build-fief-dedupe.ts が自前のビルド metadata を書く際に元ファイルの source / license を落としている」ことを発見し、mainagent が実行中のデータ側へ中継して伝播させた。元ファイルにだけ metadata があっても AC#1 は達成できず、これは並列分割の境界の狭間に落ちていた問題だった。あわせて TASK-80 のコメント「全 feature の BORDERPRECISION が 1」が中世〜近世前半でのみ正しいことが実測で判明し（1650〜1715 は 3 主体）、base の区分を 2 つに分けて混在ファイルは精度を過大に主張しない側へ倒した。検証: 両側とも TDD で red → green、deno test 1298 passed / 0 failed（着手前 1266）、fmt --check / lint / build green、生成物の差分は 81 ファイルすべて metadata のみ、mainagent がヘッドレス CDP で諸侯領（OHM / CC0-1.0）・勢力（historical-basemaps / GPL-3.0）・山峰（Natural Earth / 境界欄なし）をクリックして出典が feature 単位で切り替わることを確認、popover-overflow と標準スモークも PASS で TASK-100 / TASK-117 の非破壊を確認、CI（PR #124）green。
<!-- SECTION:FINAL_SUMMARY:END -->
