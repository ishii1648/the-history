---
id: TASK-81
title: ビルド時に勢力ポリゴンの自己交差と微小破片をクリーンアップする
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 09:03'
updated_date: '2026-07-26 13:10'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies: []
modified_files:
  - scripts/build-data.ts
  - scripts/build-france-fiefs.ts
priority: low
type: chore
ordinal: 76000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘（2026-07-26 / 1200 年・フランス周辺のスクリーンショット）の調査中に見つかったジオメトリ品質の問題。単体では目立たないが、輪郭のちらつき・意味不明な小片として地図のノイズになる。

事前調査で判明していること（要検証・鵜呑みにしない）:
- data/europe_1200.geojson の Angevin Empire に自己交差が 2 箇所ある（レンヌ北 (-1.75197, 48.17821) 付近のセグメントを含む）。他の feature（画像域内）では検出されなかった。
- data/france_fiefs_1200.geojson の County of Bar は 8 パート中 5 個が 50 km2 未満の破片で、41.9 km2 と 7.4 km2 の穴を持つ。ただしバロワは史実として飛び地が錯綜した領邦であり、一律削除は史実情報の欠落になる。閾値は小さめ（10 km2 程度）に留めるか、ズームレベル依存の表示制御にするかを実装時に検討し、根拠をプランに記録すること。
- fief 側のリングは全て閉じており、針状スパイク（180 度折り返し）は検出されなかった。連結処理（scripts/build-france-fiefs.ts のリング化）自体は健全。
- クリーンアップは scripts/build-data.ts と scripts/build-france-fiefs.ts のパイプライン内で行い、生成物を再コミットする形になる。europe_1200.geojson は 112 KB（上限 300 KB）で余裕があるため、頂点が多少増えても収まる見込み。
- 対象は 1200 年だけではない可能性が高い。全 20 年代（europe_*）と 5 年代（france_fiefs_*）を走査して件数を把握すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 生成物に自己交差を持つポリゴンが存在しない（全年代を走査する検証が CI もしくはテストで実行される）
- [x] #2 面積が閾値未満の破片・穴の扱いが定数として定義され、史実の飛び地（County of Bar など）を過剰に削らない根拠が記録されている
- [x] #3 クリーンアップ処理が純粋関数として単体テストで検証される
- [x] #4 全年代の生成物が既存のサイズ上限（europe は 300 KB、fief は 200 KB）に収まる
- [x] #5 再生成後の 1200 年を目視確認し、地図の見た目に意図しない変化がないことを確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 全年代走査: europe_* 全 20 年代・france_fiefs_* 5 年代（flat 含む生成経路を確認）を機械走査し、自己交差・微小破片・微小穴の件数を把握する。
2. TDD: 自己交差解消（buffer(0) 等の確立手法）・破片/穴の閾値判定を純粋関数として先にテストで固定し red 確認（AC#3）。
3. 実装: scripts/build-data.ts / build-france-fiefs.ts のパイプラインにクリーンアップを組み込み、生成物を再コミット。破片閾値は小さめ（10 km² 程度目安）とし、County of Bar 等の史実の飛び地を守る根拠（実測分布）を記録（AC#2）。
4. 検証: 全年代の自己交差ゼロをテスト or CI で恒常検証（AC#1）、サイズ上限（europe 300 KB / fief 200 KB）内を確認（AC#4）。
5. CDP で 1200 年の見た目に意図しない変化がないことを確認（AC#5）→ PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 走査 → 閾値決定 → パイプライン組込み → 再生成が直列依存の単一フロー。単一 subagent に委譲）。
タスク間並列: なし（TASK-85/87 は area:scripts 競合で次イテレーション）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: 全 20 年代の europe_* + hre_* + fief 系で自己交差ゼロを走査するテストを追加し CI で恒常検証。修正前は計 664 交点（最多 1500 年 309）。
- AC#2: 破片・穴の閾値 1 km² を定数化。実測分布で 1 km² 未満 151 パートは全て bbox クリップ・simplify 残骸（111 個は測地面積 0）、1 km² 以上に史実の飛び地（Württemberg 1.09 / Swiss 6.76 km² 等）。County of Bar の飛び地 4.14〜61.09 km² は 1 つも削られないことを確認（10 km² 案は Bar 3 パート等を消すため不採用の根拠を記録）。
- AC#3: scripts/clean-polygons.ts を純粋関数として実装し単体テストで検証（自己 union の面積保存 相対 4e-7 未満・不動点性含む）。TDD red→green（コミット ce67033）。
- AC#4: 全年代の生成物がサイズ上限（europe 300 KB / fief 200 KB）内であることをテストで検証。
- AC#5: CDP で 1200 年フランス全景・レンヌ北（旧自己交差部）・バール伯領（飛び地保全）を目視確認し意図しない変化なし。verify:smoke PASS。
- 下流整合: base_outline_* は再生成、france_fiefs_* はクリーンアップ恒等（自己交差ゼロ）のため無変更をテストで担保し Overpass 再取得を回避。
- 全チェック: fmt/lint clean（.wrangler / Backlog.md は untracked ローカル生成物で CI 対象外）、deno test 842 passed、build green、PR #94 CI green。
- decision 記録判定: 新規なし（パイプライン内の品質処理でタスク横断の新方針は含まない。閾値根拠は本 notes とコミットに記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
shrinkToLimit 最終段に clean-polygons を組み込み、全 20 年代の自己交差 664 交点を自己 union（面積保存 相対 4e-7 未満）で解消、1 km² 未満の残骸破片・穴を除去。閾値は実測分布で史実の飛び地（County of Bar 含む）を全て保全する根拠づき。自己交差ゼロ・サイズ上限・不動点を CI で恒常検証（842 passed）、CDP で見た目の非退行を確認、CI green（PR #94）。
<!-- SECTION:FINAL_SUMMARY:END -->
