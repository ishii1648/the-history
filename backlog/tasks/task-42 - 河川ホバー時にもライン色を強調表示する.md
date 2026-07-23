---
id: TASK-42
title: 河川ホバー時にもライン色を強調表示する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-22 15:04'
updated_date: '2026-07-23 14:32'
labels: []
dependencies:
  - TASK-36
ordinal: 41000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望: 現在、河川のライン強調（太線・濃色 #0288d1、src/rivers.ts の riverLineColor/riverLineWidth）はクリックによる選択状態（selectedRiverName）のみに基づいており、ホバーしただけでは色・太さが変わらない（TASK-29 でホバー時のツールチップ表示は実装済みだが、ライン自体の見た目は変化しない）。ホバー中の河川についても色・太さを際立たせる表示を追加する。クリック選択時の強調（確定選択、TASK-24/TASK-36）とは別状態として扱い、両者が視覚的に区別できるとなお良い（例: ホバー中は中間的な強調、クリック選択中は最も強い強調）。実装の手がかり: src/main.ts の handlePickHover で picking 結果から河川 feature を判定し、ホバー中の河川名を保持するモジュール状態（例: hoveredRiverName）を追加、buildRiversLineLayer の getLineColor/getLineWidth アクセサに選択状態と合わせて反映する。ホバー解除（picking なし・別レイヤーへの移動）で通常表示に戻すこと。TASK-36（クリック強調が反映されないバグ）の原因究明・修正を前提とし、その修正結果を踏まえて実装する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 河川ライン上にホバーすると、その河川の色・太さが通常表示より強調される
- [ ] #2 ホバー解除（別の場所へのホバー移動・ホバー対象なし）で通常表示に戻る
- [ ] #3 クリックによる選択強調（TASK-24/36）とホバー強調が併存する場合に矛盾なく表示される（クリック選択中の河川をホバーしても選択強調が消えない等）
- [ ] #4 純粋ロジック（色・太さ決定関数）にテストがあり deno test が green
- [ ] #5 実機確認でホバー強調・クリック強調・両解除のいずれも正しく動作する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TDD（red 先行）: src/rivers.ts の色・太さ決定関数を「selected / hovered / 通常」の 3 状態対応に拡張（例: riverLineColor(name, selectedName, hoveredName) / riverLineWidth 同様）。仕様: 選択中 = 最強調（現行 #0288d1 / 4.5px）、ホバー中（未選択）= 中間強調（選択色より薄い強調色 / 3.5px 程度）、選択中の河川へのホバーは選択強調を維持（AC#3）。この純関数のテストを先行追加し red 確認 → 実装で green（AC#4）。
2. 配線: src/main.ts に hoveredRiverName モジュール状態を追加し、handlePickHover で rivers picking 時に更新・それ以外で null 化、変化時のみ renderLayers()。rivers レイヤーの getLineColor/getLineWidth と updateTriggers に hover 状態を反映。ホバーは直下 pick のまま（TASK-36 の設計判断どおり radius 補正はクリック限定。判定範囲の拡大は依存タスク TASK-43 のスコープ）。
3. 品質ゲート: deno fmt --check / lint / test / build 全 green。
4. 実機確認（AC#5）: ホバー強調（中間色）・ホバー解除で復帰・クリック選択との併存（選択中ホバーで選択強調維持・別河川ホバーで両表示）を実機で確認。
5. 並列化判定: 見送り（理由: rivers.ts の純関数拡張と main.ts の配線が密結合した小規模修正で、独立サブ作業に分割できない。単一 subagent 委譲・実機確認は mainagent）。
<!-- SECTION:PLAN:END -->
