---
id: TASK-29
title: 河川ホバー/クリック時に河川名を国名・都市より優先して表示する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 14:35'
updated_date: '2026-07-21 15:50'
labels:
  - 'area:src-main'
dependencies:
  - TASK-24
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望: TASK-24 で河川クリック時の強調表示と情報パネルへの河川名表示は実装済みだが、ホバー時には河川名が表示されない（ホバーツールチップは勢力ポリゴン専用）。河川のライン上にホバーした際も河川名（日本語表記、name-ja.json 適用）をツールチップ表示すること。さらに、河川ラインは勢力ポリゴンの上に重なっているため、ホバー/クリックの picking で河川と勢力（国名）の両方がヒットしうる位置では、河川を優先してツールチップ・情報表示に出すこと。TASK-27（主要都市マーカー）が実装された際も同様に、都市マーカーより河川を優先する（優先順位: 河川 > 都市 > 国名）。実装の手がかり: TASK-24 で河川イベントは Deck レベル onHover/onClick に集約済み（src/main.ts）。ホバー時は線の細さを考慮し pickingRadius による判定余裕を確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 河川のライン上にホバーすると河川名（日本語表記）がツールチップ表示される
- [ ] #2 河川と勢力ポリゴンが重なる位置でのホバー/クリックでは河川名が国名より優先して表示される
- [ ] #3 河川から外れた位置では従来どおり勢力ポリゴンのツールチップ・情報表示が動作する（既存挙動の非退行）
- [ ] #4 優先順位のロジック（河川 > 都市 > 国名）が純粋関数として実装され単体テストがある
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 現状確認: TASK-24 の Deck レベル onHover 集約（pickedLabel）により、河川ライン上のホバーで河川名ツールチップは既に表示され、レイヤー順（powers → hre → cities → rivers）により picking も河川優先になっている見込み。まず現挙動をコードとブラウザで検証し、AC#1〜3 の充足状況を確定する。
2. 優先順位の明示化（AC#4）: レイヤー順に暗黙に埋まっている picking 優先（河川 > 都市 > 国名）を純粋関数として src/picking.ts（または main.ts から分離した小モジュール）に切り出す。案: PICKING_PRIORITY 定数（レイヤー ID の優先順リスト）と、renderLayers のレイヤー配列順を導出/検証する純粋関数 orderLayerIdsByPickingPriority、および複数 picking 候補から最優先を選ぶ selectPreferredPick を実装し、renderLayers・pickedLabel から参照する。テストで「河川 > 都市 > 国名」の順序と、レイヤー配列順との整合を固定する。
3. ホバー時の判定余裕: 既存 pickingRadius 6px の妥当性をブラウザで確認し、細線でのホバーが実用的であることを検証（不足なら調整）。
4. 並列化判定（タスク内）: 見送り（理由: src/main.ts と新規小モジュールの密結合な小規模変更で、独立にテスト可能な分割単位がない。単一 subagent に委譲）。
5. TDD（red→green）→ fmt/lint/test/build green → 目視確認（河川ホバーのツールチップ・重なり位置での河川優先・河川外での勢力ツールチップ非退行）→ PR → CI → finalization → マージ
<!-- SECTION:PLAN:END -->
