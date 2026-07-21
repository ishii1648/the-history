# 開発スタイル規約（TDD・issue 駆動・ループエンジニアリング）

> このプロジェクトの開発は「テスト駆動開発（TDD）」「issue 駆動開発（Backlog.md
> タスク起点）」「ループエンジニアリング（複数階層のフィードバックループ）」の 3
> 本柱で進める。

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
   に委譲する。実装が一通り終わったら mainagent が diff をレビューし、指摘が
   あれば subagent に修正を指示して、mainagent が問題なしと判断するまで
   収束させる（codex など外部エージェントによるレビューは行わない）。
3. **外側ループ（PR ゲート・CI）**: PR 作成後は CI（fmt / lint / test /
   build）が green になるまでマージしない。CI が red の場合は修正してから再度
   push し、このループを回す。

## 4. branch protection 設定手順

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
