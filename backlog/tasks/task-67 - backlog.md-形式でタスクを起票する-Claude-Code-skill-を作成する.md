---
id: TASK-67
title: backlog.md 形式でタスクを起票する Claude Code skill を作成する
status: To Do
assignee: []
created_date: '2026-07-25 05:53'
labels:
  - 'area:workflow'
dependencies: []
ordinal: 64000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザーの依頼内容から Backlog.md の運用ルールに沿ったタスクを起票する skill を .claude/skills/ 配下に追加する。現状はタスク起票のたびに backlog instructions overview / task-creation を読み直して手順を再構成しており、起票品質（重複検索・説明・Acceptance Criteria・依存関係・area ラベル）がセッションごとにばらつく余地がある。手順を skill として固定化することで、起票の一貫性と速度を上げる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 skill が .claude/skills/ 配下に SKILL.md として存在し、Skill ツール（スラッシュコマンド）から呼び出せる
- [ ] #2 skill の手順に、起票前の `backlog search` による重複確認と、スコープ判定（単一タスク / 親子タスク / 依存関係付き分割）が含まれる
- [ ] #3 skill はタスク作成を必ず `backlog task create` CLI 経由で行い、backlog/tasks/*.md の直接編集を禁止している
- [ ] #4 説明・Acceptance Criteria・依存関係・area ラベル付与の記述ルール（AC は実装手順でなく検証可能な振る舞い、バッククォートはシングルクォートで渡す等）が skill に含まれる
- [ ] #5 skill を実際に使ってサンプルタスクを起票し、`backlog task view --plain` で説明・AC・ラベルが期待どおり作成されることを確認済み（確認後サンプルは削除またはアーカイブ）
<!-- AC:END -->
