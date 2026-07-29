---
id: TASK-144
title: main.ts のデバッグフック 15 件を src/debug_hooks.ts へ抽出する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-29 15:56'
updated_date: '2026-07-29 17:34'
labels:
  - 'area:src-main'
  - 'area:src-debug'
dependencies: []
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decision-29 / docs/main-ts-inventory.md の U1（順序 1）。__setYear / __get*Debug / __probePick 等 15 件（約 470 行）を installDebugHooks(deps) ファクトリへ移す。読み取り専用でリスク最小。フック名はヘッドレス検証（scripts/verify）の契約なので変更しない。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [x] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [x] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [x] #4 デバッグフック名が 1 つも変わっていない（scripts/verify の既存チェックが無変更で PASS）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. docs/main-ts-inventory.md の U1（デバッグフック 15 件・約 470 行・行範囲 3132〜3569 相当）と decision-29 を読む
2. TDD red: installDebugHooks(deps) ファクトリの契約テスト（フック名の完全一致・deps 注入）を先に書く
3. src/debug_hooks.ts へ抽出。フック名は 1 つも変えない（scripts/verify の既存チェックが無変更で PASS = AC#4 の証明）
4. CDP でヘッドレス検証チェーン（smoke / mobile-smoke 等）が無変更で PASS することを確認（ポート 8144）
5. deno fmt --check / lint / test / build green

並列化判定: 見送り（理由: 単一モジュール抽出で分割単位なし）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- installDebugHooks(deps, target=globalThis) ファクトリへ 15 フックを抽出（__setYear / __getYear / __get*Debug 12 件 / __probePick / __getCityScreenPositions）。DEBUG_HOOK_NAMES 配列で名前契約をテスト固定
- deps 設計（decision-29 準拠・module-scope 可変状態なし）: 状態 getter 群 / インスタンス能力（map.project 等の構造的型で最小注入）/ main の解決関数 / メモ化インスタンス 9 件。メモ化を import ではなく注入にするのは builder と同一キャッシュを共有しフック呼び出しが polylabel 再計算・フォントアトラス再生成を誘発しないため（TASK-50/136 の参照同値契約）
- AC#2/#4: scripts/verify 無変更で verify:smoke / verify:smoke:mobile PASS。全 15 フックの evaluate 直叩きで抽出前と同形の値（__probePick の hover/click 解決含む）を確認
- AC#3: debug_hooks_test.ts 14 テスト（red: モジュール不在 14 エラー → green）
- main.ts 3,593 → 3,178 行（-415）。deno check の既存 TS エラー 6 件は HEAD と同一で増減なし
- 1548 → main 取り込み後 1556 passed（mainagent 独立検証）・fmt / lint / build green
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
デバッグフック 15 件を installDebugHooks(deps) ファクトリとして src/debug_hooks.ts へ抽出（decision-29 シリーズ 1/7）。フック名不変を DEBUG_HOOK_NAMES とテストで固定し、scripts/verify 無変更で smoke / mobile 両 PASS。メモ化は同一インスタンス注入で参照同値契約を維持。main.ts -415 行、1556 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
