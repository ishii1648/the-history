---
id: TASK-118
title: cleanup-branches が subagent worktree を 1 件も削除できず worktree-agent-* が蓄積する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 16:50'
updated_date: '2026-07-27 17:06'
labels:
  - bug
  - 'area:workflow'
  - 'area:scripts'
dependencies: []
priority: high
type: bug
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状（bug）

**再現手順**: `/agent-loop` でタスクを 1 つ以上処理したあと（subagent を worktree isolation で起動した後）、`deno task cleanup-branches --apply` を実行する。

**期待挙動**: 終了済み subagent の worktree と、それが使う `worktree-agent-*` ブランチが削除され、refs が単調増加しない（TASK-112 の AC #2）。

**実際の挙動**: **worktree が 1 件も削除されない**。すべて次の理由で拒否される。

```
fatal: ".../.claude/worktrees/agent-XXXX" contains modified or untracked files,
use --force to delete it
```

worktree が残るため、それを使う `worktree-agent-*` ブランチも削除できない。

```
error: cannot delete branch "worktree-agent-XXXX" used by worktree at ".../agent-XXXX"
```

## 原因

**subagent には「commit / push はしない。ファイル変更のみ行い報告する」と指示している**（agent-loop の運用そのもの）。mainagent は worktree から `git diff` でパッチを取り出してタスクブランチへ適用するため、**subagent の worktree は必ず未コミットの変更を抱えたまま終わる**。

`scripts/cleanup_branches.ts` は AC #4（誤削除しない）を満たすため `--force` を使わず、`git worktree remove` の dirty 拒否を最後の砦にしている。しかし subagent worktree にとって dirty は**異常ではなく常態**なので、この砦が常に発動して削除が一切進まない。

## 実測（2026-07-27・7 タスク処理後の /agent-loop セッション）

`deno task cleanup-branches --apply` の結果:

- refs: 24 → 17（**タスクブランチ 7 本は削除された**）
- 削除できた worktree: **0 件**（8 件すべて `contains modified or untracked files` で拒否）
- 削除できなかったブランチ: `worktree-agent-*` 8 本（`used by worktree at ...`）
- 実行後に残存: `worktree-agent-*` **9 本**

つまり後始末は**半分しか効いていない**。タスクブランチは掃除されるが `worktree-agent-*` は蓄積し続け、TASK-112 が解こうとした refs の単調増加が `worktree-agent-*` の分だけ残る。

**発見契機**: TASK-112 のマージ後の動作確認で mainagent が実際に `--apply` を実行して検出した。

## 想定される修正の方向（要判断）

1. **mainagent がパッチ抽出後に worktree を掃除する**: `git -C <wt> checkout -- . && git -C <wt> clean -fd` してから `cleanup-branches` に回す。SKILL.md の手順に「パッチを取り出したら worktree を元に戻す」を足す形。
2. **`.claude/worktrees/` 配下に限って `--force` を許す**: 対象が loop 生成の worktree で、locked でなく、自分自身でもないことを確認したうえで `git worktree remove --force` を使う。ただし TASK-112 で「`--force` は使わない」と決めた方針の変更にあたるため、decision の見直しが要る。
3. **1 と 2 の併用**: 通常は 1 で綺麗に消し、取りこぼしを 2 で回収する。

いずれにせよ **AC #4（他セッションのものを誤って削除しない）を壊さない**ことが前提。`locked` な worktree（実行中の subagent）と自分自身の worktree を除外する既存の判定は維持すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 終了済み subagent の worktree が cleanup-branches で削除される
- [x] #2 worktree-agent-* ブランチが残らない（1 イテレーション遅れは許容）
- [x] #3 実行中の subagent の worktree・他セッションの worktree・自分自身の worktree が削除されないことがテストで固定されている
- [x] #4 再現テスト（red）が追加され、修正により green
- [x] #5 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 原因（実測で特定済み）

