---
id: TASK-144
title: main.ts のデバッグフック 15 件を src/debug_hooks.ts へ抽出する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-29 15:56'
updated_date: '2026-07-29 17:19'
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
- [ ] #1 対象関数が src/main.ts から新モジュールへ移動し、main.ts 側は注入・配線のみになっている
- [ ] #2 挙動不変: deno task test green + ヘッドレス CDP での動作確認（年代切替・picking・該当機能）
- [ ] #3 抽出した単位にユニットテストが付与されている（テスト先行）
- [ ] #4 デバッグフック名が 1 つも変わっていない（scripts/verify の既存チェックが無変更で PASS）
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
