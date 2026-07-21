---
id: TASK-5
title: 勢力圏ポリゴンレイヤー表示
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:23'
updated_date: '2026-07-21 09:44'
labels: []
dependencies:
  - TASK-2
  - TASK-3
  - TASK-4
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
年代スナップショットの勢力圏 GeoJSON を deck.gl でベースマップ上に塗り分け表示する。MVP スコープの中核。参照: docs/app-spec.md §3.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 MapboxOverlay（interleaved）上の GeoJsonLayer 1 枚で勢力圏ポリゴンが描画される
- [ ] #2 塗り色は data/colors.json の割当を参照し、opacity 0.5 程度・白系の境界線で表示される
- [ ] #3 pickable が有効で、ホバー/クリックイベントが取得できる
- [ ] #4 GeoJsonLayer の data 差し替えのみで表示年代を切り替えられる（ベースマップは再生成されない）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-5-power-layer を origin/main から作成
2. 並列化判定: 見送り（理由: 成果物が deck.gl レイヤー統合という単一の密結合モジュール群で、src/main.ts への統合に収束する。純粋ロジック（色解決・レイヤー props 生成・年代データキャッシュ）とレイヤー配線を分離しても互いのインターフェース調整が頻発し、worktree 分割のオーバーヘッドが利得を上回る。subagent 1 体に委譲）
3. TDD: 純粋ロジックを先にテスト（red 確認）→ 実装 → green
   - colors.json のキー解決（NAME / NAME|SUBJECTO 複合キー、フォールバック色）
   - HEX → RGBA 変換・opacity 0.5・白系境界線の props 生成
   - 年代 → /data URL 解決とメモリキャッシュ判定
4. MapboxOverlay(interleaved) + GeoJsonLayer 1 枚を src/main.ts に統合。pickable: true。data 差し替えのみで年代切替できる内部 API（TASK-6 のスライダーから呼ぶ想定）を用意
5. dist へ data/*.geojson・colors.json を配信できるよう build.ts のコピー対象を確認・調整
6. AC #1/#2 は目視確認、#3 はホバー/クリックのイベント取得を console で確認、#4 は年代切替 API を実行して確認（マージ前・dev サーバ + ブラウザ）
7. fmt/lint/test/build green → PR（TASK-5 明記）→ CI+mergeability 監視 → マージ → マージ後動作確認 → finalization
<!-- SECTION:PLAN:END -->
