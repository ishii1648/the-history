---
id: TASK-1
title: プロジェクト基盤セットアップ（Deno + TypeScript）
status: To Do
assignee: []
created_date: '2026-07-20 04:22'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deno をビルドツールとした素の TypeScript + DOM 構成のフロントエンド基盤を作り、以降のタスクが同じ土台で開発できるようにする。フレームワークは導入しない。参照: docs/app-spec.md §3.2, §6
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 deno.json と lockfile がコミットされ、install script が無効化されている
- [ ] #2 maplibre-gl ^4.x / @deck.gl/core・@deck.gl/layers ^9.x / pmtiles ^3.x / @protomaps/basemaps ^4.x が依存として導入されている
- [ ] #3 index.html と TypeScript エントリポイントがあり、ビルドコマンドで静的成果物（index.html / app.js / app.css）が生成される
- [ ] #4 README 等にビルド・ローカル起動手順が記載されている
<!-- AC:END -->
