---
id: TASK-56
title: 河川クリック/ホバー時の強調表示がライン全体に及ばず途中で切れる
status: To Do
assignee: []
created_date: '2026-07-24 13:26'
labels:
  - bug
dependencies: []
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー報告: 河川をクリック/ホバーした際の強調表示（色変化、TASK-24/36/42 実装）が、河川ライン全体ではなく途中で切れてしまうケースがある。ライン川・ドナウ川で発生を確認済み。再現手順の詳細（切れる位置・年代・ズーム）は実機で確認し確立すること。調査の手がかり: (1) src/rivers.ts の riverLineColor/riverLineWidth は選択中の河川名（selectedRiverName）と feature の名前が一致する feature 全体を強調する設計だが、rivers.geojson 側で同一河川が複数の LineString feature（支流・本流の区間分割等）に分かれており、一部の feature だけ name の表記が異なる（例: 前後の空白・別名表記・大文字小文字違い）ために選択判定から漏れている可能性 (2) TASK-24 のラベルアンカー算出（最長 LineString の中点）は同一 feature 内の複数 LineString を扱うが、同一河川が複数の別 feature に分かれている場合の扱いは別ロジックであるため、この境界での取りこぼしがないか (3) riverNameFor の name-ja.json 適用前後で比較しているキーの不一致がないか。原因特定後、再現テスト（red）→ 修正（green）で対応する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ライン川・ドナウ川で強調が途中で切れる再現条件（具体的な位置・区間）が特定されている
- [ ] #2 原因（feature 分割時の名前不一致・選択判定ロジックの範囲漏れ等）が特定されている
- [ ] #3 再現テスト（red）が追加され、修正により該当河川全体が強調表示されるようになる（green）
- [ ] #4 ライン川・ドナウ川以外の主要河川でも同様の途切れがないか横展開で確認する
- [ ] #5 実機確認で修正を確認する
<!-- AC:END -->
