---
id: TASK-38
title: 国名・都市名・河川名ラベルの視認性を改善する（フォント・サイズ・縁取り）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 14:04'
updated_date: '2026-07-23 14:05'
labels: []
dependencies:
  - TASK-27
  - TASK-30
ordinal: 37000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘: 国名（power-labels）・都市名（city-labels, TASK-27）・河川名（river-labels, TASK-24）のラベルがいずれも見づらい。背景の勢力ポリゴン色や地形陰影（TASK-34 hillshade）によっては文字が同化して読み取れない箇所がある。対応: (1) フォント種類の見直し（現状のデフォルト TextLayer フォントから可読性の高い書体へ変更）、(2) 文字サイズの見直し（年代・ズームレベルに応じた現状のサイズが小さすぎないか再検討）、(3) 文字に白枠（アウトライン/ハロー）を付け、どの背景色の上でも視認できるようにする。deck.gl TextLayer は fontFamily・fontSettings（sdf + outlineWidth/outlineColor）でアウトラインをサポートしており、既存の 3 種のラベル（国名・都市名・河川名、それぞれ TASK-30/TASK-32 で色分け済み）全てに一貫して適用する。色分け（国名=濃グレー、HRE 領邦=臙脂、都市=茶系、河川=水色系）は維持し、アウトラインで可読性のみを補強すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 国名・HRE 領邦名・都市名・河川名のいずれのラベルも、白（または十分なコントラストの）縁取りが付き、任意の背景色の上で文字が判読できる
- [x] #2 フォントサイズが従来より見やすく調整されている（過度な画面占有・ラベル同士の重なり増加がないこと）
- [x] #3 既存のラベル色分け（TASK-30 HRE 領邦色・都市色・河川色）が維持されている
- [x] #4 衝突制御（CollisionFilterExtension）の優先度ロジックに退行がない
- [x] #5 変更前後のスクリーンショット等で視認性向上が目視確認されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 現状把握: src/labels.ts / src/main.ts の TextLayer 構成（fontFamily・size・色分け・CollisionFilterExtension 優先度）を確認する。
2. TDD（red 先行）: ラベル共通のフォント設定を純ロジック（例: labelFontSettings() / ラベル種別ごとのサイズ定数）として export し、(a) sdf 有効 + 白系 outlineColor + outlineWidth>0、(b) フォントサイズが従来値以上かつ上限内、(c) 3 種のラベル色分け定数が不変、を検証するテストを追加して red → 実装で green。
3. 実装: deck.gl TextLayer の fontSettings { sdf: true, ... } + outlineWidth / outlineColor（白系ハロー）を国名・HRE 領邦名・都市名・河川名の全 TextLayer に一貫適用。fontFamily は可読性の高い sans-serif スタック（日本語グリフ含む）へ。サイズは控えめに引き上げ（衝突増を避ける）。色分け・collision 優先度は変更しない。
4. 品質ゲート: deno fmt --check / lint / test / build 全 green。
5. 実機確認（AC#5）: 変更前後のスクリーンショットを取得し視認性向上を目視確認（hillshade 上・濃色ポリゴン上を含む）。AC#4 の衝突制御はズーム操作でラベル重なりが増えていないことを確認。
6. 並列化判定: 見送り（理由: 変更対象が src/labels.ts / main.ts のラベル定義に集中する単一領域の小規模修正で、ファイル競合なく分割できる独立サブ作業がない。実装は単一 subagent、実機確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（実機, Chrome, before=:8002(main)/after=:8003(task-38) 同一ビュー ?year=1500&zoom=4.8&center=17.5,50.1）:
- AC#1: after のスクリーンショットで国名・HRE 領邦名（臙脂）・都市名・河川名すべてに白 halo（alpha 235）が付き、濃緑ポリゴン + hillshade 上でも判読可能（拡大確認: ブランデンブルク選帝侯領・ケルン大司教領・ライン川・プラハ等）。
- AC#2: サイズ 13→14 / 11→12px の控えめな引き上げで before 比の判読性向上を目視確認。ラベル数・重なりは before と同等（過度な画面占有なし）。
- AC#3: 色分け定数（BASE/HRE/CITY/RIVER）は不変（labels_test.ts で回帰テスト、実機でも臙脂/濃茶/水色/濃グレーを確認）。
- AC#4: CollisionFilterExtension の優先度・collisionTestProps は diff 上未変更（レビュー確認）。実機でラベル重なりの増加なし。
- AC#5: before/after スクリーンショットを取得し比較（本ノート記載のとおり視認性向上を確認）。
- ゲート: deno fmt/lint/test（478 passed, red→green）/ build 全 green。PR #50 CI green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
全 TextLayer（国名・HRE 領邦名・都市名・河川名）のフォントを和文対応 sans-serif スタックへ変更し、白 halo を強化（alpha 220→235 + smoothing 0.15）、サイズを国名 13→14px・都市/河川 11→12px へ控えめに引き上げ。色分けと衝突制御は不変。ラベル設定は labels.ts の定数へ集約。検証: TDD red→green（478 passed）、CI green、before/after 実機スクリーンショット比較で視認性向上を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
