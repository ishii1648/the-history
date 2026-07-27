---
id: decision-24
title: subagent worktree の後始末は復元を通常経路とし、--force は loop の使い捨て足場に限定して許す
date: '2026-07-27 16:59'
status: accepted
---
## Context

TASK-112 で `deno task cleanup-branches` を整備した際、他セッションのブランチ・
worktree を誤って消さないことを最優先に「`--force` / `-D` を一切使わない」を
規約とし、`git worktree remove` の dirty 拒否を最後の安全装置に据えた
（`docs/development-style.md` 4.3.3 章）。

しかし agent-loop の運用は **subagent に「commit / push はしない。ファイル変更の
み行い報告する」と指示している**。mainagent は worktree からパッチを取り出して
タスクブランチへ適用するため、**subagent の worktree は必ず未コミットの変更を
抱えたまま終わる**。つまり dirty は異常ではなく常態であり、安全装置が常に発動
して worktree の削除が一切進まない（TASK-118）。

実測（2026-07-27・7 タスク処理後の `--apply`）: refs は 24 → 17 に減り
タスクブランチ 7 本は削除できたが、worktree の削除は **8 件すべて拒否**され、
`worktree-agent-*` は 9 本残存した。TASK-112 が解こうとした refs の単調増加が
`worktree-agent-*` の分だけ残っていた。

検討した選択肢:

1. mainagent がパッチ抽出後に worktree を復元する（手順のみで解決）
2. `.claude/worktrees/` 配下に限って `--force` を許す（スクリプトのみで解決）
3. 1 と 2 の併用

1 だけでは復元し忘れ・subagent の異常終了で dirty な worktree が残ったときに
回収手段が無く、同じ蓄積が再発する。2 だけでは「常態の dirty を `--force` で
押し切る」ことが常用経路になり、安全装置が実質無効化される。

## Decision

**3（併用）を採る。TASK-112 の「`--force` を一切使わない」方針を、「通常経路では
使わない。取りこぼしの回収に限り、loop が生成した使い捨ての足場にだけ許す」へ
変更する。**

- **通常経路（mainagent の手順）**: subagent の成果をパッチとして取り出した直後
  に `git -C <wt> reset --hard HEAD && git -C <wt> clean -fd` で worktree を元の
  状態へ戻す。`-x` は付けない（ignored ファイルが残っていても
  `git worktree remove` は通ることを e2e で確認済み）。手順は
  `.claude/skills/agent-loop/SKILL.md` の手順 2 に定義する。
- **取りこぼしの回収（スクリプト）**: 通常の `git worktree remove` が拒否された
  場合に限り `--force` で再試行する。許すのは `canForceRemoveWorktree`
  （`scripts/cleanup_branches.ts`）が真、すなわち次を**すべて**満たすものだけ:
  - `.claude/worktrees/` 配下である（他セッション・人手の worktree を除外）
  - `locked` でない（実行中の subagent が保持するものを除外）
  - 自分自身の worktree でない
  - チェックアウト中のブランチが `worktree-agent-*` である
    （detached や `task-N-*` は loop の足場ではないので除外）
- ブランチ削除の `-D` は引き続き使わない。`git branch -d` が拒否したものは
  skipped として理由付きで報告する。

`--force` の範囲を「loop が生成した使い捨ての足場」に厳密に限定するのが要点。
subagent の成果は mainagent がパッチとして取り出し済みで、worktree に残る変更は
その複製にすぎないため失われるものは無い。

## Consequences

- `worktree-agent-*` が蓄積しなくなり、TASK-112 が意図した refs の頭打ち
  （steady state = 1 イテレーションぶん）が実際に成立する。`worktree-agent-*`
  ブランチの削除が 1 イテレーション遅れる点（tip == origin/main のブランチを
  消さない条件による）は従来どおり変わらない。
- `--apply` の JSON 出力に `forced`（`--force` で回収した worktree の一覧）が
  加わる。**`forced` が毎イテレーション出る場合は通常経路の復元が漏れている
  サイン**であり、スクリプト側ではなく mainagent の手順を直す。
- `canForceRemoveWorktree` の条件が崩れると他セッションの作業を破壊する。
  条件は `scripts/cleanup_branches_test.ts` の単体テスト（locked・
  `.claude/worktrees/` 外・自分自身・`worktree-agent-*` 以外を拒否）で固定して
  あり、緩める変更はテスト・`docs/development-style.md` 4.3.3 章・本 decision の
  更新をセットで行う。
- 使い捨てリポジトリでの e2e により、dirty な agent worktree が `--force` で
  削除され対応ブランチも消えること、locked / `.claude/worktrees/` 外 / 自分自身 /
  `task-N-*` チェックアウト中の worktree が削除されないこと、refs が減ること
  （10 → 8）を確認した。

関連: TASK-112（後始末の導入）、TASK-118（本 decision）、
`docs/development-style.md` 4.3.3 章、`.claude/skills/agent-loop/SKILL.md` 手順 2・5。
