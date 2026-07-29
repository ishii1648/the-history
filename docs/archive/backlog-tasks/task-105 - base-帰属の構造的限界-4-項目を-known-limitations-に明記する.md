---
id: TASK-105
title: base 帰属の構造的限界 4 項目を known-limitations に明記する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 19:25'
updated_date: '2026-07-27 15:31'
labels:
  - 'area:data'
  - 'area:docs'
dependencies: []
priority: medium
ordinal: 98000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の横断監査で「上流データの粒度・構造に由来し propertyFixes では修正しきれない」と整理された 4 項目（スナップショット年と条約帰属のずれ・名目宗主権の扱い・消滅済み/過大勢力の形状・形状の再利用）を data/known-limitations.json に追加し、UI から確認できるようにする。項目案は監査ドキュメント（base-attribution-audit.md）の known-limitations 節を参照。

発見契機: TASK-103 の横断監査。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 4 項目が known-limitations.json に追加され、キーワード検証テストが green
- [x] #2 監査ドキュメントから各項目への参照が辿れる
- [x] #3 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 対象

TASK-103 の監査 `docs/data-inventory/base-attribution-audit.md` §6 が挙げた 4 項目を
`data/known-limitations.json` に追加する。id と要点は同節の表のとおり。

| id | 対象年代 | 要点 |
| --- | --- | --- |
| `base-attribution-snapshot-drift` | 全年代 | 上流が年代ごとに独立した地図として作られており、同一勢力の名称・宗主表記が年代で変わる |
| `base-nominal-suzerainty` | 全年代 | 名目上の宗主権が年代によって従属で描かれたり独立で描かれたりする（decision-19 との関係） |
| `base-extinct-or-overbroad-powers` | 1279〜1400 | 滅亡済みの勢力名が残る・小勢力の名で広域が塗られる。形状は上流のもので分割・削除ができない |
| `base-shape-reuse` | 1300〜1400 | 上流が年代をまたいでポリゴンを使い回している |

## 手順（TDD）

1. 既存の `data/known-limitations.json`（`limitations` 配列。要素は
   `id` / `years`（任意）/ `text`）とその検証テストを読み、同じ書式に従う。
2. キーワード検証テストを先に追加して red を確認する。
3. 4 項目を追加して green にする。
4. 監査ドキュメント §6 から各項目へ辿れるようにする（AC #2）。追加後の
   実 id を §6 の表に反映し、`known-limitations.json` 側からも監査ドキュメントを
   参照できるようにする。
5. UI（フッターの「解説」/ known-limitations 表示経路）で 4 項目が読めることを
   実機で確認する。

## 並列化判定（タスク内）

**見送り**（理由: 単一の JSON への 4 項目追加とそのテスト・参照の整合という
一続きの変更で、独立にテスト可能なサブ作業に分割できない）。

## タスク間並列

**あり**。`next-tasks` が TASK-100（area: src-main / src-info / src-labels）と
TASK-105（area: data / docs）の 2 タスク集合を返した。area が互いに素なので
個別ブランチ・個別 PR で並行して進める。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（4 項目の追加とキーワード検証テスト）**: `scripts/known-limitations-json_test.ts` に 8 件のテストを先に追加し red を確認（`base-attribution-snapshot-drift が無い` 等 4 件の AssertionError + `years` の期待値 4 件）→ JSON 追加で green。テストは項目ごとのキーワード検証に加え、`isKnownLimitationActiveForYear` を SNAPSHOT_YEARS 全 20 年代で走査して `years` の効き方を固定している。

**AC#2（監査ドキュメントからの参照）**: `docs/data-inventory/base-attribution-audit.md` §6 の列名を「id 案」→「id」に変え（4 件とも案のまま採用）、テストファイル名と UI 上の到達経路（画面左下の ⚠ ボタン）を明記。JSON 側は既存項目の作法（`（TASK-102）`・`（TASK-88 調査）`）に倣って 4 件とも末尾を `（TASK-103 調査）` にし、TASK ID 経由で監査ドキュメントへ辿れるようにした。§7 の振り分け表にも「TASK-105 で実装済み」を追記。

**AC#3（deno test green）**: `deno task test` = 1193 passed / 0 failed / 3 ignored（着手前 1185）。`deno fmt --check`（145 ファイル）green、`deno lint` は `.outputs/claude/` 配下の既存 4 件のみ、`deno task build` green。CI（PR #116）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

