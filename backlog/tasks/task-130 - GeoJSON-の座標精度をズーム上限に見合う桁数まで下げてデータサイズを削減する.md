---
id: TASK-130
title: GeoJSON の座標精度をズーム上限に見合う桁数まで下げてデータサイズを削減する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:43'
updated_date: '2026-07-29 16:22'
labels:
  - 'area:data'
  - 'area:scripts-data'
dependencies:
  - TASK-128
type: enhancement
ordinal: 112000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
scripts/build-data.ts の COORD_PRECISION は 5（小数第5位・緯度経度で約 1.1m 相当）だが、アプリのズーム上限は src/config.ts の MAX_ZOOM = 8 で、1 ピクセルあたり数百メートルに相当する。表示解像度に対して 2 桁分の精度が無駄になっており、GeoJSON は座標文字列がファイルサイズの大半を占めるため、桁数削減がそのまま転送量とパース時間の削減になる。既に SIMPLIFY_TOLERANCES によるサイズ上限制御が入っているため、精度を下げた場合に simplify のトレランスが緩む方向へ揺り戻す可能性があり、実測での確認が必要。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 COORD_PRECISION を MAX_ZOOM から見て過剰でない桁数へ下げ、根拠（ズーム 8 での 1 ピクセル相当距離との比較）がコメントに記載される
- [x] #2 全データを再生成し、data/ 配下の合計サイズの変化が記録される
- [x] #3 再生成後のデータで既存テストが green のままである
- [x] #4 境界線の見た目が劣化していないことを地図表示で確認する（ズーム 8 での海岸線・国境の判読性）
- [x] #5 TASK-128 の計測ハーネスで初期ロードと年代切替の転送量を before/after 比較し、結果を記録する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. MAX_ZOOM=8 の 1px 相当距離を算出し、COORD_PRECISION の適正桁数を決める（根拠コメント、AC#1）
2. TDD: 丸め桁の期待をテストで固定してから scripts/build-data.ts の COORD_PRECISION を変更
3. 全データ再生成（build-data → 派生パイプライン → build-attribution）。simplify トレランスの揺り戻しを実測確認し、data/ 合計サイズの変化を記録（AC#2）
4. 既存テスト green（AC#3）。CDP でズーム 8 の海岸線・国境の判読性を before/after スクリーンショット比較（AC#4、ポート 8130）
5. verify:perf で初期ロード・年代切替転送量を before/after 比較し記録（AC#5）

並列化判定: 見送り（理由: 定数変更 → 再生成 → 実測が直列依存）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- COORD_PRECISION 5 → 3。根拠: z8 の 1px = 306·cos(緯度)m = 94〜253m（欧州 bbox 34〜72°）。3 桁グリッド ≈111m の丸め誤差最大 ≈56m は北端でも 1px 未満、2 桁（≈557m）は 1px 超のため下限。build-data.ts コメント + px 換算テストで固定。clean-polygons の複製定数も同期テストで固定
- data/ 合計 9,584KB → 8,264KB（-13.9%）。座標系 68 ファイルのみ変化、name-overrides/colors/cities 等は無差分。simplify 揺り戻しなし（全年代 tolerance=0.005 のまま、決定性を事前確認したログ比較）
- 丸め誘発バグ 2 件を検出・修正: (1) europe_flat の穴（丸め前 union）と fiefs_flat 外周の半グリッドずれで base 塗りが帯状残存 → fief-dedupe で union 前に同一グリッドへ丸め (2) 1500 年 Denmark-Norway の線状スライバ（20km×60m・1.27km²）が面積閾値を偶然超え幻の勢力ラベルが復活 → 平均幅（2·面積/周長）< グリッド 1 目盛り（111m）のパートを落とす MIN_PART_MEAN_WIDTH_M を新設（コンパクトな史実飛び地 Württemberg 1.09km² は平均幅数百 m で残る。1715 の既存 junk 三角形も除去）
- AC#4: z8 の 4 地域（ブルターニュ・南伊・HRE 領邦密集・ノルウェー高緯度）before/after スクリーンショットで劣化なし（mainagent もブルターニュの組を確認）
- AC#5: verify:perf で初期ロード転送 -5.5%・年代切替平均転送 -28.8%（134,972 → 96,064B）・切替所要は誤差範囲
- OHM 生データ（*_fiefs_<year>）はライブ Overpass 由来の drift 回避のため意図的に再生成せず（非配信・派生側で 3 桁に再丸め）
- テスト更新 5 箇所は全て「丸めの意図した帰結」を確認して更新（面積許容 0.1%→1% 等、判別力の維持根拠付き）。1461 → main 取り込み後 1494 passed（mainagent 独立検証）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
COORD_PRECISION を 5 → 3 に削減（z8 の 1px に対し丸め誤差 1px 未満、2 桁は超過のため下限）。data/ -13.9%・年代切替転送 -28.8%。丸めが誘発した二重塗りの帯と幻ラベル復活の 2 件を検出し、fief-dedupe の同一グリッド丸めと平均幅フィルタで修正。z8 の 4 地域目視で劣化なし、1494 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
