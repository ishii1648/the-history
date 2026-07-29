---
id: TASK-141
title: agent-loop を GitHub Issue ベースに書き換える（claim タグ CAS・loop-doctor）
status: To Do
assignee: []
created_date: '2026-07-28 17:39'
labels:
  - 'area:scripts-loop'
  - 'area:workflow'
dependencies:
  - TASK-140
ordinal: 122000
---

移行先: #165

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: backlog.md → GitHub Issue 移行シリーズの一部（背景・決定は TASK-137 の ADR を参照）。タスク選定・起票の Issue 化後、ループ本体の状態遷移・二重着手ガード・finalization を Issue ベースへ移す。

確定事項:
- 二重着手ガードの権威は origin への claim タグ push（`refs/tags/claim/issue-<N>`）とする。タグ ref への push は既存タグがあると非 fast-forward として拒否されるため、サーバ側のアトミックな compare-and-swap になる。`status:in-progress` ラベルは人間向け表示（advisory）で、権威ではない。
- finalization は PR マージ前に AC チェック（Issue 本文の read-modify-write はこの 1 回のみ）と Implementation Notes / Final Summary のコメント投稿を完了し、Issue のクローズは PR 本文の `Closes #N` による自動クローズに任せる（明示 `gh issue close` はしない。マージとクローズの間に異常終了の窓を作らないため）。
- アトミック性を失う代わりに不整合の検出・修復を明示的に持つ: `scripts/loop_doctor.ts` を新設し、open なのに Closes 指定 PR がマージ済み / closed なのに AC 未チェック / claim タグ残存 / status ラベルと claim の不一致等を検査する。診断は純粋関数（フィクスチャでテスト）、dry-run 既定・`--apply` で修復（cleanup_branches.ts と同じ規約）。
- `scripts/cleanup_branches.ts` にクローズ済み issue の claim タグ掃除を追加する。既存の安全条件（他セッションの worktree/ブランチを消さない多重防御）を壊さない。
- `.claude/skills/agent-loop/SKILL.md` の手順 1/2/3/5/6/7 と bug intake 節を Issue ベースへ書き換える。`backlog decision create` は docs/adr/ の新規作成に置き換える。
- `docs/development-style.md` の関連章を更新する: 4.1 章の「backlog CLI に依存しない」記述の撤回、4.3.3 章の refs 掃除の根拠（クロスブランチ走査の劣化）の書き換えを含む。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 claim タグが既に存在する issue への claim push が拒否され二重着手が検出される（実地検証で確認）
- [ ] #2 loop-doctor が想定不整合パターン（open+マージ済み PR / closed+AC 未チェック / claim タグ残存）を検出し --apply で修復可能なものを修復する。診断の純粋関数テストが green
- [ ] #3 cleanup-branches がクローズ済み issue の claim タグを削除し、未クローズ issue の claim タグを消さない
- [ ] #4 agent-loop SKILL.md と development-style.md の該当章が Issue ベースの手順に更新されている
- [ ] #5 1 イテレーションの実走で claim → 実装 → finalization → Closes #N 自動クローズ → claim タグ掃除まで通しで成功する
<!-- AC:END -->
