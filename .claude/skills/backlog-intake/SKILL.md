---
name: backlog-intake
description: ユーザーの依頼内容から Backlog.md 運用ルールに沿ったタスクを起票する skill。「起票して」「タスク作成して」「タスク化して」等、backlog タスクの新規作成が必要なときに使う。
---

# backlog-intake — Backlog.md タスク起票

ユーザーの依頼（機能要望・bug 報告・改善アイデア等）を、プロジェクトの運用
ルール（`docs/development-style.md`・`backlog instructions task-creation`）に
沿った backlog タスクとして起票する。以下の手順を上から順に実行する。

## 1. 重複確認（起票前に必須）

同じ内容のタスクが既に存在しないかを必ず確認してから起票する。

- `backlog search "<キーワード>" --plain` を、依頼内容から抽出した**複数の
  キーワード**（機能名・対象モジュール・症状など言い換えを含む）で実行する。
- `backlog task list --status "To Do" --plain` で未着手タスクの一覧も確認する
  （検索語のずれによる見落とし防止）。
- 一致しそうなタスクは `backlog task view TASK-N --plain` で本文まで読んで
  重複か否かを判定する。
- 既存タスクで内容がカバーされているなら起票せず、そのタスク ID をユーザーに
  提示する。部分的に重なるなら、既存タスクの拡張（`backlog task edit`）か
  差分のみの新規起票かを判断する。

## 2. スコープ判定

依頼を以下の 3 パターンに分類してから起票する。

| 判定                                                                | 構造             | 起票方法                                         |
| ------------------------------------------------------------------- | ---------------- | ------------------------------------------------ |
| 単一の焦点を持つ PR 1 つで完結し、レビュアーが一度に読める          | 単一タスク       | `backlog task create` 1 回                       |
| 共有ゴールが 1 つで同一サブシステム内に閉じるが、作業単位を分けたい | 親子タスク       | 親を作成後、`-p TASK-N` で子タスクを作成         |
| 独立して届けられる成果物が複数あり、サブシステム・レイヤーをまたぐ  | 依存関係付き分割 | タスクを分けて `--dep TASK-N` で実行順を表現する |

判定の問い: 「単一 PR で完結するか」「レビュアーは全変更を一度に確認できる
か」「独立したデリバリーポイントがあるか」「複数サブシステムにまたがるか」。
迷ったら小さく分ける方に倒す（1 タスク = 1 PR の原則）。

## 3. 起票は必ず `backlog task create` CLI 経由

**`backlog/tasks/*.md` を直接作成・編集することは禁止**（メタデータ・ファイル
名・履歴の整合性が壊れる）。必ず CLI を使う。主なオプション:

```bash
backlog task create "<タイトル>" \
  --description '<背景・目的・調査済み事実>' \
  --ac '<検証可能な振る舞い 1>' \
  --ac '<検証可能な振る舞い 2>' \
  --labels 'area:<領域>' \
  --ordinal <番号> \
  --dep TASK-N
```

- `--ac` は複数回指定できる。`--dep` は依存タスクがある場合のみ。
- 親子タスクは `-p TASK-N`（親は実在するタスク ID。milestone ID は不可）。
- bug 起票は `--labels bug,area:<領域>` のように label `bug` を必ず付ける。

## 4. 記述ルール

### Description

- 背景・目的・調査済みの事実を書き、**会話コンテキストなしで将来のエージェント
  が着手できる**内容にする。実装プランは書かない（着手時に worker が調べて
  記録する）。
- **bug の場合**は `docs/development-style.md` 2 章の bug intake フォーマットに
  従う: 再現手順・期待挙動・実際の挙動・発見契機（どのタスクの動作確認/どの
  報告で見つかったか）を Description に記載し、label `bug` を付ける。

### Acceptance Criteria

- 実装手順ではなく**検証可能な振る舞い**を書く（「〜関数を実装する」は不可、
  「〜すると〜が表示される」「テストが green」は可）。
- 自動テストできない描画系の確認に限り「目視確認」を AC にしてよい。
- bug の場合の AC は「再現テスト（red）が追加されている」「修正により green」
  を基本とする。

### area ラベル

