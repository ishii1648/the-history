---
id: TASK-26
title: attribution フッターを折りたたみ式にする
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 13:53'
updated_date: '2026-07-21 14:37'
labels: []
dependencies:
  - TASK-9
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-9 で実装した footer の出典・attribution 表示（historical-basemaps GPL-3.0 / ETH Zürich Roller CC BY-NC-SA 4.0 / Protomaps・OpenStreetMap ODbL / Natural Earth）は常時全文表示されており、常に画面を圧迫している。OpenStreetMap(ODbL) や CC BY-NC-SA のような attribution 表示義務があるライセンスが含まれるため完全非表示・コードコメント化はライセンス違反リスクがあり不可。代わりに小さなアイコン等を常時表示し、クリック/タップで全文を展開できる折りたたみ UI に変更し、attribution 表示義務を満たしつつ画面占有を減らす。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 未展開時は小さなアイコン（例: ⓘ）等の目印のみが常時表示され、attribution 全文は隠れている
- [ ] #2 アイコンをクリック/タップすると attribution 全文（historical-basemaps・ETH Zürich Roller・Protomaps/OSM・Natural Earth の各リンクと免責文言を含む）が展開表示される
- [ ] #3 展開状態から再度クリック/タップまたは外側クリックで折りたたまれる
- [ ] #4 折りたたみ操作がキーボード操作でも可能（アクセシビリティ、aria-expanded 等の状態が適切に反映される）
- [ ] #5 既存の TASK-9 AC1 が意図した出典情報の内容・リンクは一切欠落・改変されない
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: フッターを「常時表示の小さな ⓘ トグルボタン + 折りたたみ可能な attribution 全文パネル」に変更する。全文の内容・リンク（historical-basemaps / ETH Zürich Roller / Protomaps・OSM / Natural Earth / 免責文言）は一切変更せず、表示/非表示のみを切り替える（ライセンスの attribution 表示義務は「アイコンから 1 操作で到達可能」で担保）。
2. 実装: index.html でフッターを <button aria-expanded aria-controls> + 全文コンテナ（hidden 初期値）に再構成。app.css で未展開時はアイコンのみの小さな見た目、展開時は従来相当のパネル表示。src/main.ts に setupFooter を追加し、クリックでトグル・外側クリックで折りたたみ・aria-expanded/hidden の同期を配線（既存 setupInfoUI 等と同じ配線パターン）。ボタンは native button のため Enter/Space のキーボード操作は標準で機能し、Escape でも閉じられるようにする。
3. テスト: トグル状態遷移（toggle/closeOnOutside/escape → 次状態と aria-expanded/hidden の導出）を DOM 非依存の純粋関数 src/footer.ts に切り出し footer_test.ts で TDD。CI は権限なし deno test のため index.html を読むテストは作らない（AC#5 の内容非欠落は mainagent の目視 + diff レビューで担保）。
4. 並列化判定: 見送り（理由: index.html / app.css / main.ts / footer.ts の小規模 UI 変更で相互依存し、独立にテスト可能なサブ作業に分割できない。単一 subagent に委譲）。
5. TDD → fmt/lint/test/build 全 green → 目視確認（アイコンのみ表示・展開/折りたたみ・外側クリック・キーボード・内容非欠落）→ PR → CI → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->
