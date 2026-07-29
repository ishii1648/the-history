---
id: TASK-71
title: 中世フランスの諸侯領を地図にオーバーレイ表示し、欠落を既知の制限に明示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 07:15'
updated_date: '2026-07-26 08:00'
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
- [x] #1 中世の各対象年で、取得できたフランス諸侯領がオーバーレイ表示され、HRE 領邦オーバーレイと同様に色分け・領邦名ラベル・領域の視覚的区別がされている
- [x] #2 諸侯領名が日本語（称号付き。例: ノルマンディー公領・シャンパーニュ伯領）で表示され、name-ja.json 経由でデータは英語のまま維持されている
- [x] #3 Toulouse・王領（domaine royal）・Provence（1487年以前）・Flanders（1237年以前）・Aquitaine/Gascony（1214年以降）が欠落していることが known-limitations に年代連動で明記され、該当年の UI に表示される
- [x] #4 オーバーレイ対象外の年（近世以降）ではフランス諸侯オーバーレイが表示されず、ベースマップの勢力表示と二重にならないことがテストで保証されている
- [x] #5 データソースが OpenHistoricalMap（CC0）であることが UI 上で出典表示されている
- [x] #6 既存の HRE 領邦オーバーレイ・勢力ポリゴン・都市マーカー・河川の表示が本変更で退行しない
- [x] #7 deno test が green
- [x] #8 目視確認: 1000 / 1200 / 1300 年で諸侯領のオーバーレイと日本語ラベル、および欠落を示す制限表示をブラウザで確認済み
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 既存 HRE オーバーレイ機構（src/config.ts の HRE_OVERLAY_YEARS・data/hre_<year>.geojson ロード・色分け・ラベル・称号付き日本語表記）を調査し、フランス諸侯オーバーレイを同じ機構パターンで実装する（FRANCE_FIEF_OVERLAY_YEARS = 1000/1100/1200/1279/1300、data/france_fiefs_<year>.geojson）
2. テスト先行（red→green）: 対象年判定・レイヤー生成・ラベル表記の純粋ロジックに単体テストを追加。オーバーレイ対象外の年（近世以降）で表示されないことをテストで保証（AC4）
3. data/name-ja.json に 14 諸侯領の称号付き日本語表記（例: ノルマンディー公領・シャンパーニュ伯領）を追加（データは英語のまま維持、decision-6）
4. data/known-limitations.json に欠落（Toulouse・王領・Provence 1487 以前・Flanders 1237 以前・Aquitaine/Gascony 1214 以降）を年代連動で追加（AC3）
5. attribution/フッターに OpenHistoricalMap（CC0）の出典表示を追加（AC5）
6. 色割当は decision-5 の既存機構（build-colors.ts / colors.json）に倣い決定的に生成
7. deno fmt --check / lint / test / build 全 green → mainagent がヘッドレス CDP で 1000/1200/1300 年の目視確認（AC8、マージ前）
並列化判定: 見送り（理由: オーバーレイ表示・日本語表記・制限表示・出典表示は同一機構への統合で相互依存し（ラベル表示は name-ja 追加に、対象年テストは config 追加に依存）、ファイル競合なく独立にテスト可能なサブ作業へ分割できないため）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス: (AC1,2,8) ヘッドレス CDP（scripts/verify/cdp.ts + 専用チェック）で 1000 年=7 領邦・1200 年=12 領邦・1300 年=11 領邦のオーバーレイ表示と称号付き日本語ラベル（ノルマンディー公領・シャンパーニュ伯領等、__getFranceFiefDebug で全ラベル列挙）を確認、スクリーンショットで藍紫境界線・色分け・欠落部のベース France 透過を目視確認（PASS）。データは英語のまま name-ja.json 適用（name-ja_test.ts で 14 件検証）。(AC3) known-limitations に 3 エントリ追加、1200 年で active 強調・1500 年で非 active を DOM 検証（TASK-52 の全件表示+該当年強調の設計に準拠）。(AC4) 1500 年で overlay=false・featureCount=0 を実機確認、非対象年は fetch しない構造（createOverlayLoader）+ config_test で HRE 対象年と互いに素を固定。(AC5) attribution フッターに OpenHistoricalMap（CC0 1.0）リンクを追加し dist/index.html で確認。(AC6) PICKING_PRIORITY 更新以外の既存レイヤー挙動は不変、deno test 666 passed で既存テスト全 green、標準スモーク（verify:smoke）PASS。(AC7) deno test 666 passed, 0 failed。fmt/lint/build も green。実装は subagent、レビュー・実機確認は mainagent。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
仏諸侯領（OHM, CC0）を HRE と同じオーバーレイ機構（createOverlayLoader へ汎用化）で 1000〜1300 年に表示。藍紫の境界線・ラベルで視覚区別し、称号付き日本語 14 件を name-ja.json に追加、欠落 3 種を known-limitations に年代連動で明示、attribution に OHM 出典を追加。非対象年は fetch なしで二重表示を構造排除。ヘッドレス CDP で 4 年代の表示/非表示・日本語ラベル・制限強調を実機確認（PASS）。deno test 666 passed。PR #81。
<!-- SECTION:FINAL_SUMMARY:END -->
