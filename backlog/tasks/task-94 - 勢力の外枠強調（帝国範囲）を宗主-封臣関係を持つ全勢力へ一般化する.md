---
id: TASK-94
title: 勢力の外枠強調（帝国範囲）を宗主-封臣関係を持つ全勢力へ一般化する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 16:08'
updated_date: '2026-07-26 16:57'
labels:
  - 'area:src-powers'
  - 'area:src-main'
  - 'area:scripts'
  - 'area:data'
dependencies: []
ordinal: 86000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

現在、勢力の「一体性」を外枠で示す表現は神聖ローマ帝国（HRE）専用の実装しかない
（TASK-30、`src/hre_extent.ts` + `src/main.ts` buildHreExtentLayer）。

- `extractHreExtent` は base（`europe_<year>`）から `NAME = Holy Roman Empire` の
  本体ポリゴンだけを抜き出す。`SUBJECTO = Holy Roman Empire` の従属勢力は
  「本体の範囲外（別領土）」として意図的に含めていない。
- `shouldHighlightHre` は hre-powers レイヤー、または powers レイヤーで
  `isHreFeature`（NAME か正規化後 SUBJECTO が HRE）な feature を指したときだけ
  発火する。
- 描画は `hre-extent` レイヤー（臙脂 `HRE_EXTENT_LINE_COLOR` 3px の線 + 薄塗り、
  `pickable: false`、`visible = hreHighlighted`）。

そのため HRE 以外の勢力では、クリック/ホバーしても TASK-90 の塗り強調
（`src/power_highlight.ts` の緑青 `ACTIVE_FILL_COLOR`）しか出ず、宗主とその従属
勢力が「1 つの勢力圏」であることが読み取れない。ユーザーからは 1200 年の
フランス王国について「クリックしてもブルターニュ公国が含まれていないように
見える。HRE のように外枠で囲って一体性を示してほしい」との要望が出ている。

## 調査済みの事実

- base データの各 feature は `NAME` / `SUBJECTO` / `PARTOF` を持ち、`SUBJECTO` が
  宗主を表す。1200 年では `SUBJECTO = France` が `Kingdom of France` と
  `Comté de Toulouse` の 2 件。`Britany` は `SUBJECTO = Britany`、
  `Angevin Empire` は `SUBJECTO = Angevin Empire` で、どちらもデータ上は独立扱い。
- 歴史的にはブルターニュ公はフランス王の封臣（1202 年フィリップ 2 世がアルテュール
  1 世に叙封）。base データがこの封建関係を反映していないことが、フランス王国の
  外枠にブルターニュが入らない直接の原因。
- `SUBJECTO` の正規化は `name-overrides.json` の renames を適用する規約
  （`info.ts` displayLabel / `hre_extent.ts` isHreFeature と同じ）。現在の
  `name-overrides.json` は表記ゆれの `renames` 7 件のみを持つ。
- 領邦オーバーレイのうち `hre_fiefs_flat_<year>` は `SUBJECTO = Holy Roman Empire`
  を持つが、`france_fiefs_flat_<year>` は `NAME` / `ADMIN_LEVEL` /
  `OHM_RELATION_ID` / `START_DATE` / `END_DATE` のみで宗主プロパティを持たない。
  本タスクでは仏諸侯領オーバーレイを外枠の入力には使わない（下記「範囲の仕様」）。

## 範囲の仕様（ユーザー判断で確定）

- 外枠の範囲は「宗主キーごとに、その宗主に属する全 feature（本体 + 従属）の
  union の外縁」とする。
- **アンジュー帝国は独立勢力のまま**、イングランド側の勢力圏として扱う。base では
  英本土と大陸領（ノルマンディー・アキテーヌ等）が同一の勢力キー
  `Angevin Empire` なので、上記の規則によって英本土と大陸領が一体の外枠で囲まれる。
  フランス王国の外枠には含めない。
- **ブルターニュはフランス王国の封土として扱う**。base の宗主関係を補正する
  上書きテーブル（`name-overrides.json` に追加）を導入し、`Britany` の宗主を
  `France` にする。これによりフランス王国をクリック/ホバーしたときの外枠に
  ブルターニュが入る。
- 仏諸侯領オーバーレイ（`france_fiefs_flat_*`）の union を外枠へ取り込む案は
  不採用（当初 TASK-95 として起票したが本タスクへ統合し archive 済み）。
  アンジュー大陸領を仏側に含める場合にのみ必要だったもので、上記の仕様では不要。

### 宗主補正の副作用（実装時に対処）

`colorKeyFor`（`src/powers.ts:53`）は SUBJECTO が NAME と異なるとき
`NAME|SUBJECTO` をキーにするため、`Britany` の色キーが `Britany` →
`Britany|France` に変わる。`colors.json` の再生成（`scripts/build-colors.ts`）が
必要で、配色が変化する。情報パネルの表示ラベル（`info.ts` displayLabel）も
SUBJECTO を参照するため表示が変わりうる。

## 方針（実装時に詳細判断）

- HRE も一般化した規則に載せ替えるため、従来は含まれなかった
  `SUBJECTO = Holy Roman Empire` の域内従属勢力（別領土）も囲まれるようになる。
  この見た目の変化は意図的なもの（「一体性を示す」という表現の目的に沿う）だが、
  実機で不自然でないことを確認する。
- union の幾何演算は毎フレーム計算せず、ビルド時の派生データ生成
  （`scripts/` に追加。既存の `build-fief-flat.ts` が使う多角形演算を再利用）か、
  選択時のオンデマンド計算 + メモ化のいずれかを実装時に選ぶ。
