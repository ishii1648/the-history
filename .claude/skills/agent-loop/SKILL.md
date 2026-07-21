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
     の状態を調べ、中断地点から続きを行う）。再開時、実装プランに並列化判定が
     記録されていなければ追記してから続行する。
   - なければ `deno task next-task` で次タスクを判定する。出力が空なら
     着手可能なタスクがないためループを終了し、最終レポートを出力する。
   - 次タスクのブランチ `task-N-*` が既に origin に存在する場合は状態を
     調査し、再開できるなら再開、判断が必要なら 4 のエスカレーションに従う。
2. **標準タスクフローの実行**（CLAUDE.md / docs/development-style.md に従う）
   - backlog CLI でタスクを `In Progress` にし、実装プランを記録する。
   - 実装プランには **並列化判定** を必須項目として記録する: タスクを独立
     サブ作業（互いにファイル競合・実行順依存がなく、独立にテスト可能な単位。
     例: 独立モジュール群、データ変換とテストフィクスチャ、実装とドキュメント）
     に分割できるか列挙する。
   - 独立サブ作業が 2 つ以上あれば subagent を並列起動（worktree isolation）し、
     subagent ごとの担当範囲・成果物の分担表をプランに書く。
   - 並列化しない場合は「並列化判定: 見送り（理由: …）」を明記する。判定の
     無記載はプラン不備としてレビューで差し戻す。
   - ブランチ `task-N-slug` を作成し、テスト先行（red 確認 → green）で
     実装する。default branch（main）上では作業しない。実装は subagent に
     委譲し、mainagent がレビューで収束させる。並列化判定で並列可とした場合は
     分担表に従い subagent を並列に複数起動し、worktree isolation で衝突を
     避ける（成果物の conflict は PR で解消する）。
   - `deno fmt --check` / `deno lint` / `deno test` / `deno task build` を 全て
     green にしてから PR を作成する（タイトル・説明に TASK ID を明記）。
3. **CI 監視とマージ**
   - PR activity 購読（subscribe_pr_activity 等の MCP）が使える場合は購読する。
   - CI の完了は Monitor ツール（例: PR の check-runs をポーリングし、 success /
     failure / cancelled など終端ステータスを検知したら通知する
     スクリプト）で監視する。フォアグラウンドの sleep 待ちはしない。
   - 監視は check-runs だけでなく
     mergeability（`gh pr view --json
     mergeable,mergeStateStatus`）も必ず対象にする。conflict
     中の PR は pull_request の CI 自体が走らず check-runs
     監視は沈黙し続けるため、 check-runs のみの監視は「conflict
     の検知漏れ」を起こす（禁止）。
   - `CONFLICTING` / `DIRTY` を検知したら、main をタスクブランチに取り込んで
     conflict を解消し（双方の変更意図を統合する。自分側を機械的に優先しない）、
     全チェック green を確認して再 push し、CI green を再確認する。
   - conflict でも CI red でもなくマージ自体がブロックされた場合 （`mergeable`
     が `false`、または `mergeStateStatus` が `BLOCKED` / `BEHIND`
     等）は、原因を分析して**自動修正の可否を切り分ける**。
     `gh pr view <PR> --json mergeable,mergeStateStatus` と、必要に応じて
     `gh api repos/:owner/:repo/branches/main/protection`
     でブランチ保護要件を確認する。
     - **自動修正可**: ループ内の操作で解消できるブロック。例）`BEHIND` （head
       branch が base に未追従・strict protection）は main を取り込んで 再 push
       し CI green を再確認すれば解消する（TASK-2 のマージで実際に
       発生し、この手順で解消した実績がある）。リポジトリ設定で auto-merge が
       無効（`enablePullRequestAutoMerge` エラー）な場合も「修正不可」では
       なく、CI green 確認後に**手動マージ**で代替する。
     - **自動修正不可**: ループ内の操作では解消できないブロック。例）branch
       protection の必須レビュー承認を満たす承認者がループ内に存在しない、
       恒常的に満たせない必須 status check、リポジトリのマージ権限が無い等。
       この場合は手順 5 のエスカレーションに従いループを停止する。
   - CI red なら修正して再 push し、green になるまでこのループを回す。
   - CI green になったら finalization（AC を検証エビデンス付きでチェック → final
     summary → `Done`）をタスクブランチ上でコミットし、再度 CI green を
     確認してからマージする。`Done` がマージと同時に main へ載ることで、
     次イテレーションの `next-task` 判定が正しく進む。
4. **マージ後の動作確認**
   - マージ直後、次イテレーションに進む前に `deno task build` と dev
     サーバ起動で当該タスクの変更点を実際に動かして確認する。ブラウザ操作が
     可能な環境ではブラウザで確認し、不可ならビルド成果物・データ出力の
     スモークチェック（生成物の存在・件数・スキーマ等の機械的な確認）で
     代替する。
   - 目視確認 AC を持つタスクは、手順 3 の finalization で AC
     をチェックする前（マージ前）に dev サーバ等で確認を済ませておく。
     このフェーズではマージ後の main 上での再確認・回帰確認を行う。
5. **例外時のみエスカレーション**
   - 以下のいずれかに限り、`needs-human` ラベル付き issue（**原因・検討した
     選択肢・推奨対応**を記載）を起票してループを停止する。それ以外で人の
     指示を待たない。
     - AC が曖昧・CI が恒常 red・仕様判断が必要な場合。
     - 手順 3 で **自動修正不可** と切り分けたマージブロック（必須レビュー
       承認者の不在、恒常的に満たせない必須 status check、マージ権限不足
       等）。auto-merge 無効のようにループ内で代替手段（手動マージ）が
       あるものは「修正不可」ではないため、ここには含めない。
6. **次イテレーション**
   - マージ完了後、手順 1 に戻る。

## bug intake（動作確認・ユーザー報告からの起票）

- 手順 4（マージ後の動作確認）でループ自身が問題を見つけた場合、その場では
  修正せず `backlog task create` で label `bug` 付きタスクを起票し、手順 1
  に戻る。1 イテレーション = 1 タスク = 1 PR のガードは維持する。bug
  最優先ルール（`docs/development-style.md` 4.1 章）により、その bug
  タスクは次イテレーションで即座に選ばれる。
- ユーザーがループ実行中に動作上の問題を報告した場合も、同じフォーマットで
  起票してループを継続する。
- 起票フォーマット:
  - Description: 再現手順・期待挙動・実際の挙動・発見契機（どのタスクの
    動作確認/どの報告で見つかったか）を記載する。
  - Acceptance Criteria: 「再現テスト（red）が追加されている」「修正により
    green」。自動テストできない描画系の問題に限り「目視確認」を追加する。
  - dependencies は原則空、ordinal は通常どおり採番する（優先順位は ordinal
    ではなく label `bug` が担保する）。

## 停止条件

- `deno task next-task` の出力が空で `In Progress` のタスクもない
  （全タスク完了）。
- `needs-human` エスカレーションを起票した。
- ユーザーが明示的に停止を指示した。

## ガード

- ループは同時に 1 セッションのみ実行する（並行実行しない）。
- 1 イテレーション = 1 タスク = 1 PR。複数タスクをまとめて進めない。
