---
id: decision-2
title: HRE 領邦データ（ETH Zürich Roller・CC BY-NC-SA）は GPL 派生データとファイル分離
date: '2026-07-21 15:52'
status: accepted
---
## Context

historical-basemaps は神聖ローマ帝国（HRE）を単一 feature で表現しており、内部領邦を表示できない。調査の結果、HRE 領邦粒度を満たす唯一のオープンデータは ETH Zürich の Roller データセット（DOI 10.3929/ethz-b-000472583）だったが、ライセンスが CC BY-NC-SA 4.0 で NC（非営利）条項を含む（TASK-19）。リポジトリ本体は GPL-3.0 派生データ（decision-1）を含む。

## Decision

CC BY-NC-SA の Roller データは GPL-3.0 派生の data/europe_<year>.geojson に統合せず、別ファイル data/hre_<year>.geojson（1500・1530・1600・1650）のオーバーレイとして分離する。コレクション（集合著作物）扱いとし、削除・差し替えが可能な可逆構成を保つ。出典・ライセンスはフッターに DOI リンク付きで明記する。

## Consequences

- ライセンス非互換（NC 条項と GPL）の混合を回避しつつ、HRE 領邦表示を実現できる。
- NC 条項により、本プロジェクトの利用は非営利範囲に制約される（該当データを削除すれば解除可能な構成）。
- 今後ライセンスが非互換な外部データを追加する場合も、同様に「別ファイル分離 + フッター出典明記」を先例とする。
- 関連タスク: TASK-19
