---
id: TASK-137
title: backlog.md から GitHub Issue への移行決定を ADR 化し decisions を docs/adr/ へ移設する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 17:37'
updated_date: '2026-07-29 17:19'
labels:
  - 'area:docs'
dependencies: []
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: 自律ループ（agent-loop）と人間の intake/調査セッションが別 worktree で並行してタスク状態を書くため、git 管理の `backlog/tasks/*.md` ではマージまで他 worktree から起票・状態変更が見えず、bug 最優先ルール・In Progress 一意性・重複起票検出が可視性遅延の間は保証できない。議論の結果、タスク状態をブランチフローの外の単一ストア（GitHub Issue）へ移すことを決定した。本タスクは移行シリーズ（ADR 化 → 受け皿準備 → TaskSource 抽象化 → 起票切替 → agent-loop 書き換え → backlog 撤去）の起点で、決定の記録と backlog CLI 管理の decisions（27 件）の `docs/adr/` への移設を行う。

確定事項:
- 移行決定の ADR には、検討した代替案（backlog.md 継続 + tasks の共有実体化 / 専用ブランチ + 自前薄 CLI / Issue はタイトル+状態のみで詳細は repo 内 md のハイブリッド）と不採用理由、受容したトレードオフ（オフライン性は無視してよい・タスク本文の git 履歴喪失は許容）、将来課題（運用で必要になった場合の「着手/finalization 時に Issue 本文スナップショットをタスクブランチにコミットする鏡方式」）を記録する。
- `decision-N` の N を ADR 番号として保存する（例: decision-20 → `docs/adr/0020-<slug>.md`）。既存ドキュメント・タスクからの decision 参照を壊さないため。
- 本文の Context/Decision/Consequences 構造は維持し、frontmatter のみ ADR 標準（status/date）に正規化する。
- `docs/adr/README.md` に一覧・採番規約（backlog decisions の後継、次番号から連番）を記載する。
- `docs/development-style.md` の decision 運用記述（2.1 章）を `docs/adr/` 新規作成方式へ書き換える。ただし agent-loop 手順の書き換えは後続タスクで行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 backlog/decisions/ の 27 件が docs/adr/ 配下に decision 番号を保持した名前で存在し、git log --follow で移設前の履歴が追える
- [ ] #2 移行決定の ADR が新規追加され、代替案と不採用理由・受容したトレードオフ・将来課題（スナップショット鏡方式）を含む
- [ ] #3 docs/adr/README.md に一覧と採番規約が記載されている
- [ ] #4 docs/development-style.md の decision 運用記述が docs/adr/ 方式に更新されている
- [ ] #5 docs/ 配下の既存文書から decision への参照がリンク切れになっていない
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. backlog/decisions/ 27 件を docs/adr/00NN-<slug>.md へ git mv で移設（番号保持・git log --follow で履歴が追えることを確認）。frontmatter を ADR 標準（status/date）に正規化、本文の Context/Decision/Consequences は不変
2. 移行決定の ADR（次番号）を新規作成: 代替案 3 案と不採用理由・受容トレードオフ・将来課題（スナップショット鏡方式）をタスク記載の確定事項どおり記録
3. docs/adr/README.md に一覧と採番規約を記載
4. docs/development-style.md 2.1 章を docs/adr/ 方式へ書き換え（agent-loop 手順の書き換えは後続タスクの範囲なので触らない）
5. docs/ 配下の decision 参照のリンク切れを grep で検証
6. deno fmt --check / lint / test green

並列化判定: 見送り（理由: 移設と参照更新が一体の変更）
<!-- SECTION:PLAN:END -->
