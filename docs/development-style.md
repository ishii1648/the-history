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
- bugfix も同じ red → green → refactor を適用する:
  修正より先に問題を再現するテストを書き、red であることを確認してから修正して
  green にする。描画など自動テストで再現できない場合に限り、テストの代わりに
  目視確認 AC で代替する（2 章の bug 起票フォーマットを参照）。

## 2. issue 駆動開発規約

- すべての変更は Backlog.md タスクを起点とする。着手前に
  `backlog search "<キーワード>" --plain` で既存タスクを確認し、なければ
  `backlog task create` で新規作成する。
- 既存の運用規約（本ファイル末尾ではなくプロジェクト `CLAUDE.md` の「Task-Driven
  Development」節）に定める、ブランチ名 `task-N-slug`・依存関係順の実行（area が
  互いに素な場合のタスク間並列を含む。4.2 章参照）・PR への TASK ID
  明記は継続して守る。
- タスクを Done にできるのは、Acceptance Criteria が全てチェック済みで、かつ CI
  が green の場合に限る。
- 動作確認（`/agent-loop` のマージ後動作確認フェーズや手動確認）で見つけた
  問題は、直接 hotfix せず必ず label `bug` 付きの backlog
  タスクとして起票してから直す。起票フォーマット:
  - Description: 再現手順・期待挙動・実際の挙動・発見契機（どのタスクの
    動作確認/どの報告で見つかったか）を記載する。
  - Acceptance Criteria: 「再現テスト（red）が追加されている」「修正により
    green」。自動テストできない描画系の問題に限り「目視確認」を追加する。
  - dependencies は原則空、ordinal は通常どおり採番する（優先順位は label `bug`
    が担保するため、選択順に ordinal は使わない）。

### 2.1 設計判断の記録（backlog decisions）

タスク横断で影響する設計判断は backlog decision として記録し、後続タスクが
判断の背景・根拠を参照できるようにする。

**記録する判断（タスク横断で影響するもののみ）:**

- アーキテクチャ・データフローの方式選択（例: 色割当の静的生成、picking の
  レイヤー順制御）
- データソースの採用・不採用（例: historical-basemaps のコミット固定採用）
- ライセンス方針（例: NC ライセンスデータの GPL 派生データからのファイル分離）
- プロジェクト規約の新設・変更（例: area ラベルによるタスク間並列判定）
- 複数の選択肢からトレードオフを比較して下した採否で、後続タスクの実装を
  制約するもの

**記録しない判断:**

- タスク限りの実装意図・Why（そのタスクのスコープで完結し、後続タスクを
  制約しないもの）。これらはコンテキストコミットの `intent:` / `decision:` 行と
  backlog task の Implementation Notes に記録すれば十分であり、decision
  へ転記しない（重複記録は同期切れ・形骸化を招くため禁止）。

**コンテキストコミットとの棲み分け:** コミット本文の `decision:` 行は「その
コミット/タスク限りの判断」を残す場所、backlog decision は「タスク横断の
判断」を残す場所と区別する。タスク横断の判断が実装中に生まれた場合は backlog
decision に本体を書き、コミット側は decision ID（例: `decision-3 参照`）を
参照するに留める（本文の二重管理をしない）。

**記録タイミング:** `/agent-loop` の finalization 時に「このタスクで下した
判断にタスク横断で影響するものがあるか」を判定して記録する
（`.claude/skills/agent-loop/SKILL.md` の手順に組み込み済み）。

**CLI の使い方**（backlog.md v1.48 時点。`backlog decision --help` /
`backlog search --help` で確認済み。decision には list / view / edit
サブコマンドは存在しない）:

- 作成: `backlog decision create -s accepted "<タイトル>"`。タイトルは
  検索しやすい日本語で「何をどう決めたか」まで含める。CLI は本文の編集を
  サポートしないため、作成直後に生成ファイルの `## Context` / `## Decision` /
  `## Consequences` セクションを埋める（背景・決定・根拠・関連 TASK を
  簡潔に。frontmatter は CLI 管理のため編集しない）。
- 一覧: `backlog search --type decision --plain`
- キーワード検索: `backlog search "<キーワード>" --type decision --plain`
- 本文の参照: 一覧で得たファイル `backlog/decisions/decision-N - <タイトル>.md`
  を直接読む（読み取りの直接参照は 5 章のフォールバックと同じ扱いで可）。

