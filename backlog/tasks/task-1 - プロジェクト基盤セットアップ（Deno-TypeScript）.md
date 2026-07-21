---
id: TASK-1
title: プロジェクト基盤セットアップ（Deno + TypeScript）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:22'
updated_date: '2026-07-21 03:16'
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
- [ ] #2 index.html と TypeScript エントリポイントがあり、ビルドコマンドで静的成果物（index.html / app.js / app.css）が生成される
- [ ] #3 README 等にビルド・ローカル起動手順が記載されている
- [ ] #4 maplibre-gl ^4.x / @deck.gl/core・@deck.gl/layers ^9.x / pmtiles ^3.x / @protomaps/basemaps ^5.x が依存として導入されている（basemaps は npm に 4.x が存在しないため ^5.x に訂正）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
0. backlog着手宣言・ブランチ task-1-deno-setup 作成
1. subagent へ実装委譲（TDD）: deno.json(nodeModulesDir=none, tasks: build/serve/test/test:watch), deno add で maplibre-gl^4 / @deck.gl/core^9 / @deck.gl/layers^9 / pmtiles^3 / @protomaps/basemaps^4, index.html + app.css + src/main.ts + src/config.ts(+config_test.ts 先行), scripts/build.ts(deno bundle + 静的ファイルコピー), README
2. main agent 検証: git diff レビュー, deno fmt/lint/test/task build を CI 同条件で green 確認, serve で目視
3. /review-loop 収束 → コミット → PR(TASK-1明記) → CI green → マージ
4. finalization ガイドに従い AC チェック・サマリ・Done
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
AC#2 の @protomaps/basemaps ^4.x は npm レジストリに 4.x 系が存在せず充足不可（latest 5.7.2、4.x は欠番）。仕様書執筆時の誤記と判断し AC と docs/app-spec.md §3.2 を ^5.x に訂正。
<!-- SECTION:NOTES:END -->
