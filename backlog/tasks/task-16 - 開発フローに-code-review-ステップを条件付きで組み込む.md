---
id: TASK-16
title: agent-loop 完了時に /code-review 実行を促す最終レポートへ変更
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 09:21'
updated_date: '2026-07-21 11:51'
labels: []
dependencies: []
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
当初は「PR 作成前に /code-review を実行するステップ」を検討したが、/code-review は disable-model-invocation のためエージェントから起動できず、ループに挟むと HITL になるため組み込みは見送る（ユーザー決定 2026-07-21）。代わりに次の 2 点を開発フロー文書（.claude/skills/agent-loop/SKILL.md、必要に応じて docs/development-style.md 4 章）に反映する:

1. **完了時の /code-review 促し**: agent-loop の停止条件『deno task next-task の出力が空で In Progress もない（全タスク完了）』に達した際の最終レポートに、全タスク完了の報告とともにユーザーへ /code-review 実行を促す文言（レビュー対象の説明付き）を含める。
2. **/code-review 指摘の bug タスク化**: ユーザーが /code-review を実行して得られた指摘（bug）は、既存の bug intake フォーマット（label bug・再現手順・期待/実際の挙動・発見契機、AC は再現テスト red → 修正で green）でタスクとして起票し、bug 最優先ルールにより /agent-loop の次イテレーションで処理できるようにする。この受け入れフローを SKILL.md の bug intake 節に追記する。

経緯: TASK-4 で /code-review 試行を行い、Skill ツールからの起動が「disable-model-invocation」で拒否されることを確認済み（Implementation Notes 参照）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 deno fmt --check が green である
- [x] #2 agent-loop SKILL.md の停止条件・最終レポート手順に、全タスク完了の報告とともにユーザーへ /code-review の実行を促す旨が記載されている
- [x] #3 PR 作成前に /code-review を自律実行する旨の記述が文書に存在しない（HITL 回避の設計判断が明記されている）
- [x] #4 /code-review の指摘を bug intake フォーマットで label bug タスクとして起票し agent-loop で処理する流れが SKILL.md に記載されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-16-code-review-flow を origin/main から作成
2. 並列化判定: 見送り（理由: SKILL.md 中心の文書追記のみ。subagent 1 体に委譲）
3. SKILL.md の停止条件・最終レポート節を拡張: 全タスク完了時の最終レポートに /code-review 実行の促し（レビュー対象の説明付き）を含める手順を追記
4. SKILL.md の bug intake 節に /code-review 指摘の受け入れフロー（bug intake フォーマットで起票 → bug 最優先で次イテレーション処理）を追記
5. HITL 回避の設計判断（PR 前の自律実行はしない・理由）を明記
6. fmt green → PR → CI 監視 → マージ → finalization
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
TASK-4 試行での判明事項（2026-07-21）: /code-review スキルは disable-model-invocation が設定されており、エージェント（モデル）からの自律起動は不可。Skill ツール呼び出しは「Skill code-review cannot be used with Skill tool due to disable-model-invocation」で拒否される。したがって「PR 作成前に自律ループが /code-review を実行する」という当初設計は成立しない。設計代替案: (a) ユーザーが試行タイミングで手動実行するゲートとして文書化する (b) 同等の構造化レビュー（レビュー専用 subagent に diff レビューを委譲し CONFIRMED/PLAUSIBLE を判定させる）をループ内に実装する (c) 組み込み自体を見送る。本タスク着手時に方式を決定する。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
SKILL.md と development-style 4.2 章への文書化を PR #26 で実装。検証エビデンス: (AC1) deno fmt --check green（2.7.14） (AC2) SKILL.md に「最終レポート（全タスク完了時）」節を新設し、完了報告 + /code-review 実行の促し（対象＝ループで main にマージされた一連の変更、の説明付き）を規定。停止条件から参照 (AC3) grep で「PR 作成前の自律実行」記述が存在しないことを確認し、HITL 回避の設計判断（disable-model-invocation で自律起動不可）を明記 (AC4) bug intake 節に /code-review 指摘の受け入れフロー（bug intake フォーマット起票 → bug 最優先 → /agent-loop 再開）を追記。TASK-4 での試行（Skill 呼び出し拒否の実証）が根拠として Implementation Notes に記録済み。CI green。
<!-- SECTION:FINAL_SUMMARY:END -->
