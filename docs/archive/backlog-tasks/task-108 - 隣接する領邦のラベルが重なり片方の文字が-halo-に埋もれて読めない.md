---
id: TASK-108
title: 隣接する領邦のラベルが重なり片方の文字が halo に埋もれて読めない
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 12:59'
updated_date: '2026-07-27 13:54'
labels:
  - bug
  - 'area:src-labels'
  - 'area:src-main'
dependencies: []
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状（bug）

**再現手順**: HRE 領邦が密集する年代（1400 / 1492 など）で北ドイツ一帯を表示する。

**期待挙動**: 隣接する領邦のラベルが重なる場合は、優先度の低い方が消えるか位置を
ずらすかして、表示されているラベルはすべて判読できる。

**実際の挙動**: ブレーメン大司教領とフェルデン司教領のように領土の間隔が狭い箇所で、
両方のラベルが重なった状態で描かれ、**片方（フェルデン司教領）の文字が薄く
潰れて読めない**。文字本体が消えて白っぽい輪郭だけが残っているように見える。

**発見契機**: ユーザーによる目視確認（スクリーンショット提供）。

## 調査済みの事実

現在のラベル描画・衝突制御（`src/labels.ts` / `src/main.ts`）:

- 全 TextLayer（勢力名・HRE 領邦名・仏諸侯領名・都市名・河川名・山脈名）が
  `CollisionFilterExtension` の**同一衝突空間**に参加し、判定時は
  `COLLISION_SIZE_SCALE = 2.8` 倍のサイズで扱う（TASK-54 で 2.6、TASK-72 の
  背景パネル撤去分を補って 2.8）。
- 表示優先は各層のデータが持つ `priority`（勢力は面積の対数、都市は人口バンド、
  河川はライン長）。
- 判読性は halo に一本化されている（TASK-72 で背景パネルを撤去）。
  `LABEL_OUTLINE_WIDTH = 5`、`LABEL_OUTLINE_COLOR = [244, 236, 215]`（クリーム）。
- deck.gl は 9.3.7。`CollisionFilterExtension` の fadeIn / fadeOut は未指定
  （既定値）。
- 問題の 2 つのラベルはどちらも HRE 領邦なので**同一 TextLayer 内**の instance。

## 原因の候補（実装時に再現して特定する）

1. **halo の侵食**: 衝突判定は通ったが実描画では halo 込みで重なり、後に描かれる
   ラベルのクリーム halo（幅 5）が先のラベルの文字を塗りつぶしている。同一
   TextLayer 内のグリフは instance 順に描かれるため、重なった領域では後勝ちになる。
   衝突判定の箱が「文字の実サイズ × 2.8」で halo の張り出しを含んでいない場合に起きる。
2. **衝突判定の 1 フレーム遅延**: `CollisionFilterExtension` は前フレームの
   衝突マップを使うため、パン/ズーム直後は両方描画されうる。静止状態でも
   再現するかを確認する必要がある。
3. **衝突空間の分断**: TASK-77 でラベル層は overlaid の別 canvas へ分離されており、
   「interleaved のグループ分割が衝突マップを壊しラベルが全滅する」既知の経緯が
   ある。TASK-97 で山脈ラベル層（4 系統目）が加わった際に衝突空間の前提が
   変わっていないかを確認する。

## 方針の候補（実装時に判断）

- 衝突判定の箱に halo の張り出し分を加える（`COLLISION_SIZE_SCALE` の引き上げでは
  なく、halo 幅に対応した実 px の余白を持たせる）。単純に 2.8 を上げると
  「3 以上でズーム 5〜6 の全体観から中小勢力ラベルが消えすぎる」という既存の
  制約（`labels.ts` のコメント）に当たる。
- 重なる場合にラベルを上下へオフセットして両方を残す（引き出し線の要否も含めて検討）。
- 優先度の低い方を確実に消す（中途半端に潰れた文字が残るより読める状態を保つ）。

