---
id: TASK-40
title: 情報パネル・タイムラインを羊皮紙/古地図風デザインに作り込む
status: Done
assignee:
  - '@claude'
created_date: '2026-07-22 14:12'
updated_date: '2026-07-23 14:24'
labels: []
dependencies:
  - TASK-25
  - TASK-7
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望: 情報パネル（勢力/河川/都市クリック時の表示、TASK-7）・タイムライン（縦向きスライダー、TASK-25）の見た目を「歴史地図らしい」羊皮紙・古地図風のビジュアルに作り込む。デザイン方向性（ユーザー確定）: クリーム色地 + 焦茶の装飾枠（角に小さな渦巻き装飾）+ セリフ体見出しの情報パネル、木目調/皮革調の縦帯 + アンティーク調の目盛りのタイムライン。実装にあたり frontend-design@claude-plugins-official プラグイン（Claude Code plugin marketplace 経由）をインストールし、デザイン作業の支援に活用すること（`/plugin marketplace add` 等でのインストール手順・実際に使えるか・使い方は実装時に調査する）。対象は CSS（index.html/app.css 等）のスタイリング変更が中心で、情報パネル・タイムラインの DOM 構造・データロジック（src/main.ts, src/timeline.ts, src/info.ts）は変更しない前提。既存の機能（河川優先表示 TASK-29、HRE 範囲強調 TASK-30、ラベル視認性改善 TASK-38 等）との整合を保つこと。地図本体のスタイル（ベースマップ・勢力ポリゴン色・ラベル）は本タスクのスコープ外（TASK-38 等の別タスクで扱う）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 frontend-design@claude-plugins-official プラグインがインストールされ、デザイン作業に活用されている（活用できなかった場合はその理由が final summary に記録されている）
- [x] #2 情報パネルがクリーム色地・焦茶の装飾枠（角の渦巻き装飾）・セリフ体見出しのデザインに変更されている
- [x] #3 タイムラインが木目調/皮革調の縦帯・アンティーク調の目盛りのデザインに変更されている
- [x] #4 既存の機能（勢力/河川/都市のツールチップ切り替え、年代スライダーの操作性、キーボード操作）に退行がない
- [x] #5 小さい画面幅でも情報パネル・タイムラインが他の UI（attribution・解説パネル・エラートースト）と衝突しない
- [x] #6 変更前後のスクリーンショットで視認性・デザイン意図が確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. frontend-design プラグイン活用（AC#1）: claude plugin install frontend-design@claude-plugins-official を実行しインストール済み（user scope）。プラグイン skill はセッション再起動なしでは harness にロードされないため、skill 本文（~/.claude/plugins/cache/claude-plugins-official/frontend-design/unknown/skills/frontend-design/SKILL.md）を実装 subagent に読ませてデザイン指針として活用する（活用形態を final summary に記録）。
2. 実装（AC#2/#3）: CSS 中心（app.css / index.html）。情報パネル = クリーム色地 + 焦茶の装飾枠 + 角の渦巻き装飾（CSS 疑似要素 or インライン SVG）+ セリフ体見出し。タイムライン = 木目調/皮革調の縦帯（CSS グラデーションで表現、外部画像不使用）+ アンティーク調目盛り。DOM 構造・データロジック（src/*.ts）は変更しない。解説パネル・ツールチップ・エラートースト等の隣接 UI との調和も配慮。
3. TDD 適用判定: 対象が純 CSS のためユニットテスト対象の純ロジックは発生しない見込み（発生した場合のみテスト先行）。検証はスクリーンショット比較（AC#6）と既存 deno test の回帰（AC#4 の DOM/ロジック不変の担保）で行う。
4. 実機確認: 前後スクリーンショット取得（AC#6）、クリック/ツールチップ/スライダー操作/キーボード操作の回帰確認（AC#4）、ウィンドウ幅を狭めた衝突確認（AC#5）。
5. 並列化判定: 見送り（理由: 変更が app.css 1 ファイルに集中し、情報パネルとタイムラインを分担すると同一ファイルの conflict が必至。単一 subagent に委譲し、実機確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（実機, Chrome, task-40 ビルド :8004, 2026-07-23）:
- AC#1: claude plugin install frontend-design@claude-plugins-official でインストール成功（user scope）。プラグイン skill はセッション再起動なしでは harness にロードされないため、skill 本文（SKILL.md）を実装 subagent が Read しデザインプロセス（トークン設計 → 自己批評 → 実装）に適用する形で活用（二段構えのパレット設計・装飾の抑制判断に反映）。
- AC#2: 情報パネル = クリーム地(#f4ecd7) + 焦茶二重枠 + 対角 2 隅のインク渦巻き装飾（インライン SVG data URI・自己完結）+ セリフ体（Georgia/明朝系スタック）。拡大スクリーンショットで確認。
- AC#3: タイムライン = 皮革/木目調の縦帯（repeating-linear-gradient で質感表現）+ 真鍮色の目盛り・つまみ + セリフ体年号（真鍮色 + text-shadow）。スクリーンショットで確認。
- AC#4: 勢力クリック → パネル/ツールチップ表示（ポーランド・リトアニア）、スライダーのキーボード操作（ArrowDown で 1500→1530、URL 同期）を実機確認。src/*.ts 無変更のため deno test 478 passed が回帰担保。
- AC#5: ウィンドウ 500x900 に実リサイズし、タイムライン・情報パネル・attribution・解説ボタンが衝突なく共存することをスクリーンショット確認。
- AC#6: before（:8002=旧 main）/ after（:8004）のスクリーンショットで羊皮紙デザインへの変更を確認。
- ゲート: deno fmt/lint/test（478 passed）/build 全 green。変更は app.css のみ。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
情報パネル・タイムラインを羊皮紙/古地図風デザインへ変更（app.css のみ、DOM/ロジック不変）。共通トークン（羊皮紙クリーム・焦茶インク・真鍮・封蝋レッド + セリフ体スタック）を CSS 変数で定義し、情報パネルはクリーム地 + 焦茶装飾枠 + 対角の渦巻き装飾（インライン SVG）+ セリフ体見出し、タイムラインは皮革/木目調縦帯 + 真鍮目盛りに。隣接 UI（ツールチップ・解説・トースト・スピナー）も同系色調へ最小調整。frontend-design プラグインを CLI でインストールし skill 本文をデザイン指針として活用。検証: 実機（クリック/キーボード回帰・500px 幅衝突なし・前後スクリーンショット）+ deno test 478 passed + CI。
<!-- SECTION:FINAL_SUMMARY:END -->
