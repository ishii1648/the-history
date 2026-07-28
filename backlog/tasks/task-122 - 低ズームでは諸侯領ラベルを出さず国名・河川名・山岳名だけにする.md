---
id: TASK-122
title: 低ズームでは諸侯領ラベルを出さず国名・河川名・山岳名だけにする
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 14:50'
updated_date: '2026-07-28 16:29'
labels:
  - 'area:src-labels'
  - 'area:src-main'
dependencies: []
documentation:
  - docs/app-spec.md
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

有力諸侯が多い中世初期（1000〜1300 年）は、TASK-110 の Cliopatria 採用でフランス王国の諸侯領被覆率が 24.9% から 78.5%（1000 年）まで上がり、帝国側もバイエルン・ブランデンブルク・ボヘミアが加わった。その結果、地図を引いた状態（初期 zoom 4）で領邦名ラベルが密集し、全体像が読み取りにくくなっている。

十分にズームインするまでは、地図上の常時ラベルを国名（base 勢力名）だけに絞り、諸侯領・帝国領邦のラベルはズーム段が上がってから出すようにする。

## 対象

`src/main.ts` の memoize 済みラベルデータ構築（`buildLabelData` を base / hre / fief の kind ごとに連結して 1 枚の TextLayer に渡している箇所）に、ズーム段による絞り込みを入れる。`kind` が `hre` / `fief` の datum を、しきい値未満のズーム段では除外する。`kind === "base"` は従来どおり常時表示する。

既にアプリには整数ズーム段（`zoomStep`）による出し分けの前例がある。

- 都市: `src/cities.ts` の `visibleCityRankLimit`（z4 以下・z5・z6・z7・z8 以上で人口上位ランクの上限を段階的に緩める）
- 山脈: `src/mountains.ts` が Natural Erath の MIN_LABEL をアプリのズーム段へ写して出し分ける
- 山峰: `filterVisiblePeaks`

同じ `zoomStep`（`map.on("zoom")` で整数段が変わったときだけ `renderLayers()` を呼ぶ仕組み）に載せる。`MIN_ZOOM` は 4、`MAX_ZOOM` は 8、`INITIAL_ZOOM` は 4。

## 変更しないもの

- **ホバー・クリック時に名前を出す挙動は一切変えない。** picking は `src/picking.ts` の `PICKING_PRIORITY` に従ってポリゴンレイヤーに対して行われ、ラベルレイヤー自体は pickable ではない（TASK-82 でラベルのクリック対象化は検討のうえ見送っている）。したがってラベルを隠しても低ズームで諸侯領をホバー／クリックすれば従来どおりツールチップ・情報パネルに名前が出るはずだが、これは回帰として明示的に確認する
- 河川名ラベルは TASK-69 の決定により既に常時表示をやめ、ホバー／クリック時のみ表示になっている。本タスクで常時表示に戻すことはしない（TASK-69 の巻き戻しになるため）
- 山岳名ラベル（山脈・山峰）は TASK-97 / TASK-99 のズーム別出し分けをそのまま維持する
- 都市ラベルの出し分け（TASK-66）も変更しない

## 実装時に判断する点

- **しきい値をどのズーム段に置くか。** 都市が z5 から段階的に増える設計なので、領邦ラベルもどこか 1 段で全部出すのではなく、面積や priority で段階的に出す案も考えられる。まずは単一しきい値で実機確認し、必要なら段階化する
- **base ラベル抑制との相互作用（重要）。** TASK-78 で、諸侯領にほぼ完全内包される base 勢力（1000〜1300 の Britany など）は二重ラベルを避けるため base 側のラベルを落としている（`suppressedPowerNames` / `excludeSuppressedFeatures`）。諸侯領ラベルを低ズームで隠すと、抑制された base ラベルも出ないため**その土地のラベルが 1 つも無くなる**。抑制をズーム段に応じて解除する（諸侯領ラベルを出していないズーム段では base ラベルを復活させる）必要がある
- **characterSet の扱い。** TextLayer に渡す `characterSet` は `characterSetFrom(data.map((d) => d.text))` で表示中の datum から算出している。ズームで datum を絞ると文字集合が変動し、ズームインした瞬間に未収録グリフが出る／レイヤーが作り直されるおそれがある。全ズーム段の和集合から算出するなど、絞り込み前のテキストで文字集合を作る
- **メモ化キー。** ラベルデータの memoize は現在 year / base / hre / fiefs / ja / dedupe を引数に取っている。`zoomStep` を引数に加える必要がある
- しきい値の定数を `src/labels.ts` に置くか `src/config.ts` に置くか

