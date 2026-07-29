---
id: TASK-83
title: 河川の河口未到達を NE 全体の仕様として known-limitations に一般化する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 10:56'
updated_date: '2026-07-26 11:04'
labels:
  - 'area:data'
dependencies: []
priority: low
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-76 の横断検査（docs/data-inventory/rivers-continuity-audit.md）で、幅の広い河口部・潟を海として扱いセンターラインを引かないのは Natural Earth 全体の一貫した仕様であり、Elbe 固有の欠落ではないことが判明した（Oder 14.584E・Loire -1.743E ほか、終端はいずれも ne_50m_coastline に接する。10m 版でも補完不能を実測）。現在の data/known-limitations.json の rivers-elbe-estuary-missing はエルベ限定の記述になっているため、NE 全体の仕様として一般化し、同様の河川（ロワール・オーデル等）にも当てはまる旨へ文言を修正する。

発見契機: TASK-76（全河川の端点・連続性の横断検査）の調査結果。decision-14（出典なき座標合成はせず known-limitations 明示）の適用範囲を正しく伝えるための文言修正であり、ジオメトリの変更は含めない。

参考: data/known-limitations.json、scripts/known-limitations-json_test.ts（キーワード検証テストの文言追従が必要）、docs/data-inventory/README.md §9/§10、docs/data-inventory/rivers-continuity-audit.md。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 known-limitations の該当エントリが Elbe 限定ではなく NE ソース全体の仕様として記述され、代表例（エルベ・ロワール・オーデル）に言及している
- [x] #2 scripts/known-limitations-json_test.ts の文言検証が新記述に追従して green である
- [x] #3 docs/data-inventory/README.md §9 の記述が更新されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TDD: scripts/known-limitations-json_test.ts の文言検証（キーワード）を新記述（NE 全体仕様・エルベ/ロワール/オーデル言及）に合わせて先に更新し red を確認。
2. data/known-limitations.json の rivers-elbe-estuary-missing を Elbe 限定から NE ソース全体の仕様として一般化（id は維持し、参照整合を壊さない）。
3. docs/data-inventory/README.md §9 の記述を更新し、rivers-continuity-audit.md への参照を維持。
4. 全チェック green → CDP で制限パネルの表示文言を確認 → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 文言修正 1 件とテスト追従のみの小規模タスクのため）。
タスク間並列: next-tasks の集合判定により TASK-79（area:app,scripts）と並列実行（本タスクは area:data で互いに素）。worktree isolation で衝突回避。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: data/known-limitations.json の rivers-elbe-estuary-missing を NE ソース全体の仕様として一般化（エルベ 9.78E・ロワール -1.74E・オーデル 14.58E を明記、id・ジオメトリ不変）。headless CDP で制限パネルに新文言が year=1000/1500 で表示・active を確認。
- AC#2: scripts/known-limitations-json_test.ts のキーワード検証を新記述へ追従（TDD: red『text が ロワール に言及していない』→ green）。deno test 774 passed。
- AC#3: docs/data-inventory/README.md §9 を新文言に同期し rivers-continuity-audit.md §3.2 へのリンクを追加。§10 のエルベ実測表は TASK-75 の一次記録として維持。
- 全チェック: fmt/lint/test/build green、PR #90 CI green。decision 記録判定: 新規なし（decision-14 の適用範囲の文書化のみ）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
known-limitations の河口未到達エントリを Elbe 限定から NE ソース全体の仕様（ロワール・オーデル等も同様・補完不能）として一般化。TDD で文言検証を追従（774 passed）、CDP でパネル表示を確認、CI green（PR #90）。
<!-- SECTION:FINAL_SUMMARY:END -->
