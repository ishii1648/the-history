---
id: TASK-127
title: Cloudflare デプロイと CSP・CI 整備
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:24'
updated_date: '2026-07-28 17:30'
labels:
  - 'area:workflow'
  - 'area:app'
dependencies:
  - TASK-1
type: chore
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
完全静的構成を Cloudflare Pages + R2 にデプロイし、CSP を適用する。参照: docs/app-spec.md §3.1, §6 / docs/cloudflare-provisioning.md

人間側のプロビジョニングは 2026-07-29 に完了済み。以降はコード側の実装のみで進められる。

確定済みリソース:
- Cloudflare Account ID: da40f700e2fa3c06e86e30e8c29150bf
- Pages プロジェクト: zeitreise（本番ドメイン https://zeitreises.com / プレビュー zeitreise-aop.pages.dev）
- R2 バケット: zeitreise-tiles（カスタムドメイン https://tiles.zeitreises.com・SSL active・r2.dev の公開 URL は無効）
- GitHub Secrets: CLOUDFLARE_API_TOKEN 登録済み（Account ID は秘密情報ではないため設定ファイルへの直書きでよい）

注意: Pages プロジェクトは zeitreise と the-history の 2 つが存在する。デプロイ先は zeitreise。the-history の扱い（削除可否）はユーザーに確認すること。

Renovate 設定は本タスクから分離した（TASK-134）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 main への push で GitHub Actions がビルドし wrangler pages deploy で Pages プロジェクト zeitreise へ dist/ が配信され https://zeitreises.com で地図が表示される
- [ ] #2 europe.pmtiles（および存在すれば europe-dem.pmtiles）が R2 バケット zeitreise-tiles へアップロードされ https://tiles.zeitreises.com から HTTP Range Request で取得できる
- [ ] #3 _headers に CSP が設定される: connect-src は self + https://tiles.zeitreises.com + フォールバックタイルのみ、script-src self、worker-src self blob:。本番でコンソールに CSP 違反が出ない
- [ ] #4 CI のビルドジョブに本番シークレットが渡らず、デプロイが分離ジョブで実施される（CLOUDFLARE_API_TOKEN が deploy ジョブ以外の env に現れない）
- [ ] #5 本番ビルドの BASEMAP_PMTILES_URL / DEM_PMTILES_URL が R2 カスタムドメインを指し、ローカル開発では従来どおり同一オリジンの /europe.pmtiles で動作する
- [ ] #6 _headers の Cache-Control が docs/app-spec.md のキャッシュ方針（エッジでの再検証）に沿う
- [ ] #7 スマートフォンの実機ブラウザで https://zeitreises.com を開き、地図描画と年代切替が動作することを確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/cloudflare-provisioning.md と docs/app-spec.md §3.1/§6 を読み、確定済みリソース（Pages: zeitreise / R2: zeitreise-tiles / Secrets: CLOUDFLARE_API_TOKEN）を前提に設計
2. TDD red: 本番/ローカルの pmtiles URL 切替（BASEMAP_PMTILES_URL / DEM_PMTILES_URL）を決める純粋関数と、_headers 生成（CSP: connect-src self + tiles.zeitreises.com + フォールバックタイル、script-src self、worker-src self blob: / Cache-Control: エッジ再検証方針）のテストを先に書く
3. GitHub Actions: build ジョブ（シークレット無し）と deploy ジョブ（wrangler pages deploy + R2 への pmtiles アップロード。CLOUDFLARE_API_TOKEN は deploy ジョブ env のみ）を分離して実装
4. ローカル検証: deno test / build green、_headers が dist に出力されること、ローカル dev は従来どおり同一オリジン /europe.pmtiles で動作（CDP スモーク）
5. AC#1/#2/#3/#7（本番系）はマージ後にしか検証できないため、マージ後動作確認フェーズで https://zeitreises.com と tiles ドメインの Range Request・CSP 違反無しを確認。AC#7 のスマホ実機はユーザーへ依頼
6. 旧 Pages プロジェクト the-history の削除可否はユーザーに確認（実装は非ブロック）

並列化判定: 見送り（理由: CI workflow・_headers・URL 切替が 1 つのデプロイ経路として結合しており、独立にテスト可能な単位に分割すると統合検証が二度手間になる）
<!-- SECTION:PLAN:END -->
