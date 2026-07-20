---
id: TASK-7
title: ホバー/クリック情報表示と地図挙動
status: To Do
assignee: []
created_date: '2026-07-20 04:23'
labels: []
dependencies:
  - TASK-5
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
勢力へのホバー/クリックで勢力名を表示し、ズーム範囲と初期表示を仕様どおりにする。参照: docs/app-spec.md §5.2
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ホバーで勢力名（SUBJECTO があれば「NAME — SUBJECTO 領」）がツールチップ表示される
- [ ] #2 クリックで同情報がパネル表示される（モバイルのホバー代替）
- [ ] #3 ズームが z3〜z8 程度に制限される
- [ ] #4 初期表示が center ≈ [15, 50]・zoom 4・年代 1000 年である
<!-- AC:END -->
