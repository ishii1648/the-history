# 開発スタイル規約（TDD・issue 駆動・ループエンジニアリング）

> このプロジェクトの開発は「テスト駆動開発（TDD）」「issue 駆動開発（Backlog.md
> タスク起点）」「ループエンジニアリング（複数階層のフィードバックループ）」の 3
> 本柱で進める。人間は開発フローに原則入らず、介入は例外時のみとする（4
> 章を参照）。

## 1. テスト駆動開発（TDD）規約

- テストは実装と同居させる: `src/foo.ts` に対して `src/foo_test.ts`
  を置く。実行は `deno test`。
- backlog タスクの Acceptance Criteria
  を起点にテストケースを設計する。実装より先にテストを書き、red（失敗）を確認してから実装し、green
  にしてから refactor する（red → green → refactor）。
- MapLibre / deck.gl などの
  DOM・描画に依存する処理は、可能な限りロジックを分離して純粋関数として切り出し、ユニットテストの対象を最大化する。特に以下は重点テスト対象:
  - データ変換（GeoJSON 加工・year snapshot 選択など）
  - 色割当ロジック
  - URL 状態のエンコード・デコード
  - 年代スナップの選択ロジック
- 描画結果そのもの（地図が正しく見えるか等）はユニットテストで検証できないため、該当する
  Acceptance Criteria には「目視確認」と明記し、自動テストの対象と区別する。

## 2. issue 駆動開発規約

- すべての変更は Backlog.md タスクを起点とする。着手前に
  `backlog search "<キーワード>" --plain` で既存タスクを確認し、なければ
  `backlog task create` で新規作成する。
- 既存の運用規約（本ファイル末尾ではなくプロジェクト `CLAUDE.md` の「Task-Driven
  Development」節）に定める、ブランチ名 `task-N-slug`・依存関係順の直列実行・PR
  への TASK ID 明記は継続して守る。
- タスクを Done にできるのは、Acceptance Criteria が全てチェック済みで、かつ CI
  が green の場合に限る。

## 3. ループエンジニアリング（3 層ループ運用）

開発中は次の 3 つのフィードバックループを内側から外側へ多重に回す。

1. **内側ループ（秒〜分単位・ローカル）**: `deno test --watch`
   でテストを常時実行し、red/green
   を即座に確認しながら実装する（`deno task test:watch` として task-1
   で整備予定）。
2. **中間ループ（実装完了〜PR前・エージェント自律）**: 実装は subagent
   に委譲する。タスク内で並列作業が可能な場合は subagent を並列に複数起動して
   作業効率を上げる。このとき subagent 同士の衝突を避けるため worktree isolation
   を利用し、成果物の conflict は PR で解消する。実装が一通り 終わったら
   mainagent が diff をレビューし、指摘があれば subagent に修正を
   指示して、mainagent が問題なしと判断するまで収束させる（codex など外部
   エージェントによるレビューは行わない）。作業は必ず作業ブランチで行い、
   default branch（main）上では行わない。
3. **外側ループ（PR ゲート・CI）**: PR 作成後は CI（fmt / lint / test /
   build）が green になるまでマージしない。CI が red の場合は修正してから再度
   push し、このループを回す。

## 4. 次タスク選択の決定化と外側の自律ループ

### 4.1 次タスク選択ルール（決定的）

次に着手するタスクは人が指名するのではなく、次の決定的ルールで一意に定める。

1. 候補 = status が `To Do` かつ `dependencies` の全てが `Done`
   のタスク（backlog に存在しない依存 ID は未完了として扱う）。
2. 候補のうち `ordinal` 最小のタスクを次タスクとする（`ordinal` 欠落は最後回し。
   同値なら ID の数値部分が小さい方）。
3. ただし `In Progress` のタスクが 1 つでも残っている間は次タスクを選ばない
   （直列実行規約。進行中タスクの finalization 完了が先）。

このルールは `scripts/next_task.ts` に実装されており、`deno task next-task`
で次タスク ID（例: `TASK-2`）が出力される（候補なしなら出力なし・exit 0）。
backlog CLI には依存しないため、CLI が未インストールの環境や CI 上でも動く。