**実機確認**: 1000 / 1300 / 1400 年で ⚠ ボタンを開き、4 項目が DOM に存在し `years` に応じて「この年代に該当」バッジが正しく付く（1000 年では extinct / shape-reuse が非 active）ことを確認。

## タスク説明の意図の未達（正直な記録）

タスク説明は「4 項目を known-limitations.json に追加し、**UI から確認できるようにする**」だが、**追加した 4 項目のうち 2 項目は現状の UI では画面から読めない**。`.popover-card` に `max-height` / `overflow-y` が無くパネルが上方向に伸び続け、ビューポート上端より上の項目にスクロールでも到達できないため。

mainagent がヘッドレス CDP で独立に実測した値（viewport 813px・14 項目）:

- `.popover-card` 高さ 3840px / `top: -3100px` / `max-height: none` / `overflow-y: visible` / `scrollHeight > clientHeight` は false（スクロール不可）
- `base-attribution-snapshot-drift`（top -821）と `base-nominal-suzerainty`（top -493）が完全に画面外
- 項目を 10 件（本タスクの追加前相当）に減らしても `top: -1826px` で、**追加前から既に読めない項目があった**

原因は 4 項目の追加ではなく `.popover-card` のレイアウト指定の欠落なので、ループのガード（動作確認で見つけた問題は hotfix せず bug として起票する・1 タスク = 1 PR）に従い **TASK-117**（label bug・High）として起票した。bug 最優先ルールにより次イテレーションで修正される。

本タスクの AC 3 件はいずれも JSON・テスト・ドキュメント参照のみを要求しており全て満たしているため Done とするが、タスク説明の意図の完全な達成は TASK-117 の修正待ちである。

## decision 記録の判定

**記録しない**と判断した。known-limitations への項目追加は既存機構（TASK-88 で導入・既存 10 件の前例あり）の利用で、新規の方式選択ではない。`years` の付け方・文面の粒度はいずれも既存項目の作法に倣っただけで後続タスクを制約しない（development-style 2.1 章の「記録しない判断」）。採否の根拠はコンテキストコミットの decision 行と監査ドキュメント §6 の追記に残した。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-103 の横断監査 §6 が挙げた構造的限界 4 項目（base-attribution-snapshot-drift / base-nominal-suzerainty / base-extinct-or-overbroad-powers / base-shape-reuse）を data/known-limitations.json に追加し、監査ドキュメントとの相互参照を張った。本文の記述はすべてデータで実測して裏を取り、監査 §6 より強い事実を 2 件見つけた（1279 Serbia / 1300 Raška / 1400 Bosnia は bbox 一致どころか座標が完全一致で同一 28 頂点・84,306 km²、1783 / 1800 の Mecklenburg-Strelitz も座標完全一致で bbox は 1815 のハノーファーとほぼ同一）。全年代に該当する 2 項目は既存の作法に倣い years を付けず、base-shape-reuse の years は監査の指定どおり 1300-1400 に留めて 1783 / 1800 の事例は本文で言及した（years は連続範囲を 1 つしか持てず、広げると根拠のない「この年代に該当」バッジが 9 年代に出るため）。base-nominal-suzerainty の主例は TASK-104 で是正済みのノヴゴロドを外してアルジェ・チュニスにし、TASK-107 で値が変わりうるハノーファーは勢力名を出さず一般記述に留めた。検証: キーワード検証と years の効き方を SNAPSHOT_YEARS 全走査で固定するテスト 8 件を先行追加して red → green、deno test 1193 passed / 0 failed（着手前 1185）、fmt --check / lint / build green、ヘッドレス CDP で 1000 / 1300 / 1400 年のバッジ表示を確認、CI（PR #116）green。なお実装中に .popover-card のレイアウト欠陥（max-height / overflow-y が無くパネルが上方向に伸び続け、上端の項目にスクロールでも到達できない）を発見し mainagent が独立に実測した。追加した 4 項目のうち 2 項目が画面外だが、項目を追加前相当の 10 件に減らしても top: -1826px で追加前から既に読めない項目があったため、原因は本タスクの追加ではない。ループのガードに従い hotfix せず TASK-117（label bug・High）として起票した。本タスクの AC 3 件は全て満たすが、タスク説明の「UI から確認できるようにする」の完全な達成は TASK-117 の修正待ちである。
<!-- SECTION:FINAL_SUMMARY:END -->
