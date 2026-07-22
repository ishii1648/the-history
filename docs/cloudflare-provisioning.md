# Cloudflare インフラのプロビジョニング方式

## 背景

TASK-10（Cloudflare デプロイと CSP・CI 整備）の事前準備として、Cloudflare Pages
（静的アセット配信）と R2（`europe.pmtiles` 配信）のプロビジョニング方法を検討した。
候補は次の2つだった。

1. **Terraform**（`cloudflare/cloudflare` Provider）でリソースを宣言的に管理する
2. **wrangler CLI** で対話的・スクリプト的にリソースを直接作成する

## 決定

**wrangler CLI で直接プロビジョニングする**。Terraform は導入しない。

## 比較検討

| 観点 | Terraform | wrangler CLI |
|---|---|---|
| 変更のレビュー可能性 | plan 差分で事前レビュー可能 | コマンド実行がそのまま反映される |
| 導入コスト | provider 設定・state backend・CI 権限設計が必要 | 追加設定不要、即座に使える |
| 対象リソース数 | 多数のリソースを横断管理する際に有利 | 少数リソースなら手間が少ない |
| 学習・運用コスト | HCL・state 管理の知識が要る | 既存の Cloudflare CLI 知識で完結 |

本プロジェクトの現状規模は **Pages プロジェクト1つ + R2 バケット1つ** のみであり、
複数環境（staging/production）や多数のリソースを横断管理する必要もない。この規模では
Terraform 導入によって得られる「宣言的管理・差分レビュー」のメリットよりも、state
ファイル管理や CI 権限設計を新たに構築するオーバーヘッドの方が大きいと判断した。

## 将来 Terraform 化を再検討すべき基準

以下のいずれかに該当する場合は、Terraform 導入を再検討する。

- 管理対象の Cloudflare リソースが増え、手動作成・変更の追跡が困難になった場合
  （例: 複数の R2 バケット、Workers、DNS ゾーン設定などが加わる）
- staging / production など複数環境を並行運用するようになり、環境間の設定差分を
  コードで一元管理したくなった場合
- 個人開発からチーム運用に移行し、インフラ変更を PR レビューの対象にしたくなった場合
- セキュリティ・コンプライアンス要件により、インフラ変更の変更履歴・承認フローを
  必須化する必要が生じた場合

## wrangler と Terraform を併用する場合の注意点（将来のため記録）

将来 Terraform を導入する場合でも、**wrangler と Terraform に同一リソースの管理を
二重に持たせてはいけない**。二重管理は state drift やデプロイ競合（例: Worker
デプロイの 409 Conflict）の原因になる。推奨される分業は以下の通り。

- **Terraform が担当**: リソースの作成（R2 バケット、Pages プロジェクトの箱、KV/D1、
  DNS、セキュリティルールなど）
- **wrangler が担当**: 実際のデプロイ（`wrangler pages deploy`）、D1 マイグレーション、
  ローカル開発（`wrangler dev`）、ログ監視（`wrangler tail`）

Pages プロジェクトなど、既に wrangler で作成済みのリソースを後から Terraform 管理に
載せる場合は、新規作成ではなく `terraform import` で既存リソースを state に取り込む
必要がある。
