---
id: TASK-2
title: データパイプライン構築（scripts/build-data.ts）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-20 04:22'
updated_date: '2026-07-21 08:45'
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
- [x] #1 取得元がコミットハッシュでピン留めされ、スクリプト内に記録されている
- [x] #2 ヨーロッパ bbox（N34-72°, W25°-E60°）でクリップし simplify した data/europe_<year>.geojson が 20 年代分生成され、各ファイル 300 KB 以下である
- [x] #3 data/name-overrides.json による NAME の表記ゆれ・null 補正が適用される
- [x] #4 data/index.json に年一覧と source（repo / commit / license）が出力される
- [x] #5 LICENSE と出典（aourednik/historical-basemaps, GPL-3.0）がリポジトリに明記されている
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実装完了・PR #14 作成済み（https://github.com/ishii1648/the-history/pull/14）。
- subagent が TDD（red→green）で scripts/build-data.ts + テスト 11 件を実装
- mainagent レビューで年一覧の二重定義（src/config.ts SNAPSHOT_YEARS と YEARS）を指摘し一本化で収束
- 独立検証: 20 ファイル全て 300KB 以下（最大 200,599 bytes、tolerance=0.005）、座標は bbox に収束、NAME 補正反映済み、残存 null NAME 580 件は全属性 null の無主地で補正不能を確認
- fmt --check / lint / test（39 passed）/ build 全て green。CI 監視中
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
scripts/build-data.ts と data/ 成果物を追加し PR #14 で実装。検証エビデンス: (AC1) SOURCE_COMMIT=62d8f1a03a71f2d3ff17f2d166f7553f256bce68 をスクリプト内に定数記録・テストで長さ40を検証 (AC2) data/europe_<year>.geojson × 20 生成、全ファイル300KB以下（最大200,599 bytes）、座標範囲 x=[-25,60] y=[34,72] で bbox 一致を出力走査で確認 (AC3) name-overrides.json の renames 7件が反映され補正前綴りが NAME に残存しないことを全出力走査で確認、null NAME は ABBREVN→SUBJECTO→PARTOF フォールバック実装（残存580件は全属性 null の無主地） (AC4) index.json に years 20件（900-1914）と source{repo,commit,license} を確認 (AC5) LICENSE（GPL-3.0全文）と README 出典節を確認。deno test 39 passed、PR #14 の CI green。
<!-- SECTION:FINAL_SUMMARY:END -->
