---
id: TASK-36
title: 河川ホバー/クリック時の強調スタイルが反映されない
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-22 14:03'
updated_date: '2026-07-22 14:27'
labels:
  - bug
dependencies: []
ordinal: 35000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー報告: 河川（TASK-24 で実装したライン強調・TASK-29 でホバー時ツールチップ表示）をホバー/クリックしても強調スタイル（太線・濃色 #0288d1・4.5px、src/rivers.ts の RIVER_SELECTED_LINE_COLOR/WIDTH）が視覚的に反映されない。再現手順: dev サーバでアプリを開き、1500〜1530 年付近でヴィスワ川等の河川ラインをクリックする。期待: クリックした河川全体が太線・濃色に変わり右上の情報パネルに河川名が表示される。実際: ブラウザ実機確認（Chrome、zoom 6.0 前後）で河川ライン付近をクリックしても情報パネルの表示（直前にクリックした勢力名など）が変化せず、強調も見られなかった（2 回試行、ピクセル単位で河川ラインを目視特定してクリック）。調査の手がかり: (1) src/main.ts の pickingRadius（PICKING_RADIUS_PX=6px）が実際の細い河川ラインに対して不足している可能性 (2) TASK-27（都市マーカー）・TASK-30（HRE extent 強調レイヤー）の追加により、picking 対象レイヤーの重なり順・pickable 設定に退行が生じた可能性（picking.ts の PICKING_PRIORITY 自体は河川最優先のまま定義されているが、実際の deck.gl Layer 構築・overlay 更新のタイミングに問題がある可能性）(3) selectedRiverName の状態更新後に renderLayers が正しく呼ばれているか (4) 単にブラウザ確認時のクリック座標精度の問題で実際は動作している可能性も排除できないため、再現性の確認から始めること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 報告された事象（河川クリックで強調・情報パネル反映がない）の再現手順が確立され、再現する条件（年代・ズーム・河川）が明確になっている
- [ ] #2 原因が特定され、再現テスト（red）が追加されている
- [ ] #3 修正によりテストが green になり、河川クリックで強調表示・情報パネル反映が実機で確認できる
- [ ] #4 河川ホバーのツールチップ表示（TASK-29）も併せて実機確認し、退行があれば修正する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 実機再現（AC#1）: 調査 subagent の静的解析ではロジック欠陥なし（picking 経路・レイヤー順アサーション・renderLayers 呼び出しすべて整合）。最有力仮説 = 細い河川ライン（RIVER_LINE_WIDTH_PX=2）に対し PICKING_RADIUS_PX=6 が不足しクリックが命中しない picking miss。実 Chrome（claude-in-chrome）で dev サーバを開き ?year=1500 / zoom6 でヴィスワ川等をクリック、さらに console から overlay の pickObject を直接呼んで命中半径を定量測定し、再現条件（年代・zoom・河川・命中境界 px）を確立する。
2. 原因特定と再現テスト（AC#2）: 実測で仮説を確定/棄却。radius 不足なら、headless GPU 制約で deck.gl 実 pick の結合テストは CI 不可のため、picking 判定ロジックを純関数化（例: 河川向け実効 pick radius の導出）してテスト可能にし、現状値で red になるテストを追加する。
3. 修正（AC#3）: テスト先行で PICKING_RADIUS_PX の引き上げ（実測に基づく値、目安 6→12）＋必要なら河川ラインの描画幅/当たり判定の底上げ。deno fmt/lint/test/build green。
4. 実機確認（AC#3/#4）: 実 Chrome で河川クリック強調・情報パネル反映、ホバーツールチップ（TASK-29）の回帰確認。
5. 並列化判定: 見送り（理由: 単一の picking 経路に対する調査依存の小規模修正で、ファイル競合のない独立サブ作業に分割できない。実装は単一 subagent に委譲し、実機確認は mainagent が Chrome で行う）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
実機再現・原因特定（mainagent, claude-in-chrome 実測）:
- 再現条件確立（AC#1）: dev サーバ ?year=1500&zoom=6&center=19.0,52.0、ヴィスワ川。目視でライン上と特定した点のクリック（ジオメトリ中心線から実測 5.0 CSS px）で river が選ばれず勢力（ポーランド・リトアニア）が表示される。中心線上（0.8px）のクリックでは正常に選択され、強調（#0288d1 太線）・情報パネル・ツールチップすべて動作 → 描画/状態更新経路は健全。
- 境界の定量測定: 中心線からの垂直距離 |d|≤2px で命中、|d|≥4px でミス（両側対称、DPR=1・page zoom なしを確認）。実効許容半径 ≈ ライン描画幅 2px の半値+AA ≈ 2〜3px で、PICKING_RADIUS_PX=6 が効いていない。
- 根本原因: deck.gl の picking はカーソル直下ピクセルのオブジェクトを優先し、radius は直下が空の場合の近傍探索にのみ働く。本アプリは全面を powers ポリゴンが覆うため、河川ライン描画幅の外では常に距離 0 のポリゴンが勝ち、radius 指定は河川に対して無効化される。picking.ts の selectPreferredPick（河川最優先の選好ロジック）は定義済みだが main.ts から未配線（どこからも import されていない）。
- 副次的発見: ベースマップ（Protomaps）の詳細な河川描画と deck の NE 50m 粗ジオメトリは場所により大きく乖離（ヴィスワ川北部で最大 ~200 CSS px）。ユーザが視認してクリックするのはベースマップ側の川であるため、乖離が大きい区間では radius をいくら広げても命中しない。本タスクでは picking 優先度の修正を行い、乖離問題は別途起票を検討。
<!-- SECTION:NOTES:END -->
