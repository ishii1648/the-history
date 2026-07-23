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
  が全て終端ステータスに達するまでは着手しない。タスク間の並列実行は
  `deno task next-tasks` が返す「area が互いに素なタスク集合」に限り許可する
  （`docs/development-style.md` 4.2
  章）。各タスクのステータス遷移（`In
  Progress` →
  `Done`）の一意性は並列時も維持する。
- PR タイトル・説明には TASK ID を明記し、レビュー履歴が backlog
  タスクと紐づくようにする。
- TDD は必須: 実装より先にテストを書き、red（失敗）を確認してから green
  にする。詳細は `docs/development-style.md` を参照。
- エージェント分担: 実装は subagent に委譲し、レビューは mainagent
  自身が行う。codex など外部エージェントによるレビューは行わない。
- default branch（main）上で作業しない。編集・コミットは必ず作業ブランチで行い、
  main への反映は常に PR 経由とする。
- 並列化判定は二層で行う。**タスク間並列**: `deno task next-tasks` の集合判定で
  area（`area:<領域>` ラベル）が互いに素なタスク群は同時に実装してよい （1
  タスク = 1 PR・bug 最優先は維持）。area が交差する・未付与・候補が 1
  件のみの場合は従来どおり直列にフォールバックする。**タスク内並列**:
  タスク内で並列作業が可能な場合は作業効率を上げるため subagent を並列に
  複数起動する。可否の判定は実装プラン記録時に必須で行い、判定結果と根拠
  （見送りの場合は理由）をプランに記録する。いずれの並列でも subagent 同士の
  衝突を避けるため worktree isolation を利用し、成果物の conflict は PR で
  解消する。
- 標準タスクフロー: `deno task next-tasks` で着手可能なタスク集合を判定 →
  集合内の各タスクごとに backlog タスク → ブランチ作成（いずれも main から
  分岐）→ タスク内並列化判定（実装プランに記録）→ テスト先行 → 実装 （subagent
  に委譲、並列可なら複数起動）→ `deno test` green → mainagent
  によるレビューで収束 → 個別 PR 作成（TASK ID 明記）→ CI green → マージ →
  マージ後動作確認 → backlog finalization。集合が単一タスクなら従来の直列
  フローと同一。動作確認で見つけた問題は label `bug` 付きタスクとして起票し、
  次イテレーションで最優先修正する（直接 hotfix しない）。
- タスクは Acceptance Criteria が全てチェック済みかつ CI が green の場合にのみ
  Done となる。
- 次タスクの選択は人の指名ではなく決定的ルールで行う: status が `To Do` かつ
  `dependencies` が全て `Done` のタスクのうち `ordinal`
  最小のものを選ぶ（`In
  Progress` のタスクが残っている間は選ばない）。ただし
  label `bug` を持つタスクは `ordinal` に関わらず最優先で選ぶ（bug 群内は
  ordinal → ID 順）。判定は `deno task next-tasks`（area が互いに素な集合を
  同じ優先順の貪欲選択で返す。単一選択の `deno task next-task` も互換維持）を
  使う。外側ループはローカルの Claude Code セッションで `/agent-loop`
  スキル（`.claude/skills/agent-loop/SKILL.md`）を実行して
  回し、マージ後も同一セッションが次タスクを継続する。CI や PR のステータスは
  Monitor ツールや PR activity 購読で監視する。詳細は
  `docs/development-style.md` の 4 章を参照。
- 人の介入は例外時のみ: AC が曖昧・CI が恒常 red・仕様判断が必要な場合に限り
  `needs-human` ラベル付き issue を起票して停止し、判断を仰ぐ。それ以外で人の
  指示を待たない。加えて、CI red 連続回数・実装 subagent 試行回数・タスク
  着手からの経過時間・停滞検出のいずれかが定量上限を超えた場合も強制的に
  エスカレーションする（上限値は `docs/development-style.md` 4.4.1 章を参照）。
