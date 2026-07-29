---
id: TASK-111
title: ホバーツールチップの長いラベルが枠からはみ出す（幅不足）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 14:01'
updated_date: '2026-07-27 15:05'
labels:
  - bug
  - 'area:app'
  - 'area:src-main'
dependencies: []
priority: high
type: bug
ordinal: 104000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状

長い勢力名をホバーすると、ツールチップの文字列が羊皮紙の枠（border）を突き抜けて右へはみ出し、枠外の地図の上に直接文字が乗る。

再現例: 1492 年のオットーボイレン帝国修道院領をホバーすると「オットーボイレン帝国修道院領 — 神聖ローマ帝国 領」が表示され、末尾の数文字が枠の外に出る。

## 原因

app.css の .info-tooltip が max-width: 260px と white-space: nowrap を同時に指定している。nowrap で折り返しが禁止されているため、内容が max-width を超えても行が分割されず、ボックス幅は 260px で頭打ちのまま inline 内容だけが右へあふれる。overflow の指定も無いので、あふれた文字がそのまま枠外に描画される。

日本語表記（decision-6 の name-ja.json 適用）では 1 文字あたりの幅が広く、「オットーボイレン帝国修道院領 — 神聖ローマ帝国 領」のように称号込みの領邦名と宗主名が連結されるケースで容易に 260px を超える。src/info.ts の displayLabel が NAME と SUBJECTO を LABEL_SUBJECT_SEP で連結する形式である以上、長いラベルは構造的に発生する。

## 併せて確認したい関連不具合

src/main.ts の showTooltip はカーソル座標に OFFSET_X/OFFSET_Y（各 12px）を足して absolute 配置するだけで、viewport 右端・下端でのフリップやクランプを行っていない。画面右寄りで長いラベルをホバーすると、枠ごと画面外へはみ出して読めなくなる。幅の修正と同じ箇所の問題なので本タスクで併せて扱う。

## 修正時に判断する点

- 折り返しを許して複数行にするか、max-width を広げて 1 行を維持するか。地図上の一時表示なので高さが増えすぎない方針が望ましい
- 折り返す場合、日本語の任意位置改行（overflow-wrap / word-break / line-break）をどう指定するか。「— 神聖ローマ帝国 領」の区切り前で改行させたいなど整形上の要求があるか
- クリックパネル（.info-panel、max-width: min(320px, calc(100% - 32px))）側は nowrap 指定が無いため同じ症状は出ないが、表示規則をツールチップと揃えるか
- ラベル整形は src/info.ts の純粋関数なので、幅の問題を CSS のみで解くか、整形側で改行位置のヒントを与えるか
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 長い日本語ラベル（例: オットーボイレン帝国修道院領 — 神聖ローマ帝国 領）をホバーしても、文字列がツールチップの枠外にはみ出さない（目視確認）
- [x] #2 ツールチップが viewport の右端・下端で画面外にはみ出さず、全文が読める（目視確認）
- [x] #3 短いラベルでツールチップが不必要に大きくならず、従来の見た目が保たれる（目視確認）
- [x] #4 クリックパネル側の表示崩れが無いことを同じラベルで確認している（目視確認）
- [x] #5 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 原因（起票時の分析どおり。コードで確認済み）

1. **幅**: `app.css` の `.info-tooltip`（47〜65 行）が `max-width: 260px` と
   `white-space: nowrap`（62 行）を同時に指定している。nowrap で折り返しが
   禁止されているため、内容が max-width を超えても行が分割されずボックス幅は
   260px で頭打ちのまま inline 内容だけが右へあふれる。`overflow` の指定も
   無いので、あふれた文字がそのまま枠外に描画される。
2. **位置**: `src/main.ts` の `showTooltip`（1869〜1874 行）は
   `left = x + 12` / `top = y + 12` を設定するだけで、viewport 右端・下端での
   フリップもクランプも行っていない。

## 方針

- **折り返しを許す**（max-width を広げて 1 行維持はしない）。日本語の勢力名 +
  宗主名は構造的にいくらでも長くなりうる（`src/info.ts` の `displayLabel` が
  NAME と SUBJECTO を連結する）ので、幅を広げる方向では際限が無い。地図上の
  一時表示なので高さが増えすぎないよう max-width は現行の 260px を基準に保つ。
- 併せて `max-width` を viewport 幅にも従わせ、狭い画面で枠自体が画面から
  出ないようにする。
- **位置は純粋関数でクランプ/フリップする**。カーソル座標・ツールチップの
  実測サイズ・viewport サイズから配置座標を返す関数を `src/info.ts`
  （`displayLabel` と同じ「情報表示の純粋ロジック」）に置き、`main.ts` は
  その結果を style に流すだけにする。自動テストはこの関数に対して書く。
- クリックパネル（`.info-panel`）は `nowrap` を持たないため同症状は出ないが、
  同じラベルで表示崩れが無いことを実機で確認する（AC #4）。

## 手順（TDD）

1. 配置計算の純粋関数のテストを先に書き、red を確認する（右端でフリップ・
   下端でフリップ・両端が狭い場合のクランプ・通常時は従来どおり +12/+12）。
2. 関数を実装し `main.ts` の `showTooltip` を差し替える。ツールチップの実測
   サイズは表示してから `getBoundingClientRect()` で取る（hidden のままでは
   0 になるため、先に `hidden = false` にしてから測る）。
