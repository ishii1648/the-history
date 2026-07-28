---
id: TASK-130
title: GeoJSON の座標精度をズーム上限に見合う桁数まで下げてデータサイズを削減する
status: To Do
assignee: []
created_date: '2026-07-28 16:43'
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
