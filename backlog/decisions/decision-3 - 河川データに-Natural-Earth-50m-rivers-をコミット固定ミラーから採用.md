---
id: decision-3
title: 河川データに Natural Earth 50m rivers をコミット固定ミラーから採用
date: '2026-07-21 15:52'
status: accepted
---
## Context

Protomaps ベースマップの water_river レイヤーは minzoom 9 だが、アプリの MAX_ZOOM は 8 のため河川が原理的に一度も描画されず、仕様（地形・海岸線・河川の表示）に違反していた。低ズームの Protomaps タイルには河川ライン形状自体が含まれないため、minzoom の変更では解決しない（TASK-21）。

## Decision

河川データとして Natural Earth 50m rivers_lake_centerlines（パブリックドメイン）を採用し、ミラーの nvkelso/natural-earth-vector からコミット固定（ca96624）で取得する。scripts/build-rivers.ts で欧州 bbox クリップ・主要河川フィルタ（scalerank<=5）・simplify を行い data/rivers.geojson を生成・コミットする。

## Consequences

- z4〜z8 の全ズームで主要河川（ライン・ドナウ・エルベ等）が視認できる。
- パブリックドメインのためライセンス制約はなく、フッター・attribution に出典（Natural Earth）を表示する。
- 描画は当初 MapLibre style レイヤーだったが、後にクリック判定・強調のため deck.gl レイヤーへ移行した（decision-7 参照）。
- 関連タスク: TASK-21, TASK-24
