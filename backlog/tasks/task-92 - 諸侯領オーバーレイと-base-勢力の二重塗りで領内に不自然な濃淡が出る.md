---
id: TASK-92
title: 諸侯領オーバーレイと base 勢力の二重塗りで領内に不自然な濃淡が出る
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 15:28'
updated_date: '2026-07-26 16:03'
labels:
  - bug
  - 'area:scripts'
  - 'area:data'
  - 'area:src-powers'
  - 'area:src-main'
dependencies: []
ordinal: 85000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状（bug）

**再現手順**: アプリを 1200 年で表示し、フランス一帯を見る。

**期待挙動**: 1 つの諸侯領ポリゴンは領内一様な色で塗られ、色の変化は諸侯領の
境界線でのみ起きる。

**実際の挙動**: 同一の諸侯領の内側に、境界線を伴わない濃淡・色相のずれが現れる。
ユーザー報告のスクリーンショットではガスコーニュ公領の東西、アキテーヌ公領の
南北、ノルマンディー公領・ブルターニュ公領の一部で顕著。

**発見契機**: TASK-87（仏諸侯領の許可リスト拡張）後のユーザーによる目視確認。

## 原因（調査済み）

諸侯領レイヤー（`france-fiefs` / `hre-powers`）は base 勢力レイヤー（`powers`）の
直上に、いずれも `FILL_ALPHA = 128`（opacity 0.5 相当、`src/powers.ts:18`）の
半透明で描かれる（描画順は `src/main.ts` renderLayers のコメント）。よって
諸侯領の見た目の色は `0.5 × 諸侯領色 + 0.5 × 下地` の合成になる。下地の base 勢力は
諸侯領と境界が一致しないため、1 つの諸侯領の内側を base の境界が横切り、
そこで合成色が変わって「境界線のない濃淡」として見える。

TASK-79（`scripts/build-fief-flat.ts`）はオーバーレイ同士の二重塗りを、TASK-78
（`data/base_outline_<year>.geojson`）は境界線の二重描画を幾何的に解消済み。
「オーバーレイ塗り × base 勢力塗り」の二重塗りだけが未対応で、本件はその積み残し。

## 影響範囲（実データ検査済み）

`*_fiefs_flat_<year>.geojson` の各 feature 内部を 40×40 格子でサンプリングし、
`europe_<year>.geojson` のどの feature に含まれるかを集計した結果、下地が複数に
分裂する諸侯領は以下のとおり（割合は内部面積の概算）。1200 年フランス固有では
なく、諸侯領オーバーレイを描く全年代に及ぶ。

- 仏 1200: 19 件中 14 件。アキテーヌ公領（Angevin 53% / France 43%）、ペルシュ伯領
  （France 58% / Angevin 41%）、トゥール（France 59% / Angevin 40%）、ガスコーニュ
  公領（Angevin 88% / Toulouse 11%）、バール伯領（France 72% / HRE 27%）、
  ノルマンディー公領（Angevin 71% / 下地なし 16% / France 12%）ほか
- 仏 1000 / 1100: ブルターニュ・ノルマンディー・ポンチュー・ポワトゥー・ナント
  （1100 はバール伯領も）
- 仏 1279 / 1300: 15 件中 9 件（ラ・マルシュ伯領 France 70% / English 29% ほか）
- HRE 1200: マクデブルク大司教領・バーゼル司教領ほか 7 件
- HRE 1492: 73 件中 19 件（ヌーシャテル・バール・ポンメルン・バーゼルほか）

詳細な一覧は `.outputs/claude/fief-base-double-fill-survey.md`。

## 修正方針の候補（実装時に判断）

1. base 塗りから諸侯領 union を幾何的に差し引く（推奨）。TASK-78 が境界線に対して
   行ったことの塗り版で、`scripts/build-fief-flat.ts` の `subtractOverlay` を base
   側にも適用した派生データ（例 `europe_flat_<year>.geojson`）を生成し、`powers`
   レイヤーがそれを読む。諸侯領の下地は常にベースマップだけになり領内が一様になる。
   諸侯領が覆っていない部分では従来どおり base 塗りが残る。
2. 諸侯領の塗りを不透明（alpha 255）にする。実装は最小だが羊皮紙ベースマップの
   地形が隠れ、TASK-73 / TASK-77 の配色・重ね順の意図に反する。
