---
id: decision-1
title: 勢力圏データソースに aourednik/historical-basemaps をコミット固定で採用
date: '2026-07-21 15:52'
status: accepted
---
## Context

勢力圏（国境）ポリゴンの時系列データとして、年代別 world GeoJSON を提供するオープンデータが必要だった（TASK-2）。上流リポジトリは随時更新されるため、参照が動くと成果物の再現性が失われる。

## Decision

aourednik/historical-basemaps を勢力圏データソースとして採用し、取得元コミットを `SOURCE_COMMIT=62d8f1a03a71f2d3ff17f2d166f7553f256bce68` としてスクリプト（scripts/build-data.ts）内に固定する。900〜1914 年の 20 年代分をヨーロッパ bbox（N34-72°, W25°-E60°）でクリップ・simplify して data/europe_<year>.geojson を生成・コミットする。

## Consequences

- 同一入力から常に同一出力が得られ、data/ 成果物の再現性が保たれる（data/index.json に repo / commit / license を記録）。
- GPL-3.0 由来のため、リポジトリの LICENSE は GPL-3.0 とし出典を README に明記。派生データの扱いは decision-2 の分離方針に影響する。
- 上流の更新（境界修正等）は自動では取り込まれず、コミット固定値の明示的な更新が必要。
- 関連タスク: TASK-2
