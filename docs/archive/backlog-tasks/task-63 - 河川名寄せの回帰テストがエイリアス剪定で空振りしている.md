---
id: TASK-63
title: 河川名寄せの回帰テストがエイリアス剪定で空振りしている
status: Done
assignee:
  - '@claude'
created_date: '2026-07-25 05:43'
updated_date: '2026-07-25 06:20'
labels:
  - bug
  - 'area:scripts'
dependencies: []
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review CONFIRMED 指摘 #5。scripts/build-rivers_test.ts の ALL_RIVER_NAMES はドキュメント上 data/rivers.geojson から再生成する運用だが、名寄せ（TASK-56）後の geojson には正準名しか残らず、name-ja.json からもエイリアスキーが剪定されたため、『同一 ja ラベルは単一正準名を持つ』クロスチェックが対象河川に対して発火し得ない。将来 Natural Earth 更新で国境またぎの名前分割（例: Elbe/Labe）が再発しても、ドキュメントどおりリスト再生成した場合にテスト green のまま TASK-56 の回帰（強調が川の途中で切れる）を通してしまう。期待: 名寄せ前の生ソース名（エイリアス適用前）を検証対象に含める形へテストを再設計し、再発時に red になることを固定する。発見契機: /code-review（PR #65/TASK-56 由来コードの横断レビュー）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 名寄せ前ソース名に対する回帰テストが追加され、エイリアス未登録の名前分割を検知して red になることが実証されている（既知ケースの意図的除去で red 確認 → green）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 現況調査: scripts/build-rivers.ts の RIVER_NAME_ALIASES/canonicalRiverName と build-rivers_test.ts の ALL_RIVER_NAMES・ja 衝突クロスチェックの実装を確認。
2. TDD: 名寄せ前の生ソース名（Natural Earth 由来の name。エイリアス適用前）を検証対象に含める回帰テストへ再設計する。方針案: 生成パイプラインが出力する『ソース名 → 正準名』の対応（または生 geojson のソース名一覧のスナップショット）に対し、(i) 同一 ja ラベルに紐づくソース名群が全て単一正準名へ写ること (ii) 未知のソース名（エイリアス未登録）が現れたら fail することを固定。red の実証は既知ケースの意図的除去（例: RIVER_NAME_ALIASES から Rhin を一時除去）で行う。
3. 並列化判定: 見送り（理由: テスト再設計単体で scripts 配下 1 ファイル系の変更）。単一 subagent（worktree isolation）委譲。
4. deno fmt/lint/test/build green → PR → CI → finalization → マージ。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
回帰テストを名寄せ前ソース名基準に再設計: build-rivers.ts に extractSourceRiverNames()（エイリアス適用前のユニーク名抽出、--print-source-names 再生成モード付き）を追加し、スナップショット SOURCE_RIVER_NAMES（37 名・コミットピン留めソース由来で安定・CI オフライン維持）に対して (i) 未知の分割名＝エイリアス未登録で fail (ii) 同一表示名は単一正準名へ収束 (iii) 死んだエイリアスの検出、の 3 性質を固定。AC の red 実証: RIVER_NAME_ALIASES から Rhin を一時除去 → 新テスト FAILED（旧テストでは検出不能）→ 復元で green（deno test 586 passed）。PR #75 CI green。
<!-- SECTION:FINAL_SUMMARY:END -->
