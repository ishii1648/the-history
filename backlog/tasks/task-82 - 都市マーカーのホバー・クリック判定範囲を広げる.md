---
id: TASK-82
title: 都市マーカーのホバー・クリック判定範囲を広げる
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 10:02'
updated_date: '2026-07-26 10:48'
labels:
  - 'area:app'
dependencies: []
modified_files:
  - src/main.ts
  - src/picking.ts
priority: medium
type: enhancement
ordinal: 77000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（2026-07-26）: 都市のホバー・クリックできる領域が狭く、マーカーを狙うのに精度が要る。判定範囲を広げて操作しやすくする。河川で同じ問題を解決した TASK-43（透明ヒットライン層の追加）の都市版にあたる。

事前調査で判明していること（要検証・鵜呑みにしない）:
- 都市マーカーは src/main.ts の buildCityMarkerLayer が生成する ScatterplotLayer で、radiusUnits: "pixels" / getRadius: 3 の固定 3px ドット。判定用の別レイヤーは無い。
- クリックは src/main.ts の resolveClickInfo が overlay.pickMultipleObjects({radius: PICKING_RADIUS_PX}) で近傍を再ピックし、PICKING_PRIORITY で選び直すため、実効判定はドット半径 3px + 再ピック半径 6px（picking.ts の PICKING_RADIUS_PX）程度まで効いていると見られる。
- 一方 **ホバーでは再ピックを行わない**（mousemove 毎の pickMultipleObjects は高コストという TASK-36 の設計判断）。Deck の pickingRadius はカーソル直下に何も無い場合しか働かず、都市の周囲は常に powers ポリゴンが埋めているため発動しない。したがってホバーの実効判定はドット半径 3px のみで、クリックより明確に狭い。まずこの非対称を実測で確認すること。
- 想定される対処は TASK-43 と同じ「完全透明・大半径の判定専用 ScatterplotLayer（cities-hit）を重ねる」方式。ホバー・クリックの双方が直下 pick だけで拡大する。PICKING_PRIORITY（picking.ts）への追加と、layerOrderMatchesPickingPriority の整合維持が要る。

