---
id: decision-17
title: 中世（1000〜1492）の HRE 領邦データは OHM（CC0）を採用し、1500 以降の Roller は維持する
date: '2026-07-26 13:55'
status: Accepted
---
## Context

TASK-37（2026-07-23）は「900〜1492 年の HRE 領邦を表示できるオープンデータは存在しない」と結論したが、これは OHM Wiki の自己申告に基づくもので実クエリを投げていなかった。TASK-70 で OHM 取得パイプラインが整った後の実測（帝国中核域 bbox の boundary=administrative 34,005 件）で、1000〜1492 年に有効な領邦データが実在することを確認し、TASK-85 で取り込んだ（TASK-37 の結論を訂正）。

## Decision

中世年代（1000〜1492 の 7 スナップショット）の HRE 領邦は OpenHistoricalMap（CC0 1.0）を出典とし、data/hre_fiefs_<year>.geojson として独立生成する。1500〜1700 の Roller（ETH Zürich, CC BY-NC-SA 4.0）は置き換えず併存する: Roller は査読済み学術データで属性が厚く、同一ソースの時系列として年代間の形状が整合するため。900 年は帝国成立（962 年）前かつ有効 6 件のみのため生成しない。許可リストは admin_level 4/5 に限定（2=主権国家・3=構成王国は配下領邦と二重塗りになるため除外）し、除外理由の二重防波堤（hreFiefExclusionReason）を置く。

## Consequences

- 中世年代の領邦オーバーレイ表示（別タスク）のデータ側が整う。1492 と 1500 の間で出典が変わり形状が飛ぶ可能性は既知（表示タスクで扱いを判断）。
- OHM は CC0 のためライセンス混合の制約なし。出典管理は data 系列（hre_fiefs_* vs hre_*）で分離。
- OHM の収録は編集途上であり、年代による粒度差（1200 年の谷 = 部族大公領解体後の移行期）はデータの性質として受け入れ、必要に応じ known-limitations で明示する。
- 関連タスク: TASK-37, TASK-70, TASK-85 / 関連 decision: decision-14（出典なき補完はしない）