### 4.2 外側の自律ループ（ローカル実行・/agent-loop）

外側ループはローカルの Claude Code セッション自身が実行主体となって回す。 GitHub
Actions からセッションを起動する方式は用いない。手順は
`.claude/skills/agent-loop/SKILL.md`（`/agent-loop` スキル）に定義されており、
セッションは「`deno task next-task` で次タスクを判定 → 標準タスクフロー
（TDD・subagent 実装・mainagent レビュー）→ PR 作成 → CI 監視 → green で マージ
→ finalization → 次タスクへ」を人の指示なしで繰り返す。

CI や PR のステータスは、GitHub Actions のトリガーではなくセッション側が
監視する:

- PR activity 購読（`subscribe_pr_activity` 等の MCP）でレビューコメントや CI
  失敗イベントを受け取る。
- CI の完了は Monitor ツール（check-runs をポーリングし success / failure
  などの終端ステータスを検知するスクリプト）で監視する。フォアグラウンドの sleep
  待ちはしない。

安全ガード:

- 着手可能なタスクがない場合はループを終了する（`In Progress` のタスクが
  あればそれを再開する）。
- 次タスクのブランチ `task-N-*` が既に origin に存在する場合は状態を調査し、
  再開またはエスカレーションする（二重着手防止）。
- ループは同時に 1 セッションのみ。1 イテレーション = 1 タスク = 1 PR。

起動はローカルセッションで `/agent-loop` を実行するだけでよい。停止は
セッションを止めるか、停止条件（全タスク完了・needs-human 起票）に達した
ときにループ自身が終了する。

### 4.3 エスカレーション規約（人の介入は例外時のみ）

エージェントは次のいずれかに該当する場合のみ、`needs-human` ラベル付きの GitHub
issue を起票して作業を停止し、人の判断を仰ぐ。それ以外で人の指示を
待ってはならない。

- タスクの Acceptance Criteria が曖昧で、複数の解釈がありどれを選ぶかで
  成果物が大きく変わる場合
- CI が恒常的に red で、タスクのスコープ内の修正では解消できない場合
- 仕様・アーキテクチャ・運用に関わる判断（外部サービス契約、秘密情報の設定、
  破壊的変更など）が必要な場合

issue には「何がブロックしているか」「検討した選択肢」「推奨案」を書き、 人は
issue 上で判断を返す。判断が返ったらエージェントがタスクを再開する。

## 5. backlog CLI が使えない環境でのフォールバック

CLAUDE.md の規約どおり backlog の変更（タスクの作成・編集・ステータス遷移）は
`backlog` CLI で行う。CLI が未インストールの環境では `npm i -g backlog.md`
でインストールしてから作業する。インストールできない場合、タスクファイルの
**読み取り**は `backlog/tasks/*.md` を直接読んでよいが、**書き込み**は行わず、
CLI が使える状態を先に整えること（`scripts/next_task.ts` は読み取り専用なので
常に使用できる）。

## 6. branch protection 設定手順

main ブランチで CI 必須チェックと PR
必須をまだ設定していない場合、リポジトリ管理権限を持つユーザが以下を実行する（`gh`
CLI が必要）。

```bash
printf '%s' '{"required_status_checks":{"strict":true,"contexts":["ci"]},"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":0},"restrictions":null}' \
  | gh api -X PUT repos/{owner}/{repo}/branches/main/protection \
      -H "Accept: application/vnd.github+json" --input -
```

- `gh api` の `-f`/`-F` はドット記法をネスト展開しないため、ネストした設定は
  `--input` で JSON ボディを渡す。
- `required_status_checks.contexts` には `.github/workflows/ci.yml` のジョブ名
  `ci` を指定する。
- 権限不足で失敗する場合は、GitHub リポジトリの Settings > Branches
  からブラウザ上で同等の設定（Require status checks to pass: `ci`、Require a
  pull request before merging）を行う。