`scripts/cleanup_branches.ts` は TASK-112 の AC #4（誤削除しない）を満たすため
`--force` を使わず、`git worktree remove` の dirty 拒否を最後の砦にしている。
しかし **subagent には「commit / push はしない」と指示している**（agent-loop の
運用そのもの）ため、mainagent がパッチを取り出したあとの subagent worktree は
必ず未コミットの変更を抱えたまま残る。**dirty は異常ではなく常態**なので、
この砦が常に発動して worktree の削除が一切進まない。

実測（7 タスク処理後）: refs 24 → 17（タスクブランチ 7 本は削除）だが、
worktree の削除は **8 件すべて拒否**、`worktree-agent-*` は 9 本残存。

## 方針

**mainagent 側の手順とスクリプト側の両方で対処する（起票時の案 3 = 併用）。**

- **通常経路**: mainagent がパッチを取り出した直後に worktree を元の状態へ
  戻す（`git -C <wt> checkout -- . && git -C <wt> clean -fd`）。これで
  `git worktree remove` が `--force` なしで通る。SKILL.md の手順に明記する。
- **取りこぼしの回収**: それでも dirty な worktree が残った場合に限り、
  **`.claude/worktrees/` 配下**かつ **locked でない**かつ **自分自身でない**
  ものに限って `--force` を許す。TASK-112 で「`--force` は使わない」と決めた
  方針の変更にあたるため、**decision-22 とは別に判断の記録が要る**（既存の
  decision の更新か新規かは development-style 2.1 章で判定する）。

`--force` を許す範囲を「loop が生成した使い捨ての足場」に限定するのが要点。
subagent の成果は mainagent がパッチとして取り出し済みで、worktree に残る
変更は複製にすぎない。失われるものは無い。

## 手順（TDD）

1. 現行の `planCleanup` の判定と、`--force` を許す条件を分けるテストを先に
   書いて red を確認する（AC #4: 実行中 subagent の worktree・他セッションの
   worktree・自分自身が対象外であることを固定する）。
2. スクリプトを修正する。
3. SKILL.md にパッチ抽出後の worktree 復元手順を追記する。
4. `deno task test` / `deno fmt --check` / `deno lint` / `deno task build` を green に。
5. 実際に `--apply` を実行し、`worktree-agent-*` が残らないことを確認する
   （AC #1・#2）。

## 並列化判定（タスク内）

**見送り**（理由: スクリプトの判定変更と SKILL.md の手順追記は同じ設計判断の
表裏で、判定条件を確定しないと手順も書けない。独立にテスト可能なサブ作業に
分割できない）。

## タスク間並列

なし（`next-tasks` が TASK-118 の単独集合を返した）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1 / #2（worktree と worktree-agent-* が削除される）**: mainagent が共有リポジトリ（他セッションの worktree が 5 件同居する実環境）で `deno task cleanup-branches --apply` を修正前後で実行して比較した。

| | 修正前（TASK-112 時点） | 修正後 |
| --- | --- | --- |
| refs | 24 → 17 | **19 → 11** |
| 削除した worktree | **0 件**（8 件すべて `contains modified or untracked files` で拒否） | **9 件**（うち force 8） |
| 削除した branch | 7（タスクブランチのみ） | **8**（`worktree-agent-*`） |
| 拒否された削除 | 16 | **0** |

force なしで消えた 1 件は、mainagent が新手順（パッチ抽出 → `reset --hard HEAD` + `clean -fd`）どおりに手動で復元した worktree で、**通常経路が機能することの実証**にもなっている。

**AC#3（誤削除しないことがテストで固定されている）**: `canForceRemoveWorktree` の条件（`.claude/worktrees/` 配下 / `locked` でない / 自分自身でない / チェックアウト中のブランチが `worktree-agent-*`）を単体テストで固定。共有リポジトリの実行でも他セッションの `@feat-*` worktree 5 件が `not an agent worktree`、`main` worktree が `main worktree` でスキップされることを確認した。

