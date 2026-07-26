---
id: TASK-95
title: 中世イタリアの諸侯領データをOpenHistoricalMapから取得するビルドパイプラインを追加する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 16:32'
updated_date: '2026-07-26 17:20'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:docs'
dependencies: []
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

12 世紀頃の北・中部イタリアには複数の諸侯・都市共和国が半独立国として並立していたが、
地図上でまったく表現できていない（ユーザー報告）。原因を調査した結果、
**データソースは OHM に存在し、取得範囲（bbox）と許可リストの外にあるため
パイプラインが問い合わせてすらいない**ことが分かった。

### 現状

- base（`europe_1100.geojson` / `europe_1200.geojson`）では北イタリアが
  `Holy Roman Empire` の単一ポリゴンに一括で含まれ、中部は `Papal States`、
  南部は `Dutchy of Benevento`。都市共和国は `Venice` のみが独立勢力として存在。
- 領邦オーバーレイ（`hre_fiefs_flat_<year>.geojson`）のイタリア関連は
  1100 年が `March of Verona` 1 件、1200 年は 0 件、1300 年が `Lordship of Verona`
  1 件のみ。

### 原因 1: 取得 bbox の南限

`scripts/build-hre-fiefs.ts` の `HRE_FIEF_BBOX` は
`[south 45.5, west 5.5, north 55.0, east 19.0]`。南限 45.5°N はミラノ（45.46）の
すぐ北で、ジェノヴァ 44.41 / ボローニャ 44.49 / フィレンツェ 43.77 / ピサ 43.72 /
シエナ 43.32 / スポレート 42.74 はいずれも範囲外。コメントにも
「帝国中核域（低地地方〜北イタリア北端〜ボヘミア…）」と意図的に北端で切ってある。

### 原因 2: 許可リスト

`HRE_FIEF_NAMES`（98 件）のイタリア系は `Duchy of Milan` / `March of Verona` /
`Lordship of Verona` の 3 件のみ。bbox を広げても許可リストに追加しなければ
採用されない。既存の除外規則 `danishHerredAndItalianPlebis` は
「北イタリアの Plebis 11 件は admin_level 6 なので自動的に落ちる」と述べており、
北イタリアの存在自体は認識されていたが admin_level 6 の細分だけを見て終わっている。

## OHM の実データ（Overpass に直接問い合わせて確認、2026-07-27）

bbox `(south 42.0, west 6.5, north 46.6, east 14.2)` の `boundary=administrative`
は 1,353 リレーション。`start_date` / `end_date` で対象年に有効な admin_level 3〜6:

| 年 | 件数 | 内訳（L3 / L4 / L6） |
| ---: | ---: | --- |
| 1100 | 17 | 2 / 12 / 3 |
| 1200 | 31 | 2 / 15 / 14 |
| 1300 | 40 | 4 / 21 / 15 |

1200 年に有効な admin_level 3 / 4 のジオメトリを取得し面積を実測（球面近似、
クリップ前）:

| 名称 | admin_level | 面積 km² |
| --- | ---: | ---: |
| Duchy of Spoleto（スポレート公国） | 4 | 14,363 |
| Republic of Pisa（海域込みの relation） | 4 | 8,104 |
| Marquisate of Saluzzo（サルッツォ辺境伯領） | 4 | 2,147 |
| Republic of Florence（フィレンツェ共和国） | 4 | 1,748 |
| Republic of Pisa（本土の relation） | 4 | 1,208 |
| Republic of Genoa（ジェノヴァ共和国） | 4 | 1,183 |
| County of Asti（アスティ伯領） | 4 | 778 |
| Republic of Ancona（アンコーナ共和国） | 3 | 437 |
| Republic of Siena（シエナ共和国） | 4 | 422 |
| Republic of Lucca（ルッカ共和国） | 4 | 133 |
| Republic of Noli | 4 | 23 |
| County of Vernio | 4 | 12 |
| San Marino | 4 | 3 |

比較: 既存の HRE 領邦オーバーレイは 1200 年で 26 件・合計 122,184 km²。
イタリア主要 8 件だけで約 3 万 km² あり、収録に足る規模。1100 年には
`March of Tuscany`（トスカーナ辺境伯領、988〜1115）も存在する。

調査の詳細は `.outputs/claude/italy-fiefs-12c-survey.md`。

## 本タスクの範囲

OHM からイタリア諸侯領を取得して `data/` に生成物を作るところまで。地図への
表示は後続タスクに分ける（TASK-85 → TASK-86 と同じ分け方）。

## 実装時に判断する点

- **どのパイプラインに載せるか**: `build-hre-fiefs.ts` の bbox と許可リストを
  拡張する案と、`build-france-fiefs.ts` / `build-hre-fiefs.ts` と同じ流儀で
  `scripts/build-italy-fiefs.ts` を新設する案。フィレンツェ・ジェノヴァ・ピサ・
  シエナ・ルッカは都市共和国（コムーネ）で、名目上はイタリア王国＝帝国の構成王国内
  だが HRE 領邦として扱うのが妥当かの判断を含む。既存の除外規則
  `freeImperialCities` は帝国都市を「領邦ではなく市域だけの数十 km²」として
  落としているが、イタリアのコムーネは contado を含み 1,000 km² 超あるため
  この論拠はそのままでは当てはまらない。
