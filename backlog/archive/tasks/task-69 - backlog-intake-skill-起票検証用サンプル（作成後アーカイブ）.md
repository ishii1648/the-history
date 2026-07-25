---
id: TASK-69
title: backlog-intake skill 起票検証用サンプル（作成後アーカイブ）
status: To Do
assignee: []
created_date: '2026-07-25 06:26'
labels:
  - 'area:workflow'
dependencies: []
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-67 の AC #5 検証用サンプルタスク。backlog-intake skill の手順（重複確認→スコープ判定→CLI 起票→着地確認）どおりに `backlog task create` で起票されたことを確認するためのもので、確認後に即アーカイブする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `backlog task view --plain` で説明・AC・ラベルが期待どおり表示される
- [ ] #2 確認後にタスクがアーカイブされている
<!-- AC:END -->
