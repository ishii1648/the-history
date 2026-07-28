---
id: TASK-132
title: 小画面向けのレイアウト調整を行い UI が地図面を覆わないようにする
status: To Do
assignee: []
created_date: '2026-07-28 16:43'
labels:
  - 'area:app'
dependencies:
  - TASK-131
type: enhancement
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
app.css には @media によるブレークポイントが 1 つも存在せず（prefers-reduced-motion のみ）、min() や clamp() による狭幅クランプで凌いでいる。スマートフォンの幅 375px では、画面左端の縦タイムライン（left:16px・高さ clamp(200px,46vh,460px)）、右上の情報パネル（max-width 320px）、左下の attribution と既知の制限トグル、右下の解説トグルが同時に表示され、地図の可視領域が大きく削られる。小画面向けのブレークポイントを追加し、地図が主役であることを保った配置にする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 小画面向けのブレークポイントが定義され、幅 375px でも地図の可視領域が画面の大半を占める
- [ ] #2 縦タイムラインが小画面で操作可能なまま地図を過度に覆わない配置になる
- [ ] #3 情報パネル・解説パネル・既知の制限・attribution が小画面で互いに重ならない
- [ ] #4 タップ操作の当たり判定が指で扱えるサイズ（最低 44px 相当）を満たす
- [ ] #5 デスクトップ幅での既存レイアウトが変化しない
- [ ] #6 TASK-131 のモバイル条件スクリーンショットで before/after を確認する
<!-- AC:END -->
