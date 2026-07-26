---
id: TASK-103
title: base勢力データの歴史的帰属の乖離を横断監査し是正方針を決める
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 17:08'
updated_date: '2026-07-26 19:26'
labels:
  - spike
  - 'area:data'
  - 'area:docs'
dependencies: []
ordinal: 96000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

ユーザー指摘（1100 年のノルマンディーがフランス王国領に含まれる、TASK-101）を
起点に全 26 年代を走査したところ、同種の帰属の乖離が他にも複数見つかった。
個別に対応するとデータの一貫性が保てないため、まず横断的に監査して是正対象を
確定させる。

調査の起点は `.outputs/claude/base-territory-accuracy-survey.md`。

## 現時点で見つかっている乖離候補

確度は「高 = 明確な誤り」「中 = 解釈の余地あり」。

| 年 | feature | 現状 | 史実 | 確度 |
| --- | --- | --- | --- | --- |
| 1100 / 1200 | Burgandy | 独立勢力として描画 | ブルグント（アルル）王国は **1032 年に神聖ローマ帝国へ編入**。以後は帝国の構成王国で `SUBJECTO = Holy Roman Empire` であるべき。1000 年は独立で正しい | 高 |
| 1400 | Seljuk Caliphate | 独立勢力 | ルーム・セルジューク朝は **1308 年に滅亡**。1400 年には存在しない | 高 |
| 1100 | Bulgar Khanate | 独立（bbox はバルカン半島） | 第一次ブルガリア帝国は **1018 年にビザンツへ併合**され、1185 年の第二次ブルガリア帝国まで東ローマ領 | 高 |
| 1279 / 1400 | Novgorod | SUBJECTO = `Mongol Empire`（1300 のみ独立） | ノヴゴロド共和国はモンゴルの直接支配を受けず（貢納関係のみ）。1478 年のモスクワ併合まで存続。年代間で帰属が揺れるのも不整合 | 中 |
| 1279 | Ryazan / Novgorod / Seljuk Caliphate | SUBJECTO = `Mongol Empire` | 1279 年のモンゴル帝国は既に分裂（1260 年代）。ルーシは**ジョチ・ウルス（金帳汗国）**、アナトリアは**イルハン朝**の支配下。1300 年では `Khanate of the Golden Horde` / `Ilkhanate` に変わっており、1279 だけ表記が粗い | 中 |
| 1000〜1300 | Bulgar Khanate | 名称が「Khanate」 | ブルガリアは 913 年以降ツァーリ国（帝国）。Khanate は 864 年のキリスト教化以前の呼称 | 中（名称） |
| 1100 | Armenia | SUBJECTO = `Byzantine Empire` | 1100 年のアルメニアはキリキア・アルメニア（ビザンツの宗主権下だが実質自立） | 低 |

これは同一 NAME の SUBJECTO が年代で変わるものを機械的に抽出して史実と
突き合わせた結果で、**網羅的ではない**。単一年代にしか現れない誤りや、
ポリゴンの形状そのものの誤りは拾えていない。

## 本タスクの範囲

- 全 26 年代の base 勢力について、名称・宗主・存続期間の観点で史実と突き合わせ、
  乖離を一覧化する（是正の実装は本タスクに含めず、確定した対象ごとに別タスクを
  起票する）。
- 是正方針（上書きテーブルで直すか、既知の制限として明記するか）を乖離ごとに
  決める。
- 上流データ `aourednik/historical-basemaps` の粒度に由来し修正しきれないものは
  `data/known-limitations.json` への記載対象として整理する。

## 制約