**AC#4（再現テスト red → green）**: `canForceRemoveWorktree` / `WorktreeRemoval` のテストを先に書いて red（`no exported member` 等 7 件の型エラー）→ 実装で green。

**AC#5**: `deno task test` = 1262 passed / 0 failed / 3 ignored（着手前 1255）。`deno fmt --check`（149 ファイル）green、`deno lint` は `.outputs/claude/` 配下の既存 4 件のみ、`deno task build` green。CI（PR #121）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

**使い捨てリポジトリでの e2e**（subagent 実施）: dirty な agent worktree が force で削除されブランチも消える / locked は残る / `.claude/worktrees/` 外は残る / 自分自身は残る / refs 10 → 8。加えて `task-999-inflight` を持つ agent worktree が `force:false` で計画され force されないこと、gitignore 済みファイルのみの worktree は `--force` なしで消えること（`clean -fd` で足り `-x` が不要な根拠）も確認。

## 設計の要点

**force の条件を削除の条件より厳しくした**。同一にすると `force` フラグが情報を持たない。agent パス配下でも detached HEAD や `task-N-*` を持つ worktree は削除計画には載るが force はしない。apply 時も plain `git worktree remove` を先に試し、失敗した場合のみ force へフォールバックする。`git branch -D` は引き続き一切使わない。

## mainagent のタスク記述の誤り

タスク記述に「decision-22 とは別に判断の記録が要る」と書いたが、**decision-22 は picking レイヤーの話で TASK-112 は decision を作っていない**。subagent が全 23 件を確認して指摘し、新規に decision-24 を作成した。

## 既知の限界（安全側に倒れるため未修正）

`git branch -d` は「HEAD/upstream にマージ済みか」を見るため、HEAD が遅れた worktree から実行するとマージ済みタスクブランチが `not fully merged` で拒否される。誤削除はしない（安全側）ので `-D` は使わず、mainagent が `origin/main` を指すセッション worktree から実行する運用で回避し、SKILL.md に明記した。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-112 の後始末が subagent worktree を 1 件も削除できていなかった bug を、パッチ抽出後の worktree 復元（通常経路）と限定 --force（取りこぼしの回収）の併用で直した。原因は安全装置が常態で発動していたこと: subagent には「commit / push はしない」と指示している運用なので、mainagent がパッチを取り出したあとの worktree は必ず dirty で終わり、git worktree remove の dirty 拒否を最後の砦にすると異常ではなく常態で拒否され続ける（実測 8/8 件が拒否・worktree-agent-* が 9 本残存）。修正は (1) SKILL.md の手順 2 に「subagent の成果の取り込みと worktree の復元」を新規に書き起こし（パッチ抽出の手順自体がそれまで書かれていなかった）、(2) .claude/worktrees/ 配下・locked でない・自分自身でない・チェックアウト中のブランチが worktree-agent-* の 4 条件をすべて満たす場合に限り --force を許す。force の条件を削除の条件より厳しくしたのが要点で、同一にすると force フラグが情報を持たない。apply 時も plain remove を先に試し失敗時のみ force へフォールバックし、git branch -D は一切使わない。TASK-112 の「--force は使わない」はプロジェクト規約だったため変更を decision-24 として記録した。検証: canForceRemoveWorktree のテストを先に書いて red → green、AC#3（実行中 subagent・他セッション・自分自身が force 対象にならない）をテストで固定、deno test 1262 passed / 0 failed（着手前 1255）、fmt --check / lint / build green、使い捨てリポジトリでの e2e 5 項目すべて成立、mainagent が共有リポジトリ（他セッション worktree 5 件が同居）で修正前後を実測して refs 24→17 / worktree 削除 0 件から refs 19→11 / worktree 削除 9 件・拒否 0 へ改善したことを確認、CI（PR #121）green。
<!-- SECTION:FINAL_SUMMARY:END -->
