---
id: TASK-43
title: 河川のクリック・ホバー判定範囲を広げる
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 15:05'
updated_date: '2026-07-23 15:42'
labels: []
dependencies:
  - TASK-36
ordinal: 42000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望: 河川のクリック・ホバーの当たり判定範囲をもう少し広げたい。現状 src/main.ts の PICKING_RADIUS_PX=6（ピクセル）が MapboxOverlay の pickingRadius に設定されているが、河川ラインが細いため実用上狙いにくい。TASK-36（河川強調が反映されないバグ）の原因調査・修正を前提とし、その結果（pickingRadius 不足が原因の一部だった場合はその修正と重複しないよう調整）を踏まえて、河川のクリック・ホバー判定範囲を広げる。広げる際は都市マーカー（TASK-27）・勢力ポリゴン（powers/hre-powers）等、他レイヤーの picking 判定への影響（誤って河川以外が河川と誤判定される、または他レイヤーの判定範囲まで意図せず広がる等）がないか確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 河川のクリック・ホバーの判定範囲が現状（6px）より広がり、細い河川ラインでも実用的に狙いやすくなっている
- [x] #2 判定範囲拡大によって他レイヤー（都市・勢力・HRE 領邦）のクリック/ホバー精度に悪影響が出ていない（picking 優先順位 TASK-29 が維持される）
- [x] #3 実機確認で河川のクリック・ホバーのしやすさが向上したことが確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方式: 透明の太い「ヒットライン」レイヤーを追加する。deck.gl の picking はカーソル直下優先のため、pickingRadius の引き上げでは全面を覆う powers に勝てない（TASK-36 で実測済み）。河川と同一データの GeoJsonLayer を lineWidth 14px（±7px 判定）・完全透明・pickable で最前面に重ねることで、ホバー/クリックの双方が直下 pick だけで河川を拾えるようになる。クリックの radius 補正（TASK-36 の resolveClickPick 経路, radius 6）は防御として維持。
2. TDD（red 先行）: RIVERS_HIT_LAYER_ID 定数・isRiversPickLayerId(id) ヘルパー・PICKING_PRIORITY/描画順への hit 層組み込み（rivers より上・最前面）・resolveClickPick が hit 層を rivers と同格に扱うこと・ヒット幅定数（>= 12px）のテストを追加し red → 実装で green。
3. 配線: main.ts のホバー/クリック分岐（layerId === RIVERS_LAYER_ID 判定箇所）を isRiversPickLayerId に置換。レイヤー順アサーション（layerOrderMatchesPickingPriority）との整合を保つ。ラベル/強調描画は既存 rivers 層のまま（hit 層は不可視・判定専用）。
4. AC#2 確認: 都市・勢力・HRE の picking への影響は「河川 ±7px 内で rivers 優先」= 既存 PICKING_PRIORITY（rivers 最優先, TASK-29/decision-7）の設計どおりであることをテストと実機で確認。
5. 実機確認（AC#3）: ライン中心から ~6px 離れた点のホバー/クリックが河川に命中することを確認（従来ホバーは ±2px 程度だった）。ホバーは実マウス制約があるためユーザー確認 or クリック代替エビデンスで担保。
6. 並列化判定: 見送り（理由: picking.ts / rivers.ts / main.ts が相互依存する単一機能の修正で独立サブ作業なし。単一 subagent 委譲・実機確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（実機, :8006 = task-43 ビルド, 2026-07-24）:
- AC#1/#3: ヴィスワ川の中心線から垂直 6px・-6px・12px の各点のクリックがすべて河川に命中（情報パネル「ヴィスワ川」）。実効クリック許容 = ヒットライン半幅 7px + resolveClickInfo の radius 6px ≈ ±13px（修正前はホバー ±2px・クリック ±8px 程度）。ホバーはヒットライン層の直下 pick で ±7px に拡大（クリックの直下 pick と同一機構のため機械的に保証。拡張機能の合成 hover が deck onHover を駆動しない既知の制約により、ツールチップの直接自動検証は不可の旨を記録）。
- AC#2: PICKING_PRIORITY は rivers-hit > rivers > cities > hre > powers で、河川 ±7px 外の picking は従来どおり（実機で遠方の勢力クリックが正常動作）。優先順の設計は decision-7（rivers 最優先）と整合。
- テスト: 新規テスト（RIVERS_HIT_LAYER_ID の優先順・isRiversPickLayerId・resolveClickPick の hit 層同格扱い・ヒット幅/透明色定数）を TDD（red: TS エラー 4 件 → green）。deno test 496 passed・fmt/lint/build green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
河川のクリック・ホバー判定範囲を透明ヒットライン層（同一データ・完全透明・幅 14px・最前面 pickable）で拡大。deck.gl の「カーソル直下優先」の下では radius 引き上げが全面の勢力ポリゴンに勝てないため（TASK-36 実測）、直下 pick 自体を ±7px 化する方式を採用。クリックは radius 補正との合成で実効 ±13px。layerId 判定は isRiversPickLayerId に統一し既存の優先順・見た目・TASK-42 ホバー強調は不変。検証: TDD red→green（496 passed）・実機で ±6/±12px クリック命中・CI green。
<!-- SECTION:FINAL_SUMMARY:END -->
