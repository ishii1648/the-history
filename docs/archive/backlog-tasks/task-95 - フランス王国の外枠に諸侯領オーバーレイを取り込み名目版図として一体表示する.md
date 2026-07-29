---
id: TASK-95
title: フランス王国の外枠に諸侯領オーバーレイを取り込み名目版図として一体表示する
status: To Do
assignee: []
created_date: '2026-07-26 16:09'
updated_date: '2026-07-26 16:14'
labels:
  - 'area:src-powers'
  - 'area:src-main'
  - 'area:scripts'
  - 'area:data'
dependencies:
  - TASK-94
ordinal: 87000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

1200 年のフランス王国をクリックしても、ブルターニュ公国が勢力圏に含まれていない
表示になる（ユーザー報告）。

歴史的にはブルターニュ公はフランス王の封臣（1202 年にフィリップ 2 世がアルテュール
1 世に叙封。それ以前はプランタジネット家の実効支配下という揺れはあるが、名目上の
宗主は仏王）。しかし base データ（`europe_1200.geojson`）は `Britany` の `SUBJECTO` を
`Britany`（自分自身 = 独立扱い）と記録しており、封建関係を反映していない。
`Angevin Empire` も同様に `SUBJECTO = Angevin Empire`。そのため「データに記録された
宗主関係」を読む TASK-94 の一般化だけでは、どちらもフランス王国の外枠に入らない。

ユーザーの意図は「フランス王が封建法上の宗主である土地全体（名目版図）を 1 つの
まとまりとして囲う」こと。イングランド島は含めない。

## 調査済みの事実

- `france_fiefs_flat_<year>.geojson`（1000 / 1100 / 1200 / 1279 / 1300）の
  properties は `NAME` / `ADMIN_LEVEL` / `OHM_RELATION_ID` / `START_DATE` /
  `END_DATE` のみで、**宗主プロパティ（SUBJECTO / PARTOF）を持たない**。
  一方 `hre_fiefs_flat_<year>.geojson` は `SUBJECTO = Holy Roman Empire` を持つ。
  したがって HRE 領邦は TASK-94 の一般化で自動的に帝国の外枠へ入るが、仏諸侯領は
  入らない。この非対称の解消が本タスクの中心。
- 仏諸侯領オーバーレイにはブルターニュ公領が含まれる（1200 年は 19 件中に
  `Duchy of Brittany`）。またアンジュー帝国の大陸領はノルマンディー公領・
  アキテーヌ公領・ポワトゥー伯領などの諸侯領としてカバーされるため、諸侯領 union を
  取り込めばイングランド島を含めずに大陸領だけを囲える。
  逆に言えば、base の `Angevin Empire` の宗主を France へ補正する方法では
  同じ勢力キーで描かれるイングランド島まで外枠に入ってしまい、名目版図として
  不正確になる。諸侯領 union が必要な理由はここにある。
- ただし諸侯領と base の境界は一致しない。TASK-92 の調査では諸侯領
  `Duchy of Brittany` の内部の下地は base `Britany` 65% / 下地なし 18% /
  `Angevin Empire` 16% で、**諸侯領 union だけを取り込むと base の `Britany`
  ポリゴンの一部が外枠からはみ出す**恐れがある。
- 1400 / 1492 には仏諸侯領データが存在しない。これらの年代では外枠は base の
  `SUBJECTO = France` の範囲に留まる。

## 方針（実装時に詳細判断）

- 仏諸侯領を France の従属として扱えるようにする。`scripts/build-france-fiefs.ts`
  で生成時に宗主プロパティを付与するか、外枠の範囲構築側で france-fiefs レイヤー
  全体を France 配下として扱うかは実装時に選ぶ（前者はデータの意味づけが明確、
  後者はレイヤー ID への暗黙依存が増える）。
- 上記の境界食い違いに対処するため、base 側の宗主補正（`name-overrides.json` に
  宗主上書きテーブルを追加し、`Britany` の SUBJECTO を `France` にする等）を
  併用するかを実装時に判断する。併用する場合の副作用に注意:
  `colorKeyFor`（`src/powers.ts:53`）は SUBJECTO が NAME と異なるとき
  `NAME|SUBJECTO` をキーにするため、色キーが `Britany` → `Britany|France` に
  変わり `colors.json` の再生成と配色の変化が起きる。情報パネルの表示ラベル
  （`info.ts` displayLabel）も SUBJECTO を参照する。
- 対象年代は仏諸侯領が存在する 1000〜1300。仏諸侯領を持たない年代で外枠が
  base 範囲のみになることは、`data/known-limitations.json` に記載するかを含めて
  実装時に判断する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1200 年でフランス王国（または配下の諸侯領）をクリック/ホバーすると、ブルターニュ公領を含む外枠が表示される
- [ ] #2 同じ外枠にアンジュー帝国の大陸領（ノルマンディー公領・アキテーヌ公領など諸侯領としてカバーされる領域）が含まれ、イングランド島は含まれない
- [ ] #3 仏諸侯領オーバーレイが存在する全年代（1000 / 1100 / 1200 / 1279 / 1300）で、諸侯領が外枠の内側に入る
- [ ] #4 フランス王国以外の勢力の外枠は本タスクの変更で変わらない（TASK-94 で追加したテストが green のまま）
- [ ] #5 仏諸侯領が France の外枠に含まれることを検証する単体テストが追加され green
- [ ] #6 deno test が green
- [ ] #7 実機で 1200 年のフランス王国をクリックし、ブルターニュ公領を含む一体の外枠が描かれることを目視確認できる
- [ ] #8 base の Britany ポリゴン全体が外枠の内側に入り、諸侯領との境界の食い違いによるはみ出しが起きない
- [ ] #9 宗主補正を併用する場合、配色・情報パネルの表示ラベルの変化が意図どおりであることを目視確認できる
<!-- AC:END -->
