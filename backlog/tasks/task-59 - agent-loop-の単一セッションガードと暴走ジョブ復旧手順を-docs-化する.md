---
id: TASK-59
title: agent-loop の単一セッションガードと暴走ジョブ復旧手順を docs 化する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-24 16:01'
updated_date: '2026-07-24 16:02'
labels:
  - 'area:docs'
dependencies: []
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: 2026-07-24〜25 の agent-loop 運用で、対話セッションを kill してもループが継続する事象が発生した。真因は daemon（PPID 1・tmux 外）にホストされたヘッドレスセッションジョブ（~/.claude/jobs/<id>/state.json、selfWake + session_cron）で、ターン毎に短命プロセスを生成するため ps では検知できず、cwd 固定の worktree に対して commit/push/PR マージまで実行していた。また複数セッションの並走により、同一 worktree の HEAD 移動・ブランチ reset・重複 finalization などの破壊的干渉が起きた。この検知・停止・再発防止の手順は個人メモリではなくリポジトリの docs として共有する（ユーザー指示）。
記録すべき内容: (1) ループ開始・再開前の単一セッション事前チェック（origin の直近 push 時刻・PR mergedAt・reflog の身に覚えのない操作・残存 file-server ポート） (2) 暴走実行体の検知手順（~/.claude/jobs/*/state.json の state/selfWake/session_cron 確認、daemon.log の bg claimed-spare） (3) 停止手順（daemon 本体と bg-pty-host 群の kill（SIGTERM 無視あり）→ jobs ディレクトリのリネーム無効化 → git ls-remote スナップショット比較による静穏確認） (4) launchd/crontab/tmux が無関係であること (5) subagent への git 操作制約（worktree 外への commit/push 禁止）の明文化。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 docs/ 配下に上記 (1)〜(5) を含む運用ドキュメントが作成されている
- [ ] #2 docs/development-style.md の agent-loop 関連章から参照が張られている
- [ ] #3 deno fmt --check が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/agent-loop-recovery.md を新規作成: (1) ループ開始前の単一セッション事前チェック (2) 暴走実行体（daemon ジョブ）の検知 (3) 停止手順と静穏確認 (4) 無関係な経路（launchd/crontab/tmux）の整理 (5) subagent の git 操作制約、を 2026-07-24/25 のインシデント経緯とともに記録。
2. docs/development-style.md 4.3 章（外側の自律ループ）に 4.3.2 として参照を追記。
3. deno fmt 適用 → fmt/lint/test/build green → PR（TASK-59 明記）。
4. 並列化判定: 見送り（理由: 単一ドキュメント作成 + 参照追記 1 箇所のみで分割の意味がない。docs 領域は実装中の TASK-55（scripts/data/src）と互いに素のためタスク間並列は成立）。ユーザー直接指示につき mainagent が直接実装する（TASK-41 の docs タスク前例に倣う）。
<!-- SECTION:PLAN:END -->
