---
id: TASK-4
title: ベースマップ表示（MapLibre + PMTiles）
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:23'
updated_date: '2026-07-21 09:35'
labels: []
dependencies:
  - TASK-1
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Protomaps 配布の PMTiles をベースマップとして表示する。歴史地図の下地として地形・海岸線・河川のみを描画し、現代の国境・都市名・道路は非表示にする。参照: docs/app-spec.md §2.2, §3.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MapLibre 初期化時に PMTiles プロトコルが登録され、ベースマップが表示される
- [ ] #2 スタイル定義で地形・海岸線・河川のみが表示され、現代の国境・地名・道路レイヤーは非表示である
- [ ] #3 タイル取得失敗時に OpenFreeMap へフォールバックする
- [ ] #4 ヨーロッパ域を抽出した europe.pmtiles の生成手順（pmtiles extract）が整備されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-4-basemap を origin/main から作成
2. 並列化判定: 並列可（独立サブ作業 2 件、worktree isolation で並列起動）
   - サブ作業A（subagent task4-map）: MapLibre 初期化 + PMTiles プロトコル登録 + Protomaps スタイルの地形/海岸線/河川のみフィルタ + OpenFreeMap フォールバック。src/ 配下と対応テスト。スタイルレイヤーのフィルタリングとフォールバック判定は純粋関数として切り出し TDD。担当ファイル: src/*, index.html, app.css, deno.json(imports)
   - サブ作業B（subagent task4-extract）: europe.pmtiles の生成手順整備（pmtiles extract、ヨーロッパ bbox）。スクリプト or ドキュメント + 検証。担当ファイル: scripts/extract-pmtiles*, docs/ or README 追記
   - ファイル競合: deno.json のみ競合可能性あり → マージ時に mainagent が解消
3. 各 subagent は worktree 内で task-4-basemap から派生ブランチにコミットし、mainagent が task-4-basemap にマージ・レビューで収束
4. AC #1/#2 は描画の目視確認が必要 → マージ前に deno task build + serve で dev サーバを起動しブラウザで確認（claude-in-chrome）。確認結果を AC エビデンスに記録
5. fmt/lint/test/build green → PR（TASK-4 明記）→ CI+mergeability 監視 → green でマージ → マージ後動作確認 → finalization
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
並列実装（worktree 2 体）→ 統合完了。mainagent レビュー: サブB は指摘なし。サブA は目視確認で PMTiles URL 404（demo-bucket 実在せず・subagent の実在確認誤り）を検出し、同一オリジン配信（/europe.pmtiles + build.ts 条件付きコピー）へ修正させ収束。目視確認済み: AC#1 ベースマップ表示（z4/z6）、AC#2 現代情報非表示、AC#3 OpenFreeMap フォールバック発火。extract 実機実行 193.5MB。/code-review 試行は disable-model-invocation で不可（TASK-16 に記録・方式変更済み）。
<!-- SECTION:NOTES:END -->
