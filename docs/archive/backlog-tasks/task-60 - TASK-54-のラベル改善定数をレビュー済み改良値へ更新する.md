---
id: TASK-60
title: TASK-54 のラベル改善定数をレビュー済み改良値へ更新する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 16:01'
updated_date: '2026-07-24 16:33'
labels:
  - 'area:src-labels'
dependencies: []
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: TASK-54（密集地域のラベル視認性改善）は暴走ジョブが中間版の定数（LABEL_BACKGROUND_COLOR alpha 210 / LABEL_BACKGROUND_PADDING [4,3] / COLLISION_SIZE_SCALE 2.2）で finalize し PR #66 として main へマージした。一方、mainagent のレビューを通過した改良版（alpha 200 / [3,2] / 2.6。alpha は下の塗り・境界線の透け、padding は密集地帯でのパネル同士の重なり抑制、sizeScale はズーム 5〜6 でラベルが消えすぎない上限を実測して決めた値。根拠コメント付き）はブランチ worktree-agent-aed8eab35fba74dc8（コミット c0e1a77）に残っている。この改良値と実測根拠コメント・テスト（背景色の暖色系条件 r>=g>=b、padding 上限 <=8px 等）を main に適用する。
発見契機: TASK-54 マージ後のレビュー差分確認（agent-loop 二重実行インシデントの復旧作業中）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/labels.ts の 3 定数が改良値（alpha 200 / padding [3,2] / sizeScale 2.6）と実測根拠コメント付きで更新され、c0e1a77 のテスト強化分が取り込まれている
- [x] #2 deno test が green（既存テスト含む）
- [x] #3 実機スクリーンショット（密集 3 箇所）で TASK-54 の AC 相当の判読性が維持されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. レビュー済み改良版コミット c0e1a77（ブランチ worktree-agent-aed8eab35fba74dc8）から src/labels.ts の 3 定数（LABEL_BACKGROUND_COLOR alpha 210→200 / LABEL_BACKGROUND_PADDING [4,3]→[3,2] / COLLISION_SIZE_SCALE 2.2→2.6）と実測根拠コメント、labels_test.ts のテスト強化分（暖色系条件 r>=g>=b・padding 上限 <=8px 等）を現行 main へ適用する。cherry-pick は main 側が中間版で分岐しているため使わず、diff を精査して手動適用する。
2. TDD: 先に labels_test.ts の強化テスト（改良値を固定する条件）を適用して red を確認 → labels.ts の定数・コメント更新で green。
3. 実機確認（AC #3）: CDP で密集 3 箇所（ライン川デルタ・ケルン・ザクセン）のスクリーンショットを取得し、TASK-54 AC 相当の判読性維持を目視確認。
4. 並列化判定: 見送り（理由: labels.ts と labels_test.ts の対の小変更のみで分割不可）。既存レビュー済み diff の適用が主のため mainagent が直接実装する（docs タスクの直接実装前例に準ずる小規模変更）。
5. deno fmt/lint/test/build green → PR（TASK-60 明記）→ CI green → finalization → マージ → マージ後確認。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
sizeScale の経験的主張の衝突と裁定: 中間版（main 現行 2.2）のコメントは『2.6 では衝突境界ぎりぎりのラベルが低不透明度で常時描画される』とし、改良版（c0e1a77）は 2.6 を推していた。本番ビルドで両値を同一条件（1500 年、z5 全体観・ケルン z7・ザクセン z7、フェード定常化 5 秒待ち）で再比較した結果:
- 2.2: z5 でレク川×ネーデルライン川のラベルが重なり判読不能（TASK-54 の目的に反する退行）。スイス付近のライン川も近接 2 枚。
- 2.6: 重なり解消。副作用（低不透明度のライン川 1 枚）は確認されたが判読可能で軽微。ケルン z7 は全ラベル判読可能。
→ 判読不能な重なりの解消を優先し 2.6 を採用。スクリーンショット: scratchpad verify/t60_s22_*.png（2.2）/ t60_s26_*.png（2.6）。
テストについて: 強化テストは値域（alpha 150..254・padding<=8・sizeScale (2,4]）を固定するもので、中間版の値でも pass するため red→green の TDD 対象ではない（定数チューニングの妥当性は上記実機比較で検証）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/labels.ts の 3 定数を改良値（alpha 200 / padding [3,2] / sizeScale 2.6）と実測根拠コメントへ更新し、c0e1a77 のテスト強化分（暖色系 r>=g>=b・padding<=8px・sizeScale (2,4] の値域固定）を取り込んだ。検証エビデンス: (AC #1) diff で c0e1a77 と同内容を確認、(AC #2) deno test 559 passed / fmt / lint / build green + PR #70 CI green、(AC #3) 本番ビルドの CDP スクリーンショットで密集 3 箇所（z5 全体観・ケルン z7・ザクセン z7）の判読性を確認。sizeScale は 2.2 と 2.6 の経験的主張が衝突していたため本番ビルドで再比較し、2.2 の z5 ラベル重なり（判読不能）解消を優先して 2.6 を採用（裁定と根拠は Notes）。decision 化判定: TASK-54 実装内の定数チューニングでタスク限りのため見送り。
<!-- SECTION:FINAL_SUMMARY:END -->
