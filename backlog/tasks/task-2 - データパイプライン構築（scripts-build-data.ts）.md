---
id: TASK-2
title: データパイプライン構築（scripts/build-data.ts）
status: To Do
assignee: []
created_date: '2026-07-20 04:22'
labels: []
dependencies: []
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
historical-basemaps の world_<year>.geojson × 20 年代からヨーロッパ域の派生 GeoJSON と index.json を生成する Deno スクリプトを作り、成果物をリポジトリにコミットする。GPL-3.0 ライセンス・出典の明記もこのタスクで行う。参照: docs/app-spec.md §2.1, §4
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 取得元がコミットハッシュでピン留めされ、スクリプト内に記録されている
- [ ] #2 ヨーロッパ bbox（N34-72°, W25°-E60°）でクリップし simplify した data/europe_<year>.geojson が 20 年代分生成され、各ファイル 300 KB 以下である
- [ ] #3 data/name-overrides.json による NAME の表記ゆれ・null 補正が適用される
- [ ] #4 data/index.json に年一覧と source（repo / commit / license）が出力される
- [ ] #5 LICENSE と出典（aourednik/historical-basemaps, GPL-3.0）がリポジトリに明記されている
<!-- AC:END -->