## 参考

`.outputs/claude/` に実機スクリーンショットを残す場合は、少なくとも 1000 年と 1300 年の zoom 4 / しきい値直前 / しきい値直後の 3 段で比較すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 初期表示（zoom 4）の 1000〜1300 年で、地図上の常時ラベルが国名（base 勢力名）だけになり、諸侯領・帝国領邦のラベルが表示されない（目視確認）
- [x] #2 しきい値までズームインすると諸侯領・帝国領邦のラベルが表示され、従来どおりの色分け（諸侯領=藍紫 / 帝国領邦=臙脂）と衝突処理が働く（目視確認）
- [x] #3 低ズームで諸侯領・帝国領邦をホバーおよびクリックすると、従来どおりツールチップと情報パネルに名前・出典が表示される（目視確認）
- [x] #4 TASK-78 の base ラベル抑制と組み合わせても、諸侯領ラベルを出していないズーム段でラベルが 1 つも無くなる領域が生じない（1000〜1300 年の Britany で目視確認）
- [x] #5 河川名・山岳名・都市名の表示挙動が従来から変わっていない（目視確認）
- [x] #6 ズーム段によるラベル絞り込みが DOM 非依存の純粋関数として切り出され、しきい値の境界（しきい値の 1 段下・しきい値ちょうど）が deno test で固定されている
- [x] #7 ズームイン時に文字が欠ける・豆腐になるなどの characterSet 起因の表示崩れが起きない（目視確認）
- [x] #8 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 方針

`zoomStep` による出し分けの前例（都市 `visibleCityRankLimit`・山脈
`mountainLabelMinZoom`・山峰 `filterVisiblePeaks`）に倣い、`kind` が
`hre` / `fief` のラベル datum をしきい値未満のズーム段で除外する。
`kind === "base"` は従来どおり常時表示。

## 起票時に挙げられた 4 つの落とし穴（いずれも実装時に必ず扱う）

1. **base ラベル抑制との相互作用（最重要）**: TASK-78 で、諸侯領にほぼ完全
   内包される base 勢力（1000〜1300 の Britany 等）は二重ラベルを避けるため
   base 側のラベルを落としている（`suppressedPowerNames` /
   `excludeSuppressedFeatures`）。諸侯領ラベルを低ズームで隠すと**その土地の
   ラベルが 1 つも無くなる**。抑制をズーム段に応じて解除する必要がある。
2. **characterSet**: `characterSetFrom(data.map((d) => d.text))` で表示中の
   datum から算出しているため、ズームで datum を絞ると文字集合が変動し、
   ズームインした瞬間に未収録グリフが出る／レイヤーが作り直される。
   **絞り込み前のテキストで文字集合を作る**。
3. **メモ化キー**: ラベルデータの memoize に `zoomStep` を引数として加える。
4. **しきい値の置き場**: `src/labels.ts` か `src/config.ts` か。

## 変更しないもの（起票時の明記）

- **ホバー・クリックで名前を出す挙動は一切変えない**（ラベル層は pickable では
  なく picking はポリゴンレイヤーに対して行われる）。ただし**低ズームで諸侯領を
  ホバー/クリックすれば従来どおり名前が出ることを回帰として明示的に確認する**
- 河川名ラベル（TASK-69 の決定）・山岳名ラベル（TASK-97 / TASK-99）・
  都市ラベル（TASK-66）の出し分けは変更しない

## 実装時に判断する点

