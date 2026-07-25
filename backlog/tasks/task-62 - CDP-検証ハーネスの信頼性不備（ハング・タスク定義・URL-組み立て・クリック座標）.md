---
id: TASK-62
title: CDP 検証ハーネスの信頼性不備（ハング・タスク定義・URL 組み立て・クリック座標）
status: To Do
assignee: []
created_date: '2026-07-25 05:42'
labels:
  - bug
  - 'area:scripts'
dependencies: []
ordinal: 59000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review CONFIRMED 指摘 #3/#4/#8 + PLAUSIBLE #9 をまとめた bug。(a) scripts/verify/cdp.ts の send() が返す promise は WebSocket の error/close・Chrome 死亡時に reject されず永久ハングし、無人ループが失敗シグナルなしで停止する。期待: ws.onerror/onclose で pending を一括 reject し、send にタイムアウトを設ける。(b) deno.json の verify:smoke タスクが cdp.ts の必須 2 引数（url, checkScript）を欠き、タスク名どおり実行すると usage エラーで exit 1。期待: smoke スクリプトをタスク定義に含め URL のみ渡せば動く形にする。(c) cdp.ts CLI が checkScript の file:// URL を percent-encoding なしの文字列連結で組み立てており、空白入りパスで import が失敗する。期待: toFileUrl 等の正規 API を使う。(d) checks/smoke.ts のクリック座標が rect.left/top を無視して width/2,height/2 を使っており、canvas がビューポート原点に無いレイアウトで座標がずれる（PLAUSIBLE — 修正時に実挙動を検証）。発見契機: /code-review（PR #64/TASK-58 由来コードの横断レビュー）。
再現手順: (a) スモーク実行中に headless Chrome を kill してプロセスが終了しないことを確認 (b) deno task verify:smoke を引数どおり実行し exit 1 を確認 (c) 空白入りディレクトリにチェックスクリプトを置いて実行。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 WS 切断・Chrome 死亡で pending が reject され非 0 終了する（再現テスト red → 修正 green）
- [ ] #2 deno task verify:smoke <url> が単体で動作する
- [ ] #3 file:// URL が正規 API で組み立てられ空白入りパスでも動く
- [ ] #4 クリック座標が canvas の rect 原点を考慮する（PLAUSIBLE 指摘の検証込み）
<!-- AC:END -->
