---
id: TASK-46
title: データの既知の制限（表示できない情報）をUIに明記する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-23 13:45'
updated_date: '2026-07-24 11:47'
labels: []
dependencies:
  - TASK-26
  - TASK-37
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
背景: TASK-37 の調査で「900〜1492 年は HRE 内部の領邦を表示できない（唯一年代×粒度を満たす Euratlas Periodis Provinces は商用ライセンスで再配布不可、OpenHistoricalMap の HRE プロジェクトは未成熟のため採用データなし、現状維持が妥当）」という結論に至った。このような『データソースの限界により一部の情報が表示できない』事実は、ユーザーが地図の空白・簡略化を見て誤解しないよう UI 上に明記すべきだが、常時大きく表示すると画面を圧迫する。ユーザー要望: attribution フッター（TASK-26 で折りたたみ式に変更済み）と同様に、通常時は畳み込んでおき、必要な人だけクリック/タップで展開して読める形にする。実装方針: 既知の制限事項をデータ（コードから分離した一覧、例: data/known-limitations.json 等）として持ち、TASK-26 の折りたたみ UI パターン（アイコン + 展開/格納）を流用または統合する。年代に依存する制限（例: 1500 年以前は HRE 領邦なし）は現在の年代に応じて関連する制限のみ強調する等の工夫は任意（最低限は全件を一覧表示できれば良い）。今後 TASK-39（イングランド一括り表示）等の調査で同様の制限事項が判明した場合も、コード変更なしでデータ追加のみで対応できる構造にする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 「1500 年以前は神聖ローマ帝国内部の領邦データが存在せず単一ポリゴン表示になる」という制限事項が UI 上で確認できる
- [x] #2 制限事項の表示は通常時は折りたたまれており、attribution（TASK-26）と同様の操作性（クリック/タップで展開、キーボード操作対応）で表示できる
- [x] #3 制限事項一覧はコードと分離したデータで管理され、今後の制限事項追加がコード変更なしで可能
- [x] #4 既存の UI（attribution・解説パネル TASK-33・エラートースト・情報パネル）と表示位置が衝突しない
- [x] #5 追加したロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. データ設計（AC#3）: data/known-limitations.json を新設（例: [{ id, years?: {from,to}, text }]）。初期内容は TASK-37 の結論（1500 年以前の HRE 領邦は単一ポリゴン表示 — データソースの限界）と TASK-39 の結論（1530〜1700 の「イングランド・アイルランド」一括り表示・ウェールズ非分離は上流データの限界）の 2〜3 件。追加はデータ編集のみで可能な構造。
2. TDD（red 先行）: 読込・整形の純ロジック（JSON パース/バリデーション、年代フィルタは任意実装）を src/known_limitations.ts として切り出しテスト先行（AC#5）。
3. UI（AC#1/#2/#4）: TASK-26 の折りたたみ attribution と同様の操作性（アイコンボタン + クリック/キーボードで展開/格納、aria 属性）で制限一覧パネルを追加。配置は既存 UI（attribution・解説・情報パネル・トースト）と衝突しない位置（attribution 付近）。TASK-40 の羊皮紙トーンに合わせたスタイル。
4. 品質ゲート + 実機確認: deno fmt/lint/test/build green、実機で展開/格納・狭幅衝突なしを確認。
5. 並列化判定: 見送り（理由: データ・ロジック・UI が 1 機能として密結合した小規模実装。単一 subagent 委譲・実機確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（実機, :8007 = task-46 ビルド, 2026-07-24）:
- AC#1: 展開パネルに「1500 年以前は HRE 領邦データが存在せず単一領域表示」（+ TASK-39 由来のイングランド・アイルランド制限）の 2 件が表示されることをスクリーンショット確認。
- AC#2: 通常時は ⚠ アイコンのみ、クリックで展開/格納（aria-expanded false→true→false の遷移を DOM 検証）。footer.ts の既存トグル機構（TASK-26 と同一パターン）を再利用しており Escape/外側クリックも同挙動。
- AC#3: data/known-limitations.json（id/years/text スキーマ、years 省略で常時表示）。追加はデータ編集のみ。壊れたデータは該当エントリのみ警告付きで除外する部分受容パース。
- AC#4: 左下（attribution の直上）に配置し、タイムライン・attribution・解説パネル・情報パネル・トーストと干渉しないことをスクリーンショット確認。
- AC#5: parseKnownLimitations / isKnownLimitationActiveForYear の 10 テストを TDD（red: TS2307 → green）で追加、deno test 506 passed。fmt/lint/build green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
データソースの既知の制限を UI に明記。data/known-limitations.json（コード変更なしで追記可能）+ src/known_limitations.ts（部分受容パース・年代判定、テスト 10 件）+ 折りたたみパネル（⚠ アイコン、TASK-26 のトグル機構を再利用、羊皮紙トーン、attribution 直上配置）。初期データは TASK-37/39 の調査結論 2 件。検証: TDD red→green（506 passed）・実機で展開表示/アクセシビリティ/配置干渉なしを確認・CI green。
<!-- SECTION:FINAL_SUMMARY:END -->
