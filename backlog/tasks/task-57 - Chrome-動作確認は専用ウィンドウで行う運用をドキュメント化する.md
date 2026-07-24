---
id: TASK-57
title: Chrome 動作確認は専用ウィンドウで行う運用をドキュメント化する
status: To Do
assignee: []
created_date: '2026-07-24 13:31'
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
- [ ] #1 docs/development-style.md（または適切な既存ドキュメント）に、Chrome 動作確認は専用ウィンドウ（MCP タブグループ）で行う旨が明記されている
- [ ] #2 tabs_context_mcp {createIfEmpty: true} の挙動（新規ウィンドウが作られるとは限らず、普段遣いウィンドウ内にタブグループができる場合がある点と、その場合はタブを別ウィンドウへ切り離す対処）が記載されている
- [ ] #3 地図タブが hidden 状態になると maplibre の描画（rAF）が停止するため、検証前に専用ウィンドウを前面化する必要がある旨が記載されている
- [ ] #4 既存タブへの navigate を基本とし、タブ・ウィンドウを無駄に増やさない運用方針が記載されている
<!-- AC:END -->
