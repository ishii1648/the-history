---
id: TASK-6
title: タイムラインスライダー
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:23'
updated_date: '2026-07-21 10:44'
labels: []
dependencies:
  - TASK-5
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
画面下部の離散スライダーで 20 の実在年代を切り替えられるようにする。参照: docs/app-spec.md §5.1
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 目盛りはデータが実在する 20 年代のみで、間の年は選択できない
- [ ] #2 ドラッグ / 目盛りクリック / 前後ボタン / キーボード ← → の全操作で年代を切り替えられる
- [ ] #3 現在年が大きく表示される
- [ ] #4 年代切替時に GeoJSON を fetch（取得済みはメモリキャッシュ）してレイヤーを差し替える
- [ ] #5 切替時に deck.gl の transitions でポリゴンがフェードする
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-6-timeline-slider を origin/main から作成
2. 並列化判定: 見送り（理由: スライダー UI・キーボード操作・transitions は全て src/main.ts と単一 UI コンポーネントに収束し、独立サブ作業に分割すると調整コストが利得を上回る。subagent 1 体に委譲）
3. TDD: 純粋ロジックを先行テスト（red→green）
   - スライダー位置（index）↔ 実在年の変換、範囲クランプ
   - 前後ボタン・キーボード ←→ の次年代決定（端で停止）
   - 目盛り 20 年代のみの生成（SNAPSHOT_YEARS 由来）
4. UI 実装: 画面下部固定のスライダー（目盛り 20 個の離散、間の年は選択不可）、現在年の大型表示、前後ボタン、キーボード ←→。切替は TASK-5 の switchYear（キャッシュ + 最新要求ガード内蔵）を呼ぶだけ
5. deck.gl transitions で getFillColor のフェードを buildPowerLayer に追加
6. 目視確認（mainagent・前面描画はスクリーンショットでフレーム強制）: AC#1 目盛り数と離散性、AC#2 4 操作、AC#3 年表示、AC#4 ネットワークログでキャッシュ確認、AC#5 フェード
7. fmt/lint/test/build green → PR → CI+mergeability 監視 → マージ → マージ後動作確認 → finalization
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実装: src/timeline.ts（純粋ロジック: clampIndex/yearAtIndex/indexOfYear/stepYear/keyToStep）+ src/timeline_test.ts（TDD red→green, 17 tests）。UI は index.html/app.css の下部固定コンテナ + src/main.ts の setupTimeline() で配線（switchYear 経由・fetch 重複実装なし）。AC#5 は buildPowerLayer に transitions:{getFillColor:{duration:400}} を追加。実ブラウザ検証済（localhost:8000）: 20目盛り離散/年40px/next・ArrowRight・slider input・prev の各操作/1279→1200 戻りで再fetchなし=キャッシュ(AC#4)/キーボード二重発火ガード(target=slider は無視)。fmt/lint/test(154 pass)/build 全 green。レビュー・AC確認・finalization は mainagent。
<!-- SECTION:NOTES:END -->