- 発火条件は `shouldHighlightHre` の一般化（指した feature の宗主キーを解決し、
  その宗主の外枠を表示する）。
- 線色・線幅・薄塗りは現行の HRE 外枠のスタイルをそのまま流用し、TASK-90 の
  緑青の塗り強調と同時に出ても読み分けられる状態を保つ。
- 宗主補正は歴史的に宗主関係が明白でデータが欠いているものに限り、最小限に留める
  （本タスクで必須なのは `Britany` → `France`）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 宗主-封臣関係を持つ任意の勢力（例: 1200 年のフランス王国とトゥールーズ伯領）で、宗主本体または従属勢力をクリック/ホバーすると、その宗主に属する全 feature を囲う外枠が表示される
- [x] #2 HRE をクリック/ホバーしたときも従来どおり外枠が表示され、線色・線幅・薄塗りの見た目は変わらない
- [x] #3 宗主-封臣関係を持たない単独の勢力をクリック/ホバーしても、その勢力自身の外枠のみが表示され、無関係な勢力が囲まれない
- [x] #4 外枠と TASK-90 の緑青の塗り強調が同時に出ても、両者が読み分けられる（既存の色相分離テストが green）
- [x] #5 宗主キーの解決・外枠範囲の構築・表示判定を検証する単体テストが追加され green
- [x] #6 deno test が green
- [x] #7 実機で 1200 年のフランス王国・HRE・単独勢力（例: デンマーク）をクリックし、外枠の範囲が期待どおりであることを目視確認できる
- [x] #8 1200 年でフランス王国またはトゥールーズ伯領をクリック/ホバーすると、ブルターニュを含む外枠が表示される
- [x] #9 アンジュー帝国をクリック/ホバーすると、イングランド本土と大陸領が一体の外枠で囲まれ、フランス王国の外枠には含まれない
- [x] #10 宗主補正による Britany の配色・情報パネル表示の変化が意図どおりであることを目視確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 宗主キー解決の一般化: shouldHighlightHre / extractHreExtent（hre_extent.ts）を「指した feature の宗主キー（SUBJECTO 正規化 + name-overrides の宗主補正テーブル）を解決し、その宗主に属する全 feature（本体 + 従属）の union 外縁を表示する」規則へ一般化する。HRE も同規則へ載せ替え（域内従属勢力も囲まれる = 意図的変化、実機確認）。
2. 宗主補正: name-overrides.json に Britany → France を追加（最小限）。副作用（colorKeyFor の色キー変化 → colors.json 再生成・info.ts displayLabel の表示変化）を対処し目視確認（AC#10）。
3. union の計算方式: ビルド時派生 vs 選択時オンデマンド + メモ化を実装時に比較選択（既存 build-fief-flat の多角形演算・clean-polygons を再利用）。
4. TDD: 宗主キー解決・外枠範囲構築・表示判定・単独勢力の非波及（AC#3/#5）を先にテスト固定。スタイルは現行 HRE 外枠を流用し TASK-90 緑青との読み分け（AC#4、色相分離テスト）を維持。
5. CDP で 1200 年フランス王国（ブルターニュ含む外枠）・アンジュー帝国（英本土 + 大陸領一体）・HRE・単独勢力を目視（AC#7〜#10）→ PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 宗主解決 → union 構築 → 表示 → 補正副作用が直列依存の単一機能。単一 subagent に委譲）。
タスク間並列: なし（next-tasks 単独集合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1/#8: CDP（1200 年）でフランス王国クリック時に王領 + Comté de Toulouse + Britany を囲む外枠を目視確認（extentKey=France・members 3 件をデバッグ確認）。
- AC#2: スタイル（臙脂 3px + 薄塗り）・レイヤー ID・重ね順は据え置き。HRE は一般規則へ載せ替え、1000 年で Duchy of Swabia が囲まれる意図的変化を実機確認（ボーデン湖の細輪郭は base データ由来）。
- AC#3: 1200 年デンマークで自分自身のみの外枠（非波及）を確認。
- AC#4: TASK-90 緑青の塗り強調と外枠の同時表示を CDP で確認、色相分離テスト green。
- AC#5/#6: suzerain_extent の単体テスト追加、deno test 1015 passed。
- AC#7: 仏/HRE/単独勢力の 3 パターンを CDP で目視確認。
- AC#9: アンジュー帝国クリックで英本土 + 大陸領が一体・フランス外枠に不包含を確認。
- AC#10: Britany がフランス色相の明度違いへ変化・情報パネル「ブルターニュ — フランス 領」を確認。
- union は選択時オンデマンド + メモ化（根拠は decision-19）。変化検知（applyExtentKey）で TASK-50 規律維持。
- 全チェック: fmt/lint clean、build green、verify:smoke PASS、PR #104 CI green。
- decision 記録: decision-19（外枠一般規則と宗主補正の最小限方針）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
HRE 専用だった外枠強調を「宗主キーごとの union 外縁」へ一般化（suzerain_extent.ts）。name-overrides.json の宗主補正（Britany→France のみ）で外枠・色キー・表示ラベルが同一の封建関係を反映し、1200 年フランス王国の外枠にブルターニュが含まれるように。union は選択時メモ化・変化検知維持。10 AC を CDP 実機確認、1015 テスト green、decision-19 記録、CI green（PR #104）。
<!-- SECTION:FINAL_SUMMARY:END -->
