---
id: TASK-91
title: 河川のクリック（選択）時のライン色をホバー時と同じ色に揃える
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 15:00'
updated_date: '2026-07-26 15:21'
labels:
  - 'area:src-rivers'
dependencies: []
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
河川ラインは現在、通常 / ホバー / 選択の 3 状態を色と線幅で表している（`src/rivers.ts`）。

- 通常: `RIVER_LINE_COLOR` = 青灰 #7a949e / 3px
- ホバー: `RIVER_HOVERED_LINE_COLOR` = 濃い青灰 #4a6a7a / 3.75px
- 選択: `RIVER_SELECTED_LINE_COLOR` = 赤茶 #7a2e22（app.css の --wax）/ 4.5px

TASK-73 で選択だけ色相を赤茶へ振ったが、クリックで色相が変わる挙動をやめ、
クリック（選択）時もホバー時と同じ色（濃い青灰 #4a6a7a）で強調するようにしたい、
というユーザー要望。色を揃えるのは色のみで、線幅の 3 段階（3 / 3.75 / 4.5px）は
現状維持とし、選択とホバーの区別は線幅で残す。

対象は `riverLineColor`（`src/rivers.ts`）が返す色の定義。`main.ts` は
`riverLineColor` 経由で色を得ているため呼び出し側の変更は不要な見込み。
`RIVER_SELECTED_LINE_COLOR` を残して値をホバー色に揃えるか、定数自体を
ホバー色へ集約するかは実装時に判断する（既存テストが定数名を参照している点に
注意）。

補足（要検討事項）: 選択とホバーが同色になると、色相の違いで「選択済みかどうか」を
判別できなくなり、区別は線幅 3.75px vs 4.5px の差のみに依存する。要望どおり実装
するが、目視確認で選択状態が判別しづらい場合は線幅差の拡大を別途検討する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 河川にホバーしたときと河川をクリック（選択）したときで、ライン色が同一になる
- [x] #2 riverLineColor の単体テストが、選択時に返る色がホバー時の色と等しいことを検証している
- [x] #3 線幅は従来どおり通常 3px / ホバー 3.75px / 選択 4.5px の 3 段階を維持し、riverLineWidth のテストが green
- [x] #4 deno test が green
- [x] #5 実機（ブラウザ）で河川をホバー・クリックし、色が同一で線幅のみ変化することを目視確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TDD: riverLineColor の選択時の色 = ホバー色をテストで先に固定し red 確認（AC#2）。線幅 3 段階の既存テスト維持（AC#3）。
2. 実装: RIVER_SELECTED_LINE_COLOR の値をホバー色 #4a6a7a に揃える（定数名は既存テスト・参照の互換を確認して維持する方向）。
3. CDP でホバー・クリックの色同一・線幅のみ変化を目視確認（AC#5）→ PR → CI → finalization。判別性が悪ければ線幅差拡大の followup を報告（本タスクでは要望どおり実装）。

並列化判定（タスク内）: 見送り（理由: 定数 1 箇所の変更 + テスト追従の小規模タスク）。
タスク間並列: TASK-88・90 と並列（area:src-rivers は互いに素）。worktree isolation。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1/#2: RIVER_SELECTED_LINE_COLOR を [74,106,122,255]（ホバー色 #4a6a7a）へ変更し、riverLineColor の選択時 = ホバー時をテストで検証（定数一致 + 関数出力一致の両方）。TDD red（[122,46,34,255] vs [74,106,122,255] の AssertionError）→ green。
- AC#3: 線幅定数・riverLineWidth は無変更で 3 段階（3/3.75/4.5px）維持、既存テスト green。
- AC#4: deno test 929 passed。fmt/lint/build green。
- AC#5: headless CDP でライン川をクリック選択し、濃い青灰のまま赤茶が出ないことをスクリーンショットで確認（verify:smoke PASS）。
- 補足: 選択/ホバーの識別が線幅 0.75px 差のみになる点は要望どおり。判別性が問題になれば線幅差拡大を followup 候補として記録。
- decision 記録判定: 新規なし（配色定数の変更。TASK-73 の経緯はコミット本文に記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
河川の選択色を赤茶からホバー色と同一の濃い青灰 #4a6a7a へ統一し、クリックによる色相変化を廃止（線幅 3 段階は維持）。TDD red→green（929 passed）、CDP で選択時の色を実機確認、CI green（PR #99）。
<!-- SECTION:FINAL_SUMMARY:END -->
