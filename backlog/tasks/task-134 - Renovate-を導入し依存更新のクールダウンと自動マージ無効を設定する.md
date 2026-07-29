---
id: TASK-134
title: Renovate を導入し依存更新のクールダウンと自動マージ無効を設定する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 16:44'
updated_date: '2026-07-29 15:46'
labels:
  - 'area:workflow'
dependencies:
  - TASK-127
type: chore
ordinal: 116000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/app-spec.md §6 のセキュリティ方針では、依存更新に Renovate を用い通常 7 日・patch 3 日のクールダウン（minimum release age）を設けて自動マージを無効にすると定めているが、リポジトリに Renovate の設定が存在しない。もとは Cloudflare デプロイのタスク（TASK-127）に含まれていたが、デプロイ・CSP とはレビュー単位が異なるため分離した。コア依存（maplibre-gl / deck.gl / pmtiles）の更新は差分の目視レビューを必須とする方針もあわせて反映する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 renovate.json（または同等の設定）がリポジトリに追加される
- [ ] #2 通常の依存更新に 7 日、patch 更新に 3 日の minimum release age が設定される
- [ ] #3 自動マージが無効である
- [ ] #4 lockfile の更新がコミットに含まれる設定になっている
- [ ] #5 コア依存（maplibre-gl / deck.gl / pmtiles）の更新 PR が目視レビュー対象と判別できる形になっている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/app-spec.md §6 の依存更新方針を読み、renovate.json を作成（AC#1）
2. minimum release age: 通常 7 日・patch 3 日（AC#2）。automerge 無効（AC#3）。lockfile 更新を含む設定（AC#4）
3. コア依存（maplibre-gl / deck.gl / pmtiles）を packageRules で分離しラベル等でレビュー必須と判別可能に（AC#5）
4. 設定は Renovate の JSON スキーマで検証（deno で schema 検証 or renovate-config-validator 相当の静的確認）

並列化判定: 見送り（理由: 設定ファイル 1 つの追加）
<!-- SECTION:PLAN:END -->
