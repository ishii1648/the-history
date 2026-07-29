---
status: accepted
date: '2026-07-26 07:36'
---

# decision-13: 中世フランス諸侯領データに OpenHistoricalMap（CC0・Overpass API）を採用し欠落は明示する

## Context

中世フランスの諸侯領（ノルマンディー公領・アキテーヌ公領など）を地図に表示したいが、既存ソースではカバーできない。europe_<year>.geojson（historical-basemaps, GPL-3.0）は中世フランスをほぼ一枚岩（Kingdom of France + Britany）で持ち、HRE 領邦データ（ETH Roller, CC BY-NC-SA）はフランスを一切カバーしない。Euratlas は諸侯レベルまで網羅した最高品質だが有償・再配布制限で OSS リポジトリにコミットできず（TASK-37 と同じ結論）、Wikimedia の地図の自前デジタイズは工数が過大（TASK-70）。

## Decision

OpenHistoricalMap（OHM）の Overpass API（https://overpass-api.openhistoricalmap.org/api/interpreter）を中世フランス諸侯領の データソースとして採用する。boundary=administrative リレーションの start_date / end_date タグで年代フィルタし、name:en 許可リスト + admin_level 3〜5 で選定して data/france_fiefs_<year>.geojson を決定的に生成する（scripts/build-france-fiefs.ts）。OHM に存在しない諸侯（Comté de Toulouse・王領・Foix・Armagnac・Auvergne・Bourbon・Nevers、1487 年以前の Provence、1237 年以前の Flanders、1214 年以降の Aquitaine/Gascony）は「取れるものだけ入れ、欠落を明示する」方針とし、docs/data-inventory と UI の既知の制限の双方で明示する。

## Consequences

- OHM は CC0 1.0（パブリックドメイン）のため、GPL-3.0 派生の europe_<year>.geojson とも CC BY-NC-SA の hre_<year>.geojson とも混合制約が無い（decision-2 のファイル分離義務の対象外）。ただし出典表示は docs/data-inventory と UI 双方で行う。
- 対象年は 1000/1100/1200/1279/1300 の 5 年代（900 年は 2 件のみで面として成立せず、1400 年は王領併合で OHM 側が admin_level 2 に移行するため対象外）。
- 1200 年の地図では南仏（トゥールーズ）とパリ周辺の王領が空白のまま残る。この欠落は隠さず known-limitations で明示する（表示は TASK-71）。
- データ品質は一様ではない（Droysen 1886 年地図帳由来・fixme タグ付きリレーションを含む）。
- 関連タスク: TASK-70, TASK-71
