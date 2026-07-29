---
id: TASK-117
title: 既知の制限パネルが上へ伸び続け上端の項目がスクロールでも読めない
status: Done
assignee:
  - '@claude'
created_date: '2026-07-27 15:27'
updated_date: '2026-07-27 16:16'
labels:
  - bug
  - 'area:app'
dependencies: []
priority: high
type: bug
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状（bug）

**再現手順**: 画面左下の ⚠ ボタン（既知の制限）を開く。

**期待挙動**: パネル内の全項目が読める（画面に収まらない場合はパネル内でスクロールできる）。

**実際の挙動**: `.popover-card` に `max-height` / `overflow-y` の指定が無いため、パネルはボタンの真上へ上方向に伸び続ける。ビューポート上端より上へ出た項目は**スクロールでも到達できない**（パネル自身が overflow: visible でスクロールコンテナにならず、body も縦スクロールしない）。

**実測**（ヘッドレス CDP・viewport 813px・1400 年・項目 14 件）:

- `.popover-card`: 高さ 3840px / `top: -3100px` / `max-height: none` / `overflow-y: visible` / `scrollHeight > clientHeight` は false（スクロール不可）
- TASK-105 で追加した 4 項目のうち `base-attribution-snapshot-drift`（top -821）と `base-nominal-suzerainty`（top -493）は完全に画面外
- 項目を 10 件（TASK-105 の追加前相当）に減らしても `top: -1826px` で、**追加前から既に読めない項目があった**

**発見契機**: TASK-105（既知の制限 4 項目の追記）の実装中に実装 subagent が検出し、mainagent が独立に再現・実測した。TASK-105 の追加で不可視領域が 1826px → 3100px に悪化するが、原因は追加そのものではなく `.popover-card` のレイアウト指定の欠落。

## 補足

TASK-105 のタスク説明は「4 項目を known-limitations.json に追加し、**UI から確認できるようにする**」だが、この欠陥のため追加した 4 項目のうち 2 項目は画面から読めない。TASK-105 の AC 自体は JSON とテストとドキュメント参照のみを要求しており満たしているが、意図の達成はこの bug の修正待ちである。

## 想定される修正

`app.css` の `.popover-card` に `max-height: calc(100vh - 96px)` と `overflow-y: auto` を入れる程度で済む見込み（未検証）。同じ `.popover-card` を使う他のポップオーバー（attribution フッター等）への影響を確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 既知の制限パネルの全項目が読める（画面に収まらない場合はパネル内でスクロールできる）
- [x] #2 再現テスト（red）が追加され、修正により green
- [x] #3 同じ .popover-card を使う他のポップオーバーの表示が壊れていないことを実機で確認している
- [x] #4 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 原因（起票時に実測済み）

`app.css` の `.popover-card`（281〜292 行）が `position: absolute` +
`bottom: calc(100% + 6px)` でボタンの真上へ吹き出すが、**`max-height` も
`overflow-y` も指定していない**。そのため中身が増えるほど上方向に伸び続け、
ビューポート上端を越えた分はスクロールでも到達できない（カード自身が
スクロールコンテナにならず、body も縦スクロールしない）。

実測（viewport 813px・1400 年・項目 14 件）: カード高 3840px・`top: -3100px`・
`max-height: none` / `overflow-y: visible` / `scrollHeight > clientHeight` は
false。項目を 10 件（TASK-105 の追加前相当）に減らしても `top: -1826px` で、
**TASK-105 の追加前から既に読めない項目があった**。

## 方針

`.popover-card` に `max-height` と `overflow-y: auto` を与えてカード自身を
スクロールコンテナにする。上端がビューポートから出ないよう、`max-height` は
「ボタンの上端から画面上端までの余白」を上限にする。

`.popover-card` は **2 箇所**で使われている（`index.html`）:

- `#footer-content`（左下 ⓘ の attribution・免責）
- `#known-limitations` の中身（左下 ⚠ の既知の制限）

