---
status: accepted
date: '2026-07-26 09:12'
---

# decision-14: 出典を持たない座標合成は行わず、ソース欠落は既知の制限として明示する（エルベ河口）

## Context

TASK-75 で、エルベ川が地図上でハンブルク西の Wedel 付近（東経 9.784034）で途切れ、北海河口（クックスハーフェン、約 8.6E）まで描かれない問題を調査した。原因はパイプラインではなく、採用ソース（Natural Earth 50m rivers_lake_centerlines @ ca96624a）が幅の広い河口部を河川ではなく海としてモデル化しており、センターラインが元データに存在しないこと。代替候補を実測した結果、ne_10m_rivers_lake_centerlines（西端 9.819021E で 50m より手前）・ne_10m_rivers_europe（河口部 feature 無し）のいずれにも同区間は収録されておらず、出典のある補完データが存在しなかった（実測値と再現手順は docs/data-inventory/README.md §10）。

## Decision

出典（provenance）を持たない座標を手作業で合成して史実データのオーバーレイに混ぜることは行わない。採用ソースおよび検証済み代替ソースのいずれにも存在しないジオメトリの欠落は、修正せず data/known-limitations.json の既知の制限としてユーザに明示する（本件は rivers-elbe-estuary-missing、年代非依存・常時 active）。

## Consequences

- 地図データの全ジオメトリが出典（データセット + ピン留めコミット）まで追跡可能であることが保たれる。
- エルベ川は当面河口まで描かれない。Natural Earth のソースコミットを更新する際は scripts/build-rivers.ts のコメントに従い本前提を再確認する。
- 他河川で同種の欠落が見つかった場合（TASK-76 の横断検査等）も本方針に従う: 出典のある代替ソースを探し、無ければ known-limitations に明示する。
- 関連タスク: TASK-75, TASK-76 / 関連 decision: decision-9（河川表示の deck 一本化）
