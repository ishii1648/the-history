---
id: TASK-53
title: 折りたたみ UI 配線・CSS・レイヤー props の重複を共通化する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-24 12:20'
updated_date: '2026-07-24 14:35'
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
- [ ] #1 (a)(b)(c) の重複が共通化され、既存テスト全 green・UI/picking の挙動に退行がない
- [ ] #2 (d) の採否と理由が記録されている
- [ ] #3 実機スモーク（折りたたみ 2 種・河川クリック/ホバー）で退行がない
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
