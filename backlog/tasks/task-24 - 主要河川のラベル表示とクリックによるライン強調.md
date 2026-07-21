---
id: TASK-24
title: 主要河川のラベル表示とクリックによるライン強調
status: To Do
assignee: []
created_date: '2026-07-21 13:25'
labels: []
dependencies: []
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（agent-loop 実行中の報告）: TASK-21 で追加した主要河川（data/rivers.geojson、properties に name/scalerank あり）について、(1) 河川名のラベルを地図上に表示したい、(2) 河川をクリックしたら該当河川のラインを目立たせて表示したい。

実装の手がかり: 現在の河川はベースマップの MapLibre style レイヤー（src/basemap.ts の rivers ソース + line レイヤー）として描画されており、クリック判定・動的スタイル変更をしやすくするには deck.gl レイヤー（GeoJsonLayer/PathLayer, pickable）への移行が有力。ラベルは TASK-20 と同様 deck.gl TextLayer + CollisionFilterExtension を流用でき、ラインの代表点（最長セグメントの中点等）にアンカーする方式が考えられる。ベースマップの glyphs は未設定のため MapLibre symbol レイヤー（symbol-placement: line）を使う場合は glyphs 追加が必要になる点に注意。勢力名の日本語化（TASK-23）が先に完了している場合は河川名の表記方針（日本語マッピングへの追加）も合わせること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 主要河川（ライン川・ドナウ川・エルベ川等）の名前ラベルが地図上で河川の近傍に表示される
- [ ] #2 河川のラインをクリックすると該当河川全体が強調表示（太さ・色の変化等）され、もう一度クリックするか別の場所をクリックすると解除される
- [ ] #3 河川のラベル・クリック判定が勢力ポリゴンのホバー/クリック（ツールチップ・情報パネル）を阻害しない
- [ ] #4 追加・変更した純粋ロジックにテストがあり deno test が green
<!-- AC:END -->
