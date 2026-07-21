---
id: TASK-28
title: 設計判断を backlog decisions に記録する運用を仕組み化する
status: To Do
assignee: []
created_date: '2026-07-21 14:32'
labels: []
dependencies: []
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
実装・設計の意図は現状、コンテキストコミット（intent/decision/rejected 行）・backlog タスクの Implementation Notes/Final Summary・コードコメントに散在しており、後から「なぜこの設計になったか」を横断的に参照・検索する導線がない。backlog CLI の decision 機能（backlog decision create）は存在するが未使用。タスク実行フローの中で、後続タスクにも影響する設計判断（アーキテクチャ選定・データソース選定・規約・トレードオフのある採否）を decision として記録する運用ルールを定義し、agent-loop skill / CLAUDE.md / docs/development-style.md に組み込む。全コミットの decision 行を機械的に転記するのではなく、記録対象の基準（タスク横断で影響する判断のみ等）を定めて記録の重複と形骸化を避けること。また、過去タスク（TASK-1〜25）の主要な設計判断のうち現在も有効なものを遡って decision 化する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 設計判断を decision として記録する基準（何を記録し何を記録しないか）が docs/development-style.md に定義されている
- [ ] #2 agent-loop skill のタスク実行フローに decision 記録の判断ステップが組み込まれている
- [ ] #3 過去タスクの主要な設計判断（現在も有効なもの）が backlog decision として遡及記録されている
- [ ] #4 decision の一覧・参照方法（CLI コマンド）が docs/development-style.md に記載されている
- [ ] #5 コンテキストコミットの decision 行との棲み分け（重複記録を避ける方針）が明文化されている
<!-- AC:END -->
