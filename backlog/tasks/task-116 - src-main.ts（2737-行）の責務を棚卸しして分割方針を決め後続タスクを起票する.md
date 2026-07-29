---
id: TASK-116
title: src/main.ts（2737 行）の責務を棚卸しして分割方針を決め後続タスクを起票する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 14:14'
updated_date: '2026-07-29 15:57'
labels:
  - 'area:src-main'
  - 'area:docs'
dependencies: []
ordinal: 109000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

`src/main.ts` は 2737 行あり `src/` 配下で突出して大きい（次点は `src/powers.ts` 583 行）。
`src/` は既に 25 モジュールへ分割済みで main.ts は配線・統合層だが、UI 系タスクの大半が
ここに触るため `docs/development-style.md` 4.2 章では `area:src-main` を持つタスク同士を
常に衝突扱いとしている。

## 注意: 本タスクは並列度の改善を主目的としない

調査（`.outputs/claude/agent-loop-parallelism-investigation.md`）の反実仮想シミュレーションでは、
UI タスクが一切衝突しなくなる最良ケースを仮定しても並列成立は 6/32（19%）→ 8/32（25%）に
とどまり、`area:scripts` / `area:data` のラベル細分化（+5、リファクタ不要）より効果が小さい。
さらに main.ts は配線層であり、新レイヤーを足せば必ず配線に触るため、分割しても衝突は残る。
分割作業自体も巨大な `area:src-main` タスクとして実行中の全 UI タスクをブロックする。

したがって本タスクは**並列度ではなく保守性**（2737 行の統合層のテスト容易性・可読性）を
理由に行う。

## 進め方

2737 行を 1 つの PR で分割するとレビュー不能になるため、本タスクでは責務の棚卸しと
分割方針の決定・後続タスクの起票までを行い、実際の分割は後続タスクで段階的に進める
（TASK-103 → TASK-104〜107 と同じ進め方）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 src/main.ts の責務が分類され、抽出候補のモジュール単位と各単位の概算行数が docs にまとめられている
- [x] #2 分割後も main.ts に残す配線責務の範囲が定義されている
- [x] #3 分割方針が backlog decision として記録されている
- [x] #4 抽出候補ごとに後続タスクが起票され、それぞれに area ラベルが付与されている
- [x] #5 本タスクでは src/main.ts の実コードを変更していない（方針決定と起票のみ）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/main.ts（2737 行）を通読し、責務を分類（配線/状態管理/レイヤー構築/イベント処理/デバッグフック等）
2. 抽出候補のモジュール単位・概算行数・依存関係を docs/main-ts-inventory.md（または data-inventory 同様の適所）にまとめる（AC#1）
3. main.ts に残す配線責務の範囲を定義（AC#2）
4. 分割方針は mainagent が backlog decision として記録、抽出候補ごとの後続タスク起票も mainagent が行う（AC#3/#4。subagent は起票案を報告に含める）
5. 実コードは変更しない（AC#5）。deno test green を確認

並列化判定: 見送り（理由: 単一ファイルの通読・分類作業で分割単位が無い）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）

- 実測は 3,569 行（起票時 2,737 行から約 830 行増加）。30 責務ブロックに分類し docs/main-ts-inventory.md に行範囲付きで記録（AC#1）
- 抽出候補 7 単位（U1〜U7、計約 2,980 行）。main.ts に残す配線責務は同 docs §3 で定義（renderLayers・yearSwitcher・起動シーケンス・状態所有、AC#2）
- 分割方針は decision-29 に記録（状態所有を main に残す純関数 + 依存注入ファクトリ、リスク昇順の 7 段階。却下案 3 件付き、AC#3）
- 後続タスク TASK-144〜150 を起票（全て area:src-main + 抽出先を示す第 2 ラベル。TASK-148 は TASK-147 に依存、AC#4）
- src/*.ts は無変更（パッチは docs 1 ファイルのみ、AC#5）。fmt / lint / test（1458 passed）green
- 補足: タスク本文が参照する .outputs/claude/agent-loop-parallelism-investigation.md は現存せず、並列度の前提はタスク本文の記述に依拠した
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
src/main.ts（実測 3,569 行）を 30 責務に棚卸しして docs/main-ts-inventory.md に記録。分割方針（状態所有は main 残置・純関数 + 依存注入ファクトリ・7 段階）を decision-29 に記録し、後続タスク TASK-144〜150 を area ラベル付きで起票。実コードは無変更。
<!-- SECTION:FINAL_SUMMARY:END -->
