---
id: TASK-134
title: Renovate を導入し依存更新のクールダウンと自動マージ無効を設定する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:44'
updated_date: '2026-07-29 16:00'
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
- [x] #1 renovate.json（または同等の設定）がリポジトリに追加される
- [x] #2 通常の依存更新に 7 日、patch 更新に 3 日の minimum release age が設定される
- [x] #3 自動マージが無効である
- [x] #4 lockfile の更新がコミットに含まれる設定になっている
- [x] #5 コア依存（maplibre-gl / deck.gl / pmtiles）の更新 PR が目視レビュー対象と判別できる形になっている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/app-spec.md §6 の依存更新方針を読み、renovate.json を作成（AC#1）
2. minimum release age: 通常 7 日・patch 3 日（AC#2）。automerge 無効（AC#3）。lockfile 更新を含む設定（AC#4）
3. コア依存（maplibre-gl / deck.gl / pmtiles）を packageRules で分離しラベル等でレビュー必須と判別可能に（AC#5）
4. 設定は Renovate の JSON スキーマで検証（deno で schema 検証 or renovate-config-validator 相当の静的確認）

並列化判定: 見送り（理由: 設定ファイル 1 つの追加）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- renovate.json のみ追加。enabledManagers: deno + github-actions（SHA ピンのダイジェスト更新 + helpers:pinGitHubActionDigests）
- minimumReleaseAge 7 days / patch 3 days、automerge false（config:recommended は automerge を有効化しないため二重に安全）
- rangeStrategy: bump — 範囲指定でも in-range リリースが PR になり deno.lock が同一 PR で更新される（AC#4）
- コア依存（maplibre-gl / pmtiles / @deck.gl/**）は core-dependency + needs-human-review ラベル + [core] サフィックス。deck.gl 系は groupName で 1 PR に集約
- 公式スキーマ（44.0.1、draft-07）+ ajv で VALID。fmt / lint / test green（mainagent 独立確認）
- 有効化は Renovate GitHub App のインストール（ユーザー操作）が必要。PR 本文に明記
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
renovate.json を追加（deno + github-actions マネージャ、クールダウン 7 日/patch 3 日、automerge 無効、rangeStrategy: bump で deno.lock 同梱、コア依存はラベルと [core] で目視レビュー判別）。公式スキーマで VALID を確認。有効化には Renovate App のインストールが必要（ユーザー操作）。
<!-- SECTION:FINAL_SUMMARY:END -->
