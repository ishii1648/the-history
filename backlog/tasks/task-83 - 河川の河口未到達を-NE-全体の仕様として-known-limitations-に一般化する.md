---
id: TASK-83
title: 河川の河口未到達を NE 全体の仕様として known-limitations に一般化する
status: To Do
assignee: []
created_date: '2026-07-26 10:56'
labels:
  - 'area:data'
dependencies: []
priority: low
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-76 の横断検査（docs/data-inventory/rivers-continuity-audit.md）で、幅の広い河口部・潟を海として扱いセンターラインを引かないのは Natural Earth 全体の一貫した仕様であり、Elbe 固有の欠落ではないことが判明した（Oder 14.584E・Loire -1.743E ほか、終端はいずれも ne_50m_coastline に接する。10m 版でも補完不能を実測）。現在の data/known-limitations.json の rivers-elbe-estuary-missing はエルベ限定の記述になっているため、NE 全体の仕様として一般化し、同様の河川（ロワール・オーデル等）にも当てはまる旨へ文言を修正する。

発見契機: TASK-76（全河川の端点・連続性の横断検査）の調査結果。decision-14（出典なき座標合成はせず known-limitations 明示）の適用範囲を正しく伝えるための文言修正であり、ジオメトリの変更は含めない。

参考: data/known-limitations.json、scripts/known-limitations-json_test.ts（キーワード検証テストの文言追従が必要）、docs/data-inventory/README.md §9/§10、docs/data-inventory/rivers-continuity-audit.md。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 known-limitations の該当エントリが Elbe 限定ではなく NE ソース全体の仕様として記述され、代表例（エルベ・ロワール・オーデル）に言及している
- [ ] #2 scripts/known-limitations-json_test.ts の文言検証が新記述に追従して green である
- [ ] #3 docs/data-inventory/README.md §9 の記述が更新されている
<!-- AC:END -->
