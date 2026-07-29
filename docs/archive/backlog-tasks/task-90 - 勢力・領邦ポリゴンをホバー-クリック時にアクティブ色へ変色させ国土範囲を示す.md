---
id: TASK-90
title: 勢力・領邦ポリゴンをホバー/クリック時にアクティブ色へ変色させ国土範囲を示す
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 14:59'
updated_date: '2026-07-26 15:33'
labels:
  - 'area:app'
dependencies: []
priority: medium
type: enhancement
ordinal: 84000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（2026-07-26）: 神聖ローマ帝国（HRE）で行っている「対象をホバーすると範囲が視覚的に分かる」強調と同様に、勢力・領邦のポリゴンをホバーしたときに塗り色をアクティブ色へ変色させ、その国土（領域）の広がりが一目で分かるようにする。あわせて、ホバーだけでなくクリック時にも同じスタイルが当たるようにする（ホバーの無いタッチ操作でも成立させる）。

## 現状（事前調査。実装時に再確認し鵜呑みにしない）

- 政治ポリゴンは src/main.ts の buildPowerLayer が powers / hre-powers / france-fiefs の 3 枚を同一実装で生成している。塗りは getFillColor: (f) => fillColorFor(f.properties, colors)（src/powers.ts、colors.json 由来の勢力別色 + FILL_ALPHA=128）で、ホバー/クリック状態には一切依存しない。したがって現在、勢力・領邦ポリゴンにはホバー/クリックの視覚フィードバックが無い（ツールチップと情報パネルのテキストのみ）。
- 既存の範囲強調は HRE 専用: src/hre_extent.ts（shouldHighlightHre / extractHreExtent）と main.ts の buildHreExtentLayer が、base の NAME=Holy Roman Empire 本体ポリゴンだけを臙脂の太線 + ごく薄い塗り（HRE_EXTENT_LINE_COLOR / HRE_EXTENT_FILL_COLOR）で描き、hreHighlighted を visible で切り替えている。pickable: false で PICKING_PRIORITY には関与しない。個々の勢力・領邦の塗り自体は変わらない。
- 河川は既に「選択 > ホバー > 通常」の 2 状態強調を持つ（main.ts の selectedRiverName / hoveredRiverName、rivers.ts の riverLineColor / riverLineWidth）。今回のポリゴン強調でも、ホバーとクリックの関係（クリックは選択として保持するのか、トグルするのか、ホバーとどちらを優先するのか）を同様に明示的に決める必要がある。
- 状態更新は applyRiverHover / applyHreHighlight と同じく「値が変化したときだけ renderLayers() を呼ぶ」変化検知になっている。ホバーは mousemove ごとに発火するため、この規律を外すと TASK-50（河川ホバーのたびに全レイヤー再構築）と同じ性能退行を招く。
- buildPowerLayer は updateTriggers: { getFillColor: [year] } と transitions: { getFillColor: { duration: 400 } } を持つ。強調キーを updateTriggers に足さないと色が更新されず、400ms の遷移をそのまま通すとホバーの反応が鈍く見える可能性がある（遷移時間の扱いを判断すること）。
- ホバーの picking は Deck onHover の直下 pick 1 件、クリックは resolveClickInfo（pickMultipleObjects + resolveClickPick）で選び直した 1 件。強調の判定はどちらの経路でも同じ関数を通す形にすること（TASK-30 の hreHighlightFromPick と同型）。

## 判断が要る点（実装時に決め、根拠を記録すること）