## 3. ループエンジニアリング（3 層ループ運用）

開発中は次の 3 つのフィードバックループを内側から外側へ多重に回す。

1. **内側ループ（秒〜分単位・ローカル）**: `deno test --watch`
   でテストを常時実行し、red/green
   を即座に確認しながら実装する（`deno task test:watch` として task-1
   で整備予定）。
2. **中間ループ（実装完了〜PR前・エージェント自律）**: 実装は subagent
   に委譲する。実装プラン記録時に並列化判定を必須で行う: 独立サブ作業
   （ファイル競合・実行順依存がなく独立にテスト可能な単位）への分割案を
   列挙し、採否と根拠をプランに記録する。並列可なら subagent を並列に複数
   起動し（worktree isolation で衝突回避、conflict は PR で解消）、見送り
   なら理由を明記する。mainagent はレビュー時に並列化判定の記載有無を確認し、
   無記載なら差し戻す。実装が一通り 終わったら mainagent が diff をレビュー
   し、指摘があれば subagent に修正を指示して、mainagent が問題なしと判断
   するまで収束させる（codex など外部エージェントによるレビューは行わない）。
   作業は必ず作業ブランチで行い、default branch（main）上では行わない。
3. **外側ループ（PR ゲート・CI）**: PR 作成後は CI（fmt / lint / test /
   build）が green になるまでマージしない。CI が red の場合は修正してから再度
   push し、このループを回す。

## 4. 次タスク選択の決定化と外側の自律ループ

### 4.1 次タスク選択ルール（決定的）

次に着手するタスクは人が指名するのではなく、次の決定的ルールで一意に定める。

1. 候補 = status が `To Do` かつ `dependencies` の全てが `Done`
   のタスク（backlog に存在しない依存 ID は未完了として扱う）。
2. 候補のうち label `bug` を持つタスクは、`ordinal`
   に関わらず最優先で次タスクとする。bug 候補が複数ある場合はその中で `ordinal`
   昇順、同値なら ID の数値部分が小さい方を選ぶ。
3. bug 候補が無ければ、残る候補のうち `ordinal` 最小のタスクを次タスクとする
   （`ordinal` 欠落は最後回し。同値なら ID の数値部分が小さい方）。
4. ただし `In Progress` のタスクが 1 つでも残っている間は次タスクを選ばない
   （イテレーション境界規約。進行中タスクの finalization 完了が先）。

このルールは `scripts/next_task.ts` に実装されており、`deno task next-task`
で次タスク ID（例: `TASK-2`）が出力される（候補なしなら出力なし・exit 0）。
backlog CLI には依存しないため、CLI が未インストールの環境や CI 上でも動く。
動作確認で見つけた問題（2 章参照）を label `bug`
付きで起票すると、このルールにより次イテレーションで最優先に選ばれる。

### 4.2 area ラベル規約とタスク間並列実行

タスク間の並列実行可否を機械的に判定できるよう、各タスクには「変更するファイル
領域」を表す `area:<領域>` ラベルを labels に付与する（複数可）。領域一覧と
対応パスの目安:

| area                | 対応パスの目安                                                                                                                             |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `area:docs`         | `docs/`                                                                                                                                    |
| `area:workflow`     | `.claude/`・`CLAUDE.md`・backlog 運用                                                                                                      |
| `area:scripts`      | `scripts/`                                                                                                                                 |
| `area:data`         | `data/`                                                                                                                                    |
| `area:src-main`     | `src/main.ts`・`index.html`・`app.css` の UI 統合部。UI 系タスクの大半は ここに触るため、`src-main` を持つタスク同士は互いに衝突扱いとする |
| `area:src-<module>` | `src/` 配下の独立モジュール（例: `area:src-labels`、`area:src-powers`）                                                                    |

- area の付与はタスク作成時に行い、既存タスクの整備時にも追記する（backlog CLI
  の `--add-label` を使い、既存ラベルを消さない）。
