---
id: TASK-159
title: 既知の制限パネルを要約表示と年代連動の出し分けで読めるようにする
status: To Do
assignee: []
created_date: '2026-07-29 18:12'
labels:
  - 'area:src-main'
  - 'area:src-ui-panels'
  - 'area:data-meta'
  - 'area:app'
dependencies:
  - TASK-146
priority: medium
type: enhancement
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
「データの既知の制限」パネルが実質読めない状態になっている。data/known-limitations.json の text が調査結果そのままの長文（1 項目で 400〜1000 字超、france-fiefs-missing-territories は面積・件数の羅列を含む）で、UI 側は全件を常時表示し、現在年代に該当する項目に「この年代に該当」バッジを付けて強調するだけ（TASK-52 の方針）。結果としてパネルが画面高いっぱいまで伸び、いま見ている年代と無関係な長文まで読まされる。

望む結果: 表示中の年代に該当する制限だけが、一目で意味の取れる短い要約として並ぶ。詳細（出典名・カバレッジ率・面積・関連 TASK 番号など調査由来の数値）は捨てず、必要な読者だけが項目ごとに展開して読める。

制約と背景:
- 現行 text は TASK-70 / TASK-80 / TASK-87 / TASK-110 などの調査成果であり、情報を削除するのではなく「要約」と「詳細」に分離する。
- 「制限事項の追加はデータ編集のみで可能」という TASK-46 AC #3 の方針を維持する。JSON schema を拡張する場合は src/known_limitations.ts のパーサと scripts/known-limitations-json_test.ts のバリデーションを合わせて更新し、壊れたデータでも画面を壊さない縮退（空配列 + console.warn、エントリ単位の除外）を保つ。
- 年代連動については TASK-52 で「全件表示 + 該当強調（絞り込みはしない）」を意図的に選んだ経緯がある。非該当を隠す方針へ変えるため、その判断根拠と、隠れた項目に到達する手段を用意するか否かを着手時のプランに記録すること。
- 動作確認には 1200 年（HRE 中核部の空白・フランス諸侯領の制限が該当）、1530〜1700 年（イングランド・アイルランドの制限が該当）、常時該当の borders-are-approximate の 3 パターンを使う。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 表示中の年代に該当しない制限はパネルに表示されない（例: 1200 年で england-ireland-wales-1530-1700 が出ない）
- [ ] #2 常時該当の制限（years 未指定）は全年代で表示される
- [ ] #3 各項目は既定で 2 文程度・全角 120 字以内の要約のみを表示する
- [ ] #4 既存 text の詳細情報が失われず、項目ごとに展開して読める
- [ ] #5 年代スライダーで年代を切り替えると表示項目が追従して増減する
- [ ] #6 制限事項の追加・変更が data/known-limitations.json の編集のみで可能な状態を維持している
- [ ] #7 不正な JSON・不正なエントリに対する縮退（表示なし・エントリ単位除外 + console.warn）が維持されている
- [ ] #8 deno task test が green、かつヘッドレス CDP で 1200 / 1600 の表示を目視確認済み
<!-- AC:END -->