- **同名リレーションの重複**: `Republic of Pisa (1399-1406)` は同じ name:en で
  本土（1,208 km²）と海域込み（8,104 km²）の 2 リレーションが並存する。既存の
  `selectFiefsForYear` は「admin_level 昇順 → ID 昇順で 1 件」に絞るが、この 2 件は
  同 level なので ID 順で偶然に決まってしまう。明示的な選択規則が要る。
- **名称の不正確さ**: `Republic of Pisa (1399-1406)` は name:en に誤った期間の
  曖昧性解消が入っており、そのままでは表示名に使えない（既存の `unusableNames` と
  同種）。表示名の上書きが必要。
- **対象年代**: 本調査で集計したのは 1100 / 1200 / 1300。`SNAPSHOT_YEARS` の
  他の年（1000 / 1279 / 1400 / 1492）についても実測して収録可否を決める。
- **ファイルサイズ上限**: 既存の領邦データと同様に simplify・座標丸め・
  微小破片除去でサイズ制限に収める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 OHM からイタリア諸侯領を取得する生成処理が追加され、ネットワークなしで動く単体テストが green
- [x] #2 1100 年に March of Tuscany、1200 年に Republic of Florence・Republic of Genoa・Republic of Pisa・Republic of Siena・Republic of Lucca・Duchy of Spoleto が生成物に含まれる
- [x] #3 同名リレーション（Republic of Pisa）の選択が明示的な規則で決まり、その根拠がコード上に記録されている
- [x] #4 表示名に使えない name:en（期間つき曖昧性解消）が正しい表示名に上書きされている
- [x] #5 生成物のファイルサイズが既存の領邦データと同じ上限内に収まる
- [x] #6 収録対象年・採用/除外した領邦とその根拠がコードのコメントまたは docs に記録されている
- [x] #7 出典・ライセンス（OpenHistoricalMap / CC0）が既存の OHM 由来データと同じ扱いで記録されている
- [x] #8 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. パイプライン選択（実装冒頭で確定・根拠記録）: 本命はイタリア専用 bbox・許可リストを持つ独立系統（scripts/build-italy-fiefs.ts、共通ロジックは build-france-fiefs.ts から import する既存流儀）。イタリアのコムーネは HRE 領邦の freeImperialCities 除外論拠（市域数十 km²）が当てはまらない別カテゴリのため、hre-fiefs へ混ぜず生成物も独立ファイル（italy_fiefs_<year>.geojson 等）にする方向で評価。
2. 同名リレーション（Republic of Pisa 本土 vs 海域込み）の明示的選択規則を定義しコードに根拠記録（AC#3）。期間つき曖昧性解消の表示名上書き（unusableNames と同種、AC#4）。
3. 対象年代: 1100/1200/1300 は調査済み。1000/1279/1400/1492 も実測して収録可否を決め根拠を記録（AC#6）。
4. TDD: フィルタ・選択規則・表示名のネットワーク非依存テストを先に red で固定（AC#1）。simplify・clean-polygons でサイズ上限内（AC#5）。
5. 出典（OHM / CC0）を data-inventory に既存 OHM 系と同扱いで記録（AC#7）→ 全チェック green → PR → CI → finalization → マージ。表示は後続タスク（TASK-85→86 と同じ分割）。

並列化判定（タスク内）: 見送り（理由: bbox/許可リスト設計 → 取得 → 品質処理 → docs が直列依存の単一パイプライン構築。単一 subagent に委譲）。
タスク間並列: なし（TASK-97 は area:scripts 競合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: scripts/build-italy-fiefs.ts（独立系統）+ フィクスチャによるネットワーク非依存テスト。deno test 1047 passed。
- AC#2: 生成物実査で 1100 年に March of Tuscany、1200 年に Florence / Genoa / Pisa / Siena / Lucca / Spoleto を確認（1100=7 / 1200=10 件）。
- AC#3: 同名リレーションは「有効期間の短い方 = 年代固有スナップショット」を採る規則をコードに根拠付きで記録（Pisa 6 件の並存を解決、コルシカ→サルデーニャ→本土の史実推移を再現）。
- AC#4: 期間つき曖昧性解消 name:en の表示名上書き（unusableNames で落とさず上書きした根拠も記録）。
- AC#5: 全 7 年代が最大 38.7 KB（上限 200 KB 内）。自己交差ゼロ・微小破片ゼロ。bbox 外パート（ジェノヴァ黒海植民地等）除去。
- AC#6: 対象年代（1000〜1492 の 7 年代）・採用/除外の根拠をコード内と docs/data-inventory に記録。learned: name:en を持たず name が英語のリレーションへの対処。
- AC#7: OHM / CC0 1.0 を data-inventory に既存 OHM 系と同扱いで記録。
- AC#8: fmt/lint/test/build 全 green、verify:smoke PASS（表示側スコープ外）、PR #105 CI green。
- decision 記録: decision-17 に伊系統（独立ファイル構成の標準化）を追記。表示は後続タスク。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
中世イタリアの諸侯・都市共和国を OHM（CC0）から取得する独立パイプライン build-italy-fiefs.ts を追加し、italy_fiefs_<year>.geojson（7 年代・最大 38.7 KB）を生成。同名リレーションの明示的選択規則・表示名上書き・bbox 外パート除去を含み、地域系統の独立ファイル構成を decision-17 追記として標準化。1047 テスト green・CI green（PR #105）。
<!-- SECTION:FINAL_SUMMARY:END -->
