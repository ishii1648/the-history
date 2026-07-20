---
id: TASK-10
title: Cloudflare デプロイと CSP・CI 整備
status: To Do
assignee: []
created_date: '2026-07-20 04:24'
labels: []
dependencies:
  - TASK-1
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
完全静的構成を Cloudflare Pages + R2 にデプロイし、CSP と CI のセキュリティ方針を適用する。参照: docs/app-spec.md §3.1, §6
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ビルド成果物と data/ が Cloudflare Pages から、europe.pmtiles が R2 から配信される
- [ ] #2 CSP が設定される: connect-src は自ドメイン + R2 + フォールバックタイルのみ、script-src 'self'、worker-src 'self' blob:
- [ ] #3 CI のビルドステップに本番シークレットが渡らず、デプロイが分離ステップで実施される
- [ ] #4 Renovate が通常 7 日・patch 3 日のクールダウン・自動マージ無効で設定される
<!-- AC:END -->
