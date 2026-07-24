---
id: decision-11
title: 動作確認はヘッドレス Chrome + CDP を標準とし claude-in-chrome は最終手段とする
date: '2026-07-24 14:46'
status: accepted
---
## Context

agent-loop のマージ後動作確認は claude-in-chrome 拡張で行っていたが、(1) ツール呼び出し毎の権限確認で HITL が頻発し自律ループが停止する、(2) 地図の描画（rAF）が可視ウィンドウに依存し、ウィンドウが隠れると検証がブロックされる、(3) クリック精度が ±5px 程度で小さな UI 要素（都市ドット等）を狙えない、という 3 つの構造的制約があった（TASK-58）。

## Decision

動作確認の標準を「ヘッドレス Chrome（--headless=new・実 GPU）+ CDP ハーネス（scripts/verify/cdp.ts）」とする。任意 JS 評価・1px 精度の入力・スクリーンショットを無人で実行でき、権限は .claude/settings.json の最小 Bash 許可（deno task verify:* / deno run -A scripts/verify/*）のみで賄う。mcp__claude-in-chrome__* の包括許可は行わず、拡張はユーザーの実体感確認が本質的に必要な場合の最終手段に限定する。

## Consequences

- 自律ループの動作確認フェーズから HITL・可視ウィンドウ依存・クリック精度の制約が除去される。
- 検証スクリプトは scripts/verify/checks/ に蓄積でき、回帰スモークとして再利用可能。
- ヘッドレス実行の注意（visibilityState 非依存・--disable-gpu 禁止・__getYear の初期化レース）は development-style.md 4.3.1 章に明文化。
- 関連タスク: TASK-36, TASK-50, TASK-57, TASK-58
