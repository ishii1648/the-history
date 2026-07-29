---
id: TASK-131
title: CDP 検証ハーネスにモバイル相当の画面・端末条件を追加する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:43'
updated_date: '2026-07-29 16:00'
labels:
  - 'area:scripts-verify'
dependencies:
  - TASK-128
type: enhancement
ordinal: 113000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
scripts/verify/cdp.ts は --window-size=1600,900 のデスクトップ固定で、モバイル相当の画面幅・DPR・タッチ入力での検証経路が存在しない。app.css には @media ブレークポイントが 1 つもなく（prefers-reduced-motion のみ）、375px 幅では縦タイムライン・右上情報パネル・左下と右下のトグル群が地図面を大きく占有する懸念があるが、現状これを無人で確認する手段がない。CDP の Emulation ドメインでビューポート・DPR・タッチ有効化を切り替えられるようにし、モバイル条件でのスモークを追加する。実 GPU 描画のため --disable-gpu を付けない既存方針は維持する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CDP ハーネスがビューポート幅・高さ・deviceScaleFactor・mobile フラグ・タッチ入力の有効化を指定して起動できる
- [x] #2 代表的なモバイル条件（例: 幅 375 / DPR 3）のプリセットが定義され、デスクトップ既定は従来どおり変わらない
- [x] #3 モバイル条件で地図描画・年代切替・情報パネル表示が動作することを確認するスモークチェックが追加される
- [x] #4 タップ相当の入力でポリゴンの picking と情報パネル表示が動作することを確認できる
- [x] #5 モバイル条件のスクリーンショットを取得して UI の重なりを目視確認できる
- [x] #6 追加した設定組み立てロジックのテストが先に書かれている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scripts/verify/cdp.ts の起動・CdpApi 構造を読み、Emulation ドメイン（ビューポート/DPR/mobile/タッチ）の注入点を設計
2. TDD red: 設定組み立てロジック（プリセット解決・引数パース）の純粋関数テストを先に書く（AC#6）
3. 実装: 幅/高さ/deviceScaleFactor/mobile/タッチ有効化の指定（AC#1）、モバイルプリセット（幅 375/DPR 3、AC#2。デスクトップ既定は不変）
4. モバイル条件のスモークチェック追加（地図描画・年代切替・情報パネル・タップ picking、AC#3/#4）とスクリーンショット取得（AC#5、ポート 8131）
5. deno fmt --check / lint / test / build 全 green。--disable-gpu を付けない方針は維持

並列化判定: 見送り（理由: cdp.ts の起動系とチェックスクリプトが密結合）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- 純ロジックは scripts/verify/emulation.ts に分離（checkScript が value import すると cdp.ts の top-level await と循環しデッドロックする問題を実装中に発見・解消。cdp.ts から再 export で互換維持）
- AC#1: launch オプションで Emulation.setDeviceMetricsOverride + setTouchEmulationEnabled。未指定時は Emulation を一切呼ばずデスクトップ既定（--window-size=1600,900）不変
- AC#2: MOBILE_PRESET = 375x812 / DPR 3 / mobile / touch。--device=<preset> フラグ
- AC#3/#4/#5: checks/mobile-smoke.ts（verify:smoke:mobile）。実走 PASS: viewport 反映・年代 1500 切替・タップ（Input.dispatchTouchEvent）で情報パネル「ライン川」・スクリーンショット 2 枚
- AC#6: プリセット解決・パラメータ組み立てのテスト 26 件を先行（red: TS2305 → green）
- 非退行: 既存 verify:smoke がデスクトップ既定のまま PASS。fmt / lint / test 1484 passed（mainagent 独立検証）/ build green
- TASK-132 への申し送り（UI 重なり所見）: 情報パネル × タイムライン上端の交差（約 786px²）・タイムラインが画面高 65% を占有・下端 attribution の 2 行折り返しとトグル被り
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CDP ハーネスにモバイル相当条件（viewport/DPR/mobile/タッチ）と --device プリセット・CdpApi.tap・mobile-smoke チェックを追加。デスクトップ既定は不変（既存 smoke 非退行）。red → green（テスト 26 件、1484 passed）。モバイル実走で描画・年代切替・タップ picking を確認し、UI 重なり所見を TASK-132 へ申し送り。
<!-- SECTION:FINAL_SUMMARY:END -->
