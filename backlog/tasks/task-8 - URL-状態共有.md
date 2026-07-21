---
id: TASK-8
title: URL 状態共有
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-20 04:23'
updated_date: '2026-07-21 11:06'
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
- [ ] #1 年代・ズーム・中心が ?year=1300&zoom=4.5&center=15.0,50.0 形式で replaceState により URL に反映される
- [ ] #2 クエリ付き URL を開くと年代・視点が再現される
- [ ] #3 不正なクエリ値はデフォルト表示にフォールバックする
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
