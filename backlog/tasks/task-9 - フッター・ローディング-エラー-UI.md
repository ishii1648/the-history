---
id: TASK-9
title: フッター・ローディング/エラー UI
status: To Do
assignee: []
created_date: '2026-07-20 04:23'
labels: []
dependencies:
  - TASK-5
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
データ出典・免責の常時表示と、ローディング・エラー時のフィードバックを実装する。参照: docs/app-spec.md §2.1, §5.4
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 フッターに historical-basemaps（GPL-3.0）の出典・Protomaps/OSM attribution・境界精度の免責が常時表示される
- [ ] #2 GeoJSON ロード中はスピナーが表示される
- [ ] #3 fetch 失敗時にエラートーストが表示され、再試行できる
<!-- AC:END -->
