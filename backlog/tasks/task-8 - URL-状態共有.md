---
id: TASK-8
title: URL 状態共有
status: To Do
assignee: []
created_date: '2026-07-20 04:23'
labels: []
dependencies:
  - TASK-6
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
年代・視点を URL クエリに反映し、URL を開くと同じ表示が再現されるようにする。参照: docs/app-spec.md §5.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 年代・ズーム・中心が ?year=1300&zoom=4.5&center=15.0,50.0 形式で replaceState により URL に反映される
- [ ] #2 クエリ付き URL を開くと年代・視点が再現される
- [ ] #3 不正なクエリ値はデフォルト表示にフォールバックする
<!-- AC:END -->
