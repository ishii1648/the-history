---
id: TASK-131
title: CDP 検証ハーネスにモバイル相当の画面・端末条件を追加する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 16:43'
updated_date: '2026-07-29 15:46'
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
- [ ] #1 CDP ハーネスがビューポート幅・高さ・deviceScaleFactor・mobile フラグ・タッチ入力の有効化を指定して起動できる
- [ ] #2 代表的なモバイル条件（例: 幅 375 / DPR 3）のプリセットが定義され、デスクトップ既定は従来どおり変わらない
- [ ] #3 モバイル条件で地図描画・年代切替・情報パネル表示が動作することを確認するスモークチェックが追加される
- [ ] #4 タップ相当の入力でポリゴンの picking と情報パネル表示が動作することを確認できる
- [ ] #5 モバイル条件のスクリーンショットを取得して UI の重なりを目視確認できる
- [ ] #6 追加した設定組み立てロジックのテストが先に書かれている
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
