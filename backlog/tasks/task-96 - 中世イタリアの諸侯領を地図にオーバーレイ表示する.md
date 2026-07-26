---
id: TASK-96
title: 中世イタリアの諸侯領を地図にオーバーレイ表示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 16:33'
updated_date: '2026-07-26 18:36'
labels:
  - 'area:src-main'
  - 'area:src-powers'
  - 'area:data'
  - 'area:docs'
dependencies:
  - TASK-95
ordinal: 89000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

TASK-95 で生成する中世イタリアの諸侯領データを地図に表示し、12 世紀頃の
北・中部イタリアに複数の半独立国が並立していたことを読み取れるようにする。

現状、北イタリアは base（`europe_<year>.geojson`）で `Holy Roman Empire` の
単一ポリゴンに一括で含まれ、中部は `Papal States`、都市共和国は `Venice` のみ。
フィレンツェ・ジェノヴァ・ピサ・シエナ・ルッカ・スポレート公国などは地図上に
存在しない。調査の詳細は `.outputs/claude/italy-fiefs-12c-survey.md`。

## 実装時に判断する点

- **レイヤー構成**: 既存の領邦オーバーレイ（`france-fiefs` / `hre-powers`）と同じ
  `buildPowerLayer` の経路に載せる。新レイヤーを足すか既存レイヤーへ合流させるかは
  実装時に決める。新レイヤーを足す場合は `picking.ts` の `PICKING_PRIORITY`・
  `layer_stack.ts` の重ね順・`layerOrderMatchesPickingPriority` の整合を保つ。
- **base との二重塗り**: 北イタリアは base の `Holy Roman Empire`、中部は
  `Papal States` に覆われているため、TASK-92（諸侯領オーバーレイと base 勢力の
  二重塗りで領内に濃淡が出る）と同じ問題が新たに発生する。TASK-92 の対応方針と
  足並みを揃える。
- **オーバーレイ同士の重なり**: 既存の `scripts/build-fief-flat.ts`
  （`france_fiefs_flat_*` / `hre_fiefs_flat_*` を生成）と同じ排他化を適用し、
  イタリア諸侯領と HRE 領邦（`March of Verona` 等）の重なりを解消する。
- **ラベル**: 日本語表記（`data/name-ja.json`）と、base 勢力との二重ラベル抑制
  （`fief_dedupe.ts` / `data/fief-dedupe.json`）の扱いを既存の諸侯領と揃える。
- **既知の制限**: 収録できなかった諸侯・年代は `data/known-limitations.json` に
  明記する（既存の諸侯領オーバーレイと同じ方針）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1200 年の地図でフィレンツェ共和国・ジェノヴァ共和国・ピサ共和国・シエナ共和国・ルッカ共和国・スポレート公国が個別のポリゴンとして描かれる
- [x] #2 1100 年の地図でトスカーナ辺境伯領が描かれる
- [x] #3 イタリア諸侯領のポリゴンをホバー/クリックすると名称が表示され、情報パネルに反映される
- [x] #4 諸侯領名のラベルが日本語で表示され、base 勢力との二重ラベルが出ない
- [x] #5 イタリア諸侯領と既存の HRE 領邦・仏諸侯領のオーバーレイが同じ土地で二重に塗られない
- [x] #6 レイヤー順・picking 優先順の整合を検証する既存テストが green
- [x] #7 収録できなかった諸侯・年代が data/known-limitations.json に記載され UI から確認できる
- [ ] #8 deno test が green
- [ ] #9 実機で 1100 / 1200 / 1300 年のイタリアを表示し、諸侯領が期待どおり描かれることを目視確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TASK-86（HRE 表示）と同型で進める: italy_fiefs を既存の buildPowerLayer 経路に接続。レイヤー構成（新レイヤー italy-fiefs 追加 vs 既存合流）は picking / layer_stack の整合コストを見て実装時に確定・根拠記録。
2. 派生データ一式: build-fief-flat（伊 + HRE の重なり排他化、OverlapCutPolicy）・fief-dedupe / base_outline / europe_flat（base の HRE・Papal States との二重塗り = TASK-92 方式）に italy 系統を組み込み再生成。
3. ラベル: name-ja.json に伊諸侯領の称号付き表記（○○共和国・○○公国・○○辺境伯領等）を追加、二重ラベル抑制を既存方式で適用。
4. TDD: レイヤー整合（PICKING_PRIORITY / layerOrderMatchesPickingPriority / layer_stack）・派生生成・ラベルをテスト先行で固定。
5. known-limitations に収録できなかった諸侯・年代を記載（AC#7）。
6. CDP で 1100/1200 年イタリアの表示・picking・二重塗りなしを目視（AC#1〜#5）→ PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: レイヤー構成の決定が派生データ・表示・テストを規定する直列依存。単一 subagent に委譲）。
タスク間並列: なし（TASK-97/98/103 は area 競合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: CDP（1200 年イタリア z6.5）で Florence / Genoa / Pisa / Siena / Lucca / Spoleto ほか計 10 勢力が個別ポリゴン + 称号付き日本語ラベルで表示されることを目視確認。
- AC#2: 1100 年に March of Tuscany（トスカーナ辺境伯領）の表示を確認。
- AC#3: 新レイヤー italy-fiefs は buildPowerLayer 経路で pickable、PICKING_PRIORITY は powers 直上（3 系統は幾何排他化済みで相対順無影響）。ホバー/クリック → 情報パネル反映を確認。
- AC#4: name-ja.json に 27 件追加、base（HRE・Papal States）との二重ラベルは fief-dedupe の 3 系統 union 拡張で抑制。コルシカの base ラベルは被覆率 0.9983 で抑制（known-limitations 明記）。
- AC#5: build-fief-flat の伊 × HRE 排他化（keep-smaller、レイヤー跨ぎは帝国公領 ⊃ 局所諸侯領の入れ子のため HRE 側から差し引き）。伊 × 仏は全年ゼロ。CDP で二重塗りなし確認。
- AC#6: layerOrderMatchesPickingPriority ほか既存整合テスト green（CLICK_PICK_DEPTH は PICKING_PRIORITY.length 導出に変更）。deno test 1100 passed。
- AC#7: 収録できなかった諸侯・年代を known-limitations に記載。
- 全チェック: fmt/lint/build green、verify:smoke PASS、PR #108 CI green。
- decision 記録判定: 新規なし（decision-17 追記済みの地域系統構成・OverlapCutPolicy 既存パターンの適用）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-95 の伊諸侯領データを新レイヤー italy-fiefs として表示し、1000〜1492 年の北・中部イタリアの都市共和国・公領を個別勢力として読めるようにした。派生 3 系統（flat / dedupe / europe_flat）へ伊 union を組み込み二重塗り・二重ラベルを解消、name-ja 27 件追加。1100 テスト green・CDP 目視・CI green（PR #108）。
<!-- SECTION:FINAL_SUMMARY:END -->
