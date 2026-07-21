---
id: TASK-26
title: attribution フッターを折りたたみ式にする
status: To Do
assignee: []
created_date: '2026-07-21 13:53'
labels: []
dependencies:
  - TASK-9
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-9 で実装した footer の出典・attribution 表示（historical-basemaps GPL-3.0 / ETH Zürich Roller CC BY-NC-SA 4.0 / Protomaps・OpenStreetMap ODbL / Natural Earth）は常時全文表示されており、常に画面を圧迫している。OpenStreetMap(ODbL) や CC BY-NC-SA のような attribution 表示義務があるライセンスが含まれるため完全非表示・コードコメント化はライセンス違反リスクがあり不可。代わりに小さなアイコン等を常時表示し、クリック/タップで全文を展開できる折りたたみ UI に変更し、attribution 表示義務を満たしつつ画面占有を減らす。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 未展開時は小さなアイコン（例: ⓘ）等の目印のみが常時表示され、attribution 全文は隠れている
- [ ] #2 アイコンをクリック/タップすると attribution 全文（historical-basemaps・ETH Zürich Roller・Protomaps/OSM・Natural Earth の各リンクと免責文言を含む）が展開表示される
- [ ] #3 展開状態から再度クリック/タップまたは外側クリックで折りたたまれる
- [ ] #4 折りたたみ操作がキーボード操作でも可能（アクセシビリティ、aria-expanded 等の状態が適切に反映される）
- [ ] #5 既存の TASK-9 AC1 が意図した出典情報の内容・リンクは一切欠落・改変されない
<!-- AC:END -->
