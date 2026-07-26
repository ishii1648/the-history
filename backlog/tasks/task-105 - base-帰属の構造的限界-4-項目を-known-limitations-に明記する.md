---
id: TASK-105
title: base 帰属の構造的限界 4 項目を known-limitations に明記する
status: To Do
assignee: []
created_date: '2026-07-26 19:25'
labels:
  - 'area:data'
  - 'area:docs'
dependencies: []
priority: medium
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の横断監査で「上流データの粒度・構造に由来し propertyFixes では修正しきれない」と整理された 4 項目（スナップショット年と条約帰属のずれ・名目宗主権の扱い・消滅済み/過大勢力の形状・形状の再利用）を data/known-limitations.json に追加し、UI から確認できるようにする。項目案は監査ドキュメント（base-attribution-audit.md）の known-limitations 節を参照。

発見契機: TASK-103 の横断監査。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 4 項目が known-limitations.json に追加され、キーワード検証テストが green
- [ ] #2 監査ドキュメントから各項目への参照が辿れる
- [ ] #3 deno test が green
<!-- AC:END -->
