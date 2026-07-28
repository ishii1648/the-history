---
id: TASK-127
title: Cloudflare デプロイと CSP・CI 整備
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:24'
updated_date: '2026-07-28 18:44'
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
- [x] #1 main への push で GitHub Actions がビルドし wrangler pages deploy で Pages プロジェクト zeitreise へ dist/ が配信され https://zeitreises.com で地図が表示される
- [x] #2 europe.pmtiles（および存在すれば europe-dem.pmtiles）が R2 バケット zeitreise-tiles へアップロードされ https://tiles.zeitreises.com から HTTP Range Request で取得できる
- [x] #3 _headers に CSP が設定される: connect-src は self + https://tiles.zeitreises.com + フォールバックタイルのみ、script-src self、worker-src self blob:。本番でコンソールに CSP 違反が出ない
- [x] #4 CI のビルドジョブに本番シークレットが渡らず、デプロイが分離ジョブで実施される（CLOUDFLARE_API_TOKEN が deploy ジョブ以外の env に現れない）
- [x] #5 本番ビルドの BASEMAP_PMTILES_URL / DEM_PMTILES_URL が R2 カスタムドメインを指し、ローカル開発では従来どおり同一オリジンの /europe.pmtiles で動作する
- [x] #6 _headers の Cache-Control が docs/app-spec.md のキャッシュ方針（エッジでの再検証）に沿う
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー・本番検証済み）

- URL 切替は location.hostname による実行時判定（src/pmtiles_url.ts 純粋関数）。ビルド時注入を避け、本番/プレビュー/ローカルで同一 artifact を使用（AC#4 と整合）。ローカル判定は localhost/*.localhost/ループバック/プライベート IP/空ホスト名
- _headers は scripts/build.ts buildHeadersContent（純粋関数・テスト固定）で dist に生成。CSP connect-src は self + TILES_ORIGIN + tiles.openfreemap.org（フォールバック style の全リソースが同一オリジンであることを実取得で検証）。style-src unsafe-inline は MapLibre/deck.gl のランタイムスタイル操作対応（根拠コメントあり）
- deploy.yml: build ジョブ（シークレット無し・test を最終ゲート・SHA ピン留め action）→ deploy ジョブ（CLOUDFLARE_API_TOKEN はこのジョブ env のみ）。R2 同期はカスタムドメイン HEAD 200 でスキップ・sha256 サイドカー比較・S3 互換 API（DEM 305MiB が wrangler 300MiB 上限超のため）。派生 secret は add-mask 済み。concurrency 直列化
- 本番検証（mainagent、Deploy run 30388189332 success 後）: AC#1 = https://zeitreises.com で地図描画・年代切替 1200→1500→1000 を CDP 実走。AC#2 = 両 pmtiles が 206（europe 203MB / dem 319MB）。AC#3 = CSP ヘッダ適用・securitypolicyviolation リスナーで違反ゼロ・R2 から 38 リソース取得・フォールバック未発動・エラートーストなし（static.cloudflareinsights.com への接続は Cloudflare の NEL/Report-To 由来でブラウザレベル送信のため CSP 対象外・無害）。AC#6 = Cache-Control: no-cache 実測
- AC#7（スマホ実機）のみ未検証。ユーザーへ依頼中
- 残課題: 旧 Pages プロジェクト the-history の削除可否はユーザー判断待ち
<!-- SECTION:NOTES:END -->
