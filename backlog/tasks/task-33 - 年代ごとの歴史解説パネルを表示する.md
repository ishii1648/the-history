---
id: TASK-33
title: 年代ごとの歴史解説パネルを表示する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-21 15:10'
updated_date: '2026-07-21 17:41'
labels:
  - 'area:src-main'
  - 'area:data'
  - 'area:scripts'
dependencies:
  - TASK-6
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（教育用歴史地図を参考にしたデザイン検討より）: 各年代スナップショットに「この時代のポイント」をまとめた解説パネルを表示し、地図を見るだけでは分からない歴史的コンテキスト（主要な政治情勢・重要な出来事・勢力図の読みどころ）を提供する。参考画像では①〜④の注釈ボックスと「まとめ」ボックスが地図の理解を大きく助けている。実装方針: 解説テキストは全 20 スナップショット年代（SNAPSHOT_YEARS）ぶんを日本語で作成し、コードと分離したデータファイル（例: data/notes.json）で管理する。UI は地図の閲覧を妨げないよう折りたたみ可能なパネルとし、年代切替（タイムライン）に追従して内容を差し替える。既存 UI（右上情報パネル・左端タイムライン・右下 attribution 等）と位置が衝突しないこと。解説内容は一般的な世界史の教科書レベルの正確さを保ち、断定しづらい事項は概説に留める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 全スナップショット年代（900〜1914 の 20 年代）それぞれに日本語の解説が用意され、年代切替に追従して表示される
- [ ] #2 解説パネルは折りたたみ/展開でき、折りたたみ状態でも地図操作を妨げない
- [ ] #3 解説データはコードと分離したデータファイルで管理され、テキスト追加・修正がコード変更なしで可能
- [ ] #4 既存 UI（情報パネル・タイムライン・attribution・エラートースト）と表示位置が衝突しない
- [ ] #5 解説データのロード・整形ロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. データ形式（A/B 間の契約）: /data/notes.json = { "years": Record<年文字列, { "points": string[]（3〜5 項目・この時代のポイント）, "summary": string（まとめ 1〜2 文） }>, "source": { "description": "hand-written (教科書レベルの概説)" } }。全 20 スナップショット年をカバー。文章は一般的な世界史教科書レベルの正確さで、断定しづらい事項は概説に留める。
2. UI: 折りたたみ式パネルを画面右下（maplibre attribution の上）に配置。折りたたみ時は小さなトグルボタン（「解説」）のみ、展開時は縦スクロール可能なパネル（年代見出し + ポイント箇条書き + まとめ）。既存 UI（左端タイムライン・右上情報パネル・上中央トースト・左下 attribution アイコン・右下 attribution）と重ねない。状態遷移は footer.ts と同じ純粋 reducer パターンを src/notes.ts に実装（toggle/escape、aria-expanded/hidden 導出）。年代切替（applyFn）で内容を差し替え。notes.json ロード失敗時はトグル自体を非表示にして従来表示を維持。
3. 並列化判定（タスク内）: 並列可（独立サブ作業 2 件、worktree isolation）
   - subagent A（解説データ）: data/notes.json 新規（20 年代分の日本語解説）+ scripts/notes-json_test.ts（static import で全年代カバー・非空 points/summary・SNAPSHOT_YEARS との完全一致を検証）+ scripts/build.ts の copy 対象追加（+build_test）。担当: data/notes.json / scripts/notes-json_test.ts / scripts/build.ts / scripts/build_test.ts
   - subagent B（UI）: src/notes.ts / notes_test.ts（reducer・年代 lookup・不正形耐性）、src/main.ts（ロード・配線・年代追従）、index.html / app.css（パネル DOM とスタイル）。スタブデータでテストし A の中身に依存しない。担当: src/* / index.html / app.css
   - 契約: 上記 1 の JSON 形式。担当ファイルは互いに素
4. TDD（両者 red→green）→ mainagent 統合レビュー → fmt/lint/test/build green → 目視確認（各 UI 位置の非干渉・折りたたみ/展開・年代追従・内容の妥当性抜き取り）→ PR → CI → finalization → マージ
<!-- SECTION:PLAN:END -->
