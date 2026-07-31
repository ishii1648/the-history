# リポジトリ名変更 runbook（the-history → zeitreise）

**実施状況（2026-07-31・Issue #185）**: 1 章（GitHub リネーム）と remote URL の
更新は agent-loop セッションが実行済み。`gh repo view ishii1648/zeitreise` が
新名を返し、既存 Issue / PR の喪失が無いことを確認済み。**残課題はローカル ghq
パスの移動と worktree 整理（3 章）のみ**で、作業ディレクトリを掴んでいる
セッションからは実行できないためユーザー作業として残る。

TASK-125 で、リポジトリ内で完結する参照（当時の `backlog/config.yml` の
project_name・`Backlog.md`（いずれも backlog.md 撤去（Issue #171）で削除済み）・
`.gitignore`）は更新済み。本書は**リポジトリ外**の
名前変更手順をまとめた人間向け runbook である。

## 1. GitHub リポジトリ名の変更（実行済み: 2026-07-31）

Web UI（Settings → General → Repository name）か、gh CLI で変更する。
実際には次のコマンドで実行した:

```fish
gh repo rename zeitreise --repo ishii1648/the-history
```

### リダイレクト挙動（GitHub の仕様）

- 旧名 `ishii1648/the-history` への **clone / fetch / push / Web アクセス / API
  呼び出しは新名へ自動リダイレクト**される。名前変更直後にローカルの remote URL
  を更新しなくても作業は継続できる。
- ただしリダイレクトは恒久保証ではない。**旧名と同名のリポジトリを新規作成
  するとリダイレクトは無効化される**ため、`the-history` という名前の
  リポジトリを再作成しないこと。
- GitHub Actions・branch protection・PR・issue はリポジトリに紐づくため
  そのまま引き継がれる。追加作業は不要。

## 2. Cloudflare 側の確認（変更不要）

デプロイは GitHub Actions + wrangler CLI（API token 認証）方式であり、
Cloudflare の Git 連携（GitHub App）を使っていない。そのためリポジトリ名
変更による Cloudflare 側の影響は**ない**。以下を確認だけする:

- Pages プロジェクト名: `zeitreise`（`.github/workflows/deploy.yml` の
  `--project-name=zeitreise`）— 既に新名で作成済み。
- R2 バケット: `zeitreise-tiles`、CORS 許可オリジン: `zeitreises.com` 系
  （`.github/r2-cors.json`）— リポジトリ名に依存しない。
- 残課題: 旧 Pages プロジェクト `the-history` の削除可否はユーザー判断待ち
  （TASK-127 申し送り事項。本 runbook のスコープ外）。

## 3. ローカル環境の更新

### 3-1. worktree の整理（ディレクトリ移動の前に必須）

`.claude/worktrees/` 配下の worktree は `.git` ファイルで**絶対パス**を
参照しているため、リポジトリのディレクトリを移動すると壊れる。移動前に 不要な
worktree を削除しておく:

```fish
cd ~/ghq/github.com/ishii1648/the-history
git worktree list
# 不要なものを削除（locked のものは --force が必要）
git worktree remove --force .claude/worktrees/agent-xxxx
git worktree prune
```

進行中のエージェント worktree が残っている場合は、全エージェントの完了を
待ってから実施する。

### 3-2. ディレクトリ移動と remote URL 更新

ghq の配置規約（`~/ghq/<host>/<owner>/<repo>`）に合わせてディレクトリ名を
変更し、remote URL を新名へ向ける:

```fish
cd ~/ghq/github.com/ishii1648
mv the-history zeitreise
cd zeitreise
git remote set-url origin git@github.com:ishii1648/zeitreise.git
git remote -v  # origin が zeitreise.git を指すことを確認
```

worktree を残したまま移動した場合は、移動後に修復を試みる:

```fish
git worktree repair
```

### 3-3. 動作確認

```fish
cd ~/ghq/github.com/ishii1648/zeitreise
git fetch origin
deno task test
```

## 4. 変更後の全体確認

1. `gh repo view ishii1648/zeitreise` が新名で表示される。
2. main へのダミーでない次回マージで deploy workflow
   （`.github/workflows/deploy.yml`）が green になり、 https://zeitreises.com
   が更新される。
3. 旧 URL https://github.com/ishii1648/the-history にアクセスすると
   新リポジトリへリダイレクトされる。

## 補足: リポジトリ内に残る旧名参照

以下は Done 済みタスクの歴史的記述（当時の PR URL・当時の Pages
プロジェクト名）であり、意図的に更新しない:

- `docs/archive/backlog-tasks/task-2 - *.md` — PR #14 の URL（GitHub
  側リダイレクトで引き続き到達可能）
- `docs/archive/backlog-tasks/task-11 - *.md` — PR #3 の URL（同上）
- `docs/archive/backlog-tasks/task-127 - *.md` — 旧 Pages プロジェクト
  `the-history` の削除可否に関する申し送り
