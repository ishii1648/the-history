---
id: TASK-63
title: 河川名寄せの回帰テストがエイリアス剪定で空振りしている
status: To Do
assignee: []
created_date: '2026-07-25 05:43'
labels:
  - bug
  - 'area:scripts'
dependencies: []
ordinal: 60000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review CONFIRMED 指摘 #5。scripts/build-rivers_test.ts の ALL_RIVER_NAMES はドキュメント上 data/rivers.geojson から再生成する運用だが、名寄せ（TASK-56）後の geojson には正準名しか残らず、name-ja.json からもエイリアスキーが剪定されたため、『同一 ja ラベルは単一正準名を持つ』クロスチェックが対象河川に対して発火し得ない。将来 Natural Earth 更新で国境またぎの名前分割（例: Elbe/Labe）が再発しても、ドキュメントどおりリスト再生成した場合にテスト green のまま TASK-56 の回帰（強調が川の途中で切れる）を通してしまう。期待: 名寄せ前の生ソース名（エイリアス適用前）を検証対象に含める形へテストを再設計し、再発時に red になることを固定する。発見契機: /code-review（PR #65/TASK-56 由来コードの横断レビュー）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 名寄せ前ソース名に対する回帰テストが追加され、エイリアス未登録の名前分割を検知して red になることが実証されている（既知ケースの意図的除去で red 確認 → green）
<!-- AC:END -->
