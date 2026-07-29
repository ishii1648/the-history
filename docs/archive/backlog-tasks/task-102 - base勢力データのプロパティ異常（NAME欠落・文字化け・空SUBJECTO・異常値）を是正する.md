---
id: TASK-102
title: base勢力データのプロパティ異常（NAME欠落・文字化け・空SUBJECTO・異常値）を是正する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 17:08'
updated_date: '2026-07-26 18:00'
labels:
  - bug
  - 'area:scripts'
  - 'area:data'
dependencies: []
ordinal: 95000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状（bug）

`data/europe_<year>.geojson` 全 26 年代を走査した結果、表示・色分け・ラベルに
影響するプロパティ異常が見つかった。

**発見契機**: ユーザー依頼による歴史的帰属の横断調査（2026-07-27）。
詳細は `.outputs/claude/base-territory-accuracy-survey.md`。

## 検出した異常

| 種別 | 内容 |
| --- | --- |
| **NAME 欠落** | 全年代に存在（16〜40 件/年）。900 年 36 件、1279 年 36 件、1880 年 40 件など。多くは島嶼（ヘブリディーズ、オークニー、マン島、アングルシー等）。`colorKeyFor` が null を返すため `DEFAULT_FILL_COLOR` のグレーで無名描画される |
| **文字化け** | 1100 年 `Aragón.PARTOF = Arag<U+FFFD>n` |
| **空プロパティ** | `Denmark-Norway`（1000 / 1783 / 1800）、`Alans`（1000）、`Cuman-Kipchak confederation`（1100）、`Greenland`（1530 / 1600）、`Sweden`（1530）、`Russia`（1650）、`Batavian Republic`（1800）、`Sweden–Norway`（1815）の SUBJECTO / PARTOF が空 |
| **異常値** | 1783 年 `Lombardy.SUBJECTO = "3"` |
| **SUBJECTO の年代間不整合** | `English territory` の SUBJECTO が 1279 は `England`、1300 / 1400 は `English territory`。`colorKeyFor` は `NAME|SUBJECTO` をキーにするため、同一実体の色キーが年代で変わり配色が変化しうる |

表記ゆれ（`Castilla` / `Castille` / `Scottland` / `Scottalnd` /
`Poland-Llituania` / `Kyivan Rus` / `Baltic tribes`）は
`data/name-overrides.json` の `renames` 7 件で既に吸収済みなので対象外。

## 影響

- NAME 欠落の feature はグレー一色・ラベルなしで描かれ、地図上で正体が分からない。
  島嶼が多いため、スコットランド北部・アイルランド周辺の見え方に影響する。
- 空 SUBJECTO / 異常値は、TASK-94 で導入する宗主キーによる外枠強調の入力になる
  ため、そのままでは外枠の範囲が壊れる可能性がある。
- SUBJECTO の年代間不整合は、年代を切り替えたときに同じ勢力の色が変わる原因になる。

## 制約

base は `aourednik/historical-basemaps` のピン留めコミットから生成する上流データ
（`scripts/build-data.ts`、GPL-3.0）。**生成物の直接編集は再生成で失われる**ため、
`data/name-overrides.json` を `renames` から拡張して年代付きのプロパティ上書きを
宣言するなど、パイプライン内で解決する。

## 実装時に判断する点

- NAME 欠落の feature をどう扱うか。名称を補う（島名を上書きテーブルで与える）か、
  周囲の勢力に帰属させるか、意図的に無名のまま描くかを決める。件数が多いため
  一律の規則が要る（例: 面積閾値以下の島嶼は隣接勢力の色で塗る）。
- 上書きテーブルのスキーマ。TASK-94 で導入予定の宗主上書きと同じ仕組みに
  載せられるかを確認し、二重に持たない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 NAME 欠落の feature の扱いが一律の規則で決まり、その根拠が記録されている
