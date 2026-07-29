---
id: TASK-130
title: GeoJSON の座標精度をズーム上限に見合う桁数まで下げてデータサイズを削減する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 16:43'
updated_date: '2026-07-29 15:46'
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
- [ ] #1 COORD_PRECISION を MAX_ZOOM から見て過剰でない桁数へ下げ、根拠（ズーム 8 での 1 ピクセル相当距離との比較）がコメントに記載される
- [ ] #2 全データを再生成し、data/ 配下の合計サイズの変化が記録される
- [ ] #3 再生成後のデータで既存テストが green のままである
- [ ] #4 境界線の見た目が劣化していないことを地図表示で確認する（ズーム 8 での海岸線・国境の判読性）
- [ ] #5 TASK-128 の計測ハーネスで初期ロードと年代切替の転送量を before/after 比較し、結果を記録する
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
