---
id: TASK-107
title: base 帰属の確度 B の一貫性正規化（Spain 王朝名・Hanover・Armenia 1100・1279/1300 Mongol）
status: To Do
assignee: []
created_date: '2026-07-26 19:26'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies: []
priority: low
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の監査で確度 B（解釈の余地あり）とされた一貫性の正規化: Spain の宗主が王朝名 Spanish Habsburg になっている件・1800 Hanover の同君連合表現・1100 Armenia の Byzantine 帰属（bbox は大アルメニアでありセルジューク圏が実態）・1279/1300 の Mongol Empire 宗主の後継汗国への正規化。いずれも配色再生成と目視確認をセットで行う。個別の採否と根拠を notes に記録する。

発見契機: TASK-103 の横断監査。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 各件の採否と根拠が記録され、採用分は propertyFixes で実装・回帰テスト green
- [ ] #2 配色変化が意図どおりであることを目視確認
- [ ] #3 deno test が green
<!-- AC:END -->
