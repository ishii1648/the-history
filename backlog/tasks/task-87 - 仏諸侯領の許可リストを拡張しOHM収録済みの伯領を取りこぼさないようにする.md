---
id: TASK-87
title: 仏諸侯領の許可リストを拡張しOHM収録済みの伯領を取りこぼさないようにする
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 12:13'
updated_date: '2026-07-26 14:59'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:docs'
dependencies: []
ordinal: 81000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
scripts/build-france-fiefs.ts の FRANCE_FIEF_NAMES は 14 件の許可リストで、OHM に収録されている中世フランスの伯領を複数取りこぼしている。data/known-limitations.json の france-fiefs-missing-territories は「収録されている 14 の公領・伯領のみを表示している」と書いているが、これは元データの限界ではなく本リポジトリ側の許可リストの狭さに由来する部分がある。

## 実測結果（2026-07-26）

FRANCE_BBOX（south 40.0 / west -6.5 / north 52.5 / east 10.5）に boundary=administrative の全リレーション（4,897 件）を取得し、admin_level 3〜5 かつ 1000 / 1100 / 1200 / 1279 / 1300 のいずれかで有効なもののうち、現行の許可リストに無いものを列挙した。フランス王国内および周縁の候補は以下（角括弧内は有効年）:

- County of Angoulême [1000,1100,1200,1279,1300]
- County of La Marche [1000,1100,1200,1279,1300]
- County of Vendôme [1000,1100,1200,1279,1300]
- County of Clermont-en-Argonne [1000,1100,1200,1279,1300]
- Cambrésis [1000,1100,1200,1279,1300]
- Counts of Saint-Pol [1100,1200,1279,1300]
- County of Nantes [1000,1100,1200]
- County of Tours [1000,1100,1200]
- County of Perche [1100,1200]
- County of Roussillon [1000,1100,1279,1300]

帝国側・低地地方の隣接領邦も同 bbox に収録されている（County of Namur・County of Zeeland・County of Holland・Dauphiné of Viennois・County of Montbéliard・County/Principality of Neuchâtel など）。これらはフランス王国の封建諸侯領ではないため、採否は方針判断とし、判断と根拠を記録すること。

## 位置づけ

本タスクは既存データソースの取りこぼしを拾うだけで、新規データの作成を含まない。南フランス（Toulouse・Foix・Armagnac・Auvergne）と中央部（Bourbon・Nevers）および王領の空白は OHM に実データが存在しないため本タスクでは埋まらない（実測で確認済み。別タスクで扱う）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 追加候補の各領邦について採否と根拠がコード内に記録されている
- [x] #2 採用した領邦が data/france_fiefs_<year>.geojson に含まれ、既存 14 件も従来どおり出力される
- [x] #3 追加後も 1 ファイルあたりのサイズ上限を超えない
- [x] #4 許可リスト拡張を検証する単体テストが追加され deno test が green
- [x] #5 known-limitations.json の france-fiefs-missing-territories が拡張後の実態に合わせて更新されている
- [x] #6 docs/data-inventory の諸侯領の件数が更新されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 採否方針: フランス王国内の伯領 10 候補（Angoulême / La Marche / Vendôme / Clermont-en-Argonne / Cambrésis / Saint-Pol / Nantes / Tours / Perche / Roussillon）を採用候補とし、Cambrésis（帝国司教領）・Roussillon（アラゴン圏）等の周縁は帰属を個別確認して採否を決める。帝国側・低地地方（Namur / Zeeland / Holland / Viennois / Montbéliard / Neuchâtel）は仏諸侯領オーバーレイの範囲外として不採用の方向（HRE 系は TASK-85/86 の系統が担う）。全候補の採否と根拠をコード内に記録（AC#1）。
2. TDD: 許可リスト拡張の検証（採用領邦が対象年に含まれる・既存 14 件の維持）を先にテストで固定し red 確認（AC#4）。
3. 実装: FRANCE_FIEF_NAMES 拡張 → Overpass 再取得 → flat / dedupe / base_outline の派生一式を再生成。TASK-79/86 の品質不変条件（自己交差ゼロ・残存重なり <1 km²・サイズ上限）を維持（AC#2/#3）。
4. known-limitations の france-fiefs-missing-territories を実態（南仏・中央部の空白は OHM 由来）へ更新しテスト追従（AC#5）。docs/data-inventory の件数更新（AC#6）。
5. CDP で 1200 年の追加伯領表示・既存表示の非退行を目視確認 → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 許可リスト → 再取得 → 派生再生成 → docs が直列依存の単一フロー。単一 subagent に委譲）。
タスク間並列: なし（next-tasks 単独集合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: 全 10 候補 + 低地地方の採否と根拠を FRANCE_FIEF_EXCLUSIONS（分類つき）と franceFiefExclusionReason の二重防波堤としてコード内に記録。採用 7 / 見送り: Cambrésis（帝国司教領）・Clermont-en-Argonne（ヴェルダン司教の帝国封）・Roussillon（アラゴン圏）・低地/アルル王国側（帝国領邦 = hre_fiefs 系統の担当）。
- AC#2: 件数 1000 年 7→12 / 1100 年 9→16 / 1200 年 12→19 / 1279・1300 年 11→15。既存 14 件の維持と追加領邦の収録を単体テストで検証。CDP（1200 年）でヴァンドーム・トゥール・ペルシュ・ラ・マルシュ・アングレーム等の表示を目視確認。
- AC#3: 最大 58.6 KB で上限 200 KB 内（テスト検証）。
- AC#4: build-france-fiefs_test を拡張し TDD red→green（コミット 626d9ec）。deno test 906 passed。
- AC#5: known-limitations の france-fiefs-missing-territories を「南仏・中央部の空白は OHM 側の欠落」という実態へ更新しテスト追従。
- AC#6: docs/data-inventory の README と year-*.md の件数を更新。
- 下流派生一式（flat / fief-dedupe / base_outline / colors / name-ja）を再生成し、残存重なり最大 0.004 km²・自己交差ゼロを維持。
- 全チェック: fmt/lint clean、build green、verify:smoke PASS、PR #97 CI green。
- decision 記録判定: 新規なし（採否基準はコード内記録で足りるタスク限りの判断。仏/帝国の系統分離は decision-17 の枠内）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
仏諸侯領の許可リストを 14→21 領邦へ拡張し、OHM 収録済みのフランス王国内 7 伯領の取りこぼしを解消。見送り候補は帰属根拠つきの除外リスト + 二重防波堤で管理。下流派生一式を再生成し品質不変条件を維持、known-limitations と data-inventory を実態へ更新。906 テスト green・CDP 目視・CI green（PR #97）。
<!-- SECTION:FINAL_SUMMARY:END -->
