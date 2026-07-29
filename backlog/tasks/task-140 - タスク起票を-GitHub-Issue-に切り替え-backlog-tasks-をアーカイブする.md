---
id: TASK-140
title: タスク起票を GitHub Issue に切り替え backlog/tasks をアーカイブする
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 17:38'
updated_date: '2026-07-29 18:55'
labels:
  - 'area:workflow'
  - 'area:docs'
dependencies:
  - TASK-137
  - TASK-139
ordinal: 121000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: backlog.md → GitHub Issue 移行シリーズの一部（背景・決定は TASK-137 の ADR を参照）。受け皿（ラベル・テンプレート）と読み取り（TaskSource 抽象）が揃った後、起票フローと既存データを切り替える。

確定事項:
- backlog-intake スキルを task-intake に改め、`gh issue create --body-file` ベースへ全面書き換える（body をファイルで渡すことでシェルのバッククォート/コマンド置換によるテキスト破壊を構造的に解消する）。重複確認は search API を使わず `gh issue list --state all --json number,title,labels,body` を 1 回叩いてローカルでマッチする。
- 既存 backlog タスクは Issue へ import しない（凍結）。TASK-N という ID は保存できず、コミットメッセージ・docs・decisions 内の参照が広範に残るため、二重 ID 管理を避ける。`backlog/tasks/`（archive/tasks 含む）を `docs/archive/backlog-tasks/` へ git mv し、TASK-N → ファイル名の索引を持つ README を置く。
- 移行時点で status が終端でないタスク（To Do / In Progress）のみ `gh issue create` で Issue 化する。Issue 本文末尾に旧 ID とアーカイブパスを、アーカイブ側 md に移行先 #N を相互記載する。
- `TASK_SOURCE` の既定を github に切り替える。切替の直前に両ソース（backlog / github）の候補集合が一致することを確認し、結果をタスクの Implementation Notes に記録する。
- CLAUDE.md と docs/development-style.md の起票フロー記述を Issue ベースへ更新する（agent-loop 本体の手順書き換えは後続タスク）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 新規タスクが task-intake スキルの手順で Issue として起票でき、既定ソースの deno task next-tasks が Issue 由来の候補を返す
- [ ] #2 backlog/tasks/ が docs/archive/backlog-tasks/ へ移設され、git log --follow で履歴が追え、TASK-N 索引の README がある
- [ ] #3 未終端タスクが全件 Issue 化され、旧 ID・アーカイブパスと Issue 番号が相互リンクされている
- [ ] #4 重複確認手順が search API を使わず issue list 1 コール + ローカルマッチである
- [ ] #5 切替前の両ソース候補集合の一致確認が Implementation Notes に記録されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. subagent: backlog-intake スキル → task-intake へ全面書き換え（gh issue create --body-file ベース・重複確認は issue list 1 コール + ローカルマッチ）。backlog/tasks（archive 含む）を docs/archive/backlog-tasks/ へ git mv + TASK-N 索引 README。CLAUDE.md / development-style の起票フロー更新。TASK_SOURCE 既定を github へ切替
2. subagent: 未終端タスクの Issue 化を行う移行スクリプト（scripts/migrate-tasks-to-issues.ts、gh 呼び出し・dry-run 付き・作成後に相互リンクを archive md へ書き戻す）を作成。実行は mainagent
3. mainagent: 移行スクリプトを実行し未終端タスクを Issue 化（AC#3）。切替前に両ソース候補集合の一致を確認し Implementation Notes に記録（AC#5）
4. mainagent: task-intake 手順で試験起票 → 既定 next-tasks が Issue 由来候補を返すことを確認（AC#1）
5. fmt / lint / test green

並列化判定: 一部あり（subagent = ファイル作業と移行スクリプト、mainagent = gh 実行と切替検証。gh 権限が mainagent に限られるための役割分担）
<!-- SECTION:PLAN:END -->
