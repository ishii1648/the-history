---
id: TASK-9
title: フッター・ローディング/エラー UI
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:23'
updated_date: '2026-07-21 11:25'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-9-footer-loading-ui を origin/main から作成
2. 並列化判定: 見送り（理由: フッター・スピナー・トーストは小さな UI 部品群で、いずれも main.ts の switchYear/loader 周辺への配線に収束する。分割の利得なし。subagent 1 体に委譲）
3. TDD: 純粋ロジック先行（red→green）— ローディング状態機械（並行ロード・最新要求のみ表示等）と再試行判定を DOM 非依存に切り出す
4. 実装: (a) フッターに historical-basemaps（GPL-3.0）出典・Protomaps/OSM attribution・境界精度免責を常時表示（タイムラインと重ならない配置） (b) GeoJSON ロード中スピナー (c) fetch 失敗時のエラートースト + 再試行ボタン（loader は失敗時キャッシュを残さない実装済みなので再試行は switchYear 再呼び出し）
5. 目視確認（mainagent）: フッター常時表示・スピナー（低速回線シミュレート or 未キャッシュ年代切替）・トースト（サーバ停止 or 不在ファイルで再現）と再試行
6. fmt/lint/test/build green → PR → CI+mergeability 監視 → マージ → マージ後動作確認 → finalization
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実装完了（subagent）。純粋ロジック src/loading_state.ts（進行中/失敗の年代集合→スピナー可否・エラー可否・再試行対象を導出、全て純粋関数）を TDD で先行（src/loading_state_test.ts 11 tests red→green）。UI: index.html にフッター（historical-basemaps GPL-3.0 リンク・Protomaps/OSM attribution・境界精度の免責を常時表示、左下）/ スピナー（中央）/ エラートースト（上部中央・再試行/閉じるボタン）を追加、app.css にスタイル、main.ts で switchYear をラップし start/success/fail を loading_state へ通知（キャッシュヒットはスピナー抑止・失敗は reject 握りつぶしトースト誘導）。deno fmt --check / lint / test(202 passed) / build 全 green。
<!-- SECTION:NOTES:END -->
