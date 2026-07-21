---
id: TASK-20
title: 勢力名ラベルを地図上に常時表示する
status: To Do
assignee: []
created_date: '2026-07-21 12:09'
labels: []
dependencies: []
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザ動作確認での指摘: 勢力圏は色分けのみで、どの領域がどの国か地図を見ただけでは分からない（ホバー/クリックしないと名前が出ない）。

原因調査結果: ベースマップは意図的にラベルレイヤーを生成していない（src/basemap.ts、glyphs 未設定・labels_layers 不使用）。勢力圏レイヤー（src/main.ts の GeoJsonLayer）も名前表示はホバーツールチップとクリックパネルのみで、地図上に常時表示されるラベルが存在しない。

対応の方向性: 勢力ポリゴンの代表点（最大ポリゴンの内部点など）に deck.gl TextLayer 等で NAME を描画する。glyphs 不要な手段を優先。重なり・小勢力の扱い（ズーム連動の出し分けや衝突回避）を考慮する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 各勢力ポリゴン上に勢力名ラベルが常時表示され、代表的な勢力がホバーなしで識別できる
- [ ] #2 ラベルは年代切替に追従して切り替わる
- [ ] #3 ラベル同士の重なりが制御されており、初期ズーム（z4）で判読不能な重なりが発生しない（小勢力はズームインで表示される等の出し分けも可）
- [ ] #4 属領（SUBJECTO が NAME と異なる feature）のラベル表記方針が info.ts の displayLabel と矛盾しない
- [ ] #5 ラベル位置算出などの純粋ロジックにテストがあり deno test が green
<!-- AC:END -->
