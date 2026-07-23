---
id: decision-9
title: ベースマップの水系ライン描画を廃止し河川表示を deck オーバーレイへ一本化
date: '2026-07-23 13:31'
status: accepted
---
## Context

TASK-36 の実機調査で、ベースマップ（Protomaps @protomaps/basemaps）の water_river / water_stream レイヤーが描く詳細な川筋と、deck.gl の pickable 河川（Natural Earth 50m, data/rivers.geojson）の経路が場所により大きく乖離する（zoom 6 のヴィスワ川北部で最大 ~200 CSS px）ことが判明した。ユーザーは視認できるベースマップ側の川筋をクリックするため、乖離区間では picking 半径をいくら広げても河川を選択できない「デコイ」問題が生じていた（TASK-44）。

## Decision

ベースマップの水系ライン（water_river / water_stream）は描画しない。河川の見た目とクリック/ホバー対象を deck.gl の主要河川オーバーレイに一本化し、「見える川 = 操作できる川」を不変条件とする。湖・海（water ポリゴン）と海岸線（earth）は引き続きベースマップが担う。唯一の川表示となる deck 河川は通常線幅 3px 以上を維持して視認性を担保する。

## Consequences

- 川の視覚表現とインタラクション対象が単一のデータソース（data/rivers.geojson）に揃い、経路乖離によるクリック不能が構造的に発生しない。
- ベースマップ由来の細かな支流・小川は描画されなくなり、地図の水系密度は下がる（歴史地図としては主要 48 河川で十分と判断）。
- 河川の見た目を変える場合は src/rivers.ts（deck 側）だけを変更すればよい。ベースマップのレイヤー採用リスト（src/basemap.ts BASEMAP_LAYER_IDS）に水系ラインを再追加する際は本 decision の再検討を要する。
- 関連タスク: TASK-21, TASK-24, TASK-36, TASK-44