- [x] #2 1100 年 Aragón の PARTOF の文字化けが解消している
- [x] #3 空の SUBJECTO / PARTOF を持つ feature が無くなる、または空を許容する場合の扱いが明示されている
- [x] #4 1783 年 Lombardy の SUBJECTO の異常値（"3"）が是正されている
- [x] #5 English territory の SUBJECTO が年代間で一貫し、年代切替で配色が変わらない
- [x] #6 base データの生成をやり直しても修正が保たれる（生成物の直接編集をしていない）
- [x] #7 プロパティ異常を検出する回帰テストが追加され、修正前は red・修正後は green になる
- [x] #8 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 上書き機構: name-overrides.json を renames / suzerains（decision-19）に加えて年代付きプロパティ上書き（例: propertyFixes）へ拡張し、パイプライン（build-data.ts）内で適用する。二重機構を作らない（TASK-94 の suzerains と同一ファイル・同系スキーマ）。
2. NAME 欠落（16〜40 件/年・多くは島嶼）: 一律規則を実装時に決定し根拠記録（AC#1）。候補は (a) 主要なもののみ島名を上書き付与、(b) 意図的無名（グレー）を許容し既知の制限に明示、(c) 面積閾値で隣接勢力へ帰属。件数と表示影響を実測して選ぶ。
3. 個別是正: Aragón PARTOF 文字化け（AC#2）・空 SUBJECTO/PARTOF の扱い明示（AC#3）・Lombardy SUBJECTO="3"（AC#4）・English territory の年代間一貫（AC#5、色キー安定化）。
4. TDD: プロパティ異常の検出テスト（修正前 red）→ 上書き適用で green（AC#7）。再生成耐性（AC#6）。
5. 全チェック green → CDP でスコットランド周辺等の見え方確認 → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 上書き機構の設計が全是正の前提で直列依存。単一 subagent に委譲）。
タスク間並列: なし（next-tasks 単独集合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: NAME 欠落（16〜40 件/年・描画面積 0.1〜3.8%）は無名のまま中立色で描く規則を採用。根拠 = 帰属の手がかりがデータに無く、島名補完（国家に見える）・面積閾値帰属（出典なき帰属、1279 年マン島は英諾係争）を却下。known-limitations に明示、docs/app-spec.md に記録。
- AC#2: 1100 年 Aragón.PARTOF の文字化けを propertyFixes で是正（テスト検証）。
- AC#3: 空 SUBJECTO/PARTOF は『独立勢力』として NAME で正規化（normalizeSubjectProps）。色キー・宗主キー・表示は不変であることをテストで固定。
- AC#4: 1783 年 Lombardy.SUBJECTO="3"（列ずれ）を是正。史実に基づく宗主付け替えは suzerains（decision-19）の担当として分離。
- AC#5: English territory の SUBJECTO を年代間で一貫させ、色キーの年代間安定をテストで固定。
- AC#6: name-overrides.json の propertyFixes + build-data.ts の applyPropertyFixes によるパイプライン内是正で再生成耐性あり（生成物直接編集なし）。
- AC#7: 全年代走査の異常検出テスト（base-properties_test.ts）が修正前 red → 修正後 green。
- AC#8: deno test 1070 passed、fmt/lint/build green、verify:smoke PASS、PR #107 CI green。
- learned: 正規化は TASK-101 の封土切り出しの後段に配置（切り出し feature は PARTOF を持たない）。
- decision 記録判定: 新規なし（decision-14/18/19 の原則の適用。上書き機構は name-overrides.json に集約し docs に記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
base データのプロパティ異常（文字化け・列ずれ・空 SUBJECTO・年代間不整合・NAME 欠落）を name-overrides.json の年代付き propertyFixes と正規化でパイプライン内是正（再生成耐性あり）。NAME 欠落は出典なき帰属を作らない原則で無名のまま中立色とし known-limitations に明示。全年代走査の回帰テスト red→green（1070 passed）、CI green（PR #107）。
<!-- SECTION:FINAL_SUMMARY:END -->
