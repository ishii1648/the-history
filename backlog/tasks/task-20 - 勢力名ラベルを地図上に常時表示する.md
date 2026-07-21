---
id: TASK-20
title: 勢力名ラベルを地図上に常時表示する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 12:09'
updated_date: '2026-07-21 13:06'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: deck.gl TextLayer で各勢力ポリゴンの代表点に NAME を常時描画する（glyphs 不要・既存 MapboxOverlay に統合）。重なり制御は @deck.gl/extensions の CollisionFilterExtension を使い、面積の大きい勢力を優先表示（小勢力はズームインで出現）。
2. ラベル位置: 最大ポリゴンの pole of inaccessibility（npm:@mapbox/polylabel, ISC ライセンス）を代表点とする純粋関数を src/labels.ts に実装（凹形状で重心が領域外に出る問題を回避）。優先度は最大ポリゴンの近似面積。
3. 表記: 地図上ラベルは NAME のみ（属領も NAME 表示）。属領の詳細（宗主国）はホバー/クリックの displayLabel が担い、矛盾しない（AC#4 は「NAME 部分が一致し宗主国表記はツールチップに委ねる」方針で満たす）。Württemberg 等の非 ASCII 文字が描画されるよう characterSet を全ラベル文字から導出する純粋関数を用意。
4. 対象レイヤー: base（europe_<year>）と HRE オーバーレイ（hre_<year>）の両方の feature にラベルを付ける。HRE 領邦は面積が小さいものが多く、衝突優先度により z4 では主要国 → ズームインで領邦ラベルが出る挙動になる。
5. 並列化判定: 見送り（理由: 本タスクは「純ロジック src/labels.ts」と「main.ts への TextLayer 統合」の 2 部分だが、統合部は labels.ts の API に依存しコンパイル・テストとも独立に成立しない（実行順依存）。CLAUDE.md の並列化基準「互いにファイル競合・実行順依存がなく独立にテスト可能」を満たさないため、単一 subagent に委譲して直列実装する）。
6. TDD: labels_test.ts を先行作成（red 確認）→ 実装 → green。main.ts 統合後、deno fmt --check / lint / test / build 全 green → 目視確認（z4 で主要勢力ラベル・重なり無し、ズームインで領邦ラベル、年代切替追従）→ PR → CI 監視 → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->