base は上流リポジトリのピン留めコミットから生成する（`scripts/build-data.ts`、
GPL-3.0）。生成物の直接編集は再生成で失われるため、是正はパイプライン内の
上書き（TASK-102 で拡張するテーブル）か幾何演算で行う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 全 26 年代の base 勢力について、名称・宗主・存続期間の観点で史実と突き合わせた乖離の一覧が docs または .outputs に残っている
- [x] #2 各乖離に確度（明確な誤り / 解釈の余地あり）と根拠となる史実（年号を含む）が付いている
- [x] #3 乖離ごとに是正方針（上書きテーブルで修正 / 既知の制限として明記 / 対応しない）が決まっている
- [x] #4 是正が必要と判断した乖離について、実装タスクが backlog に起票されている
- [x] #5 上流データの粒度に由来し修正しきれないものが data/known-limitations.json への記載対象として整理されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 監査（spike）: 全 26 年代の base 勢力を名称・宗主・存続期間の観点で史実と突き合わせ、乖離一覧（確度 + 年号付き根拠）を docs に残す（AC#1/#2）。既知の候補 7 件（Burgandy 1032 帝国編入・Seljuk 1308 滅亡・Bulgar 1018 併合ほか）の検証から始め、機械抽出（同一 NAME の年代間 SUBJECTO 揺れ・存続期間の異常）+ 主要勢力の個別照合で拡張する。
2. 是正方針の決定（AC#3）: 乖離ごとに (a) propertyFixes / suzerains（TASK-102/decision-19 の機構）で修正 (b) known-limitations 明記 (c) 対応しない、を決定。decision-14/18/19 の原則（出典・最小限・史実的明白性）に従う。
3. 起票判断の素材化（AC#4）: 是正が必要な乖離の実装タスク案（グルーピング・AC 案）を報告にまとめ、起票は mainagent が finalization で行う。
4. known-limitations 記載対象の整理（AC#5）→ 全チェック green → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 監査 → 方針決定が単一の調査フロー。単一 subagent に委譲）。
タスク間並列: TASK-98（area:src-basemap,src-main）と並列実行（本タスクは area:data,docs で互いに素）。worktree isolation で衝突回避。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: 全 20 年代（起票時の 26 年代は誤りと訂正）の乖離一覧を docs/data-inventory/base-attribution-audit.md に記録。機械抽出 6 検出器（deno task audit-attribution・再現可能）+ 史実照合。mainagent が再実行し同一結果を再現。
- AC#2: 確度 A 15 件 / B 7 件 / C（妥当）11 件、各件に年号付き根拠。新規発見: 1700 年へのユトレヒト条約後帰属の混入・1900 年の従属関係全欠落・1400 年の消滅済み Mongol Empire 宗主・Suomi 切り詰め異常値等。
- AC#3: 乖離ごとに propertyFixes 16 件 / NAME 上書き要判断 2 件 / known-limitations 4 項目 / 対応しない（確度 C 全件）を決定。suzerains 不使用の棲み分け（上流の誤り是正は propertyFixes）も記録。
- AC#4: 実装タスクを起票: TASK-104（確度 A 一括是正・bug/high）・TASK-105（known-limitations 4 項目）・TASK-106（NAME 上書き可否判断）・TASK-107（確度 B 正規化・low）。名称ドリフトの renames 統一（ε 案）は実害が配色のみのため起票見送り（理由記録）。
- AC#5: 構造的限界 4 項目を known-limitations 記載対象として監査ドキュメントに整理（実装は TASK-105）。
- 全チェック: fmt/lint clean、deno test 1131 passed、build green、PR #110 CI green。
- decision 記録判定: 新規なし（是正方針は decision-14/18/19 の適用。判断は監査ドキュメントに記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
全 20 年代の base 勢力の帰属を 6 種の機械検出器 + 史実照合で横断監査し、確度 A 15 / B 7 / C 11 件の乖離一覧と是正方針（propertyFixes / known-limitations / 対応しない）を確定。1700 年への条約後帰属混入など新規発見を含む。実装タスク TASK-104〜107 を起票し、監査は deno task audit-attribution で再現可能。1131 テスト green・CI green（PR #110）。
<!-- SECTION:FINAL_SUMMARY:END -->