- 強調の単位: 同一勢力は飛び地・島嶼で複数 feature に分かれる。「国土がわかるように」という要望を満たすなら feature 単位ではなく勢力単位（powers.ts colorKeyFor 相当のキー）で全ポリゴンを同時に強調するのが自然だが、france-fiefs / hre-powers の領邦は親勢力と別扱いにする必要がある。単位の決定と根拠を記録すること。
- クリック時の保持規則: クリックで強調を保持する場合、解除条件（同じ勢力の再クリック＝トグル／別の場所のクリック／年代切替）を定義する。河川の選択トグル（applyRiverSelection）との相互作用（現状、勢力クリックは河川選択を解除する）も壊さないこと。
- 配色: ベースの塗りは半透明（FILL_ALPHA=128）で、下にベースマップの羊皮紙トーンが透ける。アクティブ色は TASK-73 / TASK-74 の褪せた顔料・古地図トーンの方針と整合させ、HRE 帝国範囲強調の臙脂（HRE_EXTENT_LINE_COLOR）や諸侯領の藍紫境界（FIEF_LINE_COLOR）と混同されない見え方にすること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 勢力ポリゴン（powers）・HRE 領邦（hre-powers）・仏諸侯領（france-fiefs）のいずれかをホバーすると、その対象の塗り色がアクティブ色へ変わり、通常表示と一目で区別できる
- [x] #2 ホバーを外すと通常の塗り色へ戻る
- [x] #3 クリックでも同一のアクティブ表示が適用され、ホバーが発生しないタッチ操作だけでも強調が成立する。クリック時の保持・解除規則が定義され、単体テストで固定されている
- [x] #4 強調の適用単位（feature 単位か勢力キー単位か。飛び地を含む同一勢力の扱い）が決定され、根拠がコード内に記録されたうえで、その単位どおりに強調される
- [x] #5 HRE 本体・域内領邦をホバー/クリックした場合、TASK-30 の帝国範囲強調と本強調が併存して破綻しない（二重強調で範囲が読めなくならない）
- [x] #6 河川・都市・何も無い場所のホバー/クリックではポリゴンの強調が解除される
- [x] #7 強調状態が変化しない限り renderLayers() が呼ばれない変化検知が単体テストで担保され、ホバー移動でレイヤー再構築が連発しない（TASK-50 の方針を維持）
- [x] #8 アクティブ色が定数として定義され、羊皮紙/古地図トーンの配色方針（TASK-73 / TASK-74）および既存の強調色（HRE 臙脂・諸侯領藍紫）と識別可能であることが docs に明示されている
- [x] #9 deno test が green で、実機（headless CDP）でホバー・クリック双方の変色と解除を確認している
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 設計判断（実装冒頭で確定し根拠記録）: 強調単位は「国土が分かる」要望から勢力キー単位（colorKeyFor 相当、飛び地含む全 feature 同時）を本命、fief/hre 領邦は各領邦キーで親と独立。クリックは選択として保持し、同一対象の再クリックでトグル解除・別対象クリックで移動・何も無い場所/河川/都市クリックと年代切替で解除（河川選択トグルとの相互作用を維持）。
2. TDD: (i) 強調判定関数（ホバー/クリック共通経路・TASK-30 hreHighlightFromPick と同型）、(ii) 保持・解除規則、(iii) 変化検知（値が変わったときだけ renderLayers、TASK-50 規律）、(iv) アクティブ色定数、を先にテストで固定し red 確認。
3. 実装: buildPowerLayer の getFillColor を強調状態依存にし updateTriggers へ強調キーを追加。transitions の 400ms はホバー反応を鈍らせるため強調変化では短縮/無効を検討。配色は TASK-73/74 の褪せトーンと整合し HRE 臙脂・藍紫と識別可能に（docs 記載）。
4. CDP でホバー・クリック・解除・HRE 併存（AC#5）・タッチ相当（クリックのみ）を実機検証 → PR → CI → finalization。

並列化判定（タスク内）: 見送り（理由: 状態管理・描画・テストが単一機能に集中）。
タスク間並列: TASK-88・91 と並列（area:app は互いに素）。worktree isolation。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1/#2: CDP で HRE 本体ホバー時に帝国全体（飛び地含む）が緑青 #2e6e66 に変色、ホバー解除で通常塗りへ復帰（__getPowerHighlightDebug で hovered/activeFeatures を確認）。
- AC#3: クリック = 選択保持（ホバーを外しても維持 = タッチ操作成立）、同一対象の再クリックでトグル解除・年代切替で clear。規則は power_highlight_test の 21 テストで固定。
- AC#4: 強調単位は勢力キー（colorKeyFor = NAME / NAME|SUBJECTO）で根拠をコード内に記録。CDP でバイエルン公領キー選択時に powers=0 / hre-powers のみ active を確認（親帝国へ波及しない）。
- AC#5: HRE 本体ホバーで緑青の全域強調と臙脂の帝国範囲外縁が併存して判読可能（スクリーンショット確認）。
- AC#6: 河川クリックで選択解除（既存の applyRiverSelection 相互作用維持）を CDP で確認。
- AC#7: 変化検知ストア（値が変わったときのみ renderLayers、TASK-50 規律）を単体テストで担保。
- AC#8: ACTIVE_FILL_COLOR を定数化し、HRE 臙脂・藍紫・河川色と色相 60 度以上の分離をテストで固定。docs/app-spec.md §5.2 に強調色の使い分け表。
- AC#9: deno test 950 passed（main 取り込み後）・CDP でホバー/クリック/解除を実機確認・verify:smoke PASS・PR #100 CI green。
- transitions は再構築要因で切替（年代 400ms / 強調 120ms、renderWithFillTransition）。
- decision 記録判定: 新規なし（既存の強調パターン（TASK-30/50）と配色方針（TASK-73/74）の枠内。配色は docs に記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
勢力・領邦ポリゴンにホバー/クリックのアクティブ強調（緑青ヴェルディグリ #2e6e66・勢力キー単位で飛び地含む全 feature 同時変色）を追加。クリックは河川と同型の選択トグルとして保持しタッチ操作でも成立、HRE 帝国範囲強調と併存、変化検知で TASK-50 の性能規律を維持。新モジュール power_highlight（21 テスト、950 passed）、CDP 実機確認、CI green（PR #100）。
<!-- SECTION:FINAL_SUMMARY:END -->
