---
id: TASK-153
title: ブリテン諸島の政体を地図にオーバーレイ表示し既知の制限を更新する
status: To Do
assignee: []
created_date: '2026-07-29 16:00'
labels:
  - 'area:src-main'
  - 'area:src-powers'
  - 'area:data-meta'
  - 'area:scripts-meta'
dependencies:
  - TASK-151
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-151 で生成した data/britain_fiefs_<year>.geojson（OpenHistoricalMap・CC0）を地図上に表示し、ウェールズ・アイルランドがイングランドと区別して見えるようにする。あわせて data/known-limitations.json の england-ireland-wales-1530-1700 を実態に合わせて更新する。

背景・OHM の実測カバレッジ・対象リレーション・データ側の限界は TASK-151 の Description を参照。要点のみ再掲すると、1000〜1279 でウェールズ諸王国（Gwynedd・Powys・Deheubarth 等）とアイルランド諸王国（Dublin・Leinster・Meath）が、1600 / 1650 / 1700 でアイルランドの政体（Kingdom of Ireland・Irish Catholic Confederation）が取得できる。一方 1283〜1707 のウェールズと、アイルランドの Munster / Connacht / Ulster は上流に存在せず空白のまま残る。この欠落を隠さず明示することが本タスクの主眼の一つである。

設計上の論点（着手時に判断してプランに記録すること）: 既存の france_fiefs / hre_fiefs / italy_fiefs は「王国内部の諸侯領」を描くオーバーレイだが、ウェールズ諸王国やアイルランド諸王国は当時イングランドから独立した主権政体であり、意味論が異なる。base（europe_<year>.geojson）の勢力レイヤーと同列に見せるのか、諸侯領と同じオーバーレイ機構に載せつつ凡例やクリックパネルの表現を分けるのかを決める必要がある。1600 / 1650 / 1700 のアイルランドについては base の England and Ireland が同じ土地を塗っているため、重ね順とクリック時の優先を明示的に扱う（fief-dedupe の既存方針が使えるかを確認する）。

既存の実装資産: オーバーレイの機構は src/config.ts の *_FIEF_OVERLAY_YEARS と src/powers.ts の colorKeyFor / データ URL 解決で確立済み（TASK-71 / TASK-86 / TASK-96 / TASK-110）。日本語表記は data/name-ja.json（decision-6）、色割当は scripts/build-colors.ts、出典表示は scripts/build-attribution.ts、既知の制限は data/known-limitations.json（id / years / text）で年代連動表示される。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1000 / 1100 / 1200 / 1279 の地図でウェールズ諸王国とアイルランド諸王国がイングランドと区別できる色で表示される（目視確認）
- [ ] #2 1600 / 1650 / 1700 の地図でアイルランドがイングランドと区別できる色で表示される（目視確認）
- [ ] #3 追加した政体の日本語表記が name-ja.json に登録され、地図ラベルとクリック情報パネルに日本語で表示される
- [ ] #4 追加した政体に色が割り当てられ、既存勢力と識別できる（build-colors の生成物が整合している）
- [ ] #5 クリック情報パネルに OpenHistoricalMap の出典とライセンス（CC0-1.0）が表示される
- [ ] #6 known-limitations.json の england-ireland-wales-1530-1700 が実態に合わせて更新され、残る限界（1283〜1707 のウェールズ、Munster / Connacht / Ulster の欠落）が年代連動で UI に表示される
- [ ] #7 deno test が green
<!-- AC:END -->
