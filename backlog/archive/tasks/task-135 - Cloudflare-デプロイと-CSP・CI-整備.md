---
id: TASK-135
title: Cloudflare デプロイと CSP・CI 整備
status: To Do
assignee:
  - '@claude'
created_date: '2026-07-20 04:24'
updated_date: '2026-07-28 16:46'
labels: []
dependencies:
  - TASK-1
  - TASK-125
ordinal: 112000
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-10-deploy-csp を origin/main から作成
2. 並列化判定: 見送り（理由: _headers/deploy workflow/renovate.json は少量の設定ファイル群で、worktree 分割の利得なし。subagent 1 体に委譲）
3. 人間依存の分離: Cloudflare アカウント・Pages プロジェクト・R2 バケット作成・GitHub secrets 設定・R2 への europe.pmtiles アップロードは人間作業（シークレットはエージェントが扱わない）。コード側成果物を先に整備し、ユーザーへ確認を出す
4. コード側実装（subagent・TDD 可能な部分はテスト付き）:
   - Cloudflare Pages 用 _headers に CSP（connect-src 'self' + R2 + OpenFreeMap / script-src 'self' / worker-src 'self' blob:）
   - deploy workflow: build と deploy をステップ分離し、build に secrets を渡さない（AC#3）。Pages へは dist/ を、europe.pmtiles は Pages 25MB 制限のため R2 配信（手順文書化）
   - renovate.json: 通常 7 日・patch 3 日クールダウン・automerge 無効（AC#4）
   - BASEMAP_PMTILES_URL の本番切替方法の整備
5. AC#1（実配信）はユーザーの Cloudflare 提供後に検証。確認結果を待って finalization
6. fmt/lint/test/build green → PR → CI 監視 → マージ
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
ユーザー判断（2026-07-21）: TASK-10 は保留。人が明示的に着手を宣言するまで実施しない。next-task の選択対象から外すため draft へ demote する。着手宣言後は promote して再開（実装プランは記録済み。Cloudflare 提供・secrets 設定・R2 アップロードの人間作業が前提）。

ユーザー判断（2026-07-29）: 人間側の準備（Cloudflare アカウント・Pages プロジェクト・R2 バケットの作成、GitHub secrets 設定、europe.pmtiles の R2 アップロード）が完了したため保留を解除し、draft-1 から task へ promote した。promote 時に ID が TASK-10 から TASK-135 へ変わっている点に注意（docs/cloudflare-provisioning.md・backlog/tasks/task-4・task-11 は旧 ID の TASK-10 を参照しているため、着手時に参照を TASK-135 へ更新するか、旧 ID との対応を記録すること）。

着手順の指定: TASK-125（リポジトリ名を zeitreise に変更）の完了後に着手する。dependencies に TASK-125 を追加済み。理由は、TASK-125 の人間作業に Cloudflare Pages プロジェクト名の扱い（the-history のまま据え置くか zeitreise で作り直すか。Pages はリネーム不可のため実質は新規作成 + 再デプロイ + 旧削除で *.pages.dev の URL が変わる）の判断が含まれており、本タスクの deploy workflow がどのプロジェクト名を指すかがそれで決まるため。プロジェクト名が確定する前に workflow を書くと手戻りになる。

着手時に再確認すること: .github/workflows/ には現在 ci.yml しか無く deploy workflow は未整備。_headers（CSP）も renovate.json も未作成。一方 .wrangler/cache/pages.json に project_name: the-history と account_id があり、ローカルから wrangler で手動デプロイした痕跡がある。実装プラン（2026-07-21 記録）は当時のもので、現状のリポジトリ状態を再調査したうえで plan を更新すること。
<!-- SECTION:NOTES:END -->
