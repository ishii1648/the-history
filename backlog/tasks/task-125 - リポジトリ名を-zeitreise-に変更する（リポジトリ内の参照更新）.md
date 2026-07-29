---
id: TASK-125
title: リポジトリ名を zeitreise に変更する（リポジトリ内の参照更新）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:15'
updated_date: '2026-07-29 17:00'
labels:
  - 'area:workflow'
  - 'area:docs'
dependencies: []
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 目的

リポジトリ名を the-history から zeitreise に変更する。本タスクではリポジトリ内で完結する参照更新のみを行い、GitHub / Cloudflare / ローカル環境の設定変更は人間の作業として切り出す。

## リポジトリ内で更新する参照（実測。着手時に再確認すること）

grep で the-history を全走査した結果、追跡対象ファイルでの参照は次のとおり。

- backlog/config.yml の project_name: "the-history"。backlog CLI の設定なので CLI 経由または直接編集で zeitreise にする
- Backlog.md の 3 行目 Project: the-history。生成物なので再生成する
- backlog/tasks/task-2 および task-11 の本文。いずれも Done 済みタスクの記述で、当時のリポジトリ名を指す履歴的な記述。書き換えるか当時の名前として残すかを判断する
- .gitignore に .wrangler/ を追加する。現状 .wrangler/ は追跡対象外だが gitignore にも入っておらず、git status に毎回出る。中身の .wrangler/cache/pages.json は Cloudflare の account_id と Pages プロジェクト名を持つローカルキャッシュなので、追跡しない意図を gitignore で明示する

README.md・deno.json・index.html・.github/workflows/ci.yml・docs/ 配下にはリポジトリ名の参照が無い（docs/cloudflare-provisioning.md も Pages プロジェクト名をハードコードしていない）。

## 判断する点

- **アプリ名は変更しない**のが既定。README の見出しと index.html の title は「ヨーロッパ国境変遷マップ」で、これはリポジトリ名ではなくアプリの表示名。zeitreise をアプリ名としても採用するかは別の判断であり、本タスクのスコープ外とする。スコープに含めるなら AC を追加すること
- git remote の URL 更新（git remote set-url origin git@github.com:ishii1648/zeitreise.git）は GitHub 側のリネーム完了後でないと実行できない。人間の作業が終わってから行うか、本タスクでは触れないかを決める。GitHub はリネーム後も旧名からリダイレクトするため、更新しなくても即座に壊れはしない

## 人間の作業が必要なもの（本タスクのスコープ外。完了後に依頼する）

1. **GitHub リポジトリ名の変更**（Settings → Repository name → zeitreise）。GitHub は旧 URL からのリダイレクトを維持するため、既存の clone や PR は壊れない
2. **Cloudflare Pages プロジェクト名の変更**。.wrangler/cache/pages.json の project_name が the-history になっている。Cloudflare Pages のプロジェクト名は後からリネームできない仕様のため、実質は zeitreise という新規プロジェクトを作成して再デプロイし、旧プロジェクトを削除する手順になる。*.pages.dev の配信 URL が変わる点の可否判断が要る。URL を変えたくない場合は Pages プロジェクト名を the-history のまま据え置く選択もあり、その場合は据え置く根拠を docs/cloudflare-provisioning.md に記録する
3. **ローカルの ghq パス移動**（~/ghq/github.com/ishii1648/the-history → .../zeitreise）。ghq get で取り直すか mv する。作業ディレクトリを掴んでいるセッションからは実行できないため人間が行う
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backlog/config.yml の project_name が zeitreise になっている
- [x] #2 Backlog.md が再生成され Project 行が zeitreise になっている
- [x] #3 .gitignore に .wrangler/ が追加され、git status に .wrangler/ が出なくなっている
- [x] #4 追跡対象ファイルに残る the-history の参照が、履歴的記述として意図的に残したものだけになっている（残した箇所とその理由が Implementation Notes に記録されている）
- [x] #5 GitHub / Cloudflare / ローカルパスの変更手順が、人間が実行できる粒度で Implementation Notes または docs に記載されている
- [x] #6 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. grep で the-history の全参照を再実測（タスク記載の一覧を検証）
2. backlog/config.yml の project_name を zeitreise に変更（CLAUDE.md の例外で直接編集可）し、Backlog.md を再生成
3. .gitignore に .wrangler/ を追加
4. task-2 / task-11 の歴史的記述は「当時の名前として残す」を推奨判断とし、根拠を Implementation Notes に記録（backlog タスク本文は編集しない）
5. GitHub リポジトリ名変更・Cloudflare・ローカルパス（ghq）の人間向け手順を docs か Implementation Notes に記載
6. deno test green

並列化判定: 見送り（理由: 設定・gitignore・ドキュメントの小規模変更のみ）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- config.yml の project_name → zeitreise、Backlog.md は backlog board export Backlog.md --force + deno fmt Backlog.md で再生成（今後もセットで実行）
- .gitignore に .wrangler/ を追加（Cloudflare ローカルキャッシュ、account_id を含むため追跡しない意図を明示）
- AC#4 残した the-history 参照: (1) task-2/task-11 の Implementation Notes 内の当時の PR URL — 歴史的記録で GitHub リダイレクトにより到達可能、backlog md の直接編集も規約違反のため残置 (2) task-127 の旧 Pages プロジェクト名 the-history — リポジトリ名ではなく実在する別リソースの名前 (3) runbook 自体の旧名言及 — 手順書の性質上意図的
- AC#5 docs/repo-rename-runbook.md: gh repo rename 手順・リダイレクト仕様（旧名での新規作成は禁止）・Cloudflare は変更不要の確認結果（deploy.yml/R2/CORS すべて zeitreise 系・wrangler CLI 方式でリポジトリ名非依存）・ローカル worktree/remote の移行手順（fish 構文）
- fmt / lint / test 1495 passed（mainagent 独立検証）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
リポジトリ内の the-history 参照を整理（config.yml・Backlog.md 再生成・.gitignore に .wrangler/）。残置は歴史的記録と別リソース名のみで根拠を記録。GitHub リネーム・ローカル移行の人間向け手順を docs/repo-rename-runbook.md に整備。1495 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