いずれの方針でも、TASK-38 / TASK-54 / TASK-60 / TASK-72 で積み上げた
ラベル視認性の定数（フォントサイズ・halo 幅・衝突スケール）の意図を壊さないこと。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HRE 領邦が密集する年代（1400 / 1492）で北ドイツ一帯を表示したとき、表示されているラベルがすべて判読できる（文字が halo に潰れて読めないラベルが無い）
- [x] #2 ブレーメン大司教領とフェルデン司教領が重なる箇所で、両方が読めるか、優先度の低い方が完全に消えるかのいずれかになる
- [x] #3 静止状態とパン/ズーム直後の両方で、ラベルが中途半端に潰れた状態にならない
- [x] #4 ズーム 5〜6 の全体観で中小勢力のラベルが従来より消えすぎない
- [x] #5 勢力名・都市名・河川名・山脈名のラベルの相対的な表示優先が従来から変わらない
- [x] #6 ラベル視認性に関する既存テストが green
- [x] #7 deno test が green
- [x] #8 実機（ヘッドレス CDP スクリーンショット）で修正前後を比較し、改善を確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 原因（再現して特定済み）

起票時の候補 1〜3 はいずれも**外れ**。実際の原因は deck.gl `CollisionFilterExtension` が
**衝突判定の結果を 0/1 ではなく小数で返す**こと。

`@deck.gl/extensions@9.3.7` の `collision_isVisible`（dist/index.cjs:1824〜1848）は、
ラベルのアンカー座標まわり **5×5 ピクセル**を衝突マップからサンプルし、
`pow(一致数 / 25, 2.2)` を返す。これが `DECKGL_FILTER_COLOR` で
`color.a *= collision_fade` として乗算される。コメントにあるとおり「表示/非表示の
切り替わりのちらつきを減らすため」の意図的なフェードだが、**優先度の高いラベルの
衝突ボックスがアンカー近傍を部分的に覆っている静止状態では、負けた側が
中途半端な alpha で描かれ続ける**。文字色（濃赤）と halo（クリーム）が揃って
薄まるため「文字本体が消えて白っぽい輪郭だけが残る」ように見える。

再現エビデンス: 1400 年 / center=(9.0,53.0) / zoom=5.5 のヘッドレス CDP
スクリーンショットで「ホルシュタイン＝ピンネベルク伯領」が半透明のゴーストになり、
真下の「ブレーメン大司教領」が不透明で描かれている（同一 TextLayer 内）。
zoom 5.5 では「ヘルスフェルト帝国修道院領」でも同じ症状。halo による塗り潰しでは
ないことは拡大画像で確認済み（文字の芯まで一様に薄い＝ alpha 低下）。

## 方針

`collision_fade` を**二値化**する。ラベルは「読める」か「出ない」かのどちらかに
倒し、中途半端な半透明を無くす（AC#2 の後者を満たす）。

`CollisionFilterExtension` に閾値のプロパティは無いため、拡張側の inject を
上書きせず、**ラベル層に追加する自前の小さな Extension** で
`vs:DECKGL_FILTER_COLOR` に後段の inject を足し、`color.a` を閾値で 0/1 に
丸める（ラベルの getColor は不透明なので、乗算後の alpha をそのまま閾値判定
できる）。deck.gl の inject は登録順に連結されるため、`CollisionFilterExtension`
の後に置けば `color.a *= collision_fade` の結果に対して効く。

この方針を採る理由:

- `COLLISION_SIZE_SCALE` の引き上げでは直らない。5×5 サンプルの部分一致は
  ボックスを広げても境界が移動するだけで、境界に載ったラベルは必ず出る。
  加えて 3 以上は「ズーム 5〜6 で中小勢力ラベルが消えすぎる」既存制約
  （labels.ts のコメント。TASK-54）に当たり AC#4 に反する。
- ラベルのオフセット配置（両方残す）は引き出し線の設計が要り、TASK-38 /
  54 / 60 / 72 で積み上げた配置の意図を大きく変える。bug 修正の範囲を超える。
- 二値化なら既存の定数（フォントサイズ・halo 幅・衝突スケール・priority）を
  一切触らずに済み、AC#4 / AC#5 の「従来から変えない」を構造的に満たす。

## 手順（TDD）

1. 閾値二値化の GLSL inject を組み立てる純粋関数を `src/labels.ts` に置き、
   ユニットテストを先に書いて red を確認する（inject 文字列の形・閾値の
   クランプ・ラベル全層に同一 Extension が渡ることを検証する）。
