---
id: TASK-78
title: 諸侯領と重複する base 勢力の二重輪郭・二重ラベルを解消する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 09:02'
updated_date: '2026-07-26 10:25'
labels:
  - bug
  - 'area:app'
  - 'area:data'
dependencies: []
modified_files:
  - src/main.ts
  - src/labels.ts
priority: high
type: bug
ordinal: 73000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘（2026-07-26 / 1200 年・フランス周辺のスクリーンショット）: 諸侯領オーバーレイのある年代（1000〜1300）で、同じ土地に base（europe_*）と fief（france_fiefs_*）の輪郭が二重に走り、ラベルも二重に出る。画像では「ブルターニュ」（base）と「ブルターニュ公領」（fief）が別々のラベル・別々の輪郭で描かれ、半島の内側にもう 1 本境界線が入っている。

事前調査で判明していること（要検証・鵜呑みにしない）:
- fief ポリゴンの内部を走る base 境界線の総延長（1200 年・実測）: Duchy of Brittany 1,813 km（内訳は Angevin Empire 820 km / Britany 792 km / Kingdom of France 201 km）、Duchy of Aquitaine 689 km、Duchy of Normandy 669 km、Duchy of Gascony 360 km、County of Bar 331 km、County of Champagne 164 km、County of Poitou 118 km。
- ブルターニュは 0.05 度格子で「base Britany のみの領域 0 km2 / fief Duchy of Brittany のみ 18,633 km2 / 共通 22,394 km2、IoU 55%」。base 側は fief に完全内包されており、粗い版の同一実体が重ねて描かれている状態。
- 解像度差が二重に見える主因: base（historical-basemaps）は画像域のセグメント中央値 17.1 km、fief（OHM）は 4.2 km。
- 描画は src/main.ts の renderLayers で powers の直上に france-fiefs を重ねている（TASK-71）。線色は base が焦茶 LINE_COLOR [92,61,34,190] / 1px、fief が藍紫 [74,42,130,220] / 1.5px。
- ラベルは src/main.ts の buildLabelLayer が base + hre + fief を 1 枚に束ねており、base と fief が同一実体でも別ラベルとして出る。

想定される対処の方向（実装時に比較検討し、プランに根拠を記録すること）:
- 名寄せ表を持ち、諸侯領オーバーレイのある年は重複する base 側のラベルを抑制する
- 諸侯領のある年だけ base の境界線 alpha / 線幅を下げる
- ビルド時に base から fief union を difference して、fief に覆われた領域の base 輪郭自体を消す（サイズ上限と、諸侯領が欠落している地域を削らない配慮が要る）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1000〜1300 年で、諸侯領に内包される base 勢力（Britany など）のラベルが二重に表示されない
- [x] #2 諸侯領の内側を走る base の境界線が視認上目立たなくなっている（線を描かない、または alpha を下げる）
- [x] #3 諸侯領オーバーレイの対象外の年代（900・1400 以降）の見た目が従来から変わらない
- [x] #4 重複判定に使う対応表（または判定ロジック）が単体テストで検証される
- [x] #5 1000・1100・1200・1279・1300 年を目視確認し、二重輪郭・二重ラベルが解消していることを確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 対処方式の比較検討（実装冒頭で確定し notes に根拠を記録）: 候補は (a) 名寄せ/内包判定表による base ラベル抑制 + base 境界線の減衰、(b) 諸侯領のある年だけ base 線スタイル一律減衰、(c) ビルド時に base ジオメトリから fief union を difference。方向性としては (a) を本命とする: ビルド時に fief union による base 勢力の被覆率を計算した対応表（data/ に JSON 生成）を作り、ランタイムで該当 base のラベル抑制・境界線減衰に使う。(c) は諸侯領欠落地域を削るリスクとビルド複雑化、(b) は非重複 base（例: Kingdom of France 本体）まで巻き添えにするため原則回避。
2. TDD: (i) ビルド時被覆率判定（閾値・対象年）の単体テスト、(ii) ランタイム側（ラベル束ね buildLabelLayer / 線スタイル）が対応表に従い抑制することのテストを先に書き red を確認。
3. 実装: scripts/（ビルドパイプライン）で対応表生成 → src/labels.ts / src/main.ts で 1000〜1300 のみ抑制を適用。900・1400 以降は完全に従来どおり（AC#3）。TASK-77 の layer_stack.ts 分配ルール（decision-15）を壊さない。
4. 全チェック green → CDP で 1000/1100/1200/1279/1300 年 + 900/1400 年（回帰）のスクリーンショットを取得し目視確認（AC#5, #3）。
5. PR 作成（TASK-78 明記）→ CI 監視 → finalization（方式選択が data 設計に及ぶ場合は decision 記録を判定）→ マージ → マージ後回帰確認。

並列化判定: 見送り（理由: ビルド時対応表の出力形式がランタイム抑制ロジックの入力仕様であり、両者が直列依存する。ファイル競合も src/main.ts に集中するため単一 subagent に委譲する）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
採用方式: ビルド時派生データ 2 系統。(1) ラベル = fief union による被覆率表 data/fief-dedupe.json（閾値 0.9、実測分布の空白帯 0.52〜1.00 の中間）で勢力単位に抑制、(2) 境界線 = fief union の外側に切り出した data/base_outline_<year>.geojson を powers の stroke の代わりに描画。却下案: 被覆率のみでの線減衰（deck accessor が feature 単位のため部分重複勢力の内部線を消せない）、base ジオメトリの difference（諸侯領欠落地域を削るリスク）。

検証エビデンス:
- AC#1: headless CDP スクリーンショット（1000/1100/1200/1279/1300 年・フランス周辺 zoom6）で base 側ラベル（ブルターニュ等）の二重表示が消え fief ラベルのみ表示されることを目視確認。
- AC#2: 同スクリーンショットで諸侯領内部を走る base 境界線が描かれないことを確認（base-outlines は fief union 外側のみの LineString）。
- AC#3: 900 年・1400 年のスクリーンショットで base ラベル・輪郭が従来どおり表示されることを確認。派生データが無い年は従来描画に縮退する実装。
- AC#4: scripts/build-fief-dedupe_test.ts（被覆率・切り出し・turf lineSplit 交差 0 件の regression）、src/fief_dedupe_test.ts、src/powers_test.ts、src/layer_stack_test.ts で単体テスト。TDD で red 確認後 green（コミット 8724292）。
- AC#5: 1000/1100/1200/1279/1300 の 5 年代を mainagent が CDP で目視確認済み。
- 全チェック: fmt/lint clean、deno test 738 passed、build green、verify:smoke PASS（picking 回帰なし）、PR #87 CI green。
- decision 記録判定: 新規 decision なし。レイヤー重ね順は decision-15 の枠内（base-outlines を水面下グループへ登録）、抑制方式はタスク限りの実装意図として本 notes とコンテキストコミットに記録。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
1000〜1300 年の base 勢力と諸侯領の二重輪郭・二重ラベルを、ビルド時派生データ（被覆率表 fief-dedupe.json によるラベル抑制 + fief union 外側に切り出した base_outline_<year>.geojson による境界線差し替え）で解消。base の塗り・picking は不変、対象外年・データ欠落時は従来描画に縮退。TDD で 41 テスト追加（deno test 738 passed）、CDP で 5 年代の解消と 900/1400 年の回帰なしを目視確認、CI green（PR #87）。
<!-- SECTION:FINAL_SUMMARY:END -->
