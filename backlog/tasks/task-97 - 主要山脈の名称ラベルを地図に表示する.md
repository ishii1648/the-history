---
id: TASK-97
title: 主要山脈の名称ラベルを地図に表示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 16:58'
updated_date: '2026-07-26 19:04'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:src-main'
  - 'area:src-labels'
dependencies: []
ordinal: 90000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

現在、山岳は地形陰影（hillshade）だけで表現されており（TASK-34）、山脈名の
ラベルが一切ない。ラベルは勢力名・都市名・河川名の 3 系統のみで、どの起伏が
どの山脈なのかを地図から同定できない（ユーザー報告）。主要山脈に名称ラベルを
付けて山岳情報を読めるようにする。

調査の詳細は `.outputs/claude/mountain-display-survey.md`。

## 使えるデータ（実物を取得して確認済み、2026-07-27）

Natural Earth の `ne_50m_geography_regions_polys.geojson`（4.3 MB）。
河川で既に使っているリポジトリ `nvkelso/natural-earth-vector` の同じピン留め
コミット `ca96624a56bd078437bca8184e78163e5039ad19` から取得できる
（`scripts/build-rivers.ts` と同じ流儀。ライセンスは Public Domain）。

ヨーロッパ域内（bbox -12〜42, 34〜72）に FEATURECLA = Range/mtn が 14 件、
Plateau が 3 件。**`NAME_JA` に日本語名が入っており**、`SCALERANK` / `MIN_LABEL`
でズーム出し分けもできる。

| SCALERANK | 名称 | NAME_JA | MIN_LABEL |
| ---: | --- | --- | ---: |
| 1 | ALPS | アルプス山脈 | 2 |
| 1 | CAUCASUS MTS. | コーカサス山脈 | 2 |
| 2 | ATLAS MOUNTAINS | アトラス山脈 | 3.5 |
| 3 | APPENNINI | アペニン山脈 | 4 |
| 3 | CARPATHIAN MOUNTAINS | カルパティア山脈 | 4 |
| 3 | KJØLEN MOUNTAINS | スカンディナヴィア山脈 | 4 |
| 3 | PYRENEES | ピレネー山脈 | 4 |
| 3 | ATLAS SAHARIEN | サハラ・アトラス山脈 | 5 |
| 3 | CENTRAL RUSSIAN UPLAND | 中央ロシア高地（Plateau） | 4 |
| 4 | Balkan Mts. | バルカン山脈 | 5.3 |
| 4 | Dinaric Alps | ディナル・アルプス山脈 | 5.3 |
| 4 | Cord. Cantábrica | カンタブリア山脈 | 5.3 |
| 4 | Lesser Caucasus | 小コーカサス山脈 | 5.3 |
| 4 | PONTIC MOUNTAINS | ポントス山脈 | 5.3 |
| 4 | S. Nevada | シエラネバダ山脈 | 5.3 |
| 4 | Sierra Morena | シエラ・モレナ山脈 | 6 |
| 1 | PENÍNSULA IBÉRICA | イベリア半島（Plateau） | 3 |

## 実装時に判断する点

- **収録範囲**: Range/mtn のみか Plateau も含めるか（イベリア半島は「山脈」では
  ないので除外が自然）。ヨーロッパ域外にはみ出すもの（アトラス山脈・ポントス
  山脈）の扱い。
- **ラベルの出し方**: 常時表示か、河川ラベル（TASK-69）と同じくホバー/クリック時
  のみか。山脈は動かない地形なので常時表示が自然だが、密集地域のラベル衝突
  （TASK-38 / TASK-54 の知見）と勢力名・都市名との優先順位を決める必要がある。
- **ズーム出し分け**: NE の `MIN_LABEL` を既存のズーム段へどう対応づけるか。
  アプリのズーム上限は MAX_ZOOM = 8。
- **アンカー配置**: 既存の polylabel によるポリゴン内アンカー生成
  （`src/labels.ts`）に載せる。山脈は細長い形状なので、河川ラベルの配置ロジック
  （`src/rivers.ts` のアンカー生成）の方が適する可能性がある。
- **表記**: `NAME_JA` をそのまま使えるか、`data/name-ja.json` の既存の表記規約と
  突き合わせる必要があるか。
