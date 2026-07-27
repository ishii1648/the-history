---
id: TASK-109
title: クリック情報パネルに feature の出典・ライセンス・境界の確からしさを表示する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-27 13:33'
updated_date: '2026-07-27 17:59'
labels:
  - 'area:src-main'
  - 'area:src-info'
  - 'area:data'
  - 'area:docs'
dependencies: []
references:
  - 'https://creativecommons.org/licenses/by/4.0/'
documentation:
  - docs/data-inventory/README.md
ordinal: 102000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

地図には出典もライセンスも確度も異なる複数系統のデータが同時に載っている（historical-basemaps GPL-3.0 の base 勢力、OpenHistoricalMap CC0 の仏・独・伊諸侯領、Natural Earth の河川・山岳、Reba et al. CC BY 4.0 の都市）。しかし現在のクリックパネルは名前 1 行しか表示していない（src/main.ts の setupInfoUI 内 panelLabel.textContent = label）。どの feature がどのデータセット由来で、その境界がどの程度の確からしさかをユーザが知る手段が無い。

TASK-80 は「全境界は概略」であることを描画（にじませ・薄く）と known-limitations で表現したが、これは地図全体に対する一般的な注意書きであり、個々の feature には紐づいていない。

出典の異なるデータをさらに重ねる（TASK-110 の Cliopatria 採用）ための前提として、feature 単位で出典・ライセンス・確からしさを開示できる仕組みを先に用意する。

## 対象

- クリックパネル（src/info.ts / src/main.ts の setupInfoUI）に、選択した feature の出典（データセット名・ライセンス・取得元・ピン留めコミットまたは DOI）を表示する
- 境界の確からしさの区分を表示する（例: 出典データそのままの境界 / 簡略化・平滑化済み / 概略）
- 各データの生成パイプラインが出典情報を feature または FeatureCollection に持たせる。france_fiefs_* と hre_fiefs_* は既に metadata を持つので、europe_* / italy_fiefs_* / rivers / cities / mountains の現状を確認して揃える
- フッターの attribution（TASK-26）との役割分担を整理する（フッター = 全体の帰属表示、パネル = 選択中 feature の出典）

## 実装時に判断する点

- 出典情報を feature ごとのプロパティに持たせるか、レイヤー ID から出典へのマップを表示層に持たせるか（ファイルサイズと保守性のトレードオフ）
- 確からしさの区分をいくつ設けるか。src/approximate_borders.ts が既に頂点密度から連続的な表現をしているため、離散ラベルとの整合をどう取るか
- 山岳の情報パネル（TASK-100）と表示項目・レイアウトが競合しないか。TASK-100 と同じ area を触るため実装順に注意する
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 勢力・諸侯領をクリックすると、名前に加えてその feature の出典データセット名とライセンスがパネルに表示される
- [ ] #2 表示する出典情報は表示層のハードコードに閉じず、データまたはビルド生成物に由来する（出典が変わった場合に追従できる、または追従漏れをテストが検出する）
- [ ] #3 境界の確からしさに関する注記が feature 単位で表示され、TASK-80 の概略境界の説明・描画と矛盾しない
- [ ] #4 河川・都市・山岳など他の pick 対象をクリックしてもパネルが壊れず、出典欄の有無が適切に切り替わる
- [ ] #5 出典表示の整形ロジックが DOM 非依存の純粋関数として deno test でテストされている
- [ ] #6 docs/data-inventory/README.md に、パネルへ出す出典情報とデータの対応が記載されている
- [ ] #7 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 現状（実測）

| データ | 出典 metadata |
| --- | --- |
| `france_fiefs_*` / `hre_fiefs_*` / `italy_fiefs_*` | **あり**（`metadata`: source / sourceUrl / license / year / featureCount ほか） |
| `europe_*` | **なし**（`index.json` の `source` に repo / commit / license はある） |
| `rivers` / `mountains` / `peaks` | **なし** |
| `cities.json` | `source` に description 等はあるが形式が違う |

諸侯領 3 系統が既に持っている `metadata` の形が事実上の前例なので、これに揃える。

## データ契約（サブ作業をまたぐ唯一の取り決め）

各 FeatureCollection の **`metadata`** に少なくとも次を持たせる。既存フィールドは温存する。

| キー | 型 | 意味 |
| --- | --- | --- |
| `source` | string | データセット名（パネルに出す表示名） |
| `sourceUrl` | string | 取得元 URL |
| `license` | string | ライセンス識別子（`GPL-3.0` / `CC0-1.0` / `CC-BY-4.0` / `Public Domain` 等） |
| `commit` | string（任意） | ピン留めコミット。無い場合は省略 |
| `borderPrecision` | string（任意） | 境界の確からしさの区分。**区分の設計は データ側の担当**（AC #3） |

`cities.json` は GeoJSON ではないので、同じキーを持つ `metadata` を別途持たせる。

**表示側はこの `metadata` を汎用に描画する**（`source` / `license` / `sourceUrl` /
`commit` / `borderPrecision` があれば出す、無ければ出さない）。区分の語彙を
表示側にハードコードしないことで、データ側が語彙を変えても表示側が壊れない。

## 並列化判定（タスク内）

**並列化する（subagent 2 本を worktree isolation で起動）**。上のデータ契約を
先に確定したことで、生成側と表示側が互いのファイルに触れずに進められ、
どちらも独立にテストできるため（TASK-99 で同じ形が機能した）。

| 担当 | 触るファイル | 成果物 |
| --- | --- | --- |
| A: データ | `scripts/build-*.ts` / それらのテスト / `data/` の生成物 / `docs/data-inventory/README.md` | 全データへの `metadata` 付与（AC #2・#6）と境界の確からしさの区分設計（AC #3） |
| B: 表示 | `src/info.ts` / `src/info_test.ts` / `src/main.ts` / `app.css` | パネルの出典表示（AC #1・#4）と整形の純粋関数（AC #5） |

B は A の生成物を待たず、契約どおりのフィクスチャに対して実装・テストする。
`docs/app-spec.md` は**両者とも触らない**（mainagent がレビュー時にまとめて書く）。
実機確認は両者の成果を統合してから mainagent が行う。

**TASK-100 との競合に注意**（AC の「実装順に注意」）: TASK-100 は既にマージ済みで
山岳のパネル表示（山脈 = 名称のみ / 山峰 = 名称 + 標高）が入っている。B は
`peakPickLabel` / `mountainPickLabel` の既存表示を壊さず、出典欄を足す形にする。

## タスク間並列

なし（`next-tasks` が TASK-109 の単独集合を返した）。
<!-- SECTION:PLAN:END -->
