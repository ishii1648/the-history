---
id: TASK-44
title: 河川のベースマップ描画と picking 対象ジオメトリの乖離でクリック位置がずれる
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-22 15:12'
updated_date: '2026-07-22 18:01'
labels:
  - bug
dependencies: []
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-36 のマージ後動作確認（実機・Chrome）で発見。ベースマップ（Protomaps basemap タイル）が描画する詳細な河川ラインと、deck.gl の pickable な河川ジオメトリ（Natural Earth 50m、data/rivers.geojson）は経路が場所により大きく乖離する（実測: zoom 6 のヴィスワ川北部で最大約 200 CSS px）。ユーザーが目視でクリックするのはベースマップ側の川であるため、乖離が大きい区間では TASK-36 の radius 優先ピック（6px）でも命中しない。再現手順: dev サーバで ?year=1500&zoom=6&center=19.0,52.0 を開き、ヴィスワ川の河口付近（グダニスク湾側）のベースマップ上の川筋をクリックする。期待: 河川が選択される。実際: 勢力ポリゴンが選択される。発見契機: TASK-36 の実機調査（backlog/tasks/task-36 の Implementation Notes 参照）。対応候補: (1) deck の河川ラインを視覚的に太く/濃くして「クリックすべきライン」を明示する (2) 高解像度の河川データ（NE 10m 等）への差し替え (3) ベースマップの waterway 描画の抑制。いずれもトレードオフの検討が必要。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 再現手順が実機で確認され、乖離の大きい代表区間が記録されている
- [ ] #2 対応方針が決定され、選定理由が記録されている（decision 化の要否判定を含む）
- [ ] #3 実装により乖離区間でも河川がクリックで選択できることを実機確認、または対応不要の判断が記録されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針決定（調査済み）: ベースマップの川ライン（water_river / water_stream）は src/basemap.ts の BASEMAP_LAYER_IDS が明示採用している残存デコイ（TASK-24 で河川表示・picking は deck 側へ移行済み）。これを採用リストから除外し、ユーザーが見る川 = クリックできる川（deck NE50m）に一本化する。湖・海（water ポリゴン）・海岸線は維持。併せて deck 河川の通常線幅 RIVER_LINE_WIDTH_PX を 2→3 に引き上げ、唯一の川表示としての視認性を確保する。NE10m 差し替え案は見送り（10m でもベースマップと完全一致せず、デコイ根絶にならない。作業量 M とサイズ増も不利）。TASK-36 の resolveClickPick / radius 6 はそのまま有効。
2. TDD（red 先行）: src/basemap_test.ts に「BASEMAP_LAYER_IDS が water_river / water_stream を含まない」テスト、src/rivers_test.ts に「RIVER_LINE_WIDTH_PX >= 3」テストを追加し red を確認 → 実装で green。既存テスト（採用レイヤー列挙）の期待値も更新。
3. docs 更新: docs/app-spec.md §2.2 の「地形・海岸線・河川だけを描画」の記述を「河川は deck オーバーレイで描画（ベースマップの川ラインは除外）」に整合させる。src/basemap.ts の設計コメントも更新。
4. 実機確認: dev サーバでベースマップ川ラインが消え、deck 河川（3px）のみ表示・クリックで選択されることを確認（AC#3）。乖離区間（ヴィスワ川河口付近）の再現手順で確認（AC#1 の代表区間記録）。
5. finalization で decision 記録: 「ベースマップの水系ライン描画を廃止し河川表示を deck オーバーレイへ一本化」はタスク横断の表示方針変更のため backlog decision create で記録（AC#2）。
6. 並列化判定: 見送り（理由: basemap.ts / rivers.ts の定数変更 + テスト + docs の小規模一体作業で、ファイル競合なく分割できる独立サブ作業がない。単一 subagent に委譲、実機確認は mainagent）。
<!-- SECTION:PLAN:END -->
