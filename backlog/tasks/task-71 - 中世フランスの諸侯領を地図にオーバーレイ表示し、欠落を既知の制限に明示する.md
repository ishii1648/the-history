---
id: TASK-71
title: 中世フランスの諸侯領を地図にオーバーレイ表示し、欠落を既知の制限に明示する
status: To Do
assignee: []
created_date: '2026-07-26 07:15'
labels:
  - 'area:src-main'
  - 'area:data'
dependencies:
  - TASK-70
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-70 で生成した中世フランス諸侯領データ（OpenHistoricalMap, CC0）を地図上に表示し、取得できていない諸侯（Toulouse・王領・Provence など）の欠落をユーザーに明示する。

背景と調査済みの事実は TASK-70 の Description を参照（OHM の実測カバレッジ、欠落一覧、ライセンス、代替案の検討結果）。要点のみ再掲すると、1200 年で Brittany / Aquitaine / Gascony / Normandy / Burgundy / Champagne（admin_level 3）と Poitou / Anjou / Maine / Alençon / Bar / Ponthieu（admin_level 4-5）が取得でき、1279/1300 年には Flanders / Artois が加わる一方、Comté de Toulouse・王領（domaine royal）・Foix・Armagnac・Auvergne・Bourbon・Nevers は OHM に存在せず、Provence は 1487 年以降のみ、Flanders は 1237 年以降のみ、Aquitaine / Gascony は 1214 年で切れる。したがって 1200 年の地図では南仏とパリ周辺の王領が空白のまま残る。この欠落を隠さず明示することが本タスクの主眼である。

既存の実装資産: HRE 領邦オーバーレイの機構が src/config.ts の HRE_OVERLAY_YEARS と data/hre_<year>.geojson で確立しており（TASK-19 / TASK-30 / TASK-32 / TASK-68）、色分け・ラベル・称号付き日本語表記・域内範囲の視覚的強調が実装済み。既知の制限は data/known-limitations.json に id / years（from-to）/ text の形で登録され、年代連動で UI に表示される（例: `hre-territories-pre-1500`）。日本語表記は data/name-ja.json で表示層に適用する（decision-6）。フランス諸侯オーバーレイもこれらの既存機構に載せることを想定しているが、HRE とフランスの二系統のオーバーレイが同時に表示される年代（例: 1200 年の HRE 領邦は無いが将来的に重なる可能性）での扱いは実装時に判断すること。

ライセンス上の注意: OHM は CC0 のため HRE データ（CC BY-NC-SA、decision-2 でファイル分離が必須）とは制約が異なるが、出典表示は行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 中世の各対象年で、取得できたフランス諸侯領がオーバーレイ表示され、HRE 領邦オーバーレイと同様に色分け・領邦名ラベル・領域の視覚的区別がされている
- [ ] #2 諸侯領名が日本語（称号付き。例: ノルマンディー公領・シャンパーニュ伯領）で表示され、name-ja.json 経由でデータは英語のまま維持されている
- [ ] #3 Toulouse・王領（domaine royal）・Provence（1487年以前）・Flanders（1237年以前）・Aquitaine/Gascony（1214年以降）が欠落していることが known-limitations に年代連動で明記され、該当年の UI に表示される
- [ ] #4 オーバーレイ対象外の年（近世以降）ではフランス諸侯オーバーレイが表示されず、ベースマップの勢力表示と二重にならないことがテストで保証されている
- [ ] #5 データソースが OpenHistoricalMap（CC0）であることが UI 上で出典表示されている
- [ ] #6 既存の HRE 領邦オーバーレイ・勢力ポリゴン・都市マーカー・河川の表示が本変更で退行しない
- [ ] #7 deno test が green
- [ ] #8 目視確認: 1000 / 1200 / 1300 年で諸侯領のオーバーレイと日本語ラベル、および欠落を示す制限表示をブラウザで確認済み
<!-- AC:END -->
