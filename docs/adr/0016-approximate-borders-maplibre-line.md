---
status: accepted
date: '2026-07-26 12:48'
---

# decision-16: base 境界は概略境界として MapLibre line レイヤーで不確かさを表現する

## Context

base 境界（aourednik/historical-basemaps）は全 feature が BORDERPRECISION=1（approximate）で、提供者自身が全境界を概略と宣言している。従来の 1px のくっきり線は精密測量の誤ったメッセージを与え、数百 km の直線近似（1200 年の仏↔アンジュー 277 km 等）が特に不自然に見えていた（TASK-80）。粗さは元データ由来であり simplify 起因ではないことは検証済み。

## Decision

base 境界線は deck ではなく MapLibre の line レイヤーで描き、にじみ（line-blur）+ 低 alpha の「概略境界」として表現する。セグメント長の 3 段化（50 km ≈ p90 / 100 km ≈ p95）で長い区間ほど不確かさを強調する。表現定数は src/approximate_borders.ts の TIER_STYLES に一元化し、閾値・段判定は単体テストで固定する。重ね順は「政治ポリゴンの塗り → 概略境界 → 海洋 water → coastline」とし（decision-15 の改訂 2）、海側の線は海洋に覆わせて TASK-84 の趣旨（海上に誤った線を出さない）を維持する。normal 段の下限は alpha 0.62 / blur 0.6px（1815 年密集域の判読性を実測で担保）。

## Consequences

- 全年代の base 境界が「概略」という正しいメッセージを持つ。known-limitations にも明記済み。
- 塗りの色境界の直線性は残る。対処は sketchy rendering（決定的な微小変位）を次段階の候補として送った（TASK-80 notes）。
- deck の base-outlines レイヤーは撤去。base 境界の見た目を変える場合は approximate_borders.ts のみ変更すればよい。moveLayer による重ね順操作は @deck.gl/mapbox の styledata 再挿入と競合するため禁止。
- 関連タスク: TASK-80, TASK-84 / 関連 decision: decision-15
