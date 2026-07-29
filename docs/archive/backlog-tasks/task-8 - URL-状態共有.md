---
id: TASK-8
title: URL 状態共有
status: Done
assignee:
  - '@claude'
created_date: '2026-07-20 04:23'
updated_date: '2026-07-21 11:15'
labels: []
dependencies:
  - TASK-6
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
年代・視点を URL クエリに反映し、URL を開くと同じ表示が再現されるようにする。参照: docs/app-spec.md §5.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 年代・ズーム・中心が ?year=1300&zoom=4.5&center=15.0,50.0 形式で replaceState により URL に反映される
- [x] #2 クエリ付き URL を開くと年代・視点が再現される
- [x] #3 不正なクエリ値はデフォルト表示にフォールバックする
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-8-url-state を origin/main から作成
2. 並列化判定: 見送り（理由: URL エンコード/デコードの純粋ロジックと main.ts への配線のみで分割単位がない。subagent 1 体に委譲）
3. TDD: 純粋ロジック先行（red→green）— docs/development-style.md §1 の重点対象「URL 状態のエンコード・デコード」
   - encodeState({year, zoom, center}) → ?year=1300&zoom=4.5&center=15.0,50.0
   - decodeState(query) → 検証済み state（不正値・範囲外・非実在年は個別にデフォルトへフォールバック）
   - 丸め（zoom 小数1桁・center 小数1桁等）と replaceState 過剰呼び出し抑制の判定
4. 実装: map moveend / 年代切替時に replaceState、起動時にクエリを decode して Map 初期化と初期年代へ適用
5. 目視確認（mainagent）: 操作で URL が変わる・クエリ付き URL で再現・不正クエリでデフォルト
6. fmt/lint/test/build green → PR → CI+mergeability 監視 → マージ → マージ後動作確認 → finalization
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
URL 状態共有を PR #22 で実装。検証エビデンス（ブラウザ実機）: (AC1) 年代切替で URL が ?year=1100&zoom=4.0&center=15.0,50.0 に replaceState 更新されることを確認（pushState 不使用・同一クエリは重複抑止） (AC2) ?year=1492&zoom=6.0&center=10.0,45.0 を開き 1492 年・z6・[10,45] のビューとスライダー位置の完全再現を確認 (AC3) ?year=1234&zoom=abc&center=999,999 で year/zoom/center が個別にデフォルトへフォールバックし URL が ?year=1000&zoom=4.0&center=15.0,50.0 に正規化されることを確認。zoom 範囲外はデフォルトでなくクランプを採用（maplibre 自身の挙動と一致・レビューで承認済みの設計判断）。url_state.ts 純粋関数 24 テスト（TDD red→green）、計 191 tests。CI green・MERGEABLE/CLEAN。
<!-- SECTION:FINAL_SUMMARY:END -->