- **年代非依存**: 山脈は全年代で同一なので、年代スナップショットとは独立した
  1 ファイルにする（河川と同じ扱い）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 アルプス山脈・ピレネー山脈・カルパティア山脈・アペニン山脈・スカンディナヴィア山脈の名称が日本語で地図上に表示される
- [x] #2 ラベルの表示・非表示がズームに応じて切り替わり、広域表示で山脈名が潰れない
- [x] #3 山脈ラベルが勢力名・都市名・河川名のラベルと重なって読めなくなることがない
- [x] #4 全年代で同じ山脈ラベルが表示される（年代切替で消えたり変わったりしない）
- [x] #5 山脈データの生成処理に、ネットワーク非依存の単体テストが追加され green
- [x] #6 出典・ライセンス（Natural Earth / Public Domain）が既存の河川データと同じ扱いで記録され、attribution に反映される
- [x] #7 deno test が green
- [x] #8 実機で地図を表示し、主要山脈のラベルが陰影の位置と一致していることを目視確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. データ生成: NE 50m geography_regions_polys（ピン留めコミット・Public Domain）から Range/mtn を抽出する scripts/build-mountains.ts（仮称）を build-rivers の流儀で新設。年代非依存の 1 ファイル（data/mountains.geojson 等）。Plateau は除外（イベリア半島は山脈でない）、域外にはみ出すもの（アトラス・ポントス等）は EUROPE_BBOX クリップとの関係を実測して採否決定・根拠記録。
2. 表示: 常時表示の TextLayer（山脈は地形で年代非依存のため）。ラベルは overlaid ラベル群（decision-15）に新系統として追加し、衝突フィルタの優先順（勢力名・都市名との関係）と NE の MIN_LABEL → 既存ズーム段の対応を設計。アンカーは細長形状に適した方式（polylabel vs 河川式）を実測比較して選択・根拠記録。
3. 表記: NAME_JA を name-ja.json の規約と突き合わせ、必要なら上書き。
4. TDD: 生成処理のネットワーク非依存テスト（AC#5）・ズーム出し分け・ラベル系統の layer_stack 整合を先に固定。
5. 出典を data-inventory + attribution に反映（AC#6）→ CDP で陰影との位置一致・衝突・年代非依存を目視（AC#8）→ PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: データ生成 → 表示 → 衝突設計が直列依存。単一 subagent に委譲）。
タスク間並列: なし（TASK-98/103 は area 競合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: CDP（z5〜6）でアルプス・ピレネー・カルパティア・アペニン（+ z 上げでスカンディナヴィア）の日本語ラベル表示を目視確認。
- AC#2: MIN_LABEL の ceil + クランプで z4=9 件 / z5=10 件 / z6+=17 件のズーム出し分け（テスト固定）。
- AC#3: 衝突優先度 80〜140 の固定帯（都市名・大国名に譲り公領規模に勝つ。0〜60 案は z4 で 2 件しか残らず却下）。CollisionFilterExtension で構造的に重なり回避、CDP で確認。
- AC#4: 山脈は年代非依存の単一ファイル（河川と同じ扱い）。年代切替で不変。
- AC#5: build-mountains のネットワーク非依存テスト + ADOPTED_MOUNTAIN_NAMES による実データ突き合わせ検査。
- AC#6: data-inventory と index.html attribution に NE / Public Domain を反映。
- AC#7: deno test 1121 passed、fmt/lint/build green、verify:smoke PASS、PR #109 CI green。
- AC#8: CDP で陰影の位置とラベルの一致を目視確認。
- 設計判断: 収録 17 件（クリップ後 40% 以上残存）・Plateau/ザグロス除外・polylabel アンカー（河川式は山麓境界に立つため却下）・NAME_JA の誤り 1 件（エルブルス→アルボルズ）修正。
- decision 記録判定: 新規なし（既存のデータ取得・ラベル系統パターンの適用。判断はコード / docs に記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
NE 50m geography regions から主要山脈 17 件を抽出する build-mountains.ts を新設し、年代非依存の常時表示ラベル層 mountain-labels を追加。衝突優先度・ズーム出し分け・polylabel アンカー・日本語表記を設計根拠付きで実装し、attribution 反映。1121 テスト green・CDP 目視・CI green（PR #109）。
<!-- SECTION:FINAL_SUMMARY:END -->
