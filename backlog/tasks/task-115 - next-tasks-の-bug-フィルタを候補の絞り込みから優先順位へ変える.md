---
id: TASK-115
title: next-tasks の bug フィルタを候補の絞り込みから優先順位へ変える
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-27 14:14'
updated_date: '2026-07-27 23:17'
labels:
  - 'area:docs'
  - 'area:scripts-loop'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 判断が本体のタスク

AC #5 が「見送る判断をした場合は根拠を Implementation Notes に記録」と明記
しており、**採用・見送りのどちらも成立する**。まず可否を決める。

## mainagent の読み（subagent は自分で検証すること）

`docs/development-style.md` 4.1 章のルール 2 は

> 候補のうち label `bug` を持つタスクは、`ordinal` に関わらず**最優先で次タスクと
> する**。bug 候補が複数ある場合はその中で `ordinal` 昇順…

と書かれており、これは**順序（どれを先に選ぶか）の規定であって排他（bug 以外を
選ばない）ではない**と読める。「bug が出ている間はそれに集中する」という排他の
意図は本文に現れていない。

したがって `next_tasks.ts` の「候補集合を bug 群のみに置換する」実装は、
ルール 2 が要求していない制約を足していると解釈できる。除外をやめても
`compareTasks` が bug を先頭に並べるので**最優先は担保される**（AC #2）。

**ただしこれは mainagent の読みなので、subagent は 4.1 章・4.2 章・
decision-8・調査ドキュメントを自分で読んで判断すること。**見送りが妥当なら
その根拠を記録して閉じてよい。

## 効果（起票時の調査）

反実仮想シミュレーション（過去 32 判定機会の再生）では、除外をやめるだけで
並列成立が 6/32（19%）→ 8/32（25%）、TASK-114 の細分化と併用すると
**14/32（44%）**になる見込み。TASK-114 は既にマージ済みなので、後者の効果が
そのまま出る位置にある。

## 制約

- **単数選択の `scripts/next_task.ts`（`deno task next-task`）は変更しない**
  （bug 最優先で 1 件を返す互換動作を維持。AC #3）
- イテレーション境界ガード（`In Progress` が残る間は空集合）は不変

## 手順（TDD）

1. 4.1 章・4.2 章・decision-8・調査ドキュメントを読み、採否を判断する。
2. 採用する場合: 期待する挙動のテストを先に書いて red を確認
   （bug と非 bug が area 非交差なら両方返る・先頭は bug・単数選択は不変）
   → `next_tasks.ts` の候補集合の置換を外す → green。
3. `docs/development-style.md` 4.1 章・4.2 章に選定規約を反映（AC #4）。
4. 見送る場合: 根拠を Implementation Notes に記録して閉じる（AC #5）。

## 並列化判定（タスク内）

**見送り**（理由: 判断が先で、その結論が出るまで実装内容もドキュメントの
書き換えも決まらない。判断と実装は本質的に直列）。

## タスク間並列

なし（`next-tasks` が TASK-115 の単独集合を返した。TASK-116 は `docs` 衝突で
スキップ。`docs` の細分化は TASK-114 の対象外だったため残っている）。
<!-- SECTION:PLAN:END -->
