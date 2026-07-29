---
id: TASK-129
title: 年代 GeoJSON のメモリキャッシュに上限を設けてモバイルでのメモリ枯渇を防ぐ
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 16:42'
updated_date: '2026-07-29 16:00'
labels:
  - 'area:src-powers'
dependencies:
  - TASK-128
type: enhancement
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/powers.ts の createYearDataLoader および各オーバーレイローダのキャッシュは上限のない Map で、一度取得した年代の FeatureCollection を解放しない。年代切替 1 回で最大 7 本の GeoJSON（1300 年の場合 flat 系だけで合計約 640KB）を読み込むため、スライダーを端から端まで動かすと 20 年代分すべてがメモリに残る。GeoJSON をパースした JS オブジェクトは元テキストの数倍のヒープを占めるため、メモリ制約の厳しいモバイル端末ではタブごとクラッシュする懸念がある。LRU 等で保持年代数に上限を設け、再取得が必要になった場合は fetch に戻す。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 各年代ローダのキャッシュ保持数に上限があり、上限を超えると最も古く使われた年代から解放される
- [x] #2 上限値が定数として 1 箇所に定義され、根拠がコメントで説明されている
- [x] #3 解放された年代を再度選択したときに再 fetch され、表示が壊れない
- [x] #4 inflight 共有（同一年代への並行呼び出しを 1 回の fetch に集約する既存挙動）が維持される
- [x] #5 TASK-128 の計測ハーネスで全年代を切り替えた後の JS heap を before/after 比較し、削減されたことを記録する
- [x] #6 キャッシュ退避ロジックのテストが先に書かれている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/powers.ts の createYearDataLoader と各オーバーレイローダのキャッシュ構造・inflight 共有を読む
2. TDD red: LRU 退避（上限超で最古解放・再アクセスで再 fetch・inflight 共有維持）のテストを先に書く（AC#6）
3. 実装: 保持数上限を定数 1 箇所に定義し根拠コメント（AC#2）。全ローダに適用（AC#1/#3/#4）
4. TASK-128 の verify:perf で全年代切替後の JS heap を before/after 比較し記録（AC#5、ポート 8129）
5. deno fmt --check / lint / test / build 全 green

並列化判定: 見送り（理由: powers.ts 単一ファイルのキャッシュ機構に閉じる）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- createYearCache<V>（Map 挿入順 LRU）を powers.ts に新設。上限 YEAR_CACHE_MAX_YEARS=4（年代切替 1 回 = 最大 7 本 → 無制限だと 19 年 × 7 = 133 FC。4 年で 28 FC ≈ 2 割、隣接年代の行き来はヒット維持、の根拠コメント付き）
- 適用 2 箇所: createYearDataLoader と withSuzerainOverrides（suzerain_extent.ts）。後者は補正後 FC を全年代分保持する外側キャッシュで、放置すると内側の上限が無意味になるため（subagent の発見）。inflight は finally 自己削除のため不変
- AC#6 red → green: 退避 ×2・再 fetch・wrapper 退避の 4 テストが red（4 failed | 135 passed）→ 実装後 139 passed。全体 1465 passed（mainagent 独立検証）
- AC#5 実測（verify:perf・全 19 年代切替後 JS heap used）: before 77.2MB → after 58.5〜62.3MB（-19〜24%）。JSON は scratchpad の perf-before/after.json
- AC#3 実機: 退避済みの 1000 年再選択で europe_1000.geojson の再 fetch を Resource Timing で観測、エラートーストなし
- 参照安定性（保持中の年は同一インスタンス）は既存テストで維持を確認
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
年代 GeoJSON キャッシュを LRU（上限 4 年・根拠付き定数）化し、ローダ本体と宗主補正の外側キャッシュの双方に適用。inflight 共有・参照安定性は不変。red → green（1465 passed）、全年代切替後の JS heap used が 77.2MB → 58.5〜62.3MB（-19〜24%）に削減、退避年の再 fetch 動作を実機確認。
<!-- SECTION:FINAL_SUMMARY:END -->
