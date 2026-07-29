---
id: TASK-156
title: 二拠点・pod 化後の開発運用モデルを docs 化する（Mac mini 実装専有と intake の分離）
status: To Do
assignee: []
created_date: '2026-07-29 16:57'
labels:
  - 'area:docs'
dependencies:
  - TASK-140
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: 外出先からスマホでも開発を進められるようにするため、開発環境を次の構成に再編する計画がある。(1) 実装（agent-loop セッション）は Mac mini に固定し、k8s pod（kind on colima、k8s-lab リポジトリ管理）として動かす。CDP 動作確認はホスト macOS 側の chrome-broker へ委譲する（TASK-155）。(2) タスク起票・状況確認（intake セッション）は PC 作業時は MacBook、外出時はスマホ → Tailscale + mosh → Mac mini ホスト側 tmux で行う。タスク管理の GitHub Issue 化（TASK-137〜141）により起票はサーバ側 API への書き込みで完結し、どのマシンから行っても同期の考慮が不要になる。(3) スマホでの見た目確認は Cloudflare デプロイ（TASK-127 系）の URL を使う。

この運用が事故らないためには役割と資源の専有ルールを明文化する必要がある。docs/development-style.md（または新規 doc）に以下を記録する: 実装・Issue のステータス遷移（In Progress 相当の操作）は agent-loop セッションのみが行い intake セッションは起票と参照に限定すること。deno task serve の既定ポート 8000 は agent-loop 側が専有し intake 側で serve が必要な場合は --port で分けること。スマホからの接続手順（Tailscale + mosh → tmux attach、pod 内ループへは kubectl exec）。未整形 Issue の triage フロー（外出先では GitHub モバイルアプリで雑に起票し triage 相当のラベルを付け、後で intake セッションが重複確認・area ラベル・AC を整えて正式化する）。

前提: triage フローは起票の Issue 化（TASK-140）完了が前提のため依存に含める。Mac mini のホスト構築手順（Tailscale・launchd 等）や k8s マニフェスト自体は k8s-lab / dotfiles 側の管轄であり本タスクの範囲外。本タスクはこのリポジトリの開発フローに関わる運用ルールの文書化のみを範囲とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 実装と Issue ステータス遷移を agent-loop セッションに限定し intake セッションは起票・参照のみとする役割分担が docs に明記されている
- [ ] #2 serve の既定ポート 8000 の専有ルールと intake 側の --port 分離が docs に明記されている
- [ ] #3 スマホからの接続・attach 手順と未整形 Issue の triage フローが docs に記載されている
<!-- AC:END -->
