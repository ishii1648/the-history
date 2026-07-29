---
id: TASK-132
title: 小画面向けのレイアウト調整を行い UI が地図面を覆わないようにする
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 16:43'
updated_date: '2026-07-29 16:55'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TASK-131 の申し送り（情報パネル × タイムライン交差・タイムラインが画面高 65% 占有・下端 attribution 折り返しとトグル被り）を起点に app.css の現状を読む
2. 小画面ブレークポイント（例: max-width 480px）を設計。タイムラインの縮小/配置調整・情報パネルの幅と位置・下端要素の整理。当たり判定 44px 以上（AC#4）
3. 実装は app.css（+必要なら index.html の構造微調整）。デスクトップ幅の既存レイアウト不変（AC#5）
4. verify:smoke:mobile と TASK-131 のスクリーンショットで before/after 確認（AC#6、ポート 8132）。重なり計測（AC#3）とデスクトップ smoke 非退行
5. deno fmt --check / lint / test / build green

並列化判定: 見送り（理由: app.css 中心の一体的なレイアウト調整）
<!-- SECTION:PLAN:END -->
