---
status: accepted
date: '2026-07-27 13:52'
---

# decision-21: ラベルの衝突フェードは二値化し、重なりの解消に COLLISION_SIZE_SCALE を使わない

## Context

ラベルの重なりは deck.gl の `CollisionFilterExtension` で間引いている
（TASK-38 / 54 / 60 / 72 / 77 / 97 で積み上げた構成）。これまで「ラベルが
重なって読めない」という症状が出るたび、対処は `COLLISION_SIZE_SCALE`
（衝突判定時にラベルを何倍のサイズとして扱うか）の引き上げだった
（TASK-54 で 2 → 2.6、TASK-72 で背景パネル撤去分を補って 2.8）。

TASK-108 で「隣接する領邦のラベルの片方が、文字だけ薄れて白っぽい輪郭だけ
残る」症状を調べた結果、これは重なりの量の問題ではなく拡張の仕様に起因する
ことが分かった。

- `@deck.gl/extensions@9.3.7` の `collision_isVisible` は衝突判定を 0/1 では
  なく、ラベルのアンカー周辺 **5×5 px** を衝突マップからサンプルした
  `pow(一致率, 2.2)` という**連続値**（`collision_fade`）で返し、
  `color.a *= collision_fade` として乗算する。表示/非表示が切り替わるときの
  ちらつきを減らすための意図的なフェードである。
- 優先度の高いラベルの衝突ボックスがアンカー近傍を部分的に覆っている
  **静止状態**では、負けた側がこの中途半端な alpha のまま描かれ続ける。
- さらに TextLayer の SDF フラグメントシェーダは halo の alpha を
  `outlineColor`（不透明なクリーム）から取り `vColor.a` に依存しない。
  そのため文字の芯だけが薄まり、クリーム色の輪郭は不透明のまま残る。

`COLLISION_SIZE_SCALE` を上げてもこの症状は直らない。5×5 サンプルの部分一致は
箱を広げても境界が移動するだけで、境界に載ったラベルは必ず出る。加えて 3 以上は
「ズーム 5〜6 の全体観で中小勢力ラベルが消えすぎる」という既存の制約
（`src/labels.ts` のコメント、TASK-54）に当たる。

## Decision

**ラベルは「読める」か「出ない」かの二択に倒す。**中間の半透明状態を作らない。

`src/label_collision.ts` の `LabelCollisionCutoffExtension` を
`CollisionFilterExtension` の**後ろ**に置き、`collision_fade` を
`LABEL_COLLISION_FADE_CUTOFF`（既定 0.5 = 生の一致率 約 0.73）で二値化する。
未満はジオメトリごとクリップ空間の外へ飛ばして halo ごと消し、以上は
`collision_fade` を 1.0 に戻して本来の不透明度で描く。

**ラベルの重なりが報告されたとき、まず `COLLISION_SIZE_SCALE` を上げるという
対処を採らない。**この定数は「どのラベルを表示候補にするか」の粗さを決める
もので、AC として繰り返し現れる「ズーム 5〜6 で中小勢力ラベルが消えすぎない」
と直接トレードオフの関係にある。判読不能な描画の解消は、表示候補を減らす
のではなく描画側（この二値化）で行う。

実装上の前提が 2 つあり、どちらも deck.gl の内部仕様に依存するため
`src/label_collision_test.ts` のガードテストで固定してある。

- inject 先は `vs:DECKGL_FILTER_COLOR` ではなく
  **`vs:DECKGL_FILTER_GL_POSITION`**。色フックで `color.a` を 0 にしても、
  halo の alpha は `outlineColor` 由来なので輪郭が不透明のまま残る。
- inject は top-level ではなく **shader module** として出す。luma.gl は
  「top-level inject → modules の inject」の順に hook 本体を積むため、
  top-level で書くと collision モジュールより先に走り修正が無効になる。

## Consequences

- 衝突マップの描画パス（`collision.enabled == false`）には介入しないため、
  どのラベルが勝つかの判定・層をまたいだ表示優先（`getCollisionPriority`）・
  `COLLISION_SIZE_SCALE`・halo 幅・フォントサイズは従来のまま。既存の
  ラベル視認性の積み上げ（TASK-38 / 54 / 60 / 72）を壊さない。
- 「読めなかったゴースト」は表示されなくなる。TASK-108 の実機確認（1400 /
  1492 × zoom 5.5 / 6.5 / 7.5、北ドイツ）では消えたのはゴースト 8 件だけで、
  読めていたラベルは 1 つも消えなかった。
- 表示密度を調整したくなったときの摘みは `LABEL_COLLISION_FADE_CUTOFF`
  （`src/labels.ts`）1 箇所。下げれば残るラベルが増える。
- deck.gl のマイナーアップグレードで前提が壊れると
  `src/label_collision_test.ts` が落ちる。これは意図した挙動で、落ちたら
  `@deck.gl/extensions` の collision モジュールと luma.gl の
  `assembleShaders` を読み直す合図とする。
- 関連: decision-15（deck レイヤーの重ね順は `layer_stack.ts` で一元管理し、
  ラベルは overlaid の別オーバーレイに分離する）。ラベル層が単一の衝突空間を
  共有している前提はこの decision でも変えていない。
