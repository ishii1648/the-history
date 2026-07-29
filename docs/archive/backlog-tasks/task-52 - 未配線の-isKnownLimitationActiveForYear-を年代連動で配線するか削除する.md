---
id: TASK-52
title: 未配線の isKnownLimitationActiveForYear を年代連動で配線するか削除する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 12:20'
updated_date: '2026-07-24 14:33'
labels:
  - bug
dependencies: []
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review の CONFIRMED 指摘 #5。src/known_limitations.ts の isKnownLimitationActiveForYear（年代該当判定）は実装・6 テスト付きだが、UI（src/main.ts revealKnownLimitations）から一切呼ばれず全件常時表示のまま（TASK-46 の AC 上、年代連動は任意のため仕様違反ではない）。data/known-limitations.json には years 付きエントリが実在する。対応をどちらかに倒す: (1) 年代切替と連動して現在年代に該当する制限を強調/フィルタ表示する配線を追加 (2) 関数とテストを削除し必要になった時点で再実装。発見契機: /code-review。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 配線する場合: 年代切替で該当制限の表示が変わることがテストと実機で確認できる / 削除する場合: 未使用コードとテストが除去され deno test green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 採否判断: 「配線」を選択（削除ではなく）。理由: data/known-limitations.json に years 付きエントリが実在し、現在年代に該当する制限の強調は誤解防止という TASK-46 の目的に直結する。テスト済み関数の廃棄より配線が低コストで価値が高い。
2. 仕様: 一覧は全件表示を維持しつつ、現在の年代に該当する制限（isKnownLimitationActiveForYear が true）を視覚的に強調（例: 封蝋色マーカー + 「この年代に該当」バッジ）。年代切替時、パネルが開いていれば表示を更新する。
3. TDD（red 先行）: 一覧項目の表示状態を導出する純関数（例: knownLimitationEntries(limitations, year) → [{text, active}]）を known_limitations.ts に追加しテスト先行。UI 側（main.ts の revealKnownLimitations）は該当関数の結果を使う配線に変更。
4. ゲート + 実機: deno fmt/lint/test/build green。ヘッドレス CDP（verify/cdp.ts）で 900 年と 1800 年の両方でパネルを開き、該当強調の有無が正しく切り替わることを確認。
5. 並列化判定: 見送り（理由: 純関数 + UI 配線の小規模一体作業。単一 subagent 委譲・ヘッドレス確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（2026-07-24）:
- 採否: 「配線」を選択（削除ではなく）。既知の制限は常時全件表示を維持しつつ、現在年代に該当する項目へ封蝋色バッジ「この年代に該当」を付与する仕様（非該当を隠すと現行制約の誤解を招くため）。
- TDD: knownLimitationEntries(limitations, year) を追加、red（TS2724）→ green（known_limitations_test 14 件、全体 526 passed）。years 内/外/省略・順序保持をカバー。
- 配線: revealKnownLimitations を entries ベース化し、yearSwitcher の applyFn に reflectYearToKnownLimitations を接続（パネル開時は年代切替で即時更新）。
- 実機（ヘッドレス CDP）: 900 年 → 2 件中 1 件 active（HRE 制限）/ 1600 年 → 1 件 active（イングランド・アイルランド制限）/ 1800 年 → 0 件、と年代連動で強調が正しく切り替わることを確認（スクリーンショット t52.png）。fmt/lint/build green・CI green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
未配線だった isKnownLimitationActiveForYear を UI へ配線。knownLimitationEntries（純関数、TDD）で全件表示 + 現在年代に該当する制限へ封蝋色バッジを付与し、年代切替でパネル表示が即時更新されるようにした。削除ではなく配線を選んだ理由（常時全件表示 + 該当強調が誤解防止に資する）を記録。検証: 526 tests green・CI green・ヘッドレス CDP で 900/1600/1800 年の強調切替を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
