---
id: TASK-2
title: データパイプライン構築（scripts/build-data.ts）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:22'
updated_date: '2026-07-21 08:29'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-2-data-pipeline を作成
2. deno.json に @turf/bbox-clip / @turf/simplify / @turf/truncate と build-data タスクを追加、fmt exclude に data/ を追加
3. TDD: scripts/build-data_test.ts を先に書き red を確認（buildSourceUrl / clipFeatures / applyNameOverrides / buildIndexJson / shrinkToLimit 等の純粋関数）
4. scripts/build-data.ts を実装: SOURCE_COMMIT=62d8f1a03a71f2d3ff17f2d166f7553f256bce68 にピン留め、20年代分 fetch → bbox クリップ（W25 S34 E60 N72）→ simplify（トレランス段階引き上げで各300KB以下）→ name-overrides.json 適用 → data/europe_<year>.geojson + data/index.json 出力
5. data/name-overrides.json を実データの表記ゆれ・null を調査して作成（NAME null は ABBREVN→SUBJECTO→PARTOF フォールバック + overrides 適用）
6. LICENSE（GPL-3.0）をリポジトリに追加し README に出典（aourednik/historical-basemaps, GPL-3.0）を明記
7. パイプラインを実行し成果物 data/ をコミット
8. deno fmt --check / lint / test / build green 確認 → PR 作成（TASK-2 明記）→ CI green → マージ → finalization
<!-- SECTION:PLAN:END -->
