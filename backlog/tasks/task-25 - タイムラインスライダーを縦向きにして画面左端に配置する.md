---
id: TASK-25
title: タイムラインスライダーを縦向きにして画面左端に配置する
status: To Do
assignee: []
created_date: '2026-07-21 13:40'
labels: []
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（agent-loop 実行中の報告）: 現在画面下部中央に横向きで表示されているタイムラインスライダー（年代選択 UI）を、縦向きにして画面左端に配置したい。

実装の手がかり: 対象は index.html の #timeline（year 表示・input[type=range]・datalist 目盛り・前後ボタン）と app.css のレイアウト、src/main.ts の setupTimeline。input[type=range] の縦向き化は CSS の writing-mode: vertical-lr（新標準）を基本に、必要なら appearance 系の調整を併用する。縦向き時の年代の並び方向（上=古い/新しい）は歴史地図の慣習として上=古い年代（900）→下=新しい年代（1914）が自然だが、実装時に見た目で判断して良い。キーボード操作（←→ に加え ↑↓）、目盛りラベル、前後ボタンの配置、モバイル・狭幅画面での重なり（情報パネル・フッターとの干渉）も考慮すること。既存のタイムラインのロジック（timeline.ts の index/step 計算、URL 同期、競合ガード）は変更不要の見込み。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 タイムラインスライダーが縦向きで画面左端に表示され、ドラッグ・目盛りクリックで年代を選択できる
- [ ] #2 年代表示・前後ボタン・目盛りが縦レイアウトで操作しやすく配置され、地図・情報パネル・フッターと重ならない
- [ ] #3 キーボード操作（矢印キー）で従来どおり年代を移動できる
- [ ] #4 既存の年代切替ロジック・URL 同期のテストが引き続き green（deno test 全 green）
<!-- AC:END -->
