---
id: TASK-114
title: 'area:scripts / area:data を細分化してタスク間並列の衝突を減らす'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 14:14'
updated_date: '2026-07-27 22:02'
labels:
  - 'area:workflow'
  - 'area:docs'
dependencies: []
ordinal: 107000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

調査（`.outputs/claude/agent-loop-parallelism-investigation.md`）で、`deno task next-tasks` が
area 衝突を理由に候補をスキップした延べ 17 回の内訳は `area:src-main` 8・`area:scripts` 5・
`area:data` 4 だった。

このうち scripts / data の衝突は**実ファイルの競合ではなくラベル粒度だけの問題**である。
`scripts/` は 40 以上、`data/` は 89 ファイルに既に物理的に分かれており、それを粗いラベル
1 個で束ねているためにビルドスクリプト同士（例: `build-mountains.ts` と `build-rivers.ts`）が
衝突扱いになっている。

反実仮想シミュレーション（過去 32 判定機会の再生）では、この 2 領域を細分化するだけで
並列成立が 6/32（19%）→ 11/32（34%）に増える見込み。`scripts/next_tasks.ts` の
ロジック変更は不要で、ラベル値の変更だけで成立する。

## 対象

- `docs/development-style.md` 4.2 章の area 表に細分化規約を追加する
- `.claude/skills/backlog-intake/SKILL.md` の area 一覧を同じ規約に合わせる
- 既存の To Do タスクのラベルを付け替える（backlog CLI を使い、既存の他ラベルを消さない）

Done 済みタスクのラベル遡及付け替えは不要（選定対象にならないため）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 docs/development-style.md 4.2 章の area 表に scripts / data の細分化規約（領域名の決め方と対応パスの目安）が記載されている
- [x] #2 .claude/skills/backlog-intake/SKILL.md の area 一覧が同じ規約に更新されている
- [x] #3 To Do 状態の既存タスクに付いている area:scripts / area:data が細分化後のラベルに置き換わっており、他のラベルが失われていない
- [x] #4 deno task next-tasks が細分化後のラベルで動作し、skipped の理由に細分化後の area 名が表示される
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 背景（起票時の調査）

`next-tasks` が area 衝突でスキップした延べ 17 回の内訳は `area:src-main` 8・
`area:scripts` 5・`area:data` 4。このうち **scripts / data の衝突は実ファイルの
競合ではなくラベル粒度だけの問題**で、`scripts/` は 40 以上・`data/` は 89
ファイルに物理的に分かれているのに粗いラベル 1 個で束ねている。

反実仮想シミュレーションでは、この 2 領域の細分化だけで並列成立が
6/32（19%）→ 11/32（34%）に増える見込み。`scripts/next_tasks.ts` の**ロジック
変更は不要**で、ラベル値の変更だけで成立する。

## このセッションでの裏づけ

本セッション（16 イテレーション目に着手）でも同じ形が出ている。直近の判定で
`TASK-115` が `area conflict: scripts (TASK-106/107/110)`、`TASK-109` が
`area conflict: data` でスキップされた。いずれも実際に触るファイルは重ならない
（例: TASK-115 は `next_tasks.ts`、TASK-110 は `build-cliopatria-fiefs.ts`）。

## 方針

**細分化の粒度は「実ファイルが競合しうる単位」に合わせる**。細かすぎると
ラベル付けの判断が難しくなり、粗いと今の問題が残る。`src-*` が既に
`src-main` / `src-info` / `src-labels` / `src-powers` 等とモジュール単位で
切られているので、その作法に倣う。

- `scripts`: ビルド対象のデータ系統で切る（例: `scripts-base` / `scripts-fiefs`
  / `scripts-geo`（河川・山岳・山峰）/ `scripts-verify` / `scripts-loop`）
- `data`: 同様に生成物の系統で切る

**具体的な区分と対応パスの目安は実装時に既存ファイルを見て決める**（AC #1 が
「領域名の決め方と対応パスの目安」を求めているので、恣意的に決めず
現状のファイル構成から導く）。

## 手順

1. `scripts/` と `data/` の全ファイルを列挙し、実際に同時編集されうる単位を
   調べて区分を決める。過去のタスクがどのファイル群を触ったかも参考にする。
2. `docs/development-style.md` 4.2 章の area 表に細分化規約を追加（AC #1）。
3. `.claude/skills/backlog-intake/SKILL.md` の area 一覧を合わせる（AC #2）。
4. **To Do の既存タスクのラベルを backlog CLI で付け替える**（AC #3）。
   他のラベルを失わないこと。Done 済みは対象外（選定に影響しない）。
5. `deno task next-tasks` を実行し、細分化後のラベルで動作すること・skipped の
   理由に新しい area 名が出ることを確認（AC #4）。

## 並列化判定（タスク内）

**見送り**（理由: 区分の決定が先で、それが決まらないと docs も SKILL.md も
ラベル付け替えも書けない。3 つは同じ決定の適用先が違うだけで、独立に
テスト可能なサブ作業ではない）。

## タスク間並列

なし（`next-tasks` が TASK-114 の単独集合を返した。TASK-115 / TASK-116 は
`docs` 衝突でスキップ。**まさにこのタスクが減らそうとしている衝突**）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（docs に細分化規約）**: `docs/development-style.md` 4.2 章の area 表に `scripts/` の 7 区分・`data/` の 4 区分と対応パスの目安、運用ルール 4 項目、細分化の根拠（実測）を追加した。

