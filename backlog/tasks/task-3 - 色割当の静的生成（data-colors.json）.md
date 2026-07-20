---
id: TASK-3
title: 色割当の静的生成（data/colors.json）
status: To Do
assignee: []
created_date: '2026-07-20 04:22'
labels: []
dependencies:
  - TASK-2
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
勢力名から決定的に色を割り当てる colors.json をビルド時に静的生成し、クライアントは参照のみにする。参照: docs/app-spec.md §4.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 NAME をキーに決定的ハッシュで色が割り当てられ、同一勢力は全 20 年代で同色になる
- [ ] #2 SUBJECTO を持つ feature は宗主国の色相に寄せた明度違いの色になる
- [ ] #3 data/colors.json が生成され、パレットは隣接勢力の色衝突を緩和できる十分な色数・彩度差を持つ
<!-- AC:END -->
