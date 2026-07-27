---
id: TASK-115
title: next-tasks の bug フィルタを候補の絞り込みから優先順位へ変える
status: To Do
assignee: []
created_date: '2026-07-27 14:14'
labels:
  - 'area:scripts'
  - 'area:docs'
dependencies: []
ordinal: 108000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

`scripts/next_tasks.ts` は、候補に label `bug` を含むタスクが 1 件でもあると
**候補集合を bug 群のみに置換**する。bug intake の運用では bug は 1 件ずつ起票されるため
（現在 110 タスク中 30 件が bug）、area が完全に非交差の非 bug タスクが待機していても
集合が単独に縮退する。

bug の最優先は `compareTasks` が「bug を先頭に並べる」ことで既に担保されており、
候補集合からの非 bug 除外は優先順位の担保には不要である。

反実仮想シミュレーション（過去 32 判定機会の再生）では、除外をやめるだけで
並列成立が 6/32（19%）→ 8/32（25%）、scripts/data のラベル細分化と併用すると
14/32（44%）になる見込み。詳細は `.outputs/claude/agent-loop-parallelism-investigation.md`。

## トレードオフ（着手時に判断すること）

bug 発生中に非 bug タスクへ並行着手することになる。「bug が出ている間はそれに集中する」
という意図が `docs/development-style.md` 4.1 章の bug 最優先ルールに含まれるなら、
変更を見送る判断もありうる。着手時にこの点を検討し、採否とその根拠を記録する。
見送る場合はその判断を Implementation Notes に残してタスクを閉じてよい。

## 制約

単数選択の `scripts/next_task.ts`（`deno task next-task`）の挙動は変更しない
（bug 最優先で 1 件を返す互換動作を維持する）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 bug 候補と、それと area が非交差の非 bug 候補が同時に存在するとき、deno task next-tasks が両方を含む集合を返す
- [ ] #2 返る集合の先頭が bug 候補であることを検証するテストが green
- [ ] #3 deno task next-task（単数選択）の出力は従来どおり bug 最優先の 1 件で、既存テストが green
- [ ] #4 変更後の選定規約が docs/development-style.md 4.1 章および 4.2 章に反映されている
- [ ] #5 見送る判断をした場合は、その根拠が Implementation Notes に記録されている
<!-- AC:END -->
