---
id: TASK-155
title: 検証ハーネスにリモート CDP モードを追加する（CDP_BROKER で外部 Chrome へ接続）
status: To Do
assignee: []
created_date: '2026-07-29 16:56'
labels:
  - 'area:scripts-verify'
  - 'area:docs'
dependencies: []
ordinal: 132000
---

移行先: #169

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: agent-loop セッションを Mac mini 上の k8s pod（kind on colima、k8s-lab リポジトリ管理）へ移す計画がある。pod は Linux VM 内で動くため、実 GPU 描画を要する現行の動作確認ハーネス（scripts/verify/cdp.ts は macOS の Chrome バイナリを spawn し、--disable-gpu 禁止・実 GPU 必須）が pod 内で成立しない。方針は「pod = 頭脳、macOS ホスト = 網膜」の分離: ホスト側に per-run の chrome-broker（launchd 常駐の小さな HTTP サービス。POST /session で fresh profile + 空きポートの headless Chrome を spawn して CDP エンドポイントを返し、DELETE /session/:id で kill、TTL で孤児掃除。127.0.0.1 bind）を置き、pod 内の cdp.ts は Chrome を spawn する代わりに broker から得た WebSocket URL へ接続する。

調査済みの事実: cdp.ts のローカル依存は launch() の Chrome spawn 部分（findFreePort・Deno.Command・/json/list からの ws URL 取得）だけで、以降の navigate/evaluate/click/screenshot は全て CDP プロトコル over WebSocket であり無改修で流用できる。スクリーンショットもプロトコル経由で base64 が返るため pod 側に着地する。broker が返す ws URL の host は 127.0.0.1 なので、pod から到達可能な host（Lima slirp ゲートウェイ 192.168.5.2 等）への書き換えが必要。serve は pod 内で起動し、ホスト Chrome からは kind extraPortMapping + colima port-forward 経由の URL（例 http://127.0.0.1:8000/）で到達するため、検証 URL は従来どおり引数で受ける現行仕様のままでよい。

broker 本体と launchd plist は k8s-lab リポジトリ側の作業であり本タスクの範囲外。本タスクは cdp.ts 側の接続モード追加と broker API 契約（エンドポイント・レスポンス形式）の確定、および docs/development-style.md 4.3.1（動作確認の標準）への追記を範囲とする。フォールバック連鎖（ヘッドレス CDP → 機械的スモークチェック。TASK-64）の位置づけは変えない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 環境変数 CDP_BROKER 未設定時は現行のローカル spawn 動作が変わらない（既存テストが green のまま）
- [ ] #2 CDP_BROKER 設定時は Chrome を spawn せず broker から取得したエンドポイントへ接続して検証が実行でき、ws URL の host 書き換えを含む接続ロジックがモック broker による単体テストで green
- [ ] #3 close() が broker セッションの破棄（DELETE）を呼ぶことがテストで検証されている
- [ ] #4 docs/development-style.md 4.3.1 にリモート CDP モード（用途・CDP_BROKER・フォールバック連鎖上の位置づけ）が追記されている
<!-- AC:END -->
