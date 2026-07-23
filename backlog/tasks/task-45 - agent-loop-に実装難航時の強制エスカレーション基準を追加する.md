---
id: TASK-45
title: agent-loop に実装難航時の強制エスカレーション基準を追加する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-23 13:34'
updated_date: '2026-07-23 14:30'
labels: []
dependencies:
  - TASK-28
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー懸念（調査により確認）: 現行の .claude/skills/agent-loop/SKILL.md・docs/development-style.md 4.4 章のエスカレーション条件は「AC が曖昧」「CI が恒常的に red」「仕様・アーキテクチャ判断が必要」の 3 つのみで、「恒常的」を判定する定量的な基準（連続 red 回数・経過時間等）が定義されていない。加えて (1) 同一タスクへのリトライ回数上限 (2) タスク着手からの経過時間・イテレーション数のタイムボックス (3) トークン/コスト予算の上限と到達時の強制停止 (4) 同じ修正を繰り返すだけで進捗がないことを検出する仕組み、のいずれも存在しない。4.3 章の『In Progress のタスクが残っている間は新たな集合判定を開始しない』規約と相まって、実装が技術的に完遂できないタスクにループが固執し、無制限にトークンを消費し続けるリスクがある。対応: (a) CI red の連続回数・タスク着手からの経過時間・subagent の実装試行回数のいずれかに定量的な上限を設け、超過したら自動的に needs-human エスカレーション（4.4 章の既存フォーマット）を起票してループを停止するルールを追加する (b) 同一の失敗（同じテスト失敗・diff がほぼ変化しない再試行）が連続した場合の早期検出も検討する (c) 上限値は運用しながら調整可能な設定値として明記する。既存のエスカレーション基準・bug intake・decision 記録運用と整合させ、CLAUDE.md / docs/development-style.md / agent-loop SKILL.md を更新する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 同一タスクに対する CI red の連続回数・経過時間・実装試行回数のいずれかに具体的な数値上限が定義されている
- [x] #2 上限に到達した場合、自動的に needs-human ラベル付き issue を起票してループが停止する（既存 4.4 章のフォーマットに準拠）
- [x] #3 「同じ失敗を繰り返しているだけで進捗がない」ことを検出する基準（例: 直近 N 回の diff がほぼ同一、同じテストが連続して失敗）が定義され、通常の試行錯誤との区別ができる
- [x] #4 CLAUDE.md・docs/development-style.md 4.4 章・.claude/skills/agent-loop/SKILL.md の該当箇所が一貫して更新されている
- [x] #5 上限値が調整可能な設定値として明記され、決定根拠（なぜその値か）が記録されている（backlog decision 対象、TASK-28 参照）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 基準値の設計（AC#1/#3/#5）: 定量上限を設定値として定義 — (a) 同一タスクの CI red 連続 3 回 (b) 実装 subagent の試行（起動）5 回 (c) タスク着手（In Progress 遷移）から 24 時間、のいずれか超過で強制エスカレーション。停滞検出: 同一テストケースの失敗が 3 回連続、または直近 2 回の修正 push の diff が実質同一（変更ファイル集合と要旨が同じ）の場合は上限前でも「進捗なし」と判定してエスカレーション（通常の試行錯誤 = 失敗内容が変化している場合はカウント継続で区別）。根拠: 本プロジェクトの実績で正常タスクは CI 1〜2 回・subagent 1〜3 起動・1 タスク数時間以内に収束しており、その 2〜3 倍を異常閾値とする。
2. 文書更新（AC#2/#4）: docs/development-style.md 4.4 章に定量基準と needs-human 起票（既存フォーマット準拠）→ループ停止の手順を追記。.claude/skills/agent-loop/SKILL.md の手順 5 に同基準を反映。CLAUDE.md のエスカレーション記述を整合。三者の記述は同一の設定値表を参照する形にし、値の変更が 1 箇所（development-style.md の表）で済むようにする。
3. decision 記録（AC#5）: 上限値と根拠を backlog decision として記録（タスク横断のワークフロー規約変更のため）。
4. TDD 適用判定: ドキュメント/スキル定義のみでテスト対象の純ロジックなし（next_tasks 等のコード変更は行わない）。検証は 3 文書の整合レビューで行う。
5. 並列化判定: 見送り（理由: 3 文書は相互参照する一体の規約変更で、分割すると不整合リスクが上がる。単一 subagent に委譲し、mainagent が整合レビュー）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: docs/development-style.md 4.4.1 章に定量上限の表（CI red 連続 3 回 / subagent 試行 5 回 / 着手から 24 時間 / 停滞検出）を新設。
- AC#2: いずれか超過で 4.4 章フォーマット準拠の needs-human issue を起票しループ停止する判定手順を明記（超過後の実装継続を禁止）。
- AC#3: 停滞検出 = 同一テスト失敗 3 回連続 or 直近 2 回の修正 push の diff が実質同一。「失敗内容が変化する試行錯誤」との区別基準を根拠列に記載。
- AC#4: development-style.md 4.4.1 / SKILL.md 手順 5 / CLAUDE.md の 3 文書を更新。値の実体は 4.4.1 の表のみに置き他は参照（重複定義なしの整合構造）を mainagent レビューで確認。
- AC#5: 上限値は調整可能な設定値と明記し、根拠（実績値の 2〜3 倍の経験則）を decision-10 として記録（accepted）。
- ゲート: deno fmt --check / lint / test（478 passed）green。ドキュメントのみでコード変更なし。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
agent-loop に実装難航時の強制エスカレーション基準を追加。docs/development-style.md 4.4.1 章に定量上限（CI red 連続 3 回・実装 subagent 試行 5 回・着手 24 時間・停滞検出 = 同一テスト失敗 3 連続 or diff 実質同一の反復）の表と判定手順を新設し、SKILL.md / CLAUDE.md は表を参照する構造で一貫更新。上限値と根拠は decision-10 に記録。検証: 3 文書の整合レビュー + deno fmt/lint/test green（コード変更なし）。
<!-- SECTION:FINAL_SUMMARY:END -->
