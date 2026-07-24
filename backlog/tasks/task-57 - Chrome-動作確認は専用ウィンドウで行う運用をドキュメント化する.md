---
id: TASK-57
title: Chrome 動作確認は専用ウィンドウで行う運用をドキュメント化する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 13:31'
updated_date: '2026-07-24 16:26'
labels: []
dependencies: []
ordinal: 55000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
claude-in-chrome での実機動作確認は、ユーザーの普段遣いウィンドウではなく動作確認専用の Chrome ウィンドウ（MCP タブグループ）で行う必要がある。現状この運用はエージェントのメモリにのみ記録されており、docs/development-style.md や agent-loop skill などプロジェクトのドキュメントには反映されていない。地図タブが visibilityState: hidden（他ウィンドウの背後）になると maplibre の rAF が停止し描画・検証がブロックされる問題があるため、この手順をチーム/エージェント共通のドキュメントとして残し、今後のセッションでも一貫して専用ウィンドウでの検証が行われるようにする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/development-style.md（または適切な既存ドキュメント）に、Chrome 動作確認は専用ウィンドウ（MCP タブグループ）で行う旨が明記されている
- [x] #2 tabs_context_mcp {createIfEmpty: true} の挙動（新規ウィンドウが作られるとは限らず、普段遣いウィンドウ内にタブグループができる場合がある点と、その場合はタブを別ウィンドウへ切り離す対処）が記載されている
- [x] #3 地図タブが hidden 状態になると maplibre の描画（rAF）が停止するため、検証前に専用ウィンドウを前面化する必要がある旨が記載されている
- [x] #4 既存タブへの navigate を基本とし、タブ・ウィンドウを無駄に増やさない運用方針が記載されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/development-style.md 4.3.1（動作確認の標準: ヘッドレス CDP）の直後に、claude-in-chrome を最終手段として使う場合の運用を追記する: (a) 専用 Chrome ウィンドウ（MCP タブグループ）で行う (b) tabs_context_mcp {createIfEmpty: true} は普段遣いウィンドウ内にタブグループを作る場合があり、その際はタブを別ウィンドウへ切り離す (c) 地図タブが hidden だと maplibre の rAF が停止するため検証前に前面化する (d) 既存タブへの navigate を基本としタブ/ウィンドウを増やさない。
2. TASK-58 の standard（CDP）との位置づけを明記し、矛盾なく接続する。
3. 並列化判定: 見送り（理由: 既存ドキュメント 1 箇所への追記のみで分割対象がない）。docs 領域のみの小規模変更のため TASK-41/59 の前例に倣い mainagent が直接実装する。
4. deno fmt → fmt/lint/test/build green → PR（TASK-57 明記）→ CI green → finalization → マージ。
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
docs/development-style.md 4.3.1 の claude-in-chrome 最終手段の位置づけ直後に、専用ウィンドウ運用（専用 MCP タブグループでの検証・createIfEmpty が普段遣いウィンドウ内にタブグループを作る場合の切り離し対処・hidden で rAF が停止するための前面化・既存タブ navigate 基本のタブ節約）を追記した。AC #1〜#4 は追記本文の該当箇所と対応（grep で確認済み）。deno fmt --check / lint / test / build green、PR #69 CI green。decision 記録判定: TASK-58 の decision（CDP 標準化）を補完する運用詳細であり新規決定はないため decision 化なし。
<!-- SECTION:FINAL_SUMMARY:END -->
