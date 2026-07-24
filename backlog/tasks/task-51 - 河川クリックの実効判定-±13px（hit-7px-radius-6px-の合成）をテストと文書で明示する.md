---
id: TASK-51
title: 河川クリックの実効判定 ±13px（hit 7px + radius 6px の合成）をテストと文書で明示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 12:20'
updated_date: '2026-07-24 14:26'
labels:
  - bug
dependencies: []
ordinal: 49000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review の CONFIRMED 指摘 #3。TASK-36 の半径再ピック（resolveClickInfo → pickMultipleObjects radius=6）と TASK-43 のヒットライン層（±7px）は二重機構として正しく合成され実効 ±13px を成す（radius 経路は 7〜13px 帯を担いデッドコードではない）。しかしこの合成挙動はどのテストも検証しておらず、コメントにも 7+6=13 の関係が明示されていない。RIVER_HIT_LINE_WIDTH_PX か PICKING_RADIUS_PX の一方だけを変更すると合成範囲が暗黙に変わるが既存テスト（rivers_test = hit 幅のみ、picking_test = 優先選択ロジックのみ）は破れない。対応: 合成範囲を検証するテストの追加と、src/main.ts / picking.ts / rivers.ts の該当コメントに両定数の相互参照と 7+6=13 の関係を明記。発見契機: /code-review。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 合成実効範囲（hit 半幅 + radius）を検証するテストが追加され、片方の定数変更で失敗する
- [x] #2 3 ファイルのコメントが両定数の関係を相互参照している
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TDD（red 先行）: 合成実効範囲を表す導出定数（例: picking.ts に RIVER_CLICK_TOLERANCE_PX = RIVER_HIT_LINE_WIDTH_PX / 2 + PICKING_RADIUS_PX として export、値 13）とその検証テストを追加。テストは「導出式が両定数から構成されること」と「現在値で 13 になること」を検証し、片方の定数変更で必ず落ちる構造にする（red は導出定数未実装の状態で確認）。
2. コメント整備: src/main.ts（resolveClickInfo / PICKING_RADIUS_PX）・src/picking.ts・src/rivers.ts（RIVER_HIT_LINE_WIDTH_PX）の該当コメントに hit 半幅 + radius = 実効クリック許容の関係と相互参照を明記。
3. ゲート + 実機: deno fmt/lint/test/build green。挙動変更なしのため実機はヘッドレス CDP でスモーク（河川クリックが従来どおり動作）のみ。
4. 並列化判定: 見送り（理由: テスト 1 件 + コメント整備の小規模作業。単一 subagent 委譲）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（2026-07-24）:
- AC#1: RIVER_CLICK_TOLERANCE_PX = RIVER_HIT_LINE_WIDTH_PX / 2 + PICKING_RADIUS_PX（= 13）を rivers.ts に導出 export として追加し、値と導出式の両方を検証するテスト 2 件を TDD（red: TS2305 → green）。PICKING_RADIUS_PX は main.ts から picking.ts へ移設（挙動不変）し単体テスト可能に。片方の定数変更で必ずテストが落ちる構造。
- AC#2: main.ts（resolveClickInfo）・picking.ts・rivers.ts のコメントに hit 半幅 + radius = 実効許容 ±13px の関係と相互参照（定数名）・TASK-36/43/49 の経緯を明記。
- ゲート: deno test 522 passed・fmt/lint/build green・CI green。ヘッドレス CDP スモークで河川クリック（ヴィスワ川中心線）→ パネル「ヴィスワ川」・エラートーストなしを確認（挙動不変）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
河川クリックの実効許容 ±13px（透明ヒットライン半幅 7px + radius 再ピック 6px の合成）を、導出定数 RIVER_CLICK_TOLERANCE_PX とその検証テストで固定し、3 ファイルのコメントに相互参照として明文化。片方の定数だけ変更すると暗黙に合成範囲が変わる問題を構造的に防止。検証: TDD red→green（522 passed）・CI green・ヘッドレス CDP スモークで挙動不変を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
