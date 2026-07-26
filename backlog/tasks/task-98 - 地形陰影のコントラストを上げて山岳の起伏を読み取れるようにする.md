---
id: TASK-98
title: 地形陰影のコントラストを上げて山岳の起伏を読み取れるようにする
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 16:59'
updated_date: '2026-07-26 19:27'
labels:
  - 'area:src-basemap'
  - 'area:src-main'
dependencies:
  - TASK-92
ordinal: 91000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

地形陰影（hillshade、TASK-34）が弱く、山岳の起伏が読み取りづらい（ユーザー報告）。
調査の詳細は `.outputs/claude/mountain-display-survey.md`。

## 原因（調査済み）

1. **hillshade の上に政治ポリゴンが乗る**。レイヤーの重ね順は
   `earth → landcover → hillshade → water-inland → 政治ポリゴン → water → coastline`
   で、政治ポリゴンは `beforeId = water` によりこの位置へ入る（TASK-77 / TASK-84）。
   陸上では常に alpha 128（50%）の塗りが陰影に被さるため、コントラストが半減する。
   TASK-92 で扱う二重塗りの箇所では 3 枚重なってさらに沈む。
2. **paint 値が意図的に控えめ**。`src/basemap.ts` の `HILLSHADE_LAYER` は
   `exaggeration 0.4` / shadow `rgba(80,70,60,0.35)` / highlight
   `rgba(255,255,255,0.25)` / accent `rgba(80,70,60,0.15)` で、コメントに
   「勢力ポリゴン（alpha 0.5 相当の塗り）やラベルの判読を妨げない強さにする」と
   明記されている。現状は設計どおりの見え方であり、強くするなら政治ポリゴンの
   判読性とのトレードオフをどこで折り合わせるかの判断が要る。

## 前提

TASK-92（諸侯領オーバーレイと base 勢力の二重塗り）の解消で下地が 1 枚減り、
それだけでコントラストが上がる。本タスクはその後に着手して、二重塗りが解消された
状態を基準に調整する。

## 方針の候補（実装時に判断）

1. **paint 値の調整のみ**（最小）。`exaggeration` と shadow の alpha を上げる。
   政治ポリゴンの色・ラベルの判読性が損なわれない範囲を実機で確かめて決める。
2. **hillshade を政治ポリゴンの上へ移す**。山岳が政治色に沈まなくなるが、
   TASK-77 / TASK-84 で慎重に決めた重ね順（海へのはみ出しを海洋 water で隠す・
   内水面を政治ポリゴンの下に置く・海岸線を最前面に保つ）を触るため、沿岸と
   水面の見え方を再検証する必要がある。
3. 標高段彩（hypsometric tint）は MapLibre GL JS の `color-relief` が v5 の機能で、
   本プロジェクトは v4.7.1（`deno.json`）のため見送り。採用するなら
   メジャーアップグレードか事前生成の段彩ラスタが別途必要。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 アルプス・ピレネー・カルパティアの起伏が、政治ポリゴンの塗りの上からでも判別できる
- [x] #2 政治ポリゴンの勢力ごとの色分けが従来どおり判別でき、陰影で色が沈まない
- [x] #3 地図上のラベル（勢力名・都市名・河川名）の判読性が従来から落ちない
- [x] #4 海面に陰影がかからず、沿岸・内水面・海岸線の見え方が従来から変わらない（重ね順を変更する場合は特に確認する）
- [x] #5 ベースマップのレイヤー順・重ね順を検証する既存テストが green
- [x] #6 deno test が green
- [x] #7 実機でアルプス周辺を複数のズーム段（広域・拡大）で目視確認し、起伏が読み取れることを確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針比較（実装冒頭で確定・根拠記録）: まず候補 1（paint 値調整のみ = exaggeration / shadow alpha の引き上げ）を実機の見た目で評価し、政治ポリゴン・ラベル判読性（AC#2/#3、TASK-93 のコントラスト基準）と両立する上限を探る。不足なら候補 2（hillshade を政治ポリゴンの上へ）を検討するが、decision-15 の重ね順（TASK-77/84 の海洋・内水面・coastline）への影響が大きいため、採る場合は沿岸・水面の再検証（AC#4）とテスト更新をセットにする。候補 3（段彩）は MapLibre v5 依存のため見送り。
2. TDD: paint 定数・レイヤー順の検証テストを先に固定（AC#5）。
3. CDP でアルプス周辺の広域/拡大 + 沿岸・内水面の非退行を目視（AC#1〜#4, #7）→ PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 見た目のトレードオフ調整が単一の設計判断。単一 subagent に委譲）。
タスク間並列: next-tasks の集合判定により TASK-103（area:data,docs）と並列実行（本タスクは area:src-basemap,src-main で互いに素）。worktree isolation で衝突回避。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: exaggeration の zoom 補間（z4:1.0→z8:0.85→z11:0.55）+ shadow/highlight/accent alpha 引き上げ。PNG ピクセル実測でアルプス起伏コントラスト z5 2.02→2.71 / z7 1.67→2.55。CDP でアルプス・ピレネー・カルパティアの起伏判別を目視確認。
- AC#2: 勢力色の判別維持を目視確認（半透明維持の制約をテスト固定）。
- AC#3: ラベルコントラストは全候補で実測完全不変（クリーム halo が局所背景を作るため）。label_contrast_test green。
- AC#4: 重ね順不変（候補 2 不採用）のため海面陰影なし・沿岸/内水面は構造的に従来どおり。ブルターニュ・ジロンドで非退行を目視確認。
- AC#5/#6: basemap_test に 4 テスト追加（red→green）。deno test 1125 passed、fmt/lint/build green、PR #111 CI green。
- AC#7: z3/z5/z7/z11 の複数ズーム段で目視確認（高ズームの平野ノイズは補間減衰で回避 = 固定 1.0 案の却下根拠）。
- decision 記録判定: 新規なし（paint 定数の調整。決定基準は docs/app-spec.md §2.2 に記録）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
hillshade の paint 値を定量比較（4 候補の実機ビルドをピクセル実測）で調整し、山岳起伏のコントラストを z5 で 2.02→2.71 に向上。ラベル判読は halo により実測不変、重ね順は不変で沿岸・内水面に影響なし。テスト 4 件追加（1125 passed）、CDP 複数ズーム目視、CI green（PR #111）。
<!-- SECTION:FINAL_SUMMARY:END -->
