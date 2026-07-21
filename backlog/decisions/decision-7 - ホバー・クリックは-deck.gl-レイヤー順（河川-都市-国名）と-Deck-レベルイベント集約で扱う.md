---
id: decision-7
title: ホバー・クリックは deck.gl レイヤー順（河川 > 都市 > 国名）と Deck レベルイベント集約で扱う
date: '2026-07-21 15:52'
status: accepted
---
## Context

勢力ポリゴン・HRE 領邦・都市マーカー・河川ラインが重なる地図上で、ホバー/クリックの対象決定を一貫させる必要がある。また deck.gl の per-layer onHover は leave/enter のイベント順が保証されず、レイヤー別ハンドラではツールチップの消し込みでレースが起きる（TASK-24 でソース実読により確認）。

## Decision

picking の優先順位は deck.gl のレイヤー描画順で表現する: powers → hre-powers → cities → rivers の順に重ね、最前面判定により 河川 > 都市 > 国名 の優先で拾う。ホバー/クリックのハンドラはレイヤー別に持たず、Deck レベルの onHover/onClick に集約して layer id で分岐する。

## Consequences

- 優先順位がレイヤー配列の順序という単一の場所で決まり、対象追加時も配列順の変更だけで制御できる。
- Deck レベル集約により leave/enter レースが構造的に発生しない。ラベル系レイヤーは pickable: false とし判定から除外する。
- 新しい pickable レイヤーを追加する際は、このレイヤー順と Deck レベル分岐に従う必要がある。
- 関連タスク: TASK-24, TASK-27, TASK-29