- `docs/development-style.md` 4.2 章の表に従い `area:<領域>` を付与する
  （複数可）。タスク間並列実行の判定（`deno task next-tasks`）に使われるため
  省略しない。
- 領域: `area:docs` / `area:workflow` / `area:src-main` / `area:src-<module>`
  と、 `scripts/` `data/` の細分化領域（下表）。対応パスの目安は同章の表を参照。
- **`scripts/` `data/` は細分化領域を使う。** 粗い `area:scripts` / `area:data`
  は使わない（`next-tasks` は文字列一致で衝突を見るため、粗いラベルと
  細分化ラベルが混在すると実際には衝突するタスクが並列に選ばれる）。範囲が広い
  タスクは該当する細分化領域を複数併記する。

| 細分化領域              | 対応パスの目安                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `area:scripts-base`     | `scripts/build-data.ts`・`build-hre.ts`・`clean-polygons.ts`・`base-properties_test.ts`                                                              |
| `area:scripts-fiefs`    | `scripts/build-*-fiefs.ts`・`build-fief-dedupe.ts`・`build-fief-flat.ts`・`clean-polygons.ts`                                                        |
| `area:scripts-features` | `scripts/build-rivers.ts`・`build-mountains.ts`・`build-peaks.ts`・`build-cities.ts`・`audit-rivers.ts`                                              |
| `area:scripts-meta`     | `scripts/build-colors.ts`・`build-attribution.ts`・`audit-attribution.ts`・`name-ja_test.ts`・`known-limitations-json_test.ts`・`notes-json_test.ts` |
| `area:scripts-build`    | `scripts/build.ts`・`extract-pmtiles.ts`・`extract-dem.ts`（`build.ts` はハブなので同士は衝突扱い）                                                  |
| `area:scripts-loop`     | `scripts/next_task.ts`・`next_tasks.ts`・`cleanup_branches.ts`                                                                                       |
| `area:scripts-verify`   | `scripts/serve.ts`・`scripts/verify/`                                                                                                                |
| `area:data-base`        | `data/europe_<year>.geojson`・`europe_flat_<year>.geojson`・`base_outline_<year>.geojson`・`hre_<year>.geojson`・`index.json`・`name-overrides.json` |
| `area:data-fiefs`       | `data/<region>_fiefs_<year>.geojson`・`<region>_fiefs_flat_<year>.geojson`・`fief-dedupe.json`                                                       |
| `area:data-features`    | `data/rivers.geojson`・`mountains.geojson`・`peaks.geojson`・`cities.json`                                                                           |
| `area:data-meta`        | `data/colors.json`・`name-ja.json`・`notes.json`・`known-limitations.json`                                                                           |

- `scripts-*` と `data-*` は同名サフィックスが対になる（`scripts-base` が
  `data-base` を生成する等）。触るパイプラインを決めれば両方のラベルが決まる。
  `scripts-build` / `scripts-loop` / `scripts-verify` は生成物を持たないため
  対になる `data-*` はない。

### ordinal

- 既存タスクの最大 ordinal を確認し（例: 最新のタスクを
  `backlog task view TASK-N --plain` で見る）、**最大 + 1000 を目安**に採番する
  （後からの挿入余地を残すため）。
- 優先度は label `bug` が担保するため、ordinal で優先度を表現しない（bug でも
  ordinal は通常どおり採番する）。

### シェル引数の注意（バッククォート）

- Description や AC に Markdown のコードスパン（バッククォート）を含める場合、
  ダブルクォート内ではコマンド置換として実行されてしまう。**シングルクォート**
  で渡すか、`printf` で組み立てる。置換後のテキストは復元できないため、
  シェルに渡る前に必ず防ぐ。

```bash
backlog task create 'Document `backlog init` setup' \
  --ac 'Instructions mention `backlog init --defaults` literally'
```

## 5. 起票後の確認

- `backlog task view TASK-N --plain` で、Description・Acceptance Criteria・
  labels（area、必要なら bug）・ordinal・依存関係が期待どおり着地したことを
  確認する。
- バッククォートの化け・改行の欠落・AC の粒度（実装手順になっていないか）を
  ここで点検し、ずれていれば `backlog task edit` で修正する。
- 起票したタスク ID とタイトルをユーザーに報告する。