トレードオフと注意点:
- 判定帯を rivers-hit（幅 14px = ±7px）より優先に置くと、河畔都市（パリ・ルーアン・ケルン等）の周囲で河川をホバーしたい場合に都市が勝つ範囲が広がる。TASK-49 で「可視の河川ライン直上は河川が最優先、都市ドット直上は都市が優先」という設計が確立しているので、これを崩さない配置と半径にすること。
- TASK-66 のズーム別表示制御により低ズームでは都市が間引かれるが、それでも密集地域（HRE 域内）では都市間距離が判定半径を下回りうる。半径を広げすぎると隣接都市を誤って拾う。deck.gl の picking は「最も近い候補」ではなく最前面ピクセルで決まるため、重なった場合の勝敗は data 配列順に依存する点にも注意。
- 都市名ラベル（TextLayer・pickable: false）もクリック対象にするかは任意。実装時に判断し、採否と根拠をプランに記録すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 マーカー中心から一定距離（実装時に定める定数。目安 8〜10px）以内であれば、ホバーでもクリックでも都市が拾える
- [x] #2 ホバーとクリックの実効判定範囲が一致している（クリックだけ広い現状の非対称が解消している）
- [x] #3 可視の河川ライン直上では従来どおり河川が優先され、都市ドット直上では都市が優先される（TASK-49 の設計を維持）
- [x] #4 都市の実効判定範囲が定数として定義され、その導出（ドット半径・判定層半径・再ピック半径の合成）が単体テストと docs に明示される（TASK-51 と同様の扱い）
- [x] #5 レイヤー順と PICKING_PRIORITY の整合が layerOrderMatchesPickingPriority で検証される
- [x] #6 密集地域（1500 年前後の HRE 域内など）で、隣接都市を取り違えずに意図した都市が選択できることを実機で確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 現状の実測（AC#2 の前提）: ホバー = ドット 3px のみ / クリック = 3px + 再ピック 6px の非対称を CDP で確認する。
2. TDD: TASK-43（rivers-hit）と同型の透明判定専用 ScatterplotLayer（cities-hit）を追加する方式。(i) PICKING_PRIORITY への cities-hit 追加と layerOrderMatchesPickingPriority の整合（AC#5）、(ii) 実効判定半径の定数定義と導出の単体テスト（AC#4）、(iii) layer_stack.ts の分配（水面上・interleaved）への登録、を先にテストで固定し red を確認。
3. 実装: cities-hit レイヤー（radiusUnits pixels・完全透明・半径 8〜10px 目安、密集地域の取り違えとのトレードオフで決定し根拠を記録）。rivers-hit との優先関係は TASK-49 の設計（可視河川ライン直上は河川優先・都市ドット直上は都市優先）を維持する配置にする。都市名ラベルのクリック対象化は採否を判断し根拠を記録。
4. 全チェック green → CDP で AC#1/#2/#3/#6 を実機検証（河畔都市パリ/ルーアン付近の河川優先、1500 年 HRE 密集域の取り違えなし）。
5. PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: picking.ts / main.ts の同一箇所に変更が集中し、テスト・実装・実機検証が直列依存のため。単一 subagent に委譲）。
タスク間並列: next-tasks の集合判定により TASK-76（area:scripts,data）と並列実行（本タスクは area:app で互いに素）。worktree isolation で衝突回避。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（headless CDP・検証フック __getCityScreenPositions / __probePick）:
- AC#1/#2: パリ（1500 年 z7）距離スイープ d=0,3,6,8,9,10,12,15px。d≤9 で hover=click=パリ（cities/cities-hit）、d≥10 で都市外。ホバー・クリックの都市判定範囲が 9px で完全一致（10〜12px の click=セーヌ川は既存の河川再ピック設計 RIVER_CLICK_TOLERANCE_PX によるもので都市の非対称ではない）。
- AC#3: 可視河川ライン上 5 点（セーヌ・ロワール）で hover/click とも河川に解決。河川優先（TASK-49 / decision-7）維持。
- AC#4: CITY_MARKER_RADIUS_PX=3 / CITY_HIT_RADIUS_PX=9 / CITY_PICK_TOLERANCE_PX=9 を src/cities.ts に定数化、導出は cities_test.ts と docs/app-spec.md §3.3/§5.2 に明示。
- AC#5: layerOrderMatchesPickingPriority のテストが新順序（河川>都市>都市ヒット>河川ヒット>…）で green（picking_test / layer_stack_test）。
- AC#6: 密集域（1500 年 z5 北イタリア）視野内 40 都市のドット直上 probe が全て自都市に解決（最小ペア Brescia–Cremona 含む。null は視野外都市、表示名差異は日本語表記で実体一致）。
- 設計判断: cities-hit をクリック近傍再ピックから除外して非対称の再発を防止。ラベルのクリック対象化は不採用（衝突フィルタで出没・オフセット配置のため判定が状態依存）。
- 全チェック: fmt/lint clean、deno test 756 passed、build green、verify:smoke PASS、PR #88 CI green。
- decision 記録判定: 新規 decision なし（TASK-43/49/51 で確立済みのヒット層パターンの適用。判定定数と導出は docs/app-spec.md に記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
都市マーカーの判定範囲を透明ヒット層 cities-hit（半径 9px = 従来クリック実効範囲と同値）で拡大し、ホバー/クリックの非対称を解消。cities-hit をクリック再ピックから除外して範囲を完全一致させ、河川優先・ドット直上都市優先（TASK-49）と密集域の取り違えなしを CDP で実測検証。TDD で 756 テスト green、CI green（PR #88）。
<!-- SECTION:FINAL_SUMMARY:END -->
