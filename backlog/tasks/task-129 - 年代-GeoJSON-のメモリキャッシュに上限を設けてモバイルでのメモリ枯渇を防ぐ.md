---
id: TASK-129
title: 年代 GeoJSON のメモリキャッシュに上限を設けてモバイルでのメモリ枯渇を防ぐ
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-28 16:42'
updated_date: '2026-07-29 15:46'
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
- [ ] #1 各年代ローダのキャッシュ保持数に上限があり、上限を超えると最も古く使われた年代から解放される
- [ ] #2 上限値が定数として 1 箇所に定義され、根拠がコメントで説明されている
- [ ] #3 解放された年代を再度選択したときに再 fetch され、表示が壊れない
- [ ] #4 inflight 共有（同一年代への並行呼び出しを 1 回の fetch に集約する既存挙動）が維持される
- [ ] #5 TASK-128 の計測ハーネスで全年代を切り替えた後の JS heap を before/after 比較し、削減されたことを記録する
- [ ] #6 キャッシュ退避ロジックのテストが先に書かれている
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
