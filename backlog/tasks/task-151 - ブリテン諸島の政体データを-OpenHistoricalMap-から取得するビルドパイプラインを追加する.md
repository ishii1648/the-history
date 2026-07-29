---
id: TASK-151
title: ブリテン諸島の政体データを OpenHistoricalMap から取得するビルドパイプラインを追加する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-29 15:59'
updated_date: '2026-07-29 16:55'
labels:
  - 'area:scripts-fiefs'
  - 'area:data-fiefs'
dependencies: []
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-39（Done）は「ブリテン諸島の一括り表示は上流 historical-basemaps の限界であり、代替データも無い」と結論したが、その判断は 2026-07-23 時点のもので、代替候補の OpenHistoricalMap は当時「未成熟」と評価されていた。その後 TASK-70 / TASK-85 / TASK-96 / TASK-110 で OHM（CC0・Overpass）と Cliopatria（CC BY 4.0）の取得パイプラインが本番稼働しており、2026-07-30 に OHM の Overpass へ直接問い合わせた結果、ブリテン諸島の分離に必要なリレーションが実在し bbox も健全であることを確認した。したがって「上流に無いから描けない」のではなく「既に採用済みの出典に在るのに取りに行っていない」のが現状である。調査レポート: .outputs/claude/britain-split-feasibility.md

本タスクは scripts/build-france-fiefs.ts・scripts/build-hre-fiefs.ts と同型のパイプラインを追加し data/britain_fiefs_<year>.geojson を生成するところまでを担う（地図への表示は後続タスク）。

実測で存在を確認した取得対象（bbox 49.5,-11.0,61.2,2.2 の boundary=administrative リレーション。括弧内は OHM のリレーション ID と start_date..end_date）:
- ウェールズ（admin_level=2）: Kingdom of Gwynedd（2874011: 0785..1165 / 2800203: 1165..1282-12-11）、Kingdom of Powys（2805938: 0430..1160）、Southern Powys（2798863: 1160..1283）、Deheubarth（2803537: 0920..1197）、Brycheiniog（2803536: 0450..1045）、Kingdom of Glywysing/Morgannwg（2805408: 0974..1055）、Rhwng Gwy a Hafren（2804440: 0900..1100）
- アイルランド（admin_level=2）: Kingdom of Dublin（2851759: 0853..1170）、Kingdom of Leinster（2875840: 0800..1603）、Kingdom of Meath（2875846: 0100..1172-03）、Lordship of Meath（2875845: 1172-03..1244）、Lordship of Eastern Meath（2875843: 1244..1328）、Lordship of Western Meath（2875844: 1244..1328）、Kingdom of Ireland（2802031: 1542-06-18..1641-10-23 / 2697729: 1660-04-04..1800-12-31）、Irish Catholic Confederation（2802030: 1642..1652-05）
- 島嶼・周縁（admin_level=2）: Kingdom of Strathclyde（2869802: 0870..1030）、Kingdom of Galloway（2869805: 1034..1235）、Sodor（2851756: 0877..1265）、Isle of Man（2693293: 1333-08-09..1987-05-15）

対象外とその理由:
- スコットランドは base（europe_<year>.geojson）が 1000〜1700 の全年代で Scotland を持つため足す必要が無い。
- 1715 / 1783 / 1800 は base が既に United Kingdom と Kingdom of Ireland に分けており史実どおり。
- 1815 年以降の UK 構成国（admin_level=4 の Scotland / England and Wales / Ireland）は主権政体ではなく内部区分で意味論が異なるため別タスクで扱う。

データ側の限界（本タスクで解消できないもの・記録用）:
- 1283〜1707 のウェールズは OHM にも Cliopatria にも独立実体として存在しない（Principality of Wales のリレーションが無い）。これは史実（1284 年ルデュラン法令・1536 年併合法）と整合する。
- アイルランドの Munster / Connacht / Ulster は OHM に無く、1000〜1200 のアイルランドは Leinster / Meath / Dublin による部分的な描画になる。

Cliopatria にもウェールズ諸王国（Gwynedd / Powys / Brycheiniog / Morgannwg / Gwent）があるが、境界は OHM の 4〜7 倍粗く、アイルランドの収録は Earldom of Desmond と Earldom of Ulster のみと薄い。decision-13 / decision-17 の「OHM を優先する」方針どおり OHM を主とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1000 / 1100 / 1200 / 1279 / 1300 / 1400 / 1492 / 1500 / 1530 / 1600 / 1650 / 1700 のうち収録対象がある年について data/britain_fiefs_<year>.geojson が生成される
- [ ] #2 1000 年の生成物にウェールズ諸王国（Gwynedd・Powys・Deheubarth 等）とアイルランド諸王国（Dublin・Leinster・Meath）の feature が含まれる
- [ ] #3 1600 / 1650 / 1700 の生成物にアイルランドの政体（Kingdom of Ireland・Irish Catholic Confederation）の feature が含まれる
- [ ] #4 取得対象はリレーション ID の静的な許可リストと存続区間の包含判定だけで決まり、ネットワークに依存しないテストが green になる
- [ ] #5 収録しない対象（複合体・重複・上流の配置ずれ等）とその根拠がスクリプト内に記録されている
- [ ] #6 生成物が build-fief-flat / build-fief-dedupe の既存チェーンで処理でき deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 調査レポート .outputs/claude/britain-split-feasibility.md（あれば）とタスク記載のリレーション ID 一覧を確認。scripts/build-france-fiefs.ts / build-hre-fiefs.ts の同型パイプラインを読む
2. TDD red: リレーション ID 静的許可リスト × 存続区間の包含判定（ネットワーク非依存、AC#4）のテストを先に書く
3. scripts/build-britain-fiefs.ts を同型で実装し、data/britain_fiefs_<year>.geojson を生成（AC#1〜#3）。収録しない対象と根拠をスクリプト内に記録（AC#5）
4. 生成物を build-fief-flat / build-fief-dedupe の既存チェーンに通し、deno test green（AC#6）。Overpass 取得はコミット固定/リトライ等、既存パイプラインの流儀に従う
5. deno fmt --check / lint / test / build green。座標精度は TASK-130 の 3 桁に合わせる

並列化判定: 見送り（理由: 単一パイプライン追加で、許可リスト・取得・検証が直列依存）
<!-- SECTION:PLAN:END -->
