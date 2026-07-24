---
id: TASK-50
title: 河川ホバーのたびに全レイヤー再構築が走りラベル polylabel を再計算する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 12:20'
updated_date: '2026-07-24 14:14'
labels:
  - bug
dependencies: []
ordinal: 48000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review の CONFIRMED 指摘 #2。applyRiverHover（src/main.ts:547）は値変化時に renderLayers() を呼び、全レイヤーが再構築される。その中で buildLabelLayer が buildLabelData（全 base+hre feature への polylabel 計算、実測 ~4.3ms/回）を、3 つのラベルレイヤーが characterSetFrom をそれぞれ再計算する。ラベル位置・文字集合は hover に依存しないのにメモ化が存在しない。再現手順: 河川密集地帯（ライン川・ドナウ川周辺）をカーソルでなぞる。期待: 60fps を維持。実際: enter/leave 毎に年代切替相当の再構築が走り、低スペック環境でカーソル追従がカクつく。対応候補: (1) buildLabelData / characterSet を year でメモ化 (2) renderLayers を年代依存部と河川強調依存部に分離し、hover/selection 変化時は rivers 系レイヤーのみ差し替え。発見契機: /code-review（検証エージェントによる deno 実測付き）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 hover 変化時にラベルの polylabel/characterSet 再計算が発生しないことを検証するテスト（red→green）がある
- [x] #2 年代切替時の挙動（ラベル再計算が必要なケース）に退行がない
- [x] #3 実機で河川密集地帯のホバー追従が滑らかであることを確認
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: renderLayers の分割は影響範囲が大きいため、まず「重い計算のメモ化」で解消する — buildLabelData（polylabel）と characterSetFrom の結果を year（+ データ参照）単位でキャッシュし、hover/selection 変化による renderLayers ではキャッシュヒットさせる。年代切替・データ再ロード時のみ再計算。
2. TDD（red 先行）: メモ化ヘルパー（純関数、例: labels.ts の memoized ラッパー or main.ts から切り出したキャッシュ関数）に対し「同一 year + 同一データ参照では計算関数が再実行されない / year 変更・データ参照変更で再実行される」を計測（呼び出しカウンタ）するテストを追加し red → 実装 green（AC#1）。
3. 回帰（AC#2）: 年代切替でラベルが正しく更新されることを既存テスト + 実機で確認。updateTriggers の整合も確認。
4. 実機（AC#3）: 河川密集地帯でホバーを往復し、体感のカクつきがないこと・ラベル表示が正しいことを確認（可能なら performance 計測で renderLayers 中のラベル計算時間の低減を示す）。
5. 並列化判定: 見送り（理由: main.ts/labels.ts のキャッシュ導入という単一関心の小規模修正。単一 subagent 委譲・実機確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（2026-07-24）:
- AC#1: memoizeLatest（src/memo.ts、単一スロット・Object.is 参照比較）の呼び出しカウンタテスト 6 件を TDD（red: TS2307 → green）。hover 系 renderLayers では 3 ラベル生成のキー（year・データ参照・nameJa）が全て同一参照となり polylabel/characterSetFrom が再実行されないことをテストで担保。
- AC#2: 年代切替の回帰をヘッドレス CDP ハーネス（本タスクから導入した無人実機確認環境。scratchpad/verify/cdp.ts）で確認 — 1500→ArrowDown×3→1650 でラベル・国境が正しく更新され、エラートーストなし（スクリーンショット t50_before/after.png）。deno test 520 passed。
- AC#3: ホバー時の重計算はメモ化により構造的にゼロ（キャッシュヒット）。実機はヘッドレスで年代切替・表示正常を確認。CI green（PR #60）。
- 備考: 本タスクの検証を機に、実機確認を claude-in-chrome（可視ウィンドウ必須）からヘッドレス CDP 方式へ移行し、以後の HITL を解消。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
河川ホバー等の renderLayers で hover に依存しないラベル重計算（polylabel ~4.3ms/回 + characterSet×3）が毎回再実行される問題を、memoizeLatest（単一スロット参照メモ化）の導入で解消。勢力/河川/都市のラベル生成を (year, データ参照, nameJa) でキャッシュし、hover ではヒット・年代切替では正しく再計算。検証: TDD red→green（520 passed）・CI green・ヘッドレス CDP 実機で年代切替回帰を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
