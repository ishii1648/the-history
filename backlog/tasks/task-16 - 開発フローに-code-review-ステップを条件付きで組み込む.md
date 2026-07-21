---
id: TASK-16
title: 開発フローに /code-review ステップを条件付きで組み込む
status: To Do
assignee: []
created_date: '2026-07-21 09:21'
labels: []
dependencies: []
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
mainagent レビュー収束後・PR 作成前に /code-review スキルによる構造化レビューを実行するステップを開発フロー文書に追加する。ユーザーとの合意（2026-07-21）に基づく。TASK-4 で試行し、その結果（検出数・有効性・所要コスト）を反映して文書化する。

適用条件:
- src/ または scripts/ に実装変更があるタスクのみ対象（docs・backlog のみの変更は対象外）
- タイミングは mainagent レビュー収束後・PR 作成前
- CONFIRMED 相当の指摘のみ subagent に修正させる（PLAUSIBLE は mainagent が判断）
- 既存の生成物検証（実データの独立検証）は /code-review では代替できないため維持する、と明記する
- /code-review ultra はユーザー起動・課金のため自律ループには組み込まない

更新対象: CLAUDE.md（標準タスクフロー）、docs/development-style.md（3 章 中間ループ）、.claude/skills/agent-loop/SKILL.md（手順 2）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 TASK-4 での /code-review 試行結果（検出数・修正数・有効性の評価）がタスクに記録されている
- [ ] #2 CLAUDE.md・docs/development-style.md・agent-loop SKILL.md に条件付き /code-review ステップが追記され、適用条件（実装変更のあるタスクのみ・PR 作成前・生成物検証は維持）が明記されている
- [ ] #3 deno fmt --check が green である
<!-- AC:END -->