どちらも左下のボタンから上へ吹き出す同じ構造なので、共通クラスへの 1 箇所の
修正で両方に効く。**両方の表示が壊れていないことを実機で確認する**（AC #3）。

## 手順（TDD）

1. 再現テストを先に書いて red を確認する（AC #2）。CSS の値そのものは
   ユニットテストで検証できないため、**ヘッドレス CDP のチェックスクリプトを
   `scripts/verify/checks/` に置いて回帰検出できる形にする**か、あるいは
   `deno test` から検証できる純粋な形（例: カードの高さ上限を算出する関数）に
   切り出すかを、既存の検証資産を調べたうえで判断する。判断と根拠を報告する。
2. `app.css` を修正する。
3. `deno task test` / `deno fmt --check` / `deno lint` / `deno task build` を green に。
4. 実機で ⚠（既知の制限・14 項目）と ⓘ（attribution）の両方を開き、
   全項目に到達できること・レイアウトが壊れていないことを確認する。

## 並列化判定（タスク内）

**見送り**（理由: 単一クラスへの CSS 修正とその検証という一続きの変更で、
独立にテスト可能なサブ作業に分割できない）。

## タスク間並列

なし（`next-tasks` が TASK-117 の単独集合を返した）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（全項目が読める）**: 修正前後をヘッドレス CDP で実測（viewport 1600x813・1400 年・14 項目）。

| 計測項目 | 修正前 | 修正後 |
| --- | --- | --- |
| カード `top` | **-3082.5** | **8** |
| `clientHeight` | 3820 | 729 |
| `scrollHeight` | — | 4288 |
| `overflow-y` | `visible` | `auto` |
| `max-height` | `none` | `731px` |
| `firstItemReachable` | **false** | **true** |
| `lastItemReachable` | — | **true** |
| `occludedPoints`（他要素に覆われた検査点 / 15 点中） | 4 | **0** |

**AC#2（再現テスト）**: `scripts/verify/checks/popover-overflow.ts`（ヘッドレス CDP）を先に書いて red（`[RESULT] FAIL` / 理由「上端がビューポート外（top=-3082.5）」「先頭項目がスクロールしても可視領域に収まらない」）を確認 → 修正で `[RESULT] PASS`。CI 側は判定ロジック（`judgePopoverLayout()`）と計測式（`popoverProbeExpr()`）を純粋な形に切り出したユニットテスト 14 件でカバー。

**AC#3（他のポップオーバーが壊れていない）**: `.popover-card` を使うもう 1 箇所である ⓘ attribution も同じチェックで計測し、`occludedPoints: 0` / `clientHeight == scrollHeight == 137` で `max-height`（765px）に届かずスクロールバーも出ない＝従来どおりの見た目であることを確認。既存の `verify:smoke` も PASS。

**AC#4**: `deno task test` = 1236 passed / 0 failed / 3 ignored（着手前 1222）。`deno fmt --check`（147 ファイル）green、`deno lint` は `.outputs/claude/` 配下の既存 4 件のみ、`deno task build` green。CI（PR #118）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

## 起票時の想定が不十分だった

起票時に「`max-height: calc(100vh - 96px)` と `overflow-y: auto` を入れる程度で済む見込み」と書いたが、実際には 2 つ足りなかった。

1. **`box-sizing: border-box`**: content-box のままだと実際の高さが上限 + padding 18px + border 2px になり、上端が計算より外へ出る（実測 `top=-12px`）。
2. **z-index の引き上げ**（app-footer 5→11・known-limitations 6→12）: `max-height` を入れても、タイムラインの帯（z-index 10・実測 y≈150〜665）がカードの前面に残り本文の左 1/3 が読めないままだった。TASK-46 当時からの潜在不具合で、パネルが短い前提の重ね順になっていた。subagent がチェックに「覆い被さり検査」（カード内の検査点が `elementFromPoint` で自分の子孫かを見る）を足して検出した。

