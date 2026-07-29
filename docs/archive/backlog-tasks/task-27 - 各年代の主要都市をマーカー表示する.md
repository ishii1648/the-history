---
id: TASK-27
title: 各年代の主要都市をマーカー表示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 14:06'
updated_date: '2026-07-21 15:28'
labels: []
dependencies:
  - TASK-20
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在は勢力圏ポリゴンの国名ラベル（TASK-20, src/labels.ts）のみが地図上に表示されており、都市の情報はない。各年代スナップショットにおける主要都市（首都等）を地図上に表示し、国名と視覚的に区別できるようにする。国名ラベルと同じ TextLayer 方式のラベル基盤を流用しつつ、都市には (a) ポイントマーカー（アイコン等）を追加し、(b) ラベル文字色を国名ラベルと異なる色にすることで、一目で「国」と「都市」を区別できるようにする。なお historical-basemaps / ETH Zürich Roller データセットには都市の位置データが含まれていない可能性が高く、都市データソースの選定（例: 歴史的主要都市データセットの調査）が実装の一部として必要になる。年代ごとにどの都市を『主要』とするかの粒度（首都のみ／人口上位も含む等）は、入手可能なデータの実態に応じて実装時に決定してよい。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 各年代スナップショットで、その時代の主要都市がポイントマーカーとして地図上に表示される
- [x] #2 都市名ラベルの文字色が国名ラベルの文字色と異なり、一見して国と都市を区別できる
- [x] #3 都市マーカー・ラベルはタイムラインの年代切り替えに追従して更新される
- [x] #4 都市ラベルと国名ラベルが重なる場合の視認性（衝突制御 or 優先度）が考慮されている
- [x] #5 都市データ→表示データへの変換ロジックに単体テストがある
- [x] #6 ホバー/クリックの picking 優先順位（河川 > 都市 > 国名、TASK-29 参照）と整合している
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. データソース方針: 第一候補は Reba et al. 2016「Historical Urban Population 3700BC-AD2000」（Chandler/Modelski のデジタル化、CC BY 4.0）から各スナップショット年の欧州域内・人口上位都市を抽出する。取得・ライセンス・欧州カバレッジを実装時に検証し、困難な場合は代替として首都・主要交易都市の手作業キュレーション（座標は一般知識・件数は年代あたり 15〜25 都市、フッターの概略免責の範囲）に切り替える。採否と根拠をコミット・タスクノートに記録する。
2. データ形式（A/B 間の契約）: /data/cities.json = { years: Record<スナップショット年文字列, Array<{name: string, lon: number, lat: number, population?: number | null}>>, source: {説明・ライセンス} }。名前は英語で持ち、表示時に nameJa（name-ja.json）を適用。name-ja.json に都市名の日本語訳を追加し name-ja_test のカバレッジ対象へ cities.json を加える。
3. 表示: マーカーは ScatterplotLayer の小ドット（白縁 + 濃色）、都市名ラベルは TextLayer で国名ラベル（濃グレー #282828）と明確に異なる色（例: 茶系）にし一見で区別可能にする（AC#2）。ラベルは既存の CollisionFilterExtension 衝突空間に参加させ、優先度は都市固定バンド（国名の面積由来優先度と整合する中位帯）で設計（AC#4）。年代切替は既存 applyFn での data 差し替えに追従（AC#3）。picking はレイヤー順で 河川 > 都市 > 国名 となるよう cities レイヤーを hre-powers の上・rivers の下に配置し、Deck レベル onHover/onClick に都市の分岐を追加（AC#6, TASK-29 と整合）。
4. 並列化判定: 並列可（独立サブ作業 2 件、worktree isolation）
   - subagent A（データ）: scripts/build-cities.ts（+test）でデータ取得/生成 → data/cities.json、name-ja.json への都市名追加 + scripts/name-ja_test.ts 拡張、scripts/build.ts のコピー対象追加（+build_test）、deno.json task。担当: scripts/* / data/cities.json / data/name-ja.json / deno.json
   - subagent B（表示）: src/cities.ts（+test、変換・優先度・色の純ロジック）、src/main.ts（マーカー/ラベルレイヤーと picking 分岐）。担当: src/*。B はスタブデータでテストし A の中身に依存しない
5. TDD（red→green）→ mainagent 統合レビュー → fmt/lint/test/build 全 green → 目視確認（マーカー表示・色区別・年代追従・衝突・ホバー）→ PR → CI → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: Chrome で 1500（ミラノ・ヴェネツィア・ジェノヴァ・ボローニャ・フィレンツェ等）と 1914（ロンドン・ベルリン・ハンブルク・パリ・プラハ・ブリュッセル等）のマーカー表示を目視確認。データは Reba et al. 2016（CC BY 4.0・コミット固定）から全 20 年 × 20 都市生成。
- AC#2: 都市ラベルは茶色（#793E16）で国名（濃グレー）・河川（水色）と一見区別できることを目視確認。
- AC#3: 年代切替（1500→1914）で都市が入れ替わることを確認（renderLayers + updateTriggers）。
- AC#4: 共有 CollisionFilterExtension + 都市固定優先度バンド 150-220。レビューで「getTextAnchor/getAlignmentBaseline 指定時に衝突判定パスと干渉しラベル全滅」というバグを発見し、既定アンカー + getPixelOffset [0,-10] へ修正（切り分けデバッグの過程はコミット 58df3f0 以降参照）。
- AC#5: cities_test 15+ テスト（年キー欠落・不正形・ja 適用・priority バンド・cityDisplayName オーバーライド）+ build-cities_test。deno test 356 passed / 0 failed。CI pass。
- AC#6: レイヤー順 powers → hre → cities → rivers で picking は 河川 > 都市 > 国名（TASK-29 の前提と整合）。
- レビュー修正 2 件: 勢力名衝突キー（Venice 等）の都市訳オーバーライド（58df3f0）、衝突拡張とアンカー props の干渉修正（コミット済み）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reba et al. 2016 Historical Urban Population（CC BY 4.0）から各年 20 都市の data/cities.json を生成し、ScatterplotLayer マーカー + 茶色 TextLayer ラベル（衝突制御・人口優先度バンド付き）で表示。picking は 河川 > 都市 > 国名。日本語訳 88 件追加、勢力名衝突キーは都市専用オーバーライドで解決。衝突拡張とテキストアンカーの干渉バグをレビューで発見・修正。検証は deno test 356 passed・CI pass・1500/1914 の目視確認。
<!-- SECTION:FINAL_SUMMARY:END -->
