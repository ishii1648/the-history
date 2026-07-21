---
id: TASK-20
title: 勢力名ラベルを地図上に常時表示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 12:09'
updated_date: '2026-07-21 13:20'
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
- [x] #1 各勢力ポリゴン上に勢力名ラベルが常時表示され、代表的な勢力がホバーなしで識別できる
- [x] #2 ラベルは年代切替に追従して切り替わる
- [x] #3 ラベル同士の重なりが制御されており、初期ズーム（z4）で判読不能な重なりが発生しない（小勢力はズームインで表示される等の出し分けも可）
- [x] #4 属領（SUBJECTO が NAME と異なる feature）のラベル表記方針が info.ts の displayLabel と矛盾しない
- [x] #5 ラベル位置算出などの純粋ロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: deck.gl TextLayer で各勢力ポリゴンの代表点に NAME を常時描画する（glyphs 不要・既存 MapboxOverlay に統合）。重なり制御は @deck.gl/extensions の CollisionFilterExtension を使い、面積の大きい勢力を優先表示（小勢力はズームインで出現）。
2. ラベル位置: 最大ポリゴンの pole of inaccessibility（npm:@mapbox/polylabel, ISC ライセンス）を代表点とする純粋関数を src/labels.ts に実装（凹形状で重心が領域外に出る問題を回避）。優先度は最大ポリゴンの近似面積。
3. 表記: 地図上ラベルは NAME のみ（属領も NAME 表示）。属領の詳細（宗主国）はホバー/クリックの displayLabel が担い、矛盾しない（AC#4 は「NAME 部分が一致し宗主国表記はツールチップに委ねる」方針で満たす）。Württemberg 等の非 ASCII 文字が描画されるよう characterSet を全ラベル文字から導出する純粋関数を用意。
4. 対象レイヤー: base（europe_<year>）と HRE オーバーレイ（hre_<year>）の両方の feature にラベルを付ける。HRE 領邦は面積が小さいものが多く、衝突優先度により z4 では主要国 → ズームインで領邦ラベルが出る挙動になる。
5. 並列化判定: 見送り（理由: 本タスクは「純ロジック src/labels.ts」と「main.ts への TextLayer 統合」の 2 部分だが、統合部は labels.ts の API に依存しコンパイル・テストとも独立に成立しない（実行順依存）。CLAUDE.md の並列化基準「互いにファイル競合・実行順依存がなく独立にテスト可能」を満たさないため、単一 subagent に委譲して直列実装する）。
6. TDD: labels_test.ts を先行作成（red 確認）→ 実装 → green。main.ts 統合後、deno fmt --check / lint / test / build 全 green → 目視確認（z4 で主要勢力ラベル・重なり無し、ズームインで領邦ラベル、年代切替追従）→ PR → CI 監視 → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: dev サーバ + Chrome で目視確認。1500 年（z5）で Holy Roman Empire・France・Poland-Lithuania・Imperial Hungary 等の主要国と HRE 領邦（Brandenburg・Electoral/Ducal Saxony・Bohemia・Bavaria・Austria・Salzburg・Palatinate・Württemberg・Mainz・Hesse・Cologne）のラベルがホバーなしで判読できる。
- AC#2: 年代切替で 1400 は Holy Roman Empire 単一等、年代相応のラベルに追従することを確認（applyFn 内で TextLayer data を差し替え、updateTriggers に year）。
- AC#3: CollisionFilterExtension + collisionTestProps.sizeScale=2 で衝突制御し、z4〜z5 で判読不能な重なりなし。面積対数の priority で大勢力優先・小勢力はズームインで表示。
- AC#4: 地図上ラベルは NAME のみ、属領の宗主国込み表記（NAME — SUBJECTO 領）はツールチップの displayLabel に委ねる方針で矛盾なし（info.ts 無変更）。
- AC#5: src/labels_test.ts 14 テスト（最大ポリゴン選択・凹形状内部判定・NAME null 除外・priority 単調性とレンジ・characterSet 非 ASCII）。deno fmt --check / lint / test（260 passed）/ build 全 green、PR #30 CI pass。
- 実装: 並列化見送り（実行順依存のため単一 subagent aeb6a9b）。TDD red→green 実施。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
deck.gl TextLayer + CollisionFilterExtension で勢力名ラベルを常時表示。代表点は最大ポリゴンの pole of inaccessibility（@mapbox/polylabel）、優先度は面積対数で大勢力優先、characterSet 自動導出で非 ASCII も描画。base と HRE 領邦オーバーレイ双方が対象。検証は deno test 260 passed・CI pass・Chrome で 1500/1400 の目視確認（重なり制御・年代追従）。
<!-- SECTION:FINAL_SUMMARY:END -->