## z-index 変更の影響を mainagent が独立に検証

- **パネル閉時**: `timeline-prev` / `timeline-next` / `timeline-slider` のいずれも `elementFromPoint` で最前面（idChain が timeline 配下）。▲ をクリックすると 1400 → 1300、▼ で 1400 に戻る＝操作は奪われていない。
- **パネル開時**: カード左端（タイムラインの帯と重なる位置）の最前面はカードの中身（`known-limitations-list`）で、本文が読める。
- **閉じた後**: `timeline-prev` が再び最前面に戻る。

## 意図した副作用

- **パネル展開中はタイムラインが隠れる**。外側クリック / Escape / トグルで閉じれば戻ることを上記で確認済み。
- `box-sizing: border-box` によりカード幅が padding 分（約 24px）細くなり、attribution の高さが 122px → 137px と 1 行増えた。`max-width: calc(100vw - 32px)` が横方向の実効上限として正しく効くようになる利点と引き換え。

## 未修正の既存不具合（起票していない）

⚠ ボタン（z-index 12）が attribution パネル（11）の左下隅に重なり、最終行の 1 文字程度を隠す。TASK-46 以来の挙動で今回の変更前後で同じ。1 文字の見た目の問題なので backlog を膨らませないよう起票していない。

## decision 記録の判定

**記録しない**と判断した。`max-height` の式・`box-sizing`・z-index の値はいずれも `.popover-card` の表示に閉じた実装判断で後続タスクを制約しない。回帰検出をヘッドレス CDP チェックにした判断は方式選択に近いが、`scripts/verify/checks/smoke.ts`（TASK-58）で既に確立された機構の 2 例目の利用であり新規の採用ではない（development-style 2.1 章の「記録しない判断」）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
既知の制限パネルが上方向に伸び続けビューポート上端を越えた項目にスクロールでも到達できない bug を、.popover-card への max-height + overflow-y: auto + box-sizing: border-box と z-index の引き上げで直した。max-height は「画面高 − カード下端のオフセット − 上端余白」で、下端オフセットはアンカーごとに違うため CSS 変数にした（attribution 40px / 既知の制限 74px。一律の固定値だと attribution 側が 34px 損をする）。起票時の想定（max-height と overflow-y を入れる程度）では 2 つ足りず、(1) content-box のままだと実高が上限 + padding + border になり上端が計算より外へ出る（実測 top=-12px）ため box-sizing: border-box が必須、(2) max-height を入れてもタイムラインの帯（z-index 10）がカード（5/6）の前面に残り本文の左 1/3 が読めないままだったため z-index の引き上げ（11/12）が必須だった。後者は TASK-46 当時からの潜在不具合で、パネルが短い前提の重ね順になっていた。回帰検出はヘッドレス CDP チェック（scripts/verify/checks/popover-overflow.ts）を主体にし、CI 側は判定ロジックと計測式を純粋な形に切り出したユニットテスト 14 件でカバーした（症状は CSS のレイアウト計算結果でしか観測できず、純粋関数だけでは CSS が壊れても green のままになるため）。検証: 再現チェックを先に書いて red（top: -3082.5 / firstItemReachable: false / occludedPoints: 4）→ 修正で PASS（top: 8 / scrollHeight 4288 / first・lastItemReachable: true / occludedPoints: 0）、attribution 側も occludedPoints: 0 で従来どおりの見た目、deno test 1236 passed / 0 failed（着手前 1222）、fmt --check / lint / build green、z-index 変更の影響として mainagent がタイムラインの操作を独立に検証（閉時は ▲▼・スライダーが最前面で押すと年代が変わる／開時はカードが前面／閉じると戻る）、CI（PR #118）green。TASK-105 で「タスク説明の意図（UI から確認できるようにする）が未達」と記録した件はこれで閉じた。
<!-- SECTION:FINAL_SUMMARY:END -->