- `deno task next-tasks` は、To Do かつ dependencies 全 Done の候補から 4.1
  章と同じ優先順（bug 最優先 → `ordinal` → ID）の貪欲選択で「area が互いに
  素なタスク集合」を決定的に返す。出力は JSON（`tasks` = 選択された集合、
  `skipped` = area 衝突等で見送った候補と理由）。area 未付与のタスクは変更範囲が
  不明なため、貪欲選択の先頭に来た場合のみ単独選択する（保守的フォールバック＝
  直列）。`In Progress` のタスクが存在する間は空集合を返す。
- 従来の `deno task next-task`（単一選択）は互換維持されており、単一タスクの
  判定にはそのまま使える。
- タスク間並列実行のルール:
  - `next-tasks` が返した集合が複数タスクなら、それらを同時に実装してよい。
    集合内の各タスクは個別ブランチ・個別 PR で進める（1 タスク = 1 PR）。
  - bug 最優先・各タスクの `In Progress` → `Done` 遷移の一意性は並列時も維持
    する。
  - 並列不可の場合（area が交差する・area 未付与・依存関係で候補が 1 件のみ）
    は従来どおり直列で 1 タスクずつ進める。
- 並列化判定は二層で行う: **タスク間並列**（本節。`next-tasks` による集合判定）
  と、**タスク内並列**（3 章の中間ループ。タスクを独立サブ作業に分割して
  subagent を並列起動する判定）。両者は独立に判定し、実装プランにはタスク内
  並列の判定結果を従来どおり記録する。

### 4.3 外側の自律ループ（ローカル実行・/agent-loop）

外側ループはローカルの Claude Code セッション自身が実行主体となって回す。 GitHub
Actions からセッションを起動する方式は用いない。手順は
`.claude/skills/agent-loop/SKILL.md`（`/agent-loop` スキル）に定義されており、
セッションは「`deno task next-tasks` で着手可能なタスク集合を判定（4.2 章）→
集合内の各タスクを標準タスクフロー （TDD・subagent 実装・mainagent
レビュー）で実装（並列可なら同時に）→ タスクごとに個別 PR 作成 → CI 監視 → green
で マージ → finalization →
次の集合へ」を人の指示なしで繰り返す。集合が単一タスクの場合は従来どおりの
直列フローと同一になる。

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
- ループは同時に 1 セッションのみ。1 イテレーション = 1 タスク集合（各タスクは
  個別 PR）。`In Progress` のタスクが残っている間は新たな集合判定を開始しない。

起動はローカルセッションで `/agent-loop` を実行するだけでよい。停止は
セッションを止めるか、停止条件（全タスク完了・needs-human 起票）に達した
ときにループ自身が終了する。

`/code-review` はループ内で自律実行しない（`disable-model-invocation` で
エージェント起動不可・ループに挟むと HITL になるため）。全タスク完了時の
最終レポートでユーザーへ `/code-review`（対象＝このループで main にマージ
した一連の変更）の実行を促し、その指摘は bug intake で label `bug`
タスク化してループに還流する。詳細は `.claude/skills/agent-loop/SKILL.md`。

### 4.4 エスカレーション規約（人の介入は例外時のみ）

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

## 7. GitHub Actions の外部 action ピン留め

`.github/workflows/` のワークフローで外部 action
を追加・更新する際は、タグ（`@v4` など可変参照）ではなく**フルコミット SHA（40
桁）で固定**し、対応するバージョンを
コメントで併記する。タグは後から別コミットへ付け替え可能なため、タグ固定のままだと
タグ乗っ取りによるサプライチェーン攻撃を受けうる（SHA は不変なので固定できる）。

```yaml
# 良い例（SHA 固定 + バージョンコメント）
uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
uses: denoland/setup-deno@22d081ff2d3a40755e97629de92e3bcbfa7cf2ed # v2.0.5

# 悪い例（可変タグ参照）
uses: actions/checkout@v4
```

- SHA はタグ/ブランチが指す実体を GitHub API で取得する（例:
  `gh api repos/actions/checkout/git/ref/tags/v4 --jq .object.sha`。annotated
  tag で `object.type` が `tag` の場合は
  `gh api repos/<owner>/<repo>/git/tags/<sha>` で さらに deref する）。取得した
  SHA が対象バージョンに対応することを確認してから
  コメントのバージョンを記載する。
- action を更新する際は SHA とコメントのバージョンを同時に書き換える。Dependabot
  等で更新する場合も SHA 固定＋コメント併記の形式を維持する。
