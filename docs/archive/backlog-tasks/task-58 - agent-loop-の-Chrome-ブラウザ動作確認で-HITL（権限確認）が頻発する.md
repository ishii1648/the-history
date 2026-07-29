---
id: TASK-58
title: agent-loop の Chrome ブラウザ動作確認で HITL（権限確認）が頻発する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 14:33'
updated_date: '2026-07-24 14:46'
labels:
  - bug
  - 'area:workflow'
dependencies: []
ordinal: 0
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー報告: agent-loop（.claude/skills/agent-loop/SKILL.md 手順4「マージ後の動作確認」）が Chrome ブラウザで実機動作確認を行う際、mcp__claude-in-chrome__* ツール呼び出しのたびに人間の承認確認（HITL）が発生し、自律ループのはずが頻繁に停止してしまう。期待挙動: 自律ループ実行中は動作確認が人の介在なしに完了する（CLAUDE.md の『人間への確認を最小化』方針、および development-style.md 4.3 章の自律ループ運用と整合）。実際の挙動: ブラウザ操作のたびに許可プロンプトが挟まり、ループが止まる。発見契機: ユーザーが agent-loop 実行中の動作確認フェーズの様子を観察して気づいた。対応方針の候補（比較検討して採用すること）: (a) update-config スキルを使い .claude/settings.json の permissions.allow に mcp__claude-in-chrome__* の動作確認で必要なツール（navigate・computer の screenshot/wait 等の非破壊的操作）を許可リストとして追加し、破壊的操作（フォーム送信等）までは無条件許可しない範囲に絞る (b) ブラウザでの目視確認自体をやめ、ビルド成果物・スクリーンショット比較等の非対話的なスモークチェックへ動作確認方式を切り替える (c) 上記の組み合わせ。採否と根拠は tasks 横断で影響するため backlog decision（TASK-28 参照）として記録すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 自律ループ実行中の Chrome ブラウザ動作確認で、mcp__claude-in-chrome__* ツール呼び出しによる人間の承認待ち（HITL）が発生しない
- [x] #2 許可範囲は動作確認に必要な最小限（非破壊的操作）に絞られており、フォーム送信・削除等の破壊的操作までは無条件許可されない
- [x] #3 採用した対応方針（permissions 許可・確認方式変更・組み合わせ）とその根拠が backlog decision として記録されている
- [x] #4 .claude/settings.json 等の変更内容が反映され、実際に agent-loop の動作確認フェーズを走らせて HITL が発生しないことを確認する
- [x] #5 .claude/skills/agent-loop/SKILL.md・docs/development-style.md の該当箇所（動作確認手順）が変更内容と整合するよう更新されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針（案 b+c の複合、実績あり）: 動作確認の標準を「ヘッドレス Chrome + CDP ハーネス」へ切り替える。本セッションで試作・実証済み（scratchpad/verify/cdp.ts — 実 GPU の --headless=new で描画・rAF が動作し、任意 JS 評価・1px 精度クリック・キー入力・スクリーンショットを無人実行。TASK-50/51/52 の実機確認で使用実績）。claude-in-chrome 拡張（可視ウィンドウ必須・ツール毎の権限確認 = HITL の発生源）はユーザー体感確認の最終手段に格下げ。
2. 実装: (a) ハーネスを scripts/verify/cdp.ts としてリポジトリへ移植（navigate バグ修正済み版。純ロジック部（CDP メッセージ相関等）に可能な範囲でテストを追加） (b) deno task verify:app 等のタスク登録と使用例 check スクリプトの同梱 (c) .claude/settings.json の permissions.allow にハーネス実行に必要な Bash パターン（deno run -A scripts/verify/…・Chrome バイナリ起動）を最小範囲で追加（mcp__claude-in-chrome__* の包括許可はしない = AC#2 の趣旨に整合） (d) SKILL.md 手順 4・docs/development-style.md の動作確認手順をヘッドレス標準に更新。
3. decision 記録（AC#3）: 「動作確認はヘッドレス CDP を標準とし claude-in-chrome は最終手段」を backlog decision 化（finalization 時）。
4. 検証（AC#1/#4）: 移植後のハーネスで実際に動作確認フェーズ相当（アプリ起動 → 年代切替 → クリック → スクリーンショット）を無人実行し、権限プロンプトが発生しないことを確認。
5. 並列化判定: 見送り（理由: ハーネス移植と文書・設定更新は相互参照する一体作業。単一 subagent 委譲・最終検証は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（2026-07-25）:
- AC#1/#4: 移植後のハーネス（scripts/verify/cdp.ts + checks/smoke.ts）で動作確認フェーズ相当（アプリ起動待ち → 年代切替 1000→1500 → 河川クリック → ライン川パネル表示 → エラートースト不在 → スクリーンショット）を無人実行し PASS。権限プロンプトは一切発生せず（Bash 許可 2 パターンで完結）。
- AC#2: .claude/settings.json への追加は Bash(deno task verify:*) と Bash(deno run -A scripts/verify/*) の 2 件のみ。mcp__claude-in-chrome__* の包括許可なし。
- AC#3: decision-11（ヘッドレス CDP 標準・拡張は最終手段）を accepted で記録。
- AC#5: SKILL.md 手順 4 と development-style.md 4.3.1 章を更新（ヘッドレスの注意点 3 件も明文化）。
- TDD: 純ロジック（pickPageTargetUrl/parseEvaluateResult/resolveKeyCode/buildWaitForExpr）を red（TS2305）→ green で 9 テスト。全体 535 passed・fmt/lint/build green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
agent-loop の動作確認を claude-in-chrome 拡張（HITL・可視ウィンドウ・精度の 3 制約）からヘッドレス Chrome + CDP ハーネス（scripts/verify/）へ移行。無人スモークの実証（年代切替・河川クリック・トースト不在・スクリーンショット）、最小 Bash 許可 2 件、decision-11、SKILL.md/development-style.md の整合更新まで完了。検証: TDD red→green（535 passed）・CI green・無人実行で HITL ゼロを確認。
<!-- SECTION:FINAL_SUMMARY:END -->