3. `app.css` の `.info-tooltip` を修正する。
4. `deno task test` / `deno fmt --check` / `deno lint` / `deno task build` を green に。
5. ヘッドレス CDP で AC #1〜#4 を目視確認する。1492 年のオットーボイレン帝国
   修道院領（長いラベル）を画面中央・右端・下端の各位置でホバーし、はみ出しが
   無いことをスクリーンショットで確認する。短いラベルで従来の見た目が
   保たれることも同じ方法で確認する。

## 並列化判定（タスク内）

**見送り**。独立サブ作業の候補は (A) CSS の幅・折り返し と (B) 位置クランプの
純粋関数 + 配線 の 2 つだが、**(A) は自動テストを書けない CSS の変更**で、
検証は (B) と同じ 1 回の実機ホバー確認に相乗りする。プランの定義（互いに
ファイル競合・実行順依存がなく、**独立にテスト可能**な単位）を満たすのは (B)
だけなので、分割の利得より worktree の統合コストが上回る。単一 subagent に
委譲する。

## タスク間並列

なし（`next-tasks` が TASK-111 の単独集合を返した）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**実機確認の条件**: ヘッドレス CDP（scripts/verify/cdp.ts）、viewport 1600x813、`?year=1492&zoom=8`。対象は起票時の再現例「オットーボイレン帝国修道院領 — 神聖ローマ帝国 領」。ツールチップの `getBoundingClientRect()` と `scrollWidth`/`clientWidth`（内容の描画幅がボックス幅を超えていないか）を実測し、あわせてスクリーンショットを拡大して目視した。

| AC | ケース | 実測値 | 判定 |
| --- | --- | --- | --- |
| #1 | 画面中央（カーソル 800,406） | 枠 280x46.4（2 行）・left 812 / top 418・`scrollWidth 278 == clientWidth 278` | はみ出しなし |
| #2 | 右端（カーソル 1555,406） | left 1263 = 1555−12−280（カーソル左へフリップ）・right 1543 < 1600 | 画面内・全文表示 |
| #2 | 下端（カーソル 800,780） | top 721.6 = 780−12−46.4（カーソル上へフリップ）・bottom 768 < 813 | 画面内・全文表示 |
| #2 | 右下角（カーソル 1400,768） | 水平・垂直の両方がフリップ・right 1530 / bottom 808 | 画面内・全文表示 |
| #3 | 短いラベル（神聖ローマ帝国） | 枠幅 118px（長ラベルは 280px） | 従来どおり内容ぴったりで大きくならない |
| #4 | クリックパネル（同じ長いラベル） | 枠 356x68.5・right 1584 < 1600・ラベルの `scrollWidth == clientWidth` | 崩れなし |

**AC#5**: `deno task test` = 1185 passed / 0 failed / 3 ignored（着手前 1178）。`deno fmt --check`（145 ファイル）green、`deno lint` は `.outputs/claude/` 配下の既存 4 件のみ、`deno task build` green。CI（PR #115）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

**禁則処理**: 拡大画像で「オットーボイレン帝国修道院領 — 神聖 / ローマ帝国 領」と折れることを確認した。`line-break: strict` が無いと既定の折り返しで「神聖ロ / ーマ帝国」と長音符が行頭に落ちる。

## mainagent によるレビューでの追試

subagent の報告では右端・下端のケースも長いラベルで確認したとあったが、mainagent が同じ条件で再現したところ、その座標でカーソル下に来るのは短いラベル（「神聖ローマ帝国」）で、フリップの検証としては不十分だった（短いラベルは右端でもフリップ後に十分な余白が残るため、クランプまで踏めない）。地図中心を zoom 8 の 1px = 360/131072 度から逆算して**長いラベルを狙って端に置く**追試を行い、上表の right / bottom の実測値を得た。

## decision 記録の判定

**記録しない**と判断した。CSS の折り返し規則もツールチップの配置計算も、この 2 要素の表示に閉じた実装判断で後続タスクの実装を制約しない（development-style 2.1 章の「記録しない判断」）。採否の根拠（max-width を広げる方向を採らない理由・`anywhere` と `break-word` の違い・`line-break: strict` の必要性）はコンテキストコミットの decision 行と app.css のコメントに残した。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
ホバーツールチップの長いラベルが枠外へあふれる bug を、app.css の white-space: nowrap 撤去（+ overflow-wrap: anywhere / line-break: strict / max-width を viewport 幅にも従わせる）と、viewport 端でのフリップ・クランプを行う純粋関数 tooltipPlacement（src/info.ts）の導入で修正した。max-width を広げて 1 行を維持する方向は採らない（displayLabel が NAME と SUBJECTO を連結する構造上ラベル長に上限が無く際限が無いため）。幅は指定せず絶対配置の shrink-to-fit に任せ上限だけ max-width で与えるので、短いラベルは従来どおり小さいまま（実測 118px 対 280px）。overflow-wrap は break-word ではなく anywhere（anywhere だけが min-content 幅の計算にも効き shrink-to-fit が内容に追従する）、line-break: strict は既定の折り返しで長音符が行頭に落ちる（神聖ロ/ーマ帝国）のを防ぐため。併せて .info-panel-label にも同じ折り返し規則を揃えた（パネルにはみ出しは元から無いが、同一文字列を別ルールで折るのは不整合）。検証: tooltipPlacement のテスト 7 件を先行追加して red → green、deno test 1185 passed / 0 failed（着手前 1178）、fmt --check / lint / build green、ヘッドレス CDP で長いラベルを画面中央・右端・下端・右下角でホバーして実測値（フリップ後も画面内・scrollWidth == clientWidth）と拡大画像の両方で確認、クリックパネルの崩れが無いことも同ラベルで確認、CI（PR #115）green。
<!-- SECTION:FINAL_SUMMARY:END -->
