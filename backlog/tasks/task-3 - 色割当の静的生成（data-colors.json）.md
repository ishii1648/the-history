---
id: TASK-3
title: 色割当の静的生成（data/colors.json）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:22'
updated_date: '2026-07-21 08:50'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-3-colors-json を origin/main から作成
2. 並列化判定: 見送り。成果物が単一スクリプト（scripts/build-colors.ts）+ テストのみで独立した分割単位がなく、worktree 分割・PR conflict 解消のオーバーヘッドが利得を上回るため、subagent 1 体に委譲する
3. TDD: scripts/build-colors_test.ts を先に書き red 確認（決定的ハッシュ / パレット生成 / SUBJECTO 明度派生 / 全年代同色 の純粋関数）
4. scripts/build-colors.ts を実装: data/europe_*.geojson × 20 を読み、NAME をキーに決定的ハッシュでパレットから色割当（同一勢力は全年代同色）。SUBJECTO を持つ feature は宗主国の色相に寄せた明度違い。SUBJECTO の表記ゆれは data/name-overrides.json の renames を通してから解決（TASK-2 レビューで持ち越した論点）
5. パレットは十分な色数・彩度差を持つ設計（HSL ベース等）とし、data/colors.json を生成してコミット
6. deno.json に build-colors タスク追加
7. fmt/lint/test/build green → PR（TASK-3 明記）→ CI green → マージ → finalization
<!-- SECTION:PLAN:END -->