**AC#2（backlog-intake SKILL.md）**: 同じ区分表と「粗い `area:scripts` / `area:data` は使わない」を追加。docs との矛盾は、SKILL.md 側が「対応パスの目安は同章の表を参照」として根拠を再掲しない形で回避した。

**AC#3（既存タスクのラベル付け替え）**: To Do 状態で `area:scripts` / `area:data` を持っていたのは **TASK-115 のみ**。

| タスク | 付け替え後のラベル全体 |
| --- | --- |
| TASK-114 | `area:workflow`, `area:docs`（変更なし） |
| TASK-115 | `area:docs`, **`area:scripts-loop`**（`area:scripts` から。`area:docs` は保持） |
| TASK-116 | `area:src-main`, `area:docs`（変更なし） |

`backlog/tasks/*.md` に粗い `area:scripts` / `area:data` が残っていないことも確認済み。

**AC#4（next-tasks が細分化後のラベルで動作し skipped の理由に細分化名が出る）**: **実バックログでは示せなかった**。残る To Do 3 件が全て `area:docs` を持ち、そちらで先に衝突するため、細分化名が `skipped` の理由に現れる状況が作れない（subagent が watchdog で停止したのもこの検証中だった）。

一度きりの観測を作るのではなく、`selectNextTasks`（純粋関数）の単体テスト 4 件で恒久的に固定した。

1. 細分化した `scripts-loop` × `scripts-fiefs` が**並列に選ばれる**（細分化前は衝突していた組み合わせ）
2. 細分化した `data-base` × `data-features` が並列に選ばれる
3. **同じ細分化 area どうしは従来どおり衝突し**、`reason` に `area conflict: scripts-fiefs (TASK-1)` と細分化名が出る
4. **粗い `area:scripts` と細分化 area は文字列が違うため交差しない** — docs が混在を禁じている理由そのもの

`deno task next-tasks` 自体も実行し、細分化後のラベルでエラーなく動作することを確認した（TASK-114 が In Progress のためイテレーション境界ガードで空集合が返る）。

**検証**: `deno task test` = 1345 passed / 0 failed / 3 ignored（着手前 1341）。`deno fmt --check`（153 ファイル）green、`deno lint` は既存 4 件のみ、`deno task build` green。CI（PR #126）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。**`scripts/next_tasks.ts` のロジックは未変更**（起票時の調査の結論どおりラベル値だけで成立）。

## 区分は同時変更の実績から導いた

恣意的に決めず、`origin/main` の全マージ PR で `scripts/` `data/` のどのファイルが同一 PR 内で一緒に変更されたかから導いた。

- `next_task.ts` / `next_tasks.ts` / `cleanup_branches.ts` はビルドパイプラインと**一度も同時に変更されていない** → `scripts-loop`
- `build-fief-dedupe.ts` と `build-fief-flat.ts` は **4 PR で同時に変更されている** → 同じ `scripts-fiefs`
- `rivers` / `mountains` / `peaks` / `cities` の生成物が `europe_*`・`base_outline_*`・`*_fiefs_*` と同一 PR で変更されたのは、全 feature に出典を付与した TASK-109 の 1 回だけ → 別区分

## subagent が watchdog で停止し mainagent が引き継いだ

実装 subagent が「600 秒無進捗」で停止した。停止時点で規約策定（AC#1・#2）とラベル付け替え（AC#3）は完了しており、残っていたのは AC#4 の検証だけだった。mainagent がパッチを取り込み、テストによる固定で完成させた。

停止の直接の原因は、AC#4 を実バックログで示せないと分かったあと「忠実なシナリオ再生を組む」方向へ進もうとして時間を使ったことにある。**実バックログで示せない AC は、観測を再現しようとするより純粋関数のテストで固定する方が速く、かつ恒久的**という教訓が得られた。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
area:scripts / area:data を実ファイルの競合単位に合わせて細分化した（scripts は base/fiefs/features/meta/build/loop/verify の 7 区分、data は base/fiefs/features/meta の 4 区分）。区分は恣意的に決めず、origin/main の全マージ PR で scripts/ data/ のどのファイルが同一 PR 内で一緒に変更されたかから導いた（next_tasks.ts 等のループ支援ツールはビルドパイプラインと一度も同時変更されておらず、build-fief-dedupe.ts と build-fief-flat.ts は 4 PR で同時変更されている）。scripts-* と data-* を同名サフィックスで対にしたので「どのパイプラインを触るか」を一度決めれば両方のラベルが決まる。粗い area:scripts / area:data は使わない規約とし、混在すると next-tasks が文字列一致で交差を見るため実際には衝突するタスクが並列に選ばれる危険をテストで固定した。docs/development-style.md 4.2 章と backlog-intake/SKILL.md の両方に規約を書き、SKILL.md 側は根拠を再掲せず docs を参照する形で矛盾を避けた。To Do で粗いラベルを持っていたのは TASK-115 のみで area:scripts → area:scripts-loop に置き換え（area:docs は保持）。AC#4 は実バックログでは示せなかった（残る To Do 3 件が全て area:docs で先に衝突するため）ので、selectNextTasks の単体テスト 4 件で恒久的に固定した（細分化で並列になる例 2 件・同一 area は従来どおり衝突し reason に細分化名が出る例・粗いラベルとの混在が交差しない例）。scripts/next_tasks.ts のロジックは起票時の調査の結論どおり未変更。検証: deno test 1345 passed / 0 failed（着手前 1341）、fmt --check / lint / build green、CI（PR #126）green。実装 subagent が watchdog（600 秒無進捗）で停止したため mainagent が AC#4 の検証を引き継いで完成させた。
<!-- SECTION:FINAL_SUMMARY:END -->
