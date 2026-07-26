---
id: TASK-77
title: 勢力・諸侯領ポリゴンをベースマップの水面より下に描画し海へのはみ出しを隠す
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 09:01'
updated_date: '2026-07-26 09:49'
labels:
  - bug
  - 'area:app'
dependencies: []
modified_files:
  - src/main.ts
  - src/basemap.ts
priority: high
type: bug
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘（2026-07-26 / 1200 年・フランス周辺のスクリーンショット）: 勢力ポリゴンと諸侯領ポリゴンの塗りが海岸線を越えて海にはみ出し、逆に陸側では塗りが届かず海色の隙間が見える。アキテーヌ北西岸（ジロンド北の細い隙間）とブルターニュ半島先端で顕著。

事前調査で判明していること（要検証・鵜呑みにしない）:
- 0.1 度格子 14,820 点のサンプリング（陸判定は Natural Earth 50m land / ピン留めコミット ca96624a56bd078437bca8184e78163e5039ad19、範囲は西経 5.5 度〜東経 10 度・北緯 43〜52.5 度）で、europe_1200.geojson は「陸なのに勢力ポリゴン未被覆」0.9%（92/10,817 点 ≈ 7,700 km2）、「海なのに被覆」2.9%（117/4,003 点 ≈ 9,800 km2）。
- france_fiefs_1200.geojson は 0.05 度格子で塗り面積の 5.9%（≈ 15,900 km2）が海上にかかる。
- 原因はベースマップ（Protomaps / OSM の現代海岸線・メートル級）と政治ポリゴン（historical-basemaps は画像域のセグメント中央値 17.1 km、OHM は同 4.2 km）が別々の海岸線を持つこと。データ側で海岸線を一致させるのは解像度差が大きく現実的でない。
- src/main.ts:371 の MapboxOverlay は既に interleaved: true で生成されている。deck.gl のレイヤー prop beforeId で MapLibre スタイルの水面レイヤーより下に差し込めば、海へはみ出した塗り（合計 ≈ 2.5 万 km2）は水面ポリゴンに覆われて見えなくなる。
- 陸側の抜け（0.9%）はこの方法では解消しない。目立つ場合の扱いは別タスク（概略境界の表現 / known-limitations）に委ねる。
- ベースマップのスタイル定義は src/basemap.ts。water レイヤーの id は実装時に実スタイルから確認すること（Protomaps テーマのレイヤー名に依存するためハードコードの前に存在確認が要る）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 powers / france-fiefs / hre-powers の 3 レイヤーがベースマップの水面ポリゴンより下に描画され、海上にはみ出した塗りが見えない
- [x] #2 河川ライン・河川ヒット層・都市マーカー・各種ラベルは従来どおり水面より上に描画され、隠れない
- [x] #3 ホバー・クリックの picking 優先順（PICKING_PRIORITY）が従来と変わらない
- [x] #4 ベースマップのスタイルに対象の水面レイヤー id が存在しない場合でも例外を投げず、従来の描画順にフォールバックする
- [x] #5 1200 年（フランス西岸・ブルターニュ）と 1815 年で目視確認し、海にはみ出した塗りが解消していることを確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/basemap.ts の実スタイルから水面ポリゴンレイヤーの id を確認する（Protomaps テーマ依存のためハードコード前に存在確認。取得はランタイムのスタイル定義 or ビルド時定数のどちらが安全か実装時に判断）。
2. TDD: deck.gl レイヤー構築ロジックについて、(a) powers / france-fiefs / hre-powers の 3 ポリゴンレイヤーに水面レイヤー id が beforeId として付与される、(b) 河川・都市・ラベル系レイヤーには付与されない、(c) 水面レイヤー id がスタイルに存在しない場合は beforeId なし（従来描画順）にフォールバックし例外を投げない、を検証するテストを追加し red を確認する。
3. 実装: MapboxOverlay は interleaved: true 済み（src/main.ts:371）なので、対象 3 レイヤーに beforeId を指定して水面より下に差し込む。PICKING_PRIORITY・ホバー/クリック挙動は変更しない。
4. 全チェック green（fmt/lint/test/build）→ 既存 verify:smoke で picking 回帰確認。
5. 目視 AC#5: ヘッドレス CDP で 1200 年フランス西岸（ブルターニュ・ジロンド）と 1815 年のスクリーンショットを取得し、海へのはみ出し解消を確認する。
6. PR 作成（TASK-77 明記）→ CI 監視 → finalization → マージ → マージ後回帰確認。

並列化判定: 見送り（理由: 変更が src/main.ts のレイヤー構築 1 箇所に集中し、テスト・実装・目視確認が同一変更に直列依存するため独立サブ作業に分割できない。単一 subagent に委譲する）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: buildPowerLayer で 3 層に underWaterBeforeId（beforeId=water）を付与。headless CDP スクリーンショット（1200 年ブルターニュ・ジロンド、1815 年西欧）で海上のはみ出しが水面に隠れることを目視確認。
- AC#2: layer_stack_test.ts で河川・都市・ラベル系に beforeId が付かないことをテスト。CDP スクリーンショットで河川ライン（ロワール・セーヌ等）・都市マーカー・全ラベルの描画健在を確認。
- AC#3: PICKING_PRIORITY・イベント処理は無変更（beforeId は MapLibre 挿入位置のみ変更、deck picking 順に影響しない）。verify:smoke の河川クリックで infoPanelLabel=ライン川を確認（回帰なし）。
- AC#4: underWaterBeforeId は water 不在のスタイルで undefined を返し例外を投げない（layer_stack_test.ts で検証）。OpenFreeMap フォールバック時は styledata once で組み直し。
- AC#5: 1200 年（ブルターニュ半島先端・ジロンド北岸）と 1815 年のスクリーンショットで目視確認済み（mainagent が CDP で実施）。
- TDD: layer_stack_test.ts を先に追加し red を確認してから実装で green（実装 subagent 報告・コミット a26eb44）。
- 全チェック: deno fmt --check / lint（repo 管理ファイル clean）、deno test 697 passed、deno task build 成功、PR #86 CI green。
- 実装で判明した制約（ラベル全滅と overlaid 分離）は decision-15 に記録。副作用: 内水面が政治ポリゴンの塗りに染まらなくなる（許容）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
政治ポリゴン 3 層（powers / france-fiefs / hre-powers）に deck.gl の beforeId を付与してベースマップ水面ポリゴンの直下へ差し込み、海岸線の解像度差による海へのはみ出し（≈2.5 万 km²）を水面に覆わせて解消した。beforeId の実在検証とフォールバック（AC#4）、CollisionFilterExtension との干渉によるラベル全滅の根本原因特定とラベル 3 層の overlaid 分離を含み、重ね順の分配ルールを src/layer_stack.ts に一元化（decision-15）。TDD（red→green）で 11 テスト追加、deno test 697 passed、CDP で 1200/1815 年の目視確認・picking 回帰なしを検証、CI green（PR #86）。
<!-- SECTION:FINAL_SUMMARY:END -->
