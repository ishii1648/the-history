---
id: TASK-115
title: next-tasks の bug フィルタを候補の絞り込みから優先順位へ変える
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 14:14'
updated_date: '2026-07-28 14:50'
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
- [x] #1 bug 候補と、それと area が非交差の非 bug 候補が同時に存在するとき、deno task next-tasks が両方を含む集合を返す
- [x] #2 返る集合の先頭が bug 候補であることを検証するテストが green
- [x] #3 deno task next-task（単数選択）の出力は従来どおり bug 最優先の 1 件で、既存テストが green
- [x] #4 変更後の選定規約が docs/development-style.md 4.1 章および 4.2 章に反映されている
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 採否の判断 → 採用（AC#5 は「見送った場合」の条項なので該当なし）

根拠は 3 点。**最も強いのは 1 点目**で、mainagent が渡した読み（docs の文言解釈）より accepted な decision に照らす方が確かだった。

1. **`decision-8`（accepted）の本文が既に「順序」で書かれている**。「bug 最優先 → ordinal → ID の貪欲選択で area が互いに素なタスク集合を決定的に返す」— 除外ではなく比較順の規定。つまり `next_tasks.ts` の絞り込みは **decision-8 が定めた契約より強い制約を実装が勝手に足していた**状態で、削除は規約変更ではなく**実装の契約への是正**にあたる。
2. **4.1 章のルール 2 も排他を言っていない**。「`ordinal` に関わらず最優先で次タスクとする」は順序の記述で、「bug 中は他に着手しない」という文は 4.1〜4.2.1 のどこにも無い。
3. **4.2.1 章は既に bug 中の並列を許容している**。「area が互いに素な bug 同士は並列に処理されうる」と書かれており、bug 発生中に複数タスクを並行させること自体は許容済みだった。

実務リスク（レビュー負荷・main の不安定化）は「bug + bug の並列」で既に受け入れられている以上、bug + 非 bug に特有ではない。bug 修正の遅延も集合の先頭が bug である限り着手・レビュー・マージの優先順は保たれるため、この受け皿を 4.2 章に明文化した。

## 検証エビデンス（finalization）

**実装**: `selectNextTasks` 内の絞り込み 3 行を削除しただけ。`compareTasks`（bug 最優先 → ordinal 昇順 → ID 昇順の全順序）は**無変更**。

**AC#1 / #2 — mainagent が独立に検証した 4 つの保証**:

| 検証 | 結果 |
| --- | --- |
| bug が ordinal 最大（9000）でも先頭に来るか | `["TASK-9","TASK-1","TASK-2"]` — **先頭 bug** |
| bug と area 交差する非 bug は従来どおりスキップされるか | `skipped: [{"reason":"area conflict: docs (TASK-9)"}]` |
| bug 群内の順序（ordinal → ID）が変わっていないか | `["TASK-3","TASK-4","TASK-5","TASK-1"]`（ordinal 3000 同値は ID 順） |
| イテレーション境界ガードが不変か | `{"tasks":[],"skipped":[]}` |

**AC#3（単数選択が不変）**: `scripts/next_task.ts` は**未変更**（diff に現れないことを確認）。既存テスト 17 件 green。実バックログで `git stash` により新旧を実行比較し、`next-task` は両方 `TASK-115`、`next-tasks` の JSON も完全一致（現在の候補に bug が無いため非 bug 時の無回帰も確認できた）。

**AC#4（docs への反映）**: **4.1 章を「全順序の定義」・4.2 章を「その順序を使った貪欲な集合選択」と役割分離**した。4.1 のルールを「選ぶ」から「並べる」に書き換え、ルール 2 に「これは順序の規定であって候補の絞り込み（排他）ではない」を明記。4.2 章に「集合の先頭は必ず bug」「bug と非 bug が同居する場合は bug の実装・レビュー・マージを先に片付ける」を追記。4.2.1 章の「bug 最優先フィルタの下でも」という旧前提も修正し、残課題リストから解決済み要因（area 粒度 = TASK-114、bug 絞り込み = TASK-115）を消し込んだ。この分離により **4.1 が単一選択専用のルールに読めてしまう旧構成の曖昧さ**も同時に解消している。

