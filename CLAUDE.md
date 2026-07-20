
<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.48.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

## プロジェクト運用規約

- **ブランチ命名**: `task-N-短い説明`（例: `task-1-deno-setup`）。TASK ID と内容が一目でわかるようにする
- **タスク実行順序**: `backlog/tasks/` の `dependencies` に従い、依存が満たされたタスクから番号順に逐次実行する（並列実行はしない）
- **main への取り込み**: タスクブランチは main に fast-forward できる状態を保ち、マージ後に `git push origin main` まで行う
- **検証方針**: 各タスクの Acceptance Criteria は基本的にローカル起動での手動確認で検証する。`scripts/build-data.ts` のようなロジック中心のタスクは、必要に応じて `deno test` の追加を検討する
- **ライセンス**: `data/` 配下の historical-basemaps 由来の派生データは GPL-3.0 必須。リポジトリ全体（アプリコード含む）も GPL-3.0 とする
