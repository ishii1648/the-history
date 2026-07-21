---
id: TASK-25
title: タイムラインスライダーを縦向きにして画面左端に配置する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 13:40'
updated_date: '2026-07-21 14:14'
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: index.html の #timeline を画面左端の縦レイアウトに変更する。input[type=range] の縦向き化は CSS の writing-mode: vertical-lr（+ 必要に応じ direction）を基本とし、年代の並びは上=古い（900）→下=新しい（1914）とする。年表示は上部、前後ボタンは上下端（上=前の年代/下=次の年代）、目盛りは縦に沿わせる。
2. レイアウト干渉: 情報パネル（左上）と重ならないよう配置を調整する（スライダーを左端の垂直中央帯に収める・情報パネルを右上へ移す等、実装時に見た目で判断）。フッター（左下）とも重ねない。狭幅・低さの画面では max-height と overflow を考慮。
3. キーボード: ←→ は従来どおり維持しつつ、縦向きに合わせ ↑↓ でも年代移動できるよう timeline.ts の keyToStep を拡張する（上=古い方向）。スライダー自身のフォーカス時は native の挙動（input イベント）に委ねる既存の二重発火防止を維持。
4. ロジック不変: index/step 計算・URL 同期・競合ガード（timeline.ts / url_state.ts / powers.ts）は変更しない（keyToStep の拡張のみ）。
5. 並列化判定: 見送り（理由: 変更は index.html / app.css / src/main.ts setupTimeline / src/timeline.ts の UI レイアウト一式で相互依存が強く、独立にテスト・検証可能なサブ作業に分割できない。単一 subagent に委譲）。
6. TDD: timeline_test.ts（keyToStep の ↑↓ 拡張）を先行（red）→ 実装 → green → fmt/lint/test/build 全 green → 目視確認（縦スライダー表示・ドラッグ/クリック/キー操作・重なりなし）→ PR → CI → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->
