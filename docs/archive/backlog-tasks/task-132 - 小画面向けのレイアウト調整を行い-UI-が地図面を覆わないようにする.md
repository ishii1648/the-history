---
id: TASK-132
title: 小画面向けのレイアウト調整を行い UI が地図面を覆わないようにする
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:43'
updated_date: '2026-07-29 17:14'
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
- [x] #1 小画面向けのブレークポイントが定義され、幅 375px でも地図の可視領域が画面の大半を占める
- [x] #2 縦タイムラインが小画面で操作可能なまま地図を過度に覆わない配置になる
- [x] #3 情報パネル・解説パネル・既知の制限・attribution が小画面で互いに重ならない
- [x] #4 タップ操作の当たり判定が指で扱えるサイズ（最低 44px 相当）を満たす
- [x] #5 デスクトップ幅での既存レイアウトが変化しない
- [x] #6 TASK-131 のモバイル条件スクリーンショットで before/after を確認する
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- @media (max-width: 480px) を app.css 末尾に追加（+169 行、既存 CSS 変更なし）。閾値根拠: 縦タイムライン右端 x≈108 + 情報パネル 320+16px の横分離に ≈460px 必要 → 480px で主要スマホ論理幅（320〜430）を包含
- タイムライン: 左端の縦帯 92x531（画面高 65% 占有）→ 下端の横帯 359x62（writing-mode 横書き・左=古い、ボタン/入力 44px）。トグル行（ⓘ・⚠・解説）44px 横並び、attribution は展開状態基準で専用帯、情報/解説パネルは max-height 38dvh で同時表示でも非重複（H>=542px で保証）
- AC#3/#4: mobile-smoke の重なり・当たり判定検査を報告のみ → 失敗条件へ昇格（TDD red → green）。重なり before 4 件（timeline×info 786px² / attrib×ⓘ 624 / attrib×⚠ 364 / attrib×解説 1120）→ after 0 件。<44px 7 件 → 0 件
- AC#5: 変更は @media 内に閉じ、デスクトップ verify:smoke PASS で非退行確認
- AC#6: before/after + 開閉状態のスクリーンショット 8 枚（mainagent も after-mobile-smoke を目視）
- index.html / JS 変更なし。1499 → main 取り込み後 1505 passed（mainagent 独立検証）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
小画面（<=480px）向けブレークポイントを追加。縦タイムラインを下端の横帯化、トグル 44px 化、attribution 帯確保、パネル 38dvh 上限で、重なり 4 件 → 0 件・当たり判定 <44px 7 件 → 0 件を mobile-smoke の失敗条件として固定。デスクトップは構造的に不変。1505 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
