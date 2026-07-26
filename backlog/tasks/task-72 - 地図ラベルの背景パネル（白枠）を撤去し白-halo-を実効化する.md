---
id: TASK-72
title: 地図ラベルの背景パネル（白枠）を撤去し白 halo を実効化する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-26 07:15'
updated_date: '2026-07-26 08:16'
labels:
  - 'area:src-labels'
  - 'area:src-main'
dependencies: []
ordinal: 68000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（2026-07-26）: 地図上のラベルに敷かれている明るいベタ矩形（背景パネル）が「白枠」として目立ちすぎるため撤去したい。もともとパネルを入れた理由は「マップ上だと文字が見えづらい」ことなので、撤去と同時に可読性を別手段で担保する必要がある。

調査済みの事実（調査レポート: .outputs/claude/label-legibility/README.md、ヘッドレス CDP による実測スクリーンショット付き）:
(1) 「白枠」の実体は deck.gl TextLayer の背景パネル。src/labels.ts の LABEL_BACKGROUND_COLOR = [244,236,215,200] と LABEL_BACKGROUND_PADDING = [3,2]、および src/main.ts の labelLayerBaseProps() 内 background: true / getBackgroundColor / backgroundPadding（TASK-54 で追加、TASK-60 で調整、TASK-65 で共通化）。
(2) 現行の白 halo は事実上描画されていない。deck.gl の outlineWidth は px 指定ではなく fontSettings.radius（既定 12）比で正規化され（@deck.gl/layers text-layer.js）、outlineBuffer = max(smoothing, 0.75 * (1 - 正規化 outlineWidth)) となる（multi-icon-layer.js）。LABEL_OUTLINE_WIDTH = 2 は 14px 表示で約 0.33 CSS px にしかならず、TASK-38 で縁取りを入れたのに効かずパネル追加に至った根本原因。src/labels.ts の「アウトライン幅（px）」というコメントは誤りなので併せて訂正する。
(3) 実測では outlineWidth を 5 前後（fontSettings に buffer: 8 を追加、smoothing 0.1）にするとパネル無しでも HRE 領邦の密集地帯で判読できた。fontSettings.buffer は atlas のグリフ余白で halo 幅の上限になるが、字送り（advance）には影響しない。
(4) 逆に outlineWidth 9 まで上げると、deck.gl のグリフスプライトがインク bbox のみでハローが bbox にクリップされる仕様上、日本語では文字ごとの白いベタ矩形になり「白枠」と同じ見た目になる。上限は 5〜6 程度。
(5) フォントの種類・ウェイト変更（ヒラギノ角ゴ→丸ゴ／明朝、weight 600→700）では可読性はほとんど改善せず（明朝はむしろ不利）、この問題の解決手段にはならないことを実測で確認済み。フォントを Noto Sans JP 等の webfont サブセットで固定する案は OS 差の解消が目的の別課題であり、本タスクのスコープ外とする。
(6) 背景パネルを外すとラベルの衝突箱がパネルの padding 分だけ縮むため、COLLISION_SIZE_SCALE = 2.6（TASK-54）の再調整が必要になる可能性が高い。z4 の欧州全体表示では現行でもラベルの重なりが発生している。

対象は国名（勢力）・HRE 領邦名・都市名・河川名の全 TextLayer（labelLayerBaseProps で共通化済み）。TASK-38 / TASK-54 / TASK-60 / TASK-65 で書かれた「白 halo 上で判読」「背景パネル」前提のコメントも実態に合わせて更新すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ラベルの背景パネルが全 TextLayer（国名・HRE 領邦名・都市名・河川名）で描画されず、地図上の文字の周囲にベタ矩形が見えない
- [ ] #2 1650 年・HRE 領邦の密集地帯（ズーム 6 付近）で、勢力名・都市名・河川名ラベルが下の塗りや HRE 外縁の赤境界線と重なっても判読できることを目視確認済み
- [ ] #3 halo が文字ごとの白いベタ矩形に見えるほど太くなっていないことを目視確認済み（枠を消した目的を損なわない）
- [ ] #4 ズーム 4 の欧州全体表示でラベル同士の重なりが背景パネル撤去前より悪化していないことを目視確認済み
- [ ] #5 ラベルの配色・サイズ・アウトラインに関する定数とコメントが実際の deck.gl の挙動（outlineWidth は radius 比、px ではない）と整合している
- [ ] #6 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/labels.ts / src/main.ts labelLayerBaseProps() から背景パネル（background/getBackgroundColor/backgroundPadding、LABEL_BACKGROUND_COLOR/PADDING）を撤去（AC1）
2. halo を実効化: outlineWidth を radius 比で 5 前後（fontSettings に buffer: 8, smoothing 0.1 を追加）。調査済み上限 5〜6 を守り文字ごとのベタ矩形化を回避（AC3）。TASK-73 の申し送りに従い halo 色は純白でなくクリーム（--parchment #f4ecd7 系）を第一候補に目視判断
3. 「アウトライン幅（px）」等の誤りコメントを deck.gl の実挙動（outlineWidth は fontSettings.radius 比）に合わせ訂正、TASK-38/54/60/65 の背景パネル前提コメントも更新（AC5）
4. パネル撤去で衝突箱が縮むため COLLISION_SIZE_SCALE = 2.6 の再調整を目視で詰める（AC4、z4 全体表示で悪化させない）
5. テスト先行: labels_test 等の期待値を新定数に合わせ red→green。全 TextLayer（国名/HRE/都市/河川）へ一括適用（labelLayerBaseProps 共通化済み）
6. fmt/lint/test/build green → mainagent がヘッドレス CDP で 1650 年 z6 密集地帯・z4 全体表示を目視確認（AC2〜4、マージ前）
並列化判定: 見送り（理由: labels.ts と main.ts の共通 base props を軸にした単一の視覚チューニング作業で、halo 幅・衝突スケール・パネル撤去が相互依存するため独立サブ作業に分割できない）
<!-- SECTION:PLAN:END -->