2. `src/main.ts` の 6 つの TextLayer（勢力名・HRE 領邦名・仏諸侯領名・
   イタリア諸侯領名・都市名・河川名・山脈名）の `extensions` に追加する。
   共通 base props に載せて漏れを防ぐ。
3. `deno test` / `deno fmt --check` / `deno lint` / `deno task build` を green に。
4. ヘッドレス CDP で修正後スクリーンショットを撮り、取得済みの修正前
   （scratchpad の task108-before-*.png、1400/1492 × zoom 5.5/6.5/7.5）と
   比較して AC#1〜#4・#8 を確認する。静止状態とパン/ズーム直後の両方を撮る。

## 並列化判定

**タスク内並列: 見送り**（理由: 原因特定が済んだ結果、変更は
`src/labels.ts` + `src/main.ts` + そのユニットテストという単一の変更系に
収束した。検証は取得済みの修正前スクリーンショットとの比較で足り、独立に
テストできるサブ作業が 2 つ以上に分割できない。単一 subagent に委譲する）。

**タスク間並列: なし**（next-tasks が単独集合 TASK-108 を返した）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**実機確認の条件**: ヘッドレス CDP（scripts/verify/cdp.ts）で 1400 / 1492 × zoom 5.5 / 6.5 / 7.5、center=(9.0, 53.0)（ブレーメンとフェルデンの中間）、静止 2.5 秒後にスクリーンショット。加えてパン直後の状態も撮影。修正前後を同一条件で撮って比較した。

**AC#1（表示ラベルがすべて判読できる）**: 修正前は 1400-z5.5 で「ホルシュタイン＝ピンネベルク伯領」「ヘルスフェルト帝国修道院領」「ブリュージュ」、1492-z6.5 で「ディーペンブルク伯領」「シューピーゲルベルク伯領」「トルン帝国修道院領」「ケルン選帝侯領」「リューベック」が輪郭だけのゴーストだった（拡大画像で文字の芯が消え、クリーム色の halo のみ残っていることを確認）。修正後はこれら 8 件が完全に消え、残っているラベルはすべて不透明で判読できる。

**AC#2（ブレーメン／フェルデン）**: 修正後の 1400-z6.5 / 1492-z6.5 で「ブレーメン大司教領」「フェルデン司教領」「ホルシュタイン＝ピンネベルク伯領」がいずれも不透明で判読可能。1400-z5.5 では「ホルシュタイン＝ピンネベルク伯領」が完全に消え「ブレーメン大司教領」が鮮明に残る。どちらも AC の「両方読める」「優先度の低い方が完全に消える」のいずれかを満たす。

**AC#3（静止・パン直後）**: 静止 2.5 秒後・パン直後の両方で撮影。パン直後は衝突マップが 1 フレーム古いため両ラベルが描かれるが、**どちらも不透明で鮮明**であり中途半端に潰れた状態にはならない。

**AC#4（ズーム 5〜6 で消えすぎない）**: 修正前後の 1400-z5.5 / 1492-z6.5 を目視で突き合わせ、**消えたのは上記のゴースト 8 件のみ、読めていたラベルは 1 つも消えていない**ことを確認した。cutoff=0.5 は生の一致率換算 約 0.73（fade は pow(一致率, 2.2)）で、完全勝利（一致率 1.0）のラベルは必ず残るため、衝突していないラベルの表示は構造的に変わらない。

**AC#5（相対的な表示優先が変わらない）**: 二値化は衝突マップの**描画パス**（collision.enabled == false）には介入しない。どのラベルが勝つかの判定・getCollisionPriority・COLLISION_SIZE_SCALE（2.8）・halo 幅・フォントサイズは一切変更していない（git diff で確認）。

**AC#6 / #7（既存テスト・deno test）**: `deno task test` = 1146 passed / 0 failed / 3 ignored。ラベル視認性の既存テスト（labels_test.ts の COLLISION_SIZE_SCALE・halo・priority 関連）を含めて green。新規テストは 9 件（label_collision_test.ts 4 件 + labels_test.ts 5 件）。

**AC#8（修正前後の実機比較）**: 上記のスクリーンショット 13 枚（before 6 + after 6 + moving 1）で比較済み。

