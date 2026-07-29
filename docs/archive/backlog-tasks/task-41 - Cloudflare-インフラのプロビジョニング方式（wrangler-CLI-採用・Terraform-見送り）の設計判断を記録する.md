---
id: TASK-41
title: Cloudflare インフラのプロビジョニング方式（wrangler CLI 採用・Terraform 見送り）の設計判断を記録する
status: Done
assignee: []
created_date: '2026-07-22 14:38'
updated_date: '2026-07-22 14:42'
labels: []
dependencies: []
documentation:
  - docs/cloudflare-provisioning.md
type: docs
ordinal: 40000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-10（Cloudflare デプロイと CSP・CI 整備）の事前準備として、Cloudflare Pages / R2 のプロビジョニング方式を検討した。Terraform（Cloudflare Provider）導入も候補に挙がったが、Pages プロジェクト1つ + R2 バケット1つという現状の規模では IaC 導入のオーバーヘッド（state 管理・CI 権限設計の複雑化）が見合わないと判断し、wrangler CLI で直接プロビジョニングする方針を採用した。この設計判断の背景・比較検討内容・将来の再検討条件を docs に残し、後から経緯を追えるようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/ 配下に Cloudflare インフラのプロビジョニング方式に関する決定を記録したドキュメントが作成される
- [x] #2 Terraform を採用しなかった理由（現状の規模とオーバーヘッドの見合い）が明記される
- [x] #3 将来 Terraform 化を再検討すべき判断基準（例: 管理リソース数の増加、複数環境化、チーム運用への移行等）が記載される
- [x] #4 wrangler と Terraform を併用する場合の注意点（同一リソースの二重管理は禁止、Terraform=リソース作成・wrangler=デプロイという分業）への言及がある
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/cloudflare-provisioning.md を新規作成する
2. 内容構成: (a) 背景・経緯（TASK-10 Cloudflare デプロイ事前準備で Terraform 導入を検討した経緯）, (b) 検討した選択肢と比較（Terraform Provider vs wrangler CLI 直接プロビジョニング）, (c) 決定: wrangler CLI を採用, (d) 理由: Pages 1つ + R2 バケット1つの規模では IaC の state 管理・CI 権限設計のオーバーヘッドが見合わない, (e) 将来 Terraform 化を再検討すべき基準（管理リソース数増加・複数環境化・チーム運用移行等）, (f) wrangler/Terraform 併用時の注意点（同一リソースの二重管理禁止、Terraform=作成/wrangler=デプロイの分業）
3. 単一ドキュメント作成のみのため並列化判定: 見送り（サブエージェント分割不要）
4. AC を1つずつ本文中の該当箇所で満たしているか確認しチェック
5. finalization（final summary 記入・Done 遷移）
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
docs/cloudflare-provisioning.md を新規作成し、Cloudflare Pages/R2 のプロビジョニングを wrangler CLI 直接運用とし Terraform を見送った設計判断を記録した。理由（Pages1つ+R2バケット1つの規模に対するIaC導入オーバーヘッド）、将来の再検討基準、wrangler/Terraform併用時の二重管理禁止ルールの3点を記載し、grep で該当箇所の存在を確認済み。
<!-- SECTION:FINAL_SUMMARY:END -->
