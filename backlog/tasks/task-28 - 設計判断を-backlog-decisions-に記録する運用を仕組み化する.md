---
id: TASK-28
title: 設計判断を backlog decisions に記録する運用を仕組み化する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 14:32'
updated_date: '2026-07-21 15:49'
labels:
  - 'area:docs'
  - 'area:workflow'
dependencies: []
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
実装・設計の意図は現状、コンテキストコミット（intent/decision/rejected 行）・backlog タスクの Implementation Notes/Final Summary・コードコメントに散在しており、後から「なぜこの設計になったか」を横断的に参照・検索する導線がない。backlog CLI の decision 機能（backlog decision create）は存在するが未使用。タスク実行フローの中で、後続タスクにも影響する設計判断（アーキテクチャ選定・データソース選定・規約・トレードオフのある採否）を decision として記録する運用ルールを定義し、agent-loop skill / CLAUDE.md / docs/development-style.md に組み込む。全コミットの decision 行を機械的に転記するのではなく、記録対象の基準（タスク横断で影響する判断のみ等）を定めて記録の重複と形骸化を避けること。また、過去タスク（TASK-1〜25）の主要な設計判断のうち現在も有効なものを遡って decision 化する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 設計判断を decision として記録する基準（何を記録し何を記録しないか。タスク単位の実装意図・Why までは対象に含めず、タスク横断で影響する判断に粒度を絞る）が docs/development-style.md に定義されている
- [ ] #2 agent-loop skill のタスク実行フローに decision 記録の判断ステップが組み込まれている
- [ ] #3 過去タスクの主要な設計判断（現在も有効なもの）が backlog decision として遡及記録されている
- [ ] #4 decision の一覧・参照方法（CLI コマンド）が docs/development-style.md に記載されている
- [ ] #5 コンテキストコミットの decision 行との棲み分け（重複記録を避ける方針）が明文化されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: 設計判断の記録先を backlog decisions（backlog decision create）に一本化し、記録基準を「タスク横断で影響する判断」（アーキテクチャ/データソース/ライセンス/規約/採否にトレードオフがある選定）に絞る。タスク単位の実装意図・Why はコンテキストコミット（intent/decision 行）と task notes に残し、decision へは転記しない（棲み分けの明文化）。
2. docs/development-style.md に記録基準・参照方法（backlog decision list / view）・棲み分けを追記。agent-loop SKILL.md のタスク実行フロー（finalization 前後）に「decision 記録要否の判断ステップ」を追加。
3. 過去タスクの主要設計判断の遡及記録（現在も有効なもの）: 例 — データソース選定（historical-basemaps ピン留め / ETH Roller CC BY-NC-SA の別ファイル分離 / Natural Earth rivers / Reba cities）、色割当の決定的プロービング設計、HRE 領邦の独立色化、日本語表記の表示層マッピング方式（name-ja.json フラットマップ + 都市オーバーライド）、deck.gl レイヤー順による picking 優先、Deck レベルイベント集約、area ラベルによるタスク間並列判定。各 1 decision として backlog CLI で作成。
4. 並列化判定（タスク内）: 見送り（理由: ドキュメント 2 本と decision 群の作成は同一の基準定義に依存する単一の運用整備作業で、独立にテスト可能な分割単位がない。単一 subagent に委譲）。
5. チェック: deno fmt --check / lint / test green（md fmt 対象）→ PR → CI → finalization → マージ
<!-- SECTION:PLAN:END -->
