---
id: TASK-89
title: deno task serve がポート衝突でスタックトレースを吐いて起動できない
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 14:39'
updated_date: '2026-07-26 15:12'
labels:
  - bug
  - 'area:scripts'
  - 'area:docs'
  - 'area:workflow'
dependencies: []
ordinal: 83000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 再現手順

1. 任意のセッション・シェルで `deno task serve` を起動したまま残す
2. 同じリポジトリで再度 `deno task serve` を実行する

## 期待挙動

空いているポートで起動する、または「既に起動中である」ことと対処（占有している PID・停止方法）が分かるメッセージを出して終了する。

## 実際の挙動

原因の説明なしにスタックトレースだけを出して異常終了する:

```
error: Uncaught (in promise) AddrInUse: Address already in use (os error 48)
  Deno.serve(options, handler);
       ^
    at listen (ext:deno_net/01_net.js:594:35)
    at serveInner (ext:deno_http/00_serve.ts:713:16)
    at Object.serve (ext:deno_http/00_serve.ts:629:10)
    at main (https://jsr.io/@std/http/1.1.2/file_server.ts:911:8)
```

ポート衝突が原因であることも、誰が占有しているかも読み取れない。

## 発見契機

ユーザーが 2026-07-26 に `deno task serve` を実行して遭遇。

## 調査済みの事実（2026-07-26。実装時に再検証すること）

- deno.json の serve タスクは `jsr:@std/http@^1/file-server dist` をポート指定なしで起動するため、ポートは @std/http のデフォルト 8000 に固定される。占有チェックもフォールバックも無い。
- 実際に 8000 を占有していたのは、**別の Claude Code セッションが起動したまま残した `deno task serve`** だった（lsof で PID 90136、稼働 8 分以上。親プロセスの環境変数 CODEX_COMPANION_SESSION_ID が当該セッションのものと一致し、実行中セッションのものとは異なる）。ローカル検証やエージェントループで起動した dev サーバが後始末されずに残る運用上の穴がある。TASK-59 の暴走ジョブ復旧手順と地続きの問題。
- scripts/verify/cdp.ts は CDP のデバッグポートについては `findFreePort()`（`Deno.listen({ port: 0 })` で空きポートを取得）を持っており、同じ考え方をアプリ配信ポートにも適用できる。
- 一方 cdp.ts の doc コメントは `await api.navigate("http://localhost:8011/")` と 8011 を例示しており、serve の既定ポート 8000 とドリフトしている。ポート番号の単一定義元が存在しない。
- docs/app-spec.md 175 行目が dev サーバとして `deno task serve` に言及しているが、ポートには触れていない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ポートが既に使用中の状態で serve を実行しても、スタックトレースではなく原因と対処が分かるメッセージで終了する、または空きポートで起動する
- [x] #2 起動したポートが標準出力に表示される
- [x] #3 scripts/verify/cdp.ts のコメント例と serve の既定ポートが一致し、ポート番号の定義元が 1 箇所になっている
- [x] #4 ローカル検証で起動した dev サーバを後始末する手順が docs に記載されている
- [x] #5 ポート占有時の挙動を検証する再現テストが追加され、修正前は red・修正後は green になる
- [x] #6 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. serve を jsr file-server の直接起動から自前ラッパースクリプト（scripts/serve.ts 等）へ置き換える: 既定ポート 8000 を定数として単一定義元に置き、占有時は (a) 占有 PID・停止方法を含む説明メッセージで終了するか (b) 空きポートへフォールバックして起動ポートを標準出力に明示（実装時に UX を比較して選択・根拠記録）。
2. cdp.ts の doc コメント例のポートを単一定義元と一致させる（AC#3）。
3. docs に dev サーバの後始末手順（lsof での特定・停止）を記載（AC#4）。
4. TDD: ポート占有時挙動の再現テスト（ポートを塞いで起動→メッセージ/フォールバックを検証）を先に書き、現行実装で red を確認（AC#5）。
5. 全チェック green → 実機で verify:smoke がフォールバック/明示ポートでも通ることを確認 → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: serve ラッパー・定数一元化・docs が同一変更に付随する小規模タスク。単一 subagent に委譲）。
タスク間並列: なし（next-tasks 単独集合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: 既定は占有プロセス（PID・コマンド）と対処 5 案を提示して exit 1、--auto-port で空きポートへフォールバック。実機で占有状態の両挙動を確認（実在の残存サーバ PID 32708 を正しく特定）。黙ったフォールバックを既定にしない根拠（旧ビルド配信によるスモーク誤判定防止）を記録。
- AC#2: 全経路で起動 URL を標準出力に表示（実機確認: http://localhost:51758/ 等）。
- AC#3: DEFAULT_PORT を scripts/serve.ts の単一定義元とし cdp.ts は DEFAULT_APP_URL 経由で参照。doc コメント 8011 のドリフト解消（cdp_test で検証）。
- AC#4: README に後始末手順（lsof -nP -iTCP:<port> → kill）を記載。
- AC#5: ポートを塞いだ再現テスト（serve_test.ts）で修正前 red → 修正後 green。
- AC#6: deno test 928 passed。全チェック green、PR #98 CI green。
- decision 記録判定: 新規なし（開発ツーリングの改善でタスク横断方針なし）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
deno task serve を自前ラッパー scripts/serve.ts に置き換え、ポート占有時は占有 PID・対処 5 案の説明メッセージ（既定）または --auto-port フォールバックで扱えるようにした。起動 URL の明示・DEFAULT_PORT の単一定義元化・後始末手順の README 記載を含む。TDD で再現テスト red→green（928 passed）、実機で両挙動確認、CI green（PR #98）。
<!-- SECTION:FINAL_SUMMARY:END -->
