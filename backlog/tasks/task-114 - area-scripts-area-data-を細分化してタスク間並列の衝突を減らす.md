---
id: TASK-114
title: 'area:scripts / area:data を細分化してタスク間並列の衝突を減らす'
status: To Do
assignee: []
created_date: '2026-07-27 14:14'
labels:
  - 'area:workflow'
  - 'area:docs'
dependencies: []
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

調査（`.outputs/claude/agent-loop-parallelism-investigation.md`）で、`deno task next-tasks` が
area 衝突を理由に候補をスキップした延べ 17 回の内訳は `area:src-main` 8・`area:scripts` 5・
`area:data` 4 だった。

このうち scripts / data の衝突は**実ファイルの競合ではなくラベル粒度だけの問題**である。
`scripts/` は 40 以上、`data/` は 89 ファイルに既に物理的に分かれており、それを粗いラベル
1 個で束ねているためにビルドスクリプト同士（例: `build-mountains.ts` と `build-rivers.ts`）が
衝突扱いになっている。

反実仮想シミュレーション（過去 32 判定機会の再生）では、この 2 領域を細分化するだけで
並列成立が 6/32（19%）→ 11/32（34%）に増える見込み。`scripts/next_tasks.ts` の
ロジック変更は不要で、ラベル値の変更だけで成立する。

## 対象

- `docs/development-style.md` 4.2 章の area 表に細分化規約を追加する
- `.claude/skills/backlog-intake/SKILL.md` の area 一覧を同じ規約に合わせる
- 既存の To Do タスクのラベルを付け替える（backlog CLI を使い、既存の他ラベルを消さない）

Done 済みタスクのラベル遡及付け替えは不要（選定対象にならないため）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/development-style.md 4.2 章の area 表に scripts / data の細分化規約（領域名の決め方と対応パスの目安）が記載されている
- [ ] #2 .claude/skills/backlog-intake/SKILL.md の area 一覧が同じ規約に更新されている
- [ ] #3 To Do 状態の既存タスクに付いている area:scripts / area:data が細分化後のラベルに置き換わっており、他のラベルが失われていない
- [ ] #4 deno task next-tasks が細分化後のラベルで動作し、skipped の理由に細分化後の area 名が表示される
<!-- AC:END -->
