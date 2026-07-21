---
id: TASK-7
title: ホバー/クリック情報表示と地図挙動
status: Done
assignee:
  - '@claude'
created_date: '2026-07-20 04:23'
updated_date: '2026-07-21 11:04'
labels: []
dependencies:
  - TASK-5
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
勢力へのホバー/クリックで勢力名を表示し、ズーム範囲と初期表示を仕様どおりにする。参照: docs/app-spec.md §5.2
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ホバーで勢力名（SUBJECTO があれば「NAME — SUBJECTO 領」）がツールチップ表示される
- [x] #2 クリックで同情報がパネル表示される（モバイルのホバー代替）
- [x] #3 ズームが z3〜z8 程度に制限される
- [x] #4 初期表示が center ≈ [15, 50]・zoom 4・年代 1000 年である
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-7-hover-info を origin/main から作成
2. 並列化判定: 見送り（理由: ツールチップ・パネル・ズーム制限・初期表示は全て src/main.ts の GeoJsonLayer / Map 設定と小さな UI 部品に収束し、独立サブ作業の分割単位がない。subagent 1 体に委譲）
3. TDD: 純粋ロジック先行（red→green）
   - 表示名整形: NAME + SUBJECTO から「NAME — SUBJECTO 領」形式を生成（SUBJECTO なし/自己参照/NAME null の分岐）
   - ツールチップ位置計算等の DOM 非依存部分
4. 実装: GeoJsonLayer の onHover でツールチップ（既存 console.debug を置換）、onClick でパネル表示。MIN_ZOOM=3 / MAX_ZOOM=8 と INITIAL_CENTER [15,50] / INITIAL_ZOOM 4 / INITIAL_YEAR 1000 は config 済みのため検証中心
5. 目視確認（mainagent）: ホバーでツールチップ、クリックでパネル、ズーム端で制限、リロード初期状態
6. fmt/lint/test/build green → PR → CI+mergeability 監視 → マージ → マージ後動作確認 → finalization
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ホバー/クリック情報表示を PR #21 で実装。検証エビデンス（ブラウザ実機）: (AC1) ホバーでカーソル近傍ツールチップ（Holy Roman Empire 等）。属領は「NAME — SUBJECTO 領」形式。レビューで補正前綴り自己参照バグ（Scotland — Scottland 領）を検出し、renames 正規化（TASK-3 色割当と同一規則）で修正、修正後に Scotland/Castile の正常表示を確認 (AC2) クリックで左上パネル表示・閉じるボタン動作を確認 (AC3) ダブルクリック連打で z8 収束（スクリーンショット完全一致）、shift+ダブルクリックで z3 収束を実測 (AC4) リロードで center≈[15,50]・zoom4・1000 年を確認。displayLabel 純粋関数 13 テスト（TDD red→green）、計 167 tests。CI green・MERGEABLE/CLEAN。
<!-- SECTION:FINAL_SUMMARY:END -->
