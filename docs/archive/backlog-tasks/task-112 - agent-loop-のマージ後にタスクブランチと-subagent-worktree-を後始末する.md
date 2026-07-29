---
id: TASK-112
title: agent-loop のマージ後にタスクブランチと subagent worktree を後始末する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 14:05'
updated_date: '2026-07-27 16:39'
labels:
  - 'area:workflow'
  - 'area:docs'
dependencies: []
priority: high
ordinal: 105000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PR マージ後にタスクブランチと subagent 用 worktree ブランチが残り続けるため、リポジトリの refs が単調増加している。2026-07-27 時点で refs 285 本（うち 279 本が origin/main にマージ済み、worktree-agent-* が 56 本、git worktree 登録が 67 件）まで膨らみ、backlog.md のクロスブランチ走査（全ブランチに対し ls-tree / log / show を実行）が毎回走ることで backlog board の表示が 12.7 秒かかっていた。手動で掃除して refs 12 本・board 約 2.9 秒（うち約 2.4 秒は git fetch のネットワーク待ち）まで回復させたが、agent-loop 側に後始末の手順がないため放置すると再発する。調査結果は .outputs/claude/backlog-board-slowdown.md を参照。GitHub 側の deleteBranchOnMerge は 2026-07-27 に有効化済みなので、残るのはローカル側の後始末とその手順化。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 agent-loop skill のマージ後手順に、マージ済みタスクブランチの削除（git branch -d）・subagent worktree の削除（git worktree remove / prune）・git fetch --prune が明記されている
- [x] #2 1 タスク完了ごとに上記が実行され、ループを複数回まわしても refs 数が単調増加しないことを確認できる
- [x] #3 backlog/config.yml の active_branch_days が実運用に見合う値（30 日より短い値）に見直され、その根拠が記録されている
- [x] #4 掃除の実行時に他セッションがチェックアウト中のブランチ・worktree を誤って削除しない手順になっている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 現状の実測（着手時点）

このセッション（/agent-loop 1 回の実行）で 7 タスクを処理した結果:

- refs: 20 本
- `git worktree list` の登録: 12 件
- `worktree-agent-*` ブランチ: 7 本
- origin/main にマージ済みの `task-*` ブランチ: 6 本

起票時（refs 285 本・worktree 67 件）ほどではないが、**1 セッションで 13 本の
ゴミ ref が増えており**、後始末が無ければ単調増加するという起票時の指摘が
そのまま再現している。

## 方針

`.claude/skills/agent-loop/SKILL.md` の「4. マージ後の動作確認」に後始末の手順を
追加する。ドキュメントだけでなく、**誤削除しない手順**（AC #4）が要点。

- マージ済みタスクブランチ: `git branch -d`（`-D` は使わない。未マージを
  取り違えて消さないため）
- subagent の worktree: `git worktree remove` + `git worktree prune`
- リモート追跡: `git fetch --prune`（GitHub 側の deleteBranchOnMerge は
  2026-07-27 に有効化済みなので、origin 側の実体は既に消えている）
- **他セッションがチェックアウト中のものを消さない**: `git worktree list` が
  返すパスに現れるブランチは削除対象から除く。`git branch -d` は
  チェックアウト中のブランチを拒否するが、worktree の削除は
  `git worktree remove` が dirty な worktree を拒否することに依存するため、
  `--force` を使わない手順にする。

## 手順

1. 既存の検証資産（`scripts/` 配下）を調べ、後始末をスクリプト化するか
   SKILL.md の手順記述に留めるかを判断する。スクリプト化する場合は
   ネットワーク非依存の単体テストを付ける。
2. `backlog/config.yml` の `active_branch_days` を実運用に見合う値へ見直す
   （AC #3）。現行値と、backlog.md がこの値をどう使うか（クロスブランチ走査の
   対象期間）を調べたうえで根拠を記録する。
3. SKILL.md に手順を追記する（AC #1）。
4. 実際に後始末を 1 回実行し、refs 数が減ることを確認する（AC #2）。

## 並列化判定（タスク内）

