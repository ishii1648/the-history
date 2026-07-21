---
id: TASK-23
title: 勢力名を日本語表記にする
status: To Do
assignee: []
created_date: '2026-07-21 13:17'
labels: []
dependencies: []
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（agent-loop 実行中の報告）: 地図上の勢力名ラベル・ツールチップ・クリックパネルが英語表記（France, Holy Roman Empire 等）なので日本語表記（フランス、神聖ローマ帝国 等）にしたい。

実装の手がかり: データの NAME は英語のまま維持し（colors.json のキー・SUBJECTO 参照・上流データとの整合を壊さないため）、表示層で NAME→日本語名のマッピング（例: data/name-ja.json を新設）を適用する方式を想定。対象は TASK-20 の常時ラベル（src/labels.ts / main.ts）、ツールチップ/パネル（src/info.ts displayLabel）、HRE 領邦名（Austria→オーストリア等）。マッピングに無い名前は英語のままフォールバックする。TextLayer の characterSet が日本語グリフを含む必要がある点に注意（characterSetFrom は実装済みでラベル文字から自動導出される）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 地図上の常時ラベルが日本語表記で表示される（例: フランス、神聖ローマ帝国、オーストリア）
- [ ] #2 ホバーツールチップとクリックパネルも同じ日本語表記を使い、属領表記（「NAME — 宗主国 領」形式）も日本語になる
- [ ] #3 全年代・全勢力の主要どころを網羅する NAME→日本語のマッピングがデータとして管理され、未登録名は英語のままフォールバックする
- [ ] #4 追加・変更したロジックにテストがあり deno test が green
<!-- AC:END -->
