---
id: TASK-114
title: 'area:scripts / area:data を細分化してタスク間並列の衝突を減らす'
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-27 14:14'
updated_date: '2026-07-27 19:43'
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
- [ ] #1 docs/development-style.md 4.2 章の area 表に scripts / data の細分化規約（領域名の決め方と対応パスの目安）が記載されている
- [ ] #2 .claude/skills/backlog-intake/SKILL.md の area 一覧が同じ規約に更新されている
- [ ] #3 To Do 状態の既存タスクに付いている area:scripts / area:data が細分化後のラベルに置き換わっており、他のラベルが失われていない
- [ ] #4 deno task next-tasks が細分化後のラベルで動作し、skipped の理由に細分化後の area 名が表示される
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
