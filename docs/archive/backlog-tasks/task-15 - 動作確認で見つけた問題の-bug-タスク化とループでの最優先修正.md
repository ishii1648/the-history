---
id: TASK-15
title: 動作確認で見つけた問題の bug タスク化とループでの最優先修正
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 08:37'
updated_date: '2026-07-21 09:01'
labels: []
dependencies: []
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現状の /agent-loop は事前定義タスクの消化に限定され、動作確認中に見つかった問題を取り込む経路がない。①人間・ループ双方からの bug 起票規約（label: bug、再現手順・期待/実際・発見契機を記載、AC は再現テスト red→green）、②next_task.ts の bug 最優先選択ルール（label bug を ordinal より優先）、③agent-loop SKILL.md へのマージ後動作確認フェーズと bug intake 手順の追記、④docs/development-style.md・CLAUDE.md への規約明文化を行う。これにより動作確認で気づいた問題が bug タスクとして積まれ、次イテレーションで最優先に修正される。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 next_task.ts が labels をパースし、label bug を持つ To Do タスクを ordinal に関わらず最優先で選択する（テスト先行で red→green を確認）
- [x] #2 agent-loop SKILL.md にマージ後の動作確認フェーズと bug intake 規約（その場で修正せず起票して手順1へ戻る）が追記されている
- [x] #3 docs/development-style.md と CLAUDE.md に bug 起票フォーマットと bug 最優先ルールが明文化され、実装と矛盾がない
- [x] #4 deno fmt --check / deno lint / deno test / deno task build が全て green で CI が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. main から作業ブランチ task-15-bugfix-intake を作成
2. 並列化判定: 並列可。コード変更（scripts/next_task.ts + next_task_test.ts）と文書変更（.claude/skills/agent-loop/SKILL.md, docs/development-style.md, CLAUDE.md）はファイル集合が互いに素のため、subagent 2 体を worktree isolation で並列起動する
3. subagent A（コード・TDD）: next_task_test.ts に labels パース／bug 最優先のテストを先に追加して red を確認 → TaskMeta に labels 追加・compareTasks を bug 優先に拡張して green
4. subagent B（文書）: SKILL.md にマージ後動作確認フェーズ＋bug intake 規約を追記、development-style.md に bugfix 規約（起票フォーマット・bug 最優先・再現テスト先行）、CLAUDE.md に bug 最優先ルールを追記
5. mainagent が両成果物をレビューして収束 → deno fmt/lint/test/build green を確認
6. 手動 E2E: ダミー bug タスク（label bug・ordinal 99000）で deno task next-task が bug を返すことを確認して削除
7. PR 作成（TASK-15 明記）→ CI green → マージ → finalization
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
next_task.ts の bug 最優先選択を TDD（red: TS2353 ×15 → green: 25 passed）で実装。SKILL.md/development-style.md/CLAUDE.md に動作確認フェーズと bug 起票規約を追記（レビュー指摘 2 件修正済み）。deno fmt/lint/test(37)/build 全て green。E2E: label bug・ordinal 99000 のダミータスク（TASK-16、検証後アーカイブ）が ordinal 2000 の通常タスクより優先選択されることを実ファイルで確認。In Progress ガードにより deno task next-task が空を返すことも確認。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
next_task.ts に label bug の最優先選択を TDD で実装（red: TaskMeta.labels 未定義の型エラー → green: deno test 48 passed）。agent-loop SKILL.md にマージ後動作確認フェーズ・bug intake 規約・PR mergeability 監視と conflict 解消手順を追加し、docs/development-style.md と CLAUDE.md にも bug 起票フォーマットと bug 最優先ルールを明文化。検証: deno fmt --check / lint / test / build 全 green、PR #15 の CI green（ci: pass, MERGEABLE/CLEAN）、実ファイル E2E で label bug・ordinal 99000 のダミータスクが ordinal 2000 の通常タスクより優先選択されることを確認（ダミーはアーカイブ済み）。PR #13/#14 との conflict は main 取り込みで解消し、検知漏れの再発防止（mergeability 監視必須化）を SKILL.md に規約化。
<!-- SECTION:FINAL_SUMMARY:END -->