**TDD**: テスト先行で 3 件 red（非 bug が除外される・交差時に skipped が空・bug 群内順序）→ 実装で green。`deno task test` = 1350 passed / 0 failed / 3 ignored（着手前 1345）。`deno fmt --check`（153 ファイル）green、`deno lint` は既存 4 件のみ、`deno task build` green。CI（PR #127）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

## 出力契約の変化（テストで固定）

絞り込み廃止で、従来 `skipped` に一切現れなかった非 bug 候補が **bug と area 交差時に `skipped` として出る**ようになる。JSON スキーマは不変で `/agent-loop` は `tasks` を見て動くため実害は無いが、テストで明示的に固定した。

## 既存テスト 1 件の扱い

「bug 候補があれば候補を bug 群のみに絞る」テストは旧挙動の仕様固定だったので、非 bug タスクを外して「area が互いに素な bug 候補を複数選択する」に改名・縮小した（4.2.1 章が要求する保証は残した）。

## subagent が 2 回停止した

1 回目は watchdog（600 秒無進捗）ではなく **API エラー（Connection closed mid-response）**で停止し、worktree も作られていなかった。「採用する」という判断までは出ていたので、2 回目は判断からやり直させたうえで、mainagent が特定した該当箇所（`selectNextTasks` 内の 3 行）とテストケースを 1 つ追加（bug 群内の順序が変わらないこと）して渡した。2 回目は成功し、しかも mainagent の読みより強い根拠（decision-8 の本文）を見つけた。

## PR に無関係なタスクファイルが混入した

`backlog/tasks/task-119`（900 年の削除）と `task-120`（フランス王国の外枠が出ない・`bug`）は、このタスクの作業中に別途作成されたもので `git add -A` が拾った。タスクファイルはメタデータで実装への影響が無いため、force-push で剥がすより素直に含めて PR 本文に明記した。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
next_tasks.ts が候補に bug を 1 件でも含むと候補集合を bug 群のみに置換していたのをやめ、bug 最優先を compareTasks の順序だけで担保するようにした。採用の決め手は decision-8（accepted）の本文が既に「bug 最優先 → ordinal → ID の貪欲選択で area が互いに素なタスク集合を決定的に返す」と順序で書かれていたことで、絞り込みは decision-8 が定めた契約より強い制約を実装が勝手に足していた状態だった（削除は規約変更ではなく実装の契約への是正）。4.1 章のルール 2 も排他を言っておらず、4.2.1 章は既に「area が互いに素な bug 同士は並列に処理されうる」と bug 中の並列を許容していた。実務リスク（レビュー負荷・main の不安定化）は bug + bug の並列で既に受け入れられている以上 bug + 非 bug に特有ではなく、bug 修正の遅延も集合の先頭が bug である限り優先順は保たれるため、その受け皿を 4.2 章に明文化した。実装は selectNextTasks 内の 3 行削除のみで compareTasks は無変更。docs は 4.1 章を「全順序の定義」・4.2 章を「その順序を使った貪欲な集合選択」と役割分離し、4.1 が単一選択専用に読めてしまう旧構成の曖昧さも解消した。検証: テスト先行で 3 件 red → green、deno test 1350 passed / 0 failed（着手前 1345）、fmt --check / lint / build green、scripts/next_task.ts は未変更で既存テスト 17 件 green かつ実バックログでの新旧比較も一致、mainagent が独立に 4 つの保証（bug が ordinal 最大でも先頭・交差する非 bug はスキップ・bug 群内の順序不変・イテレーション境界ガード不変）を確認、CI（PR #127）green。実装 subagent は 1 回目が API エラーで停止したため再起動し、2 回目は mainagent の読みより強い根拠を見つけた。
<!-- SECTION:FINAL_SUMMARY:END -->
