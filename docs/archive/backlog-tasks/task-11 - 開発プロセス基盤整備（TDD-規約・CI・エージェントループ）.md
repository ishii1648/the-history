---
id: TASK-11
title: 開発プロセス基盤整備（TDD 規約・CI・エージェントループ）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-20 06:53'
updated_date: '2026-07-21 02:41'
labels: []
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
今後の全タスクを TDD・issue 駆動（Backlog タスク起点）・ループエンジニアリング（エージェント自律レビューループ + CI フィードバックループ）で進めるための規約と仕組みを整備する。deno.json は TASK-1 の領分なので作成しない。デプロイ CI・Renovate は TASK-10 の領分なので含めない。参照: docs/development-style.md（本タスクで新規作成）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/development-style.md に TDD 規約（テスト先行・red-green-refactor・`*_test.ts` 配置・描画部の目視確認区別）が明文化されている
- [x] #2 docs/development-style.md に issue 駆動規約（全変更は backlog タスク起点、AC 全チェック + CI green が Done 条件）が明文化されている
- [x] #3 docs/development-style.md に 3 層ループ運用（`deno test --watch` / `/review-loop` 収束 / CI ゲート）が明文化されている
- [x] #4 .github/workflows/ci.yml が fmt/lint/test/build を実行し、deno.json 不在時はスキップして green になる
- [x] #5 main の branch protection（CI 必須 + PR 必須）が設定されている、または設定手順が docs に記載されている
- [x] #6 CLAUDE.md にタスク標準フロー（テスト先行→実装→test green→/review-loop→PR→CI green→finalization）が追記されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-11-dev-process-foundation を作成
2. docs/development-style.md を新規作成（TDD 規約 / issue 駆動規約 / 3 層ループ運用）
3. .github/workflows/ci.yml を新規作成（deno.json 不在ガード付き fmt/lint/test/build）
4. gh api で main の branch protection を設定（失敗時は docs に手順記載）
5. CLAUDE.md にタスク標準フローを追記
6. actionlint 等で検証し finalization ガイドに従って完了処理
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
docs/development-style.md（TDD/issue駆動/3層ループ/branch protection手順）、.github/workflows/ci.yml（deno.json不在ガード付き、actionlintエラーなし）、CLAUDE.md追記を作成。gh apiコマンドの型付きフィールドは -F に修正。main は branch protection 未設定（public リポジトリ・無料プランで設定可能なことを確認済み）。AC#4 は push 後の CI 実行結果で検証予定。

PR #3 push・作成済み、main の branch protection（required check: ci, PR必須）設定済み。gh pr checks 3 で ci=pass(6s)を確認しAC#4を検証。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TDD・issue駆動・ループエンジニアリングの開発プロセス基盤を整備した。docs/development-style.md（規約明文化）、.github/workflows/ci.yml（deno.json不在ガード付きCI、実行確認済みgreen）、CLAUDE.md追記（タスク標準フロー）を作成し、main branch protection（ci必須+PR必須）を設定。PR #3 (https://github.com/ishii1648/the-history/pull/3) で全AC達成を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