しきい値を 1 段に置くか段階化するか。都市が z5 から段階的に増える設計なので、
面積や priority で段階的に出す案もありうる。**まず単一しきい値で実機確認し、
必要なら段階化する**（起票時の指示）。

## 並列化判定（タスク内）

**見送り**（理由: しきい値の決定・base 抑制の解除・characterSet・メモ化キーは
同じ 1 つのラベルデータ構築の中で相互に依存しており、独立に実装できない）。

## タスク間並列

**あり**。TASK-121（area: src-suzerain-extent / data-base / data-fiefs /
scripts-fiefs / docs）と並列。**TASK-114 の area 細分化と TASK-115 の bug
フィルタ変更が両方効いて、bug（TASK-121）と非 bug（TASK-122）が同じ集合に
入った初のケース**。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## しきい値の決定（実機の描き比べ）

候補 5 と 6 の両方をビルドして描き比べた。

| ズーム | 現行（全部出す） | しきい値 5 | しきい値 6 |
| --- | --- | --- | --- |
| z4 | 諸侯領名で埋まり「フランス」が読めない | 国名のみ・可読 | 国名のみ・可読 |
| z5 | 密集だが全ラベル判読可・情報量あり | 現行と同じ（良好） | **フランス全土が無名ポリゴンのパッチワーク** |
| z6 | — | 正常 | 正常 |

決め手は z5。しきい値 6 だとフランスが色違いの領域に分かれているのが見えるのに名前が 1 つも無い状態になる。目的は「引きすぎた段でラベルを出さない」ことで、寄った段で情報を減らすことではないため **5** を採用。

段階化（面積・priority）は採らなかった。諸侯領は都市の人口のような明確なランクを持たず切り方が恣意的になり、「この段では国名だけ」という読み方の単純さが失われるため。

## 4 つの落とし穴の扱い

**(1) base ラベル抑制との相互作用（最重要）**: 抑制の適用点を「FeatureCollection から落とす」→「**datum に印を付ける**」へ移した。`buildLabelData` に `suppressedNames` を渡して `LabelDatum.suppressed = true` を立て、実際に出すかは `filterPowerLabelsByZoom` が決める。しきい値未満では諸侯領を落とすと同時に抑制を解除するので、**どのズーム段でも 1 つの土地にちょうど 1 つのラベルが載る**。z4〜z8 の全段でループするテストで固定した。

**(2) characterSet**: 上の設計で同時に解決した。datum を落とさず印だけ付けるので `characterSetFrom` に渡るのは絞り込み前の全 datum になる。

**(3) メモ化キー**: 重い方（polylabel を含む `memoizedPowerLabelData`）ではなく、その安定参照を入力に取る軽い絞り込み側（`memoizedVisiblePowerLabels`）に `zoomStep` を置いた。重い方に足すとズーム段が変わるたびに全 feature の polylabel が再計算され TASK-50 の方針に反する。`filterVisibleMountainLabels` と同型。**mainagent の指示（重い方に足す）からの意図的な逸脱**で、挙動は同じで再計算コストだけが下がる。

**(4) しきい値の置き場**: `src/labels.ts`。`config.ts` が持つのは MIN/MAX_ZOOM や年集合のような複数モジュール共有の地図基本設定で、「どの種別のラベルをどの段から出すか」は表示ポリシー。都市が `cities.ts`・山脈が `mountains.ts` に置く先例に倣う。

## 検証エビデンス（finalization）

**AC#1 / #2 — mainagent が独立に実測**:

| 年 | z4 | z5 | z6 | z7 | characterSet |
| ---: | --- | --- | --- | --- | ---: |
| 1000 | base 55 / **hre 0 / fief 0** | base 52 / hre 19 / fief 25 | 同左 | 同左 | **111（全段一致）** |
| 1300 | base 39 / **hre 0 / fief 0** | base 37 / hre 55 / fief 36 | 同左 | 同左 | **112（全段一致）** |

