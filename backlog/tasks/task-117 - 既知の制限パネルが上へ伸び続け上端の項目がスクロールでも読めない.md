---
id: TASK-117
title: 既知の制限パネルが上へ伸び続け上端の項目がスクロールでも読めない
status: To Do
assignee: []
created_date: '2026-07-27 15:27'
labels:
  - bug
  - 'area:app'
dependencies: []
priority: high
type: bug
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状（bug）

**再現手順**: 画面左下の ⚠ ボタン（既知の制限）を開く。

**期待挙動**: パネル内の全項目が読める（画面に収まらない場合はパネル内でスクロールできる）。

**実際の挙動**: `.popover-card` に `max-height` / `overflow-y` の指定が無いため、パネルはボタンの真上へ上方向に伸び続ける。ビューポート上端より上へ出た項目は**スクロールでも到達できない**（パネル自身が overflow: visible でスクロールコンテナにならず、body も縦スクロールしない）。

**実測**（ヘッドレス CDP・viewport 813px・1400 年・項目 14 件）:

- `.popover-card`: 高さ 3840px / `top: -3100px` / `max-height: none` / `overflow-y: visible` / `scrollHeight > clientHeight` は false（スクロール不可）
- TASK-105 で追加した 4 項目のうち `base-attribution-snapshot-drift`（top -821）と `base-nominal-suzerainty`（top -493）は完全に画面外
- 項目を 10 件（TASK-105 の追加前相当）に減らしても `top: -1826px` で、**追加前から既に読めない項目があった**

**発見契機**: TASK-105（既知の制限 4 項目の追記）の実装中に実装 subagent が検出し、mainagent が独立に再現・実測した。TASK-105 の追加で不可視領域が 1826px → 3100px に悪化するが、原因は追加そのものではなく `.popover-card` のレイアウト指定の欠落。

## 補足

TASK-105 のタスク説明は「4 項目を known-limitations.json に追加し、**UI から確認できるようにする**」だが、この欠陥のため追加した 4 項目のうち 2 項目は画面から読めない。TASK-105 の AC 自体は JSON とテストとドキュメント参照のみを要求しており満たしているが、意図の達成はこの bug の修正待ちである。

## 想定される修正

`app.css` の `.popover-card` に `max-height: calc(100vh - 96px)` と `overflow-y: auto` を入れる程度で済む見込み（未検証）。同じ `.popover-card` を使う他のポップオーバー（attribution フッター等）への影響を確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 既知の制限パネルの全項目が読める（画面に収まらない場合はパネル内でスクロールできる）
- [ ] #2 再現テスト（red）が追加され、修正により green
- [ ] #3 同じ .popover-card を使う他のポップオーバーの表示が壊れていないことを実機で確認している
- [ ] #4 deno test が green
<!-- AC:END -->
