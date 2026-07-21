---
name: agent-loop
description: backlog の次タスクを決定的に選択し、実装から finalization までを人の介入なしで繰り返すローカル自律ループ。ユーザーが /agent-loop を実行したとき、または自律タスクループの開始・再開を指示したときに使う。
---

# agent-loop — 自律タスクループ（ローカル実行）

ローカルの Claude Code セッション自身が外側ループの実行主体となり、以下を
繰り返す。GitHub Actions からセッションを起動する方式は用いない。CI や PR の
ステータスはこのセッションが Monitor ツールや PR activity
購読（MCP）で監視する。

## ループ手順

1. **現在タスクの決定**
   - `In Progress` のタスクがあればそれを現在タスクとして再開する （ブランチ・PR
     の状態を調べ、中断地点から続きを行う）。
   - なければ `deno task next-task` で次タスクを判定する。出力が空なら
     着手可能なタスクがないためループを終了し、最終レポートを出力する。
   - 次タスクのブランチ `task-N-*` が既に origin に存在する場合は状態を
     調査し、再開できるなら再開、判断が必要なら 4 のエスカレーションに従う。
2. **標準タスクフローの実行**（CLAUDE.md / docs/development-style.md に従う）
   - backlog CLI でタスクを `In Progress` にし、実装プランを記録する。
   - ブランチ `task-N-slug` を作成し、テスト先行（red 確認 → green）で
     実装する。実装は subagent に委譲し、mainagent がレビューで収束させる。
   - `deno fmt --check` / `deno lint` / `deno test` / `deno task build` を 全て
     green にしてから PR を作成する（タイトル・説明に TASK ID を明記）。
3. **CI 監視とマージ**
   - PR activity 購読（subscribe_pr_activity 等の MCP）が使える場合は購読する。
   - CI の完了は Monitor ツール（例: PR の check-runs をポーリングし、 success /
     failure / cancelled など終端ステータスを検知したら通知する
     スクリプト）で監視する。フォアグラウンドの sleep 待ちはしない。
   - CI red なら修正して再 push し、green になるまでこのループを回す。
   - CI green になったら finalization（AC を検証エビデンス付きでチェック → final
     summary → `Done`）をタスクブランチ上でコミットし、再度 CI green を
     確認してからマージする。`Done` がマージと同時に main へ載ることで、
     次イテレーションの `next-task` 判定が正しく進む。
4. **例外時のみエスカレーション**
   - AC が曖昧・CI が恒常 red・仕様判断が必要な場合に限り、`needs-human`
     ラベル付き issue（ブロック内容・検討した選択肢・推奨案を記載）を起票して
     ループを停止する。それ以外で人の指示を待たない。
5. **次イテレーション**
   - マージ完了後、手順 1 に戻る。

## 停止条件

- `deno task next-task` の出力が空で `In Progress` のタスクもない
  （全タスク完了）。
- `needs-human` エスカレーションを起票した。
- ユーザーが明示的に停止を指示した。

## ガード

- ループは同時に 1 セッションのみ実行する（並行実行しない）。
- 1 イテレーション = 1 タスク = 1 PR。複数タスクをまとめて進めない。
