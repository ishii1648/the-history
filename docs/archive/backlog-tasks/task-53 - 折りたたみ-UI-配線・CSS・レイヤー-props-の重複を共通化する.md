---
id: TASK-53
title: 折りたたみ UI 配線・CSS・レイヤー props の重複を共通化する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 12:20'
updated_date: '2026-07-24 14:52'
labels:
  - bug
dependencies: []
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
/code-review の CONFIRMED 指摘 #4/#6/#7/#8 をまとめた改善タスク。(a) src/main.ts: setupKnownLimitationsUI が setupFooter と同型の配線（createFooterState/render/dispatch・toggle click・外側 click・Escape）を複製 → 共通ファクトリ（例: wireCollapsiblePanel）へ統合。(b) app.css: .known-limitations-toggle/-content が .footer-toggle/-content とほぼ同一 → 共通クラス（例: .corner-toggle-btn / .popover-card）へ統合（.notes 系は形状が異なり対象外）。(c) src/main.ts: buildRiversLineLayer / buildRiversHitLayer の共通 GeoJsonLayer props 6 個 → 共通 base props のスプレッドへ。(d) applyHreHighlight/applyRiverSelection/applyRiverHover の同値ガード三重複製 → setter コールバック式ヘルパーへの統合を検討（効果が薄ければ (d) は見送り可、判断を記録）。既存挙動の完全維持が前提（リファクタのみ、deno test green + 実機スモーク）。発見契機: /code-review。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 (a)(b)(c) の重複が共通化され、既存テスト全 green・UI/picking の挙動に退行がない
- [x] #2 (d) の採否と理由が記録されている
- [x] #3 実機スモーク（折りたたみ 2 種・河川クリック/ホバー）で退行がない
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 調査結果: 重複は (a) setupFooter/setupKnownLimitationsUI の配線（createFooterState/render/dispatch・toggle click・外側 click・Escape が同型）、(b) app.css の .footer-toggle/-content と .known-limitations-toggle/-content（円形トグル・羊皮紙ポップオーバーがほぼ同一。差分は font-size/padding と [hidden] 規則のみ）、(c) buildRiversLineLayer/buildRiversHitLayer の共通 GeoJsonLayer props 6 個（data/pickable/stroked/filled/lineWidthUnits/lineCapRounded/lineJointRounded）、(d) apply* 3 関数の同値ガード。
2. (a) 新モジュール src/collapsible.ts に wireCollapsiblePanel を実装。要素は最小インターフェース（setAttribute/hidden/addEventListener/contains）で受け、fake 要素によるユニットテストを先に書く（TDD: red→green）。setupFooter/setupKnownLimitationsUI は同関数の呼び出し + 各自の固有処理（revealKnownLimitations 差し込み等）に縮退。
3. (b) 共通クラス .corner-toggle-btn / .popover-card を導入し index.html の該当要素に付与。固有差分（font-size・padding・[hidden] 規則・位置）は既存クラスに残す。
4. (c) 共通 base props 定数を定義し両 build 関数でスプレッド展開。挙動不変（updateTriggers 等の固有 props は各関数に残す）。
5. (d) 採否判定: 3 関数は各 4 行で、ヘルパー化には getter/setter クロージャの導入が必要になり可読性がむしろ下がるため見送り予定。判断と理由を Implementation Notes に記録（AC #2）。
6. 並列化判定: 見送り（理由: (a)(c)(d) が全て src/main.ts に集中し、(b) も (a) の markup 変更と index.html/app.css で結合するため、サブ作業間でファイル競合し独立テスト可能な分割ができない）。実装は単一 subagent（worktree isolation）に委譲し mainagent がレビュー。
7. deno fmt/lint/test/build green → 実機スモーク（折りたたみ 2 種・河川クリック/ホバー）→ PR 作成（TASK-53 明記）→ CI green → finalization → マージ。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（引き継ぎセッション, 2026-07-25）:
- 前セッションが (a) wireCollapsiblePanel（src/collapsible.ts、TDD）(b) .corner-toggle-btn/.popover-card 共通クラス (c) rivers 共通 base props スプレッド を実装済み（PR #63）。本セッションで BEHIND を解消（origin/main を取り込み。TASK-50 メモ化・TASK-52 年代連動と conflict なしで共存、統合をレビュー確認）。
- AC#1: deno test 544 passed・fmt/lint/build green・CI green（マージ後再確認済み）。
- AC#2: (d) apply* 3 関数のヘルパー化は見送り（各 4 行に対し getter/setter クロージャ導入で可読性が下がるため — プラン手順 5 に記録済み）。
- AC#3: ヘッドレス CDP（scripts/verify、TASK-58 導入の標準ハーネス）で実機スモーク PASS — 年代切替・河川クリック（ライン川表示）・エラートースト不在、および折りたたみ（既知の制限パネル開閉 + 年代バッジ 900/1600/1800 切替 = TASK-52 回帰チェック）を確認。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
折りたたみ UI 配線（wireCollapsiblePanel へ統合）・CSS（.corner-toggle-btn/.popover-card 共通クラス）・rivers レイヤー共通 props（base props スプレッド）の 3 重複を共通化（/code-review 指摘 #4/#6/#7）。(d) apply* 同値ガードの統合は可読性低下のため見送りと記録（指摘 #8）。前セッションの実装を引き継ぎ、BEHIND 解消（TASK-50/52 との統合確認込み）・ヘッドレススモークと折りたたみ回帰 PASS・544 tests・CI green で完了。
<!-- SECTION:FINAL_SUMMARY:END -->