**見送り**（理由: SKILL.md の手順記述・config.yml の値見直し・後始末の実行が
一続きで、手順を確定しないと実行も記述もできない。独立にテスト可能な
サブ作業に分割できない）。

## タスク間並列

**あり**。`next-tasks` が TASK-106（area: scripts / data）と TASK-112
（area: workflow / docs）の 2 タスク集合を返した。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（SKILL.md への手順記載）**: `.claude/skills/agent-loop/SKILL.md` に独立した手順 5「マージ後の後始末（refs の掃除）」を追加した。`deno task cleanup-branches --apply` が `git fetch --prune` → `git worktree remove` / `git worktree prune` → `git branch -d` を 1 回で行うこと、誤削除を防ぐ 5 条件、`refsAfter` が単調増加していないことの確認までを明記。既存の手順 5・6 は 6・7 へ繰り上げ、参照箇所 4 か所も修正済み。

**AC#2（refs が単調増加しない）**: 判定ロジックは純粋関数（`planCleanup` / `parseWorktreeList` / `parseMergedBranches` / `isLoopBranch` / `isAgentWorktreePath`）に切り出し、git・ネットワーク非依存の単体テスト 16 件で固定。実際の削除は使い捨てリポジトリでの e2e で検証した（1 回目: refs 9 → 6。2 回目: dirty worktree を混ぜて `git worktree remove` が拒否 → skipped に理由付きで記録され残りは続行、refs 7 → 6）。出力の JSON に `refsBefore` / `refsAfter` を含めてイテレーション間の比較ができるようにした。

**AC#3（active_branch_days の見直し）**: 30 → 3。backlog.md 1.48.0 の実装を調べ、この値が `listRecentBranchTips` / `listRecentRemoteBranches` / `getBranchLastModifiedMap` の 3 か所でクロスブランチ走査の対象を絞る「コミット日時の窓」であることを確認した。走査に価値があるのは未マージの in-flight ブランチだけなので、origin/main にマージ済みのタスクブランチ **117 本**の生存時間（最初のコミット 〜 マージコミット）を実測: 中央値 0.12 時間・p95 0.69 時間・**最大 19.98 時間（1 日超えは 0 本）**。実測最大の約 3.6 倍にあたる 3 日を採る。1 日未満にも詰められるが、週末・一晩の中断で in-flight タスクが board から消えると混乱するため。根拠は `docs/development-style.md` 4.3.3 に記録。

**AC#4（誤削除しない手順）**: `--force` / `-D` を一切使わず、git 自身の拒否（dirty worktree・未マージ・チェックアウト中）を最後の砦として残し、拒否されたものは `skipped` に理由付きで記録して処理を続ける。加えて 5 条件で対象を絞る（loop 生成の名前のみ / origin/main にマージ済み / どこかの worktree にチェックアウト中は除外 / locked な worktree と自分自身の worktree は除外 / tip == origin/main は除外）。

mainagent が共有リポジトリ（refs 24 本）で dry-run を実行し、保護が全て効くことを確認した:

| 判定 | 対象 |
| --- | --- |
| 削除候補 | 終了済み subagent の worktree 6 件、マージ済み `task-*` 5 本、`worktree-agent-*` 6 本 |
| skip `locked (in use by another session)` | TASK-106 の subagent が使用中の worktree |
| skip `no commits of its own (tip == origin/main)` | **`task-106-name-overrides`**・`task-112-loop-cleanup`・実行中 subagent の `worktree-agent-*` 2 本 |
| skip `checked out at ...` | `task-11-finalize-backlog`（別セッションの worktree） |
| skip `not an agent worktree` | 他セッションの `@feat-*` worktree 5 件 |
| skip `not a loop-generated branch` | `main` / `feat/*` / `docs/*` |

## 素朴な shell 版では事故が起きる（最重要の発見）

起票時の調査ドキュメントに載っていた shell 版
（`git branch --merged | grep -vE ^\*|^\+ | xargs git branch -d`）は AC#4 を満たせない。