3. 描画時に下地をクリップする。deck.gl / MapLibre の合成では一般解が無く不採用。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 諸侯領オーバーレイ対象の全年代（仏 1000〜1300、HRE 1000〜1492）で、1 つの諸侯領ポリゴンの内側に境界線を伴わない濃淡が現れない
- [x] #2 諸侯領が覆っていない領域では従来どおり base 勢力の塗りが見える（南仏・パリ周辺などの欠落部が無色にならない）
- [x] #3 諸侯領の内部が下地の base 勢力によって分裂しないことを検証する自動テスト（再現テスト）が追加され、修正前は red・修正後は green になる
- [x] #4 諸侯領のラベル・境界線・ホバー/クリック判定は従来どおり動作する（既存テストが green）
- [x] #5 deno test が green
- [x] #6 実機（1200 年フランス、および HRE 1492）でガスコーニュ公領・アキテーヌ公領・バーゼル司教領周辺を目視し、領内の濃淡が解消していることを確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針 1（推奨案）を採用: ビルド時に base 塗りから諸侯領 union（仏 + HRE の 2 系統）を差し引いた派生データ europe_flat_<year>.geojson を生成し、powers レイヤーの読み込み先を対象年のみ切り替える。TASK-78 の線（base_outline）に対する処理の塗り版で、build-fief-flat の subtractOverlay を再利用。
2. TDD: (i) 再現テスト = 諸侯領 union 内部に base 塗りが残らないこと（AC#3、修正前 red）、(ii) 諸侯領が覆わない領域の base 塗り維持（AC#2）、(iii) 対象外年代は従来ファイルのまま、を先に固定。
3. 実装: 派生生成 + src/powers.ts の年代→ファイル解決拡張。clean-polygons の不変条件（自己交差ゼロ）・サイズ上限・picking / ラベル / base_outline / fief-dedupe との整合を維持（AC#4）。
4. CDP で 1200 年フランス（ガスコーニュ・アキテーヌ）と 1492 年 HRE（バーゼル周辺）の濃淡解消を目視（AC#6）→ PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 派生データ生成 → 読み込み切替 → 検証が直列依存の単一フロー。単一 subagent に委譲）。
タスク間並列: なし（next-tasks 単独集合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: europe_flat_<year>.geojson（7 年代）で base 塗りから諸侯領 union を差し引き。CDP（1200 年ガスコーニュ・アキテーヌ / 1492 年バーゼル・ヌーシャテル）で領内濃淡の解消を目視確認。
- AC#2: パリ周辺・南仏の隙間で base 塗り維持を CDP で確認（諸侯領が覆わない領域は従来どおり）。
- AC#3: 再現テスト（諸侯領 union 内部に base 塗りが残らない）を修正前 red → 修正後 green で追加。
- AC#4: ラベル（polylabel）・帝国範囲強調・fief-dedupe 被覆率は従来の europe_<year> を使用し位置・判定不変。picking は PICKING_PRIORITY により挙動不変。既存テスト + verify:smoke PASS。
- AC#5: deno test 971 passed。fmt/lint/build green、PR #102 CI green。
- AC#6: 上記 CDP 3 ビューで目視確認済み。
- 技術詳細: base_outline と同じ fiefUnionOf から生成し輪郭と塗りの消える範囲が一致。完全内包勢力（Britany）は feature ごと除去。difference 起因の 1 点接触穴は clean-polygons の separateTouchingRings（1〜3m 分離）で解消し自己交差ゼロを維持。派生欠落時は従来動作へ縮退。
- decision 記録判定: 新規なし（TASK-78/79 で確立した派生データ排他化パターンの base 塗りへの適用）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
諸侯領の下地に base 勢力の塗りが透けて領内に濃淡が出る問題を、base 塗りから諸侯領 union を差し引いた派生データ europe_flat_<year>（7 年代）で解消。ラベル・picking・被覆率判定は従来データを使い挙動不変、clean-polygons 拡張（1 点接触穴の分離）で品質不変条件を維持。TDD 再現テスト red→green（971 passed）、CDP 3 ビュー目視、CI green（PR #102）。
<!-- SECTION:FINAL_SUMMARY:END -->
