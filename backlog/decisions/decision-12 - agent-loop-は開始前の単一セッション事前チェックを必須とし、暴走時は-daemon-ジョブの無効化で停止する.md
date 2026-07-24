---
id: decision-12
title: agent-loop は開始前の単一セッション事前チェックを必須とし、暴走時は daemon ジョブの無効化で停止する
date: '2026-07-24 16:09'
status: accepted
---
## Context

2026-07-24〜25、`/agent-loop` を実行するセッションが複数並走し、同一
worktree への交互の git 操作（HEAD 移動・ブランチ reset・重複 finalization・
PR マージ）で作業が破壊される事象が発生した。対話プロセスを 3 回 kill
してもループは継続し、真因は daemon にホストされたヘッドレスジョブ
（`~/.claude/jobs/<id>/state.json`、selfWake + session_cron）だった
（TASK-59）。

## Decision

- `/agent-loop` の開始・再開前に単一セッション事前チェック（origin の直近
  push・直近 PR の mergedAt・reflog の異常・残存 dev サーバ）を必須とする。
- 対話プロセスの kill でループが止まらない場合は daemon ジョブを疑い、
  「daemon/bg ホスト群の kill（SIGKILL 併用）→ jobs ディレクトリの
  リネーム無効化 → git ls-remote スナップショット比較による静穏確認」の
  手順で停止する。
- 実装 subagent への指示に「git 操作は自分の worktree 内のみ・push 禁止・
  コミット前の pwd/branch 確認」を必ず含める。

手順の詳細は `docs/agent-loop-recovery.md`（TASK-59）を参照。

## Consequences

- ループ開始のたびに事前チェックの数十秒が追加されるが、二重ループによる
  ブランチ破壊・重複 finalization・意図しない PR マージ（本件では中間版
  実装が main へマージされ TASK-60 の followup が必要になった）を防げる。
- 停止手順が可逆（jobs はリネームであり削除しない）なため、必要なら
  ジョブを復元して意図的に再開できる。
