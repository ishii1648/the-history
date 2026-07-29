---
id: TASK-30
title: 神聖ローマ帝国の域内範囲を視覚的に分かりやすくする
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 14:46'
updated_date: '2026-07-21 16:44'
labels:
  - 'area:src-main'
dependencies:
  - TASK-19
ordinal: 30000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘: 神聖ローマ帝国（HRE）の域内が分かりづらい。特に領邦オーバーレイのある年代（1500・1530・1600・1650、TASK-19）では領邦が各々独立色で塗られるため、どこまでが帝国の範囲なのか一目で分からない。対応方針は 2 本立て: (1) HRE 域内の領邦ラベルの文字色を独立国のラベルと変え、ラベルを見るだけで域内/域外を区別できるようにする。(2) HRE 本体または域内の領邦をホバー/クリックした際に、帝国全体の範囲（外縁の内側全域）を強調表示（色のオーバーレイ・外縁強調等）し、帝国の面積・範囲が一目で分かるようにする。実装の手がかり: HRE 外縁は base（europe_*）の単一 feature、領邦は hre_<year>.geojson オーバーレイ（src/main.ts の hre-powers レイヤー）として描画済み。領邦ラベルは buildLabelData で base と束ねて 1 枚の TextLayer になっているため、色分けにはレイヤー分割か色アクセサの追加が必要。強調表示は TASK-24 の河川強調（選択状態 + updateTriggers）と同様のパターンが流用できる。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 領邦オーバーレイ年代で、HRE 域内の領邦ラベルの文字色が独立国ラベルと異なり、ラベルだけで域内/域外を区別できる
- [x] #2 HRE 本体または域内の領邦をホバーまたはクリックすると、帝国全体の範囲が強調表示され、帝国の面積・範囲が一目で分かる
- [x] #3 強調はホバー解除・別の場所のクリック等で解除され、通常表示に戻る
- [x] #4 領邦オーバーレイの無い年代（HRE が単一ポリゴンの年代）でも HRE のホバー/クリックで同様に範囲が強調される
- [x] #5 既存のツールチップ・情報パネル・河川強調（TASK-24）の挙動を阻害しない
- [x] #6 追加した純粋ロジックにテストがあり deno test が green
- [ ] #7 HRE の外縁境界が塗りと独立した専用の線種（破線等、参考: 教育用歴史地図の帝国境界表現）で常時描画され、領邦色の塗りがある年代でも帝国範囲の輪郭が読み取れる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針（AC#1 ラベル色分け）: HRE 領邦ラベルの文字色を独立国ラベル（濃グレー [40,40,40]）と別色（帝国を示す濃い臙脂系等、都市の茶・河川の水色とも区別できる色）にする。実装は labels.ts の LabelDatum に由来種別（kind: "base" | "hre"）を追加するか、main.ts の buildLabelLayer で base/hre の LabelDatum を別々に生成し getColor アクセサで塗り分ける（1 枚の TextLayer + per-datum color を基本とし、衝突制御は既存の共有空間を維持）。
2. 方針（AC#2〜4 帝国範囲の強調）: モジュール状態 hreHighlighted（boolean）を追加し、ホバー対象が HRE 関連（base の NAME=Holy Roman Empire、または hre-powers レイヤーの feature）である間 true にする。強調表示は base データから HRE feature を抽出した専用 GeoJsonLayer（id hre-extent、太い濃色外縁 + 薄い強調塗り）を powers の上・cities の下に描画して実現（picking 優先には不参加 = pickable false。PICKING_PRIORITY 不変で TASK-29 と整合）。ホバー解除で消える（AC#3）。領邦オーバーレイの無い年代でも base の HRE feature 判定で同様に動作（AC#4）。
3. 純ロジック: src/hre_extent.ts（新規）に isHreFeature(props)（NAME または renames 正規化後 SUBJECTO が Holy Roman Empire）、extractHreFeatures(fc)、ラベル種別付与のヘルパを実装し TDD。
4. 並列化判定（タスク内）: 見送り（理由: labels.ts / main.ts / 新モジュールの密結合な表示変更で独立テスト可能な分割単位がない。単一 subagent に委譲）。
5. TDD（red→green）→ fmt/lint/test/build green → 目視確認（1500: 領邦ラベル色分け・領邦ホバーで帝国全域強調・解除、1400: 単一 HRE でも強調、ツールチップ/河川強調の非阻害）→ PR → CI → finalization → マージ
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: Chrome（1500, z5.5）で HRE 領邦ラベルが臙脂 [140,30,30]・独立国が濃グレーで表示され、ラベルのみで域内/域外を区別できることを確認。
- AC#2: バイエルン公領ホバーで帝国全域に 3px 臙脂外縁 + 薄い同色塗りの強調（hre-extent レイヤー）。ツールチップ「バイエルン公領 — 神聖ローマ帝国 領」も併存。スイス盟約者団等の域外は強調から除外されることを確認。
- AC#3: フランスへのホバー移動で強調が解除され通常表示に復帰。
- AC#4: 1400（領邦オーバーレイなし・単一 HRE）でも HRE ホバーで全域強調を確認。
- AC#5: ツールチップ・情報パネル・河川強調のロジック無変更（picking 優先も PICKING_PRIORITY 不変・hre-extent は pickable false）。既存テスト含め 407 passed。
- AC#6: hre_extent_test 13 + labels_test 4 追加（TDD red→green）。fmt/lint/test/build 全 green。PR #41 CI pass。並列化見送り（単一 subagent 3defd3a）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
HRE 領邦ラベルを帝国色（臙脂）で塗り分け、HRE 本体・領邦のホバー/クリックで帝国全域を hre-extent レイヤー（3px 外縁 + 薄塗り・pickable false）により強調表示。純ロジックは src/hre_extent.ts に分離し TDD。picking 優先・河川強調・ツールチップは非退行。検証は deno test 407 passed・CI pass・1500/1400 の目視確認。
<!-- SECTION:FINAL_SUMMARY:END -->
