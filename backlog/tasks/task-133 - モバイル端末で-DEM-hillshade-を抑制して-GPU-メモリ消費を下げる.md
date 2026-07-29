---
id: TASK-133
title: モバイル端末で DEM hillshade を抑制して GPU メモリ消費を下げる
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:44'
updated_date: '2026-07-29 17:08'
labels:
  - 'area:src-basemap'
dependencies:
  - TASK-131
type: enhancement
ordinal: 115000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/basemap.ts は terrarium エンコーディングの DEM PMTiles を hillshade レイヤーの入力に使っており、ベースマップタイルに加えて DEM タイルのテクスチャを GPU に載せる。デスクトップでは起伏表現の価値が高いが、小画面のモバイルでは判読への寄与が小さい割に GPU メモリと帯域を消費し、deck.gl のポリゴン・ライン・ラベルと合わせて描画が破綻する要因になりうる。端末条件に応じて hillshade を無効化またはズーム範囲を絞る。無効化の判定基準は実測を踏まえて決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 端末条件（画面サイズ等）に応じて DEM hillshade レイヤーを含めるかどうかを切り替えられる
- [x] #2 判定基準と根拠がコメントで説明され、判定ロジックが純粋関数として切り出される
- [x] #3 hillshade を外した場合でもベースマップ・勢力ポリゴン・ラベルの表示が破綻しない
- [x] #4 デスクトップでの表示は従来どおり hillshade を含む
- [x] #5 hillshade 無効時に DEM PMTiles のリクエストが発生しないことを確認する
- [x] #6 判定ロジックのテストが先に書かれている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/basemap.ts の hillshade レイヤーと DEM ソースの組み込みを読む
2. TDD red: 端末条件（画面サイズ等）→ hillshade 有効/無効の判定純粋関数のテストを先に書く（AC#6）。判定基準は実測（モバイル CDP プリセット）を踏まえて決め、根拠コメントを付ける（AC#2）
3. 実装: buildBasemapStyle への組み込み切替（AC#1）。無効時に DEM ソース自体を含めず、DEM PMTiles へのリクエストが発生しないことを Resource Timing / Network で確認（AC#5）
4. モバイル条件（verify:smoke:mobile 拡張 or 専用チェック、ポート 8133）で表示破綻なし（AC#3）、デスクトップは hillshade 維持（AC#4）を確認
5. deno fmt --check / lint / test / build green

並列化判定: 見送り（理由: basemap.ts の判定と組み込みが一体）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- 判定: shouldEnableHillshade（basemap.ts、純粋関数）。タッチ対応（maxTouchPoints > 0）かつビューポート短辺 < HILLSHADE_MIN_SHORT_SIDE_PX（768 = iPad 縦持ち境界）で無効。短辺 min(w,h) 基準は画面回転で反転しない。タッチ掛け合わせでデスクトップ縮小ウィンドウを除外。deviceMemory は Chrome 限定 + 8GB クランプで決定的でないため不採用（AC#2 根拠コメント）
- 無効時は buildBasemapStyle（第 3 引数 hillshadeEnabled）に DEM ソース/hillshade レイヤーを含めず、main.ts の PMTiles(dem) 生成・protocol.add・getHeader をスキップ
- AC#5: Resource Timing でモバイル条件 dem 0 件（正の対照: basemap 7 件・バッファ非溢れ確認。変更前ビルドの同条件は dem 13 件 = 変更起因の実証）。デスクトップは dem 29 件で従来どおり（AC#4）
- AC#3: mobile-no-hillshade.png で基図・勢力・境界・河川・都市の破綻なし。初期表示の勢力ラベル不在は変更前と同一の既存挙動（衝突フィルタ由来）でラベル退行なし。verify:smoke / verify:smoke:mobile 両 PASS
- AC#6 red → green: 判定 7 + スタイル 3 テスト先行（TS2305/TS2554 red）→ 46 passed。全体 1504 → main 取り込み後 1501 passed（mainagent 独立検証）
- 副次効果: モバイルでは attribution から Mapzen クレジットが落ち 1 行に収まる（DEM ソース不在時の正しい挙動）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
モバイル端末（タッチ + 短辺 < 768px）で DEM hillshade をスタイルごと無効化し、PMTiles 登録・リクエストも発生させない（Resource Timing で 0 件、変更前対照 13 件）。判定は純粋関数 + 根拠コメント、デスクトップ不変。red → green（テスト 10 件先行）、1501 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
