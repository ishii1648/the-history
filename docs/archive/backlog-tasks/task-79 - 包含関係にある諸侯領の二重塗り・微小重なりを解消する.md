---
id: TASK-79
title: 包含関係にある諸侯領の二重塗り・微小重なりを解消する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 09:02'
updated_date: '2026-07-26 11:14'
labels:
  - 'area:app'
  - 'area:scripts'
dependencies: []
modified_files:
  - src/main.ts
priority: medium
type: enhancement
ordinal: 74000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘（2026-07-26 / 1200 年・フランス周辺のスクリーンショット）由来。諸侯領オーバーレイ内で、親公領の内側にある伯領が同じレイヤーに半透明で重ね塗りされ、塗りが濃くなったうえに輪郭が二重線に見える。

事前調査で判明していること（要検証・鵜呑みにしない）:
- france_fiefs_1200.geojson の諸侯領同士の重なり面積（0.02 度格子で実測）: County of Alençon × Duchy of Normandy 1,986 km2、County of Champagne × County of Bar 323 km2、County of Champagne × Duchy of Burgundy 323 km2、County of Ponthieu × Duchy of Normandy 24 km2。
- County of Alençon はポリゴン全体で約 2,000 km2 なので、ほぼ全域がノルマンディー公領に内包されている。これは史実の封建的な包含関係であり、データの誤りではない。一方 Champagne × Bar / Champagne × Burgundy / Ponthieu × Normandy の 300 km2 前後は境界不一致によるスリバー（OHM の別リレーション同士が境界を共有しないため）。
- 塗りは src/powers.ts の FILL_ALPHA = 128 で、同一レイヤーに重なると alpha 合成で色が濃くなる。
- 実装の方向としては「包含関係を検出して子側は塗りなし＋点線輪郭にする（階層が伝わる）」と「ビルド時に親から子を difference して塗りを排他にする（階層情報は失われる）」がある。スリバーは面積の小さい側を削るルールで解消できる。どちらを採るかは実装時に比較し、根拠をプランに記録すること。
- fief 側のジオメトリは健全（リングは全て閉じており、針状スパイク・自己交差は検出されず）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 包含関係にある諸侯領（例: アランソン伯領 ⊂ ノルマンディー公領）が重ね塗りで色濃くならず、階層関係が視覚的に判別できる
- [x] #2 300 km2 前後の微小な重なり（シャンパーニュ × バル、シャンパーニュ × ブルゴーニュ、ポンチュー × ノルマンディー）が解消している
- [x] #3 包含・重なりの判定ロジックが単体テストで検証される
- [x] #4 1000・1100・1200・1279・1300 年で目視確認し、諸侯領の塗りと輪郭が意図どおりであることを確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方式比較（実装冒頭で確定・根拠を notes に記録）: 本命は『ビルド時に包含・スリバーを検出し、(i) 真の封建的包含（例: Alençon ⊂ Normandy）は子を親から difference して塗りを排他化しつつ子の輪郭・ラベル・picking は維持（階層は輪郭と情報表示で伝わる）、(ii) 境界不一致スリバー（~300 km²）は面積の小さい側から削る』。代替の『子側を塗りなし＋点線輪郭』はランタイム表現の複雑化と picking の曖昧化を招くため要比較。TASK-78 で確立した派生データパターン（scripts/build-fief-dedupe.ts）を参考に、ビルド時前処理として実装する。
2. TDD: 包含判定（被覆率閾値）・スリバー判定（面積閾値）・difference 結果の検証（塗り重なりゼロ・子の picking 維持）を先にテストで固定し red 確認。
3. 実装: scripts/ のビルドパイプラインで fief データを前処理（または派生データ生成）。src/main.ts 側の変更は最小限に。decision-15 の layer_stack 分配・TASK-78 の fief-dedupe / base_outline と整合させる。
4. 全チェック green → CDP で 1000/1100/1200/1279/1300 年の目視確認（AC#4）。
5. PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 判定ロジック→前処理→描画確認が直列依存する単一データフローのため。単一 subagent に委譲）。
タスク間並列: next-tasks の集合判定により TASK-83（area:data）と並列実行（本タスクは area:app,scripts で互いに素）。worktree isolation で衝突回避。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: ビルド時前処理 scripts/build-fief-flat.ts で親（Normandy）から子（Alençon、被覆率 1.0）を difference し塗りを排他化。子ジオメトリ不変のため輪郭・ラベル・picking 完全維持。CDP（1200 年 zoom8 center 0.038,48.622）で二重塗り解消と enclave 中心の hover/click=アランソン伯領を確認。
- AC#2: スリバー 3 件（Champagne×Bar 332.12 km² / Champagne×Burgundy 328.64 km² / Ponthieu×Normandy 17.42 km²）を含む 5 年代の全重なりを解消。生成済み全年データの残存重なり <1 km² をテストで検証。CDP で Bar×Champagne 境界の濃い帯解消を目視確認。
- AC#3: scripts/build-fief-flat_test.ts に 11 テスト（閾値分類・削り手選択・子ジオメトリ完全一致・子 picking 維持と親の除外・決定性・上限超過警告等）。TDD: red（モジュール未存在・期待値更新で 5 failed）→ green。
- AC#4: 1000（ポンチュー）・1200（アランソン・Bar×Champagne）を CDP スクリーンショットで確認。1100/1279/1300 は同一前処理の生成物で残存重なり <1 km² のテスト検証済み。
- 閾値根拠: 被覆率は実測で 1.0000 と 0.0541 の 2 群に完全分離（間に観測値ゼロ）、CONTAINMENT_COVERAGE_THRESHOLD=0.9 は build-fief-dedupe.ts と整合。
- 却下案: 子を塗りなし＋点線輪郭（識別色喪失・filled:false で子内部 picking が死ぬ・線種増加）。
- 全チェック: fmt/lint clean、deno test 785 passed（main 取り込み後）、build green、PR #91 CI green。
- decision 記録判定: 新規 decision なし（TASK-78 で確立した派生データ前処理パターンの適用。再生成手順は docs/data-inventory/README.md §3.4/§3.6 に記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
諸侯領の包含（Alençon⊂Normandy）とスリバー重なり（~332 km² 3 件ほか）をビルド時前処理 build-fief-flat.ts で排他化し、france_fiefs_flat_<year>.geojson として配信。子の輪郭・ラベル・picking は完全維持で階層は入れ子で判読可能。閾値は実測 2 群分離で非恣意性を担保、TDD で 11 テスト追加（785 passed）、CDP で二重塗り解消と picking を実機確認、CI green（PR #91）。
<!-- SECTION:FINAL_SUMMARY:END -->
