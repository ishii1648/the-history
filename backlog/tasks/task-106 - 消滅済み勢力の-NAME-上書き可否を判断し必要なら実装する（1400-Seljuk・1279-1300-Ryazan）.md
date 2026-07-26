---
id: TASK-106
title: 消滅済み勢力の NAME 上書き可否を判断し必要なら実装する（1400 Seljuk・1279/1300 Ryazan）
status: To Do
assignee: []
created_date: '2026-07-26 19:26'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies: []
priority: medium
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の監査で確度 A/B とされた「NAME 自体が誤っている」2 系統: (1) 1400 年 Seljuk Caliphate（1308 年に滅亡。オスマン侯国等への上書き可否）、(2) 1279/1300 年 Ryazan（全ルーシ 131 万 km² を覆う過大形状。Golden Horde 圏としての表現可否）。NAME 上書きは前例がなく、色（colors.json 決定的プロービング）と name-ja 追加を伴うため単独タスクとして可否判断から行う。判断根拠は backlog decision または notes に記録する。

発見契機: TASK-103 の横断監査。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 NAME 上書きの可否が根拠付きで判断され記録されている
- [ ] #2 採用する場合: 上書きが propertyFixes 系機構で実装され回帰テスト green・name-ja / colors の整合が維持される
- [ ] #3 見送る場合: known-limitations に記載されている
- [ ] #4 deno test が green
<!-- AC:END -->
