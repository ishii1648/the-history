<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.48.0 -->

<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview`
before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog
tasks.

Before task lifecycle actions, read the matching detailed guide:

- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or
  assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria,
  writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows
options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files
directly. Use the `backlog` CLI so metadata, relationships, and history stay
consistent.

</CRITICAL_INSTRUCTION>

<!-- BACKLOG.MD GUIDELINES END -->

## タスク駆動開発（Backlog.md）

- ブランチ名には TASK ID を含める: `task-N-slug`（例:
  `task-1-deno-setup`）。これによりブランチから backlog
  タスクへ常に追跡できるようにする。
- `backlog/tasks/*.md` の依存関係順に厳密に作業する。あるタスクの `dependencies`
  が全て終端ステータスに達するまでは着手しない。また、タスクのステータス遷移を曖昧にしないため並行実行はしない。
- PR タイトル・説明には TASK ID を明記し、レビュー履歴が backlog
  タスクと紐づくようにする。
- TDD は必須: 実装より先にテストを書き、red（失敗）を確認してから green
  にする。詳細は `docs/development-style.md` を参照。
- エージェント分担: 実装は subagent に委譲し、レビューは mainagent
  自身が行う。codex など外部エージェントによるレビューは行わない。
- 標準タスクフロー: backlog タスク → ブランチ作成 → テスト先行 → 実装 （subagent
  に委譲）→ `deno test` green → mainagent によるレビューで収束 → PR 作成（TASK
  ID 明記）→ CI green → マージ → backlog finalization。
- タスクは Acceptance Criteria が全てチェック済みかつ CI が green の場合にのみ
  Done となる。
- 次タスクの選択は人の指名ではなく決定的ルールで行う: status が `To Do` かつ
  `dependencies` が全て `Done` のタスクのうち `ordinal`
  最小のものを選ぶ（`In
  Progress` のタスクが残っている間は選ばない）。判定は
  `deno task next-task` を使う。外側ループはローカルの Claude Code セッションで
  `/agent-loop`（`.claude/commands/agent-loop.md`）を実行して
  回し、マージ後も同一セッションが次タスクを継続する。CI や PR のステータスは
  Monitor ツールや PR activity 購読で監視する。詳細は
  `docs/development-style.md` の 4 章を参照。
- 人の介入は例外時のみ: AC が曖昧・CI が恒常 red・仕様判断が必要な場合に限り
  `needs-human` ラベル付き issue を起票して停止し、判断を仰ぐ。それ以外で人の
  指示を待たない。