**`git branch --merged origin/main` は「まだ 1 つもコミットが無いブランチ」を含む**。着手直後の in-flight なタスクブランチは tip == origin/main なのでマージ済みに見える。`grep -v ^+` は「他 worktree でチェックアウト中」しか弾けないため、**mainagent が作ったばかりの空のタスクブランチを消してしまう**。

実際に dry-run で並行実装中の `task-106-name-overrides` が削除候補に挙がり、`no commits of its own (tip == origin/main)` の条件を足して除外した。

この条件は「main がまだ進んでいない間」しか効かない（別 PR のマージで main が進むと、コミットの無い in-flight ブランチも tip != origin/main になる）。ただし該当するのはコミットが 1 つも無いブランチだけなので失われる作業は無く、同名ブランチを作り直せば復帰できる。トレードオフは `docs/development-style.md` 4.3.3 に明記した。

## 共有リポジトリでの --apply は実行していない

実行時点で TASK-106 の subagent が稼働中で、削除計画に他 subagent の worktree 6 件が含まれていた。他エージェントの作業ディレクトリを消す判断は mainagent の領分と考え、**全 subagent の終了後に mainagent が実行する**方針とした。AC#2 の実証は使い捨てリポジトリでの e2e で取ってある。

## decision 記録の判定

**記録しない**と判断した。後始末の手順そのものは `.claude/skills/agent-loop/SKILL.md` と `docs/development-style.md` 4.3.3 が一次情報で、decision に本体を書くと二重管理になる（development-style 2.1 章の「重複記録は同期切れ・形骸化を招くため禁止」）。スクリプト化するか shell に留めるかの判断は既存の `next_tasks.ts` の前例に倣っただけで新規の方式選択ではない。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
agent-loop がマージ後にタスクブランチと subagent worktree を掃除するようにした。scripts/cleanup_branches.ts + deno task cleanup-branches が git fetch --prune → git worktree remove / prune → git branch -d を 1 回で行い、refsBefore / refsAfter を含む JSON を返す。SKILL.md には独立した手順 5 として記載し、既存の手順 5・6 を 6・7 へ繰り上げた。shell のワンライナーではなくスクリプトにしたのは next_task.ts / next_tasks.ts と同じ「運用ロジックを純粋関数 + 単体テストで持つ」前例に倣うためで、判定条件が 6 つあり shell では誤削除の検証ができないから。最重要の発見は、起票時の調査に載っていた素朴な shell 版が事故を起こすこと: git branch --merged origin/main は「まだ 1 つもコミットが無いブランチ」を含むため、着手直後の in-flight なタスクブランチが tip == origin/main でマージ済みに見え、削除されてしまう。実際に dry-run で並行実装中の task-106-name-overrides が削除候補に挙がり、この条件を足して除外した。誤削除の防止は --force / -D を使わず git 自身の拒否を最後の砦に残したうえで 5 条件（loop 生成の名前のみ / origin/main にマージ済み / チェックアウト中は除外 / locked な worktree と自分自身は除外 / tip == origin/main は除外）で絞る形にし、拒否されたものは skipped に理由付きで記録して処理を続ける。active_branch_days は 30 → 3（backlog.md がクロスブランチ走査の対象を絞るコミット日時の窓で、マージ済みタスクブランチ 117 本の生存時間を実測すると中央値 0.12 時間・最大 19.98 時間・1 日超えは 0 本だったため実測最大の約 3.6 倍を採用）。検証: 判定ロジックの単体テスト 16 件を先行追加して red → green、deno test 1252 passed / 0 failed（着手前 1236）、fmt --check / lint / build green、mainagent が共有リポジトリで dry-run して 6 種類の skip 理由が全て正しく効くことを確認、使い捨てリポジトリでの --apply e2e で refs 9→6 および dirty worktree の拒否と処理続行を確認、CI（PR #119）green。共有リポジトリでの --apply は TASK-106 の subagent 稼働中だったため実行せず、全 subagent 終了後に mainagent が行う方針とした。
<!-- SECTION:FINAL_SUMMARY:END -->