**AC#3（ホバー回帰）**: 1200 年 z4 で諸侯領をホバーし `シュヴァーベン公領 — 神聖ローマ帝国 領` が表示されることを mainagent が確認。ラベル層は `pickable: false` のままなので picking はズーム段に依存しない。subagent 側では before/after でツールチップ（シャンパーニュ伯領・セーヌ川・バール伯領）とクリックパネル（出典 OpenHistoricalMap / CC0-1.0 / 概略）が完全一致することも確認済み。

**AC#4（抑制解除）**: 1000 年 z4 で `["ノルマンディー公領","ブルターニュ","シュヴァーベン公領"]`、1300 年 z4 で `["コルシカ","ブルターニュ"]` が base 色で復活することを debug 出力とスクリーンショットで確認。z5 以上では消えて諸侯領ラベルに戻る。

**AC#5**: 比較画像で都市（ロンドン・パリ・ケルン）・山脈（アルプス・ピレネー・カルパティア）・山峰（モンブラン）の出方が before/after で同一。河川名は従来どおりホバー時のみ。

**AC#6**: `filterPowerLabelsByZoom` / `fiefLabelsVisibleAt` を DOM 非依存の純粋関数として切り出し、しきい値の境界（4 と 5）をテストで固定。

**AC#7（characterSet）**: 上表のとおり全ズーム段で一致（1000 年 = 111・1300 年 = 112）。ズームインしてもフォントアトラスは作り直されない。subagent 側で 1000 年 z6 の日本語グリフに欠け・豆腐が無いことも目視確認。

**AC#8**: `deno task test` = 1373 passed / 0 failed / 3 ignored（着手前 1360）。`deno fmt --check`（153 ファイル）green、`deno lint` は既存 4 件のみ、`deno task build` green。CI（PR #129）`ci: pass`。

## 申し送り（イテレーション末にバッチ起票する）

抑制を datum の印へ移した結果、`src/fief_dedupe.ts` の `excludeSuppressedFeatures` が**未使用の export** になった（`main.ts` からの唯一の呼び出しが消えた）。関数とテストは残っており lint も通るがデッドコードで、「これが抑制の実装だ」と誤読される危険がある。担当ファイル外のため本タスクでは触っていない。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
低ズームで諸侯領・帝国領邦のラベルを出さず国名だけにした（FIEF_LABEL_MIN_ZOOM = 5）。TASK-110 の Cliopatria 採用でフランスの諸侯領被覆率が 24.9% → 78.5%（1000 年）まで上がり初期 zoom 4 でラベルが密集していたのを解消する。しきい値は 5 と 6 の両方をビルドして描き比べ、6 だと z5 でフランスが色違いの領域に分かれているのに名前が 1 つも無いパッチワークになるため 5 を採用した（目的は引きすぎた段でラベルを出さないことで、寄った段で情報を減らすことではない）。段階化は諸侯領に都市の人口のような明確なランクが無く切り方が恣意的になるため見送った。最大の設計点は TASK-78 の base ラベル抑制との相互作用で、諸侯領ラベルを隠すと抑制された base 勢力のラベルも出ずその土地のラベルが 1 つも無くなる。抑制の適用点を FeatureCollection から落とす方式から datum に印を付ける方式へ移し、実際に出すかをズーム段の絞り込みが決める形にしたことで、どのズーム段でも 1 つの土地にちょうど 1 つのラベルが載ることを保証し、同時に characterSet が絞り込み前の全 datum から算出されてフォントアトラスが作り直されない問題も解決した。メモ化キーは重い polylabel 側ではなく軽い絞り込み側に置き（ズーム段ごとの polylabel 再計算を避ける）、しきい値は表示ポリシーなので src/labels.ts に置いた。検証: テスト 12 件を先行追加して red → green、deno test 1373 passed / 0 failed（着手前 1360）、fmt --check / lint / build green、mainagent が z4〜z7 のラベル件数（z4 で hre 0 / fief 0）と characterSet の全段一致（111 / 112）と z4 でのホバー回帰（シュヴァーベン公領 — 神聖ローマ帝国 領）を独立に確認、CI（PR #129）green。
<!-- SECTION:FINAL_SUMMARY:END -->
