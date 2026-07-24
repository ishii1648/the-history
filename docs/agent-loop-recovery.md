# agent-loop の単一セッションガードと暴走ジョブ復旧手順

2026-07-24〜25 に発生した「対話セッションを kill してもループが継続する」
インシデントの記録と、再発時の検知・停止・復旧の標準手順（TASK-59）。

## 1. 事象の概要（何が起きたか）

- `/agent-loop` を実行する Claude Code セッションが複数並走し、同一 worktree
  に対して HEAD の checkout・ブランチの reset・重複 finalization・ PR
  マージが交互に行われた。
- 対話プロセス（terminal 上の `claude`）を 3 回 kill してもループが継続した。
  正体は **daemon（PPID 1・tmux 外）にホストされたヘッドレスセッション
  ジョブ**（`~/.claude/jobs/<id>/state.json`）で、`selfWake: true` +
  `session_cron` により自己起床し、ターン毎に短命プロセスを生成・消滅する ため
  `ps` の点検では捕捉できなかった。
- ジョブは `cwd` が特定 worktree に固定されており、その worktree で `git commit`
  / `git push` / PR 作成・マージまで自律実行していた。

## 2. ループ開始・再開前の単一セッション事前チェック（必須）

`/agent-loop` の開始・再開時は、着手前に以下を確認する。痕跡があれば
ループを開始せず、ユーザーに他実行体の停止を確認する。

1. **origin の直近 push**:
   `git for-each-ref --sort=-committerdate refs/remotes/origin | head`
   で数分以内の push がないか。
2. **直近 PR の mergedAt**: `gh pr list --state merged --limit 3` で
   数分以内のマージがないか（人間の操作速度でないマージは他ループの兆候）。
3. **reflog の異常**: `git reflog -10` に身に覚えのない checkout / merge / reset
   / commit が現れていないか。作業中も定期的に確認する。
4. **残存 file-server**: ポート 8009/8011/8012 等に古い dev サーバが
   残っていないか（`lsof -nP -iTCP:<port> -sTCP:LISTEN`）。残存サーバは
   他セッション稼働のシグナルであると同時に、**旧ビルドの配信によって
   実機スモークの誤判定を起こす**。スモーク前に配信中ビルドの検証
   （変更に含まれる DOM 要素の存在確認等）を必ず入れる。

## 3. 暴走実行体（daemon ジョブ）の検知

対話プロセスを止めてもリポジトリへの操作が続く場合は、daemon ホストの
ヘッドレスジョブを疑う。

```
# ジョブ state の確認: state: "working" / selfWake: true /
# inFlight.kinds に session_cron があれば自己起床ループ
cat ~/.claude/jobs/*/state.json

# daemon がジョブを再 claim した記録（起動直後の行に注目）
tail -30 ~/.claude/daemon.log   # 例: "bg claimed-spare <id> (slash)"
```

state.json の `cwd` フィールドで、どの worktree に対して操作しているかを
特定できる。`children` には作成した PR の一覧が残る。

## 4. 停止手順と静穏確認

1. **daemon 本体と bg ホスト群を kill する**:
   `ps -axo pid,command | grep -E "claude daemon|bg-pty-host|bg-spare"` で PID
   を特定し kill する。**bg-pty-host は SIGTERM を無視することが
   あるため、残った場合は SIGKILL（`kill -9`）を使う。**
2. **ジョブ state を無効化する**: daemon は claude CLI の起動時に
   `~/.claude/jobs/` の既存ジョブを再 claim するため、プロセスを殺した
   だけでは次の CLI 起動で復活する。該当ディレクトリをリネームして
   無効化する（削除せず可逆にする）:
   `mv ~/.claude/jobs/<id> ~/.claude/jobs/<id>.disabled`
3. **静穏確認**: `git ls-remote origin | sort` のスナップショットを取り、
   数分後に diff して**リモート ref が一切動いていないこと**を確認して
   から安全宣言する。あわせて `~/.claude/jobs/` に新規ディレクトリが
   増えていないこと・daemon プロセスが再出現していないことを確認する。

## 5. 無関係な経路（調査済み・対応不要）

- **launchd**: claude 関連の常駐エントリは存在しない（`launchctl list`）。
  daemon は OS 起動時ではなく claude CLI 起動時にオンデマンドで立つ。
- **crontab**: OS の crontab にはループ関連エントリはない。自己起床は ジョブ
  state 内の `session_cron` で完結している。
- **tmux**: daemon は PPID 1 で tmux の外にいるため、tmux セッションの
  削除はループ停止の必要条件でも十分条件でもない（残った空シェルの掃除
  としてのみ意味がある）。

なお、`claude --resume` で該当会話を手動再開すればループは再始動しうる。
無効化したジョブ state を元に戻した場合も同様（自動では起きない）。

## 6. subagent の git 操作制約（再発防止）

worktree isolation で起動した実装 subagent が、シェルの cwd リセットに
よって**親リポジトリのチェックアウト中ブランチへ誤コミット・誤 push する**
事故が実際に発生した（TASK-54 で中間版が push され、レビュー済み最終版と
競合した）。subagent への指示には以下を必ず含める:

- git 操作・ファイル編集は**自分の worktree 内のみ**。`git -C` で他パスを
  指定しない。
- **push は禁止**（push とマージは mainagent が行う）。
- コミット前に `pwd` と `git branch --show-current` を確認する。
