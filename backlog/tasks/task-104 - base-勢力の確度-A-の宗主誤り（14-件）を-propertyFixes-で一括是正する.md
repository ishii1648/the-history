---
id: TASK-104
title: base 勢力の確度 A の宗主誤り（14 件）を propertyFixes で一括是正する
status: To Do
assignee: []
created_date: '2026-07-26 19:25'
labels:
  - bug
  - 'area:scripts'
  - 'area:data'
dependencies: []
priority: high
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の横断監査（docs/data-inventory/base-attribution-audit.md）で確度 A（明確な誤り）と判定された宗主・帰属の誤りを、TASK-102 で導入した name-overrides.json の propertyFixes で一括是正する。対象は監査ドキュメントの確度 A 一覧のうち propertyFixes 方針の 14 件（例: Burgandy 1100/1200 = 1032 年に帝国編入済み・Bulgar Khanate 1100 = 1018 年ビザンツ併合・1700 年スナップショットへのユトレヒト条約後帰属の混入 3 件・1400 年の消滅済み Mongol Empire 宗主 3 件・1000 Suomi の切り詰め異常値 等。年号付き根拠は監査ドキュメント参照）。

発見契機: TASK-103 の横断監査。是正方針は同監査で確定済み（suzerains ではなく propertyFixes = 上流の誤りの是正、decision-19 との棲み分け）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 監査ドキュメントの確度 A・propertyFixes 方針の 14 件について SUBJECTO/PARTOF が期待値になる回帰テストが追加され、修正前 red → 修正後 green
- [ ] #2 各 fix に年号付き根拠 note が propertyFixes エントリに付いている
- [ ] #3 再生成（deno task build 系）後も修正が保たれ、下流派生（colors / europe_flat 等）の整合が維持される
- [ ] #4 deno test が green
<!-- AC:END -->