**その他のチェック**: `deno fmt --check`（追跡対象 129 ファイル）green、`deno lint` は `.outputs/claude/` 配下の既存 4 件のみで新規指摘なし、`deno task build` green、CI（PR #113）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

## 起票時の原因候補はすべて外れだった

起票時に挙げた 3 候補（1. halo の侵食 2. 衝突判定の 1 フレーム遅延 3. 衝突空間の分断）はいずれも誤り。真因は `CollisionFilterExtension` が衝突判定を連続値で返すことと、TextLayer の SDF が halo の alpha を outlineColor から取り vColor.a に依存しないことの組み合わせ。詳細は decision-21 と docs/app-spec.md §3.3 に記録した。

## 実装中に判明したプランの誤り 2 件

実装プランでは inject 先を `vs:DECKGL_FILTER_COLOR` とし、top-level inject で足りると想定していたが、どちらも誤りだった。

1. 色フックでは halo が消えない（alpha が outlineColor 由来のため）。ジオメトリごとクリップ空間外へ飛ばす必要があり、inject 先は `vs:DECKGL_FILTER_GL_POSITION`。
2. luma.gl は「top-level inject → modules の inject」の順に hook 本体を積むため、top-level inject では collision モジュールより先に走り修正が無効になる。shader module として出す必要がある。

どちらも `src/label_collision_test.ts` のガードテストで固定し、deck.gl 側の前提が壊れたら落ちるようにした。

## CI のテスト実行権限の変更

`deno test` に `--allow-env=NODE_ENV` を追加した（deno.json・.github/workflows/ci.yml）。上記のガードテストが `@deck.gl/extensions` を import し、その debug モジュールが `process.env.NODE_ENV` を読むため。この修正は deck.gl の内部仕様（inject の順序・フックの選択）に全面的に依存しており、アップグレードで前提が壊れたことを検知するガードテストの価値が権限拡大のコストを上回ると判断した。許可はこの 1 変数のみで、ネットワーク・他の環境変数は不許可のまま。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ラベルが「文字だけ薄れて白っぽい輪郭が残る」判読不能な状態で描かれ続ける bug を、CollisionFilterExtension の後段に置く自前の LayerExtension（src/label_collision.ts の LabelCollisionCutoffExtension）で collision_fade を二値化して修正した。真因は起票時の候補 3 つのいずれでもなく、(1) CollisionFilterExtension が衝突判定を 0/1 ではなく pow(アンカー近傍 5x5 px の一致率, 2.2) の連続値で返し color.a に乗算すること（ちらつき低減のための意図的なフェード。優先度の高いラベルの衝突ボックスがアンカー近傍を部分的に覆う静止状態では負けた側が中途半端な alpha で残り続ける）と、(2) TextLayer の SDF が halo の alpha を outlineColor から取り vColor.a に依存しないこと（文字の芯だけ薄まり輪郭が不透明のまま残る）の組み合わせ。cutoff（LABEL_COLLISION_FADE_CUTOFF = 0.5、生の一致率 約 0.73 相当）未満はジオメトリごとクリップ空間外へ飛ばして halo ごと消し、以上は fade を 1.0 に戻して本来の不透明度で描く。衝突マップの描画パスには介入しないため COLLISION_SIZE_SCALE・priority・halo 幅・フォントサイズは不変。COLLISION_SIZE_SCALE の引き上げ（5x5 の部分一致は箱を広げても境界が移動するだけで直らず、3 以上は中小勢力ラベルが消えすぎる既存制約に当たる）とラベルのオフセット配置（引き出し線の設計を伴い既存の配置意図を大きく変える）は見送った。実装中にプランの前提 2 件（inject 先は色フックではなく GL_POSITION フック / top-level inject ではなく shader module）が誤りと判明し、どちらもガードテストで固定した。方式選択は decision-21 に、挙動は docs/app-spec.md §3.3 に記録。検証: 新規テスト 9 件を先行追加して red → green、deno test 1146 passed / 0 failed、fmt --check / lint / build green、ヘッドレス CDP で 1400 / 1492 × zoom 5.5 / 6.5 / 7.5 と パン直後の修正前後を比較し、消えたのはゴースト 8 件のみで読めていたラベルは 1 つも消えていないことを確認、CI（PR #113）green。
<!-- SECTION:FINAL_SUMMARY:END -->
