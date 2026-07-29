---
id: TASK-49
title: rivers-hit の 14px 判定帯が河畔都市マーカーの picking を遮蔽してクリック不能になる
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 12:19'
updated_date: '2026-07-24 13:45'
labels:
  - bug
dependencies: []
ordinal: 47000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review（PR #45〜#56 の横断レビュー、2026-07-24）の CONFIRMED 指摘 #1。TASK-43 の透明ヒットライン層（RIVER_HIT_LINE_WIDTH_PX=14、PICKING_PRIORITY 最優先・最前面）が、河川中心線から ±7px 以内の都市マーカーのクリック/ホバーを構造的に不能にする。resolveClickInfo（src/main.ts:491 付近）は直下 pick が rivers/rivers-hit なら早期 return するため、下にある都市は pickMultipleObjects の候補にも入らない。実測: パリ（セーヌ川上、data/cities.json）はズーム 4 で 0.77px・ズーム 6 で 3.1px・ズーム 7 で 6.2px と、アプリのズーム域（4〜8）の大半で帯の内側。再現手順: dev サーバで year=1500 前後、ズーム 4〜6 でパリの都市ドットをクリック。期待: 都市名（パリ）が表示される。実際: セーヌ川が選択される。TASK-43 以前（河川の実効判定 2〜3px）には無かった質的退行。対応候補: (1) rivers-hit 直下 pick 時にも pickMultipleObjects で都市候補を列挙し「都市ドット近傍（例 ±5px）なら都市優先」の分岐を追加 (2) hit 幅のズーム連動 (3) 都市専用ヒット層の追加。PICKING_PRIORITY の rivers > cities は decision-7 の設計だが「2〜3px の優先」前提だった点を考慮すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 再現テスト（パリ相当の座標関係で都市が pick されないことを示す red）が追加されている
- [x] #2 修正により河畔都市のクリック/ホバーが可能になり、河川の広い判定（TASK-43）も維持されている（両立の境界がテストで検証されている）
- [x] #3 実機確認でパリ等の河畔都市クリックが都市を選択する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 修正方針: PICKING_PRIORITY を rivers > cities > rivers-hit > hre-powers > powers に変更する（現状は rivers-hit が最前面）。これにより (a) 可視の河川ライン（3px）直上 → 従来どおり河川最優先 (b) 都市ドット直上 → 都市が不可視ヒット帯に勝つ（本バグの解消） (c) 帯内だがライン・都市いずれの上でもない → rivers-hit = 河川、の三層が z 順だけで成立する。radius 再ピック（resolveClickPick）も同じ優先表を使うため一貫する。decision-7（rivers > cities）の趣旨は「可視要素同士の優先」であり、不可視ヒット帯を都市の下に置くことは矛盾しない（finalization で注記）。
2. TDD（red 先行）: (a) PICKING_PRIORITY の新順序テスト（cities が rivers-hit より高優先） (b) resolveClickPick が [rivers-hit, cities] の候補で cities を選ぶこと（都市ドット直上相当） (c) [rivers, cities] では従来どおり rivers (d) 描画順導出（renderOrderFromPickingPriority）の整合。red 確認 → picking.ts の順序変更 + 既存テスト期待値更新で green。
3. 実機確認: 河畔都市（パリ、zoom 5〜6）のクリック/ホバーで都市が選択・表示されること、河川ライン直上クリックは河川のままであること、帯内（ライン外・都市外）のクリックが河川になることを確認。
4. 並列化判定: 見送り（理由: picking.ts の順序変更を核とした単一機構の小規模修正。単一 subagent 委譲・実機確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（2026-07-24）:
- AC#1: 再現テスト — 優先順の red 3 件（cities > rivers-hit 等）と isDirectPickFinal の red（TS2305）を確認してから実装（TDD 2 巡）。
- AC#2: 修正は (1) PICKING_PRIORITY を rivers > cities > rivers-hit > hre > powers に並べ替え（三層が z 順で成立、decision-7 の rivers > cities は可視要素間の優先として維持） (2) isDirectPickFinal 導入でクリックの radius 再ピックが都市の直下ヒットを上書きしない、の 2 段。TASK-43 の判定拡大（帯内・都市外は河川）は実機で維持を確認（帯内クリック → セーヌ川選択）。境界の単体テスト 514 passed・CI green（PR #59）。
- AC#3: 実機（:8010 = task-49 ビルド）で、修正前は パリ クリック → セーヌ川 となる残存経路を確認 → 追修正後、ユーザーの実マウスで パリ の都市ドットクリック → 情報パネル「パリ」を確認（自動クリックは精度 ±5px でドット半径 3px に不安定なため実マウスで代替）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
rivers-hit（14px 不可視判定帯）が河畔都市の picking を遮蔽するバグを 2 段で修正。(1) PICKING_PRIORITY を rivers > cities > rivers-hit に並べ替え、可視ライン > 都市ドット > 不可視帯の三層を z 順だけで成立させホバーを解消。(2) 実機検証で発見した残存経路（クリックの radius 再ピックが都市の直下ヒットを近傍河川で上書き）を isDirectPickFinal で封止。検証: TDD red→green ×2（514 passed）・CI green・実機でパリクリック → 「パリ」表示（ユーザー実マウス確認）と帯内クリック → 河川選択の両立を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
