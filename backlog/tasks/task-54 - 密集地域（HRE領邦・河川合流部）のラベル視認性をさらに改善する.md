---
id: TASK-54
title: 密集地域（HRE領邦・河川合流部）のラベル視認性をさらに改善する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 12:58'
updated_date: '2026-07-24 15:34'
labels: []
dependencies:
  - TASK-38
ordinal: 52000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: TASK-38 でラベル（国名・都市名・河川名）に白縁取り等の可読性対策を実装済み（Done）だが、ユーザーが実機（1500 年、神聖ローマ帝国周辺）で確認したところ、依然として見づらい箇所が残っている。参考画像で確認できる具体的な問題点: (1) 左上のライン川・ワール川・レク川周辺で複数の河川ラベルが近接し重なって判読しづらい (2) ケルン大司教領周辺で領邦ラベル同士が密集し、小さい文字が背景と同化・重なって読めない箇所がある (3) HRE 外縁の赤い境界線（TASK-30）付近にラベルが重なり、線と文字が干渉して読みにくい (4) ザクセン選帝侯領/公領のような選帝侯・領邦が密集するエリアでラベル密度が高く、白縁取りだけでは不十分。TASK-38 は「白縁取り・フォント・サイズ」という一般的な可読性対策だったのに対し、本タスクは密集地域という局所的な問題に対する追加対策を検討する。検討観点（実装時に判断）: 衝突制御（CollisionFilterExtension）の優先度・間引き基準の見直し、ズームレベルに応じたラベル数の動的間引き強化、ラベルごとの半透明背景パネルの追加、境界線とラベルの重なりを避けるオフセット調整等。まずは修正案の検討（複数の対策候補の比較）を行い、採用案を決めてから実装すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 参考スクリーンショットで指摘された具体的な密集箇所（ライン川/ワール川/レク川周辺、ケルン大司教領周辺、ザクセン選帝侯領/公領周辺）が改善後に判読できる
- [x] #2 HRE 外縁境界線とラベルが重なる場合でも両方が判読できる（線がラベルを隠さない、またはラベルが線を避ける）
- [x] #3 複数の改善案を比較検討した記録が実装プランに残っている（採用案とその理由）
- [x] #4 既存の衝突制御・優先度ロジック（labels.ts）に対する変更がある場合、テストが追加され deno test が green
- [x] #5 改善前後のスクリーンショットで密集地域の視認性向上が確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 改善案の比較（AC #3）: 案A: ラベル半透明背景パネル — deck.gl TextLayer の background/getBackgroundColor/backgroundPadding で羊皮紙トーンの下地を敷く。密集の判読性と HRE 外縁線との干渉の双方に効く最有力。案B: 衝突間引きの強化 — CollisionFilterExtension の collisionTestProps.sizeScale 引き上げで密集地帯の下位優先ラベルを積極的に間引く。案C: 境界線とのオフセット調整 — 座標依存が強く保守性が低いため見送り（案A の背景で干渉を吸収できるかを実測で判断）。採用方針: A+B の複合。
2. 出自の注記: この比較検討は前セッション（強制停止済み）が中断時に残した未コミットプランを引き継いだもの。実装しかけの diff（labels.ts/labels_test.ts/main.ts、107 行）は参考資料として subagent に渡すが、TDD（テスト先行 red→green）で正規に実装し直し、採否はレビューで判断する。
3. TDD（AC #4）: 背景色・padding・sizeScale 等の定数/導出ロジックを labels.ts に export し、テスト先行で固定してから main.ts の各 TextLayer（国名・都市名・河川名）へ配線する。
4. 検証（AC #1/#2/#5）: ヘッドレス CDP（scripts/verify/cdp.ts、TASK-58 標準）で改善前後のスクリーンショットを取得し比較する。対象: ライン川/ワール川/レク川合流部・ケルン大司教領周辺・ザクセン選帝侯領/公領周辺（year=1500）+ HRE 外縁の境界線付近。改善前は mainagent が現行 main のビルドで取得済みとし、改善後は実装完了後に同一座標で取得。
5. 並列化判定: 見送り（理由: labels.ts と main.ts のラベル設定に集中する単一領域の変更でファイル競合なしに分割できない）。実装は単一 subagent（worktree isolation）に委譲し mainagent がレビュー。
6. deno fmt/lint/test/build green → PR（TASK-54 明記）→ CI green → finalization → マージ → マージ後動作確認。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（mainagent レビュー, 2026-07-25）:
- AC#1/#2/#5: ヘッドレス CDP の前後スクリーンショット（ライン川/ワール川/レク川合流部・ケルン大司教領周辺・ザクセン選帝侯領/公領周辺・HRE 外縁 + zoom5 全体観）で、半透明背景パネルにより密集ラベル・境界線干渉の判読性向上と過剰間引きなしを確認。
- AC#3: 案A（背景パネル）+ 案B（sizeScale 2→2.2）採用、案C（オフセット調整）は案A で吸収を実測確認し不採用。2.6 は閾値付近のラベルが低透明度フェードで固着する副作用（8 秒待機でも回復せず）を実測で発見し却下 — 採否と根拠を実装プラン・本ノートに記録。
- AC#4: 新定数を labels.ts へ export し TDD（red: TS2305 → green）。deno test 551 passed・fmt/lint/build green・CI green（PR #66）。
- 備考: subagent が worktree と共有ディレクトリで二重実装し不要な merge を放置していたため、mainagent が merge --abort で HEAD（完全実装）に収束させた。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
密集地域のラベル可読性を、全ラベルへの羊皮紙トーン半透明背景パネル（alpha 200）+ 衝突間引きの適正化（sizeScale 2→2.2、2.6 のフェード固着副作用を実測却下）で改善。HRE 外縁境界線との干渉は背景パネルで吸収。改善案 3 種の比較記録付き。検証: TDD red→green（551 passed）・CI green・前後スクリーンショット比較で密集 3 箇所 + 境界の判読性向上を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
