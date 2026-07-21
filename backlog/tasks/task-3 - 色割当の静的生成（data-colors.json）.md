---
id: TASK-3
title: 色割当の静的生成（data/colors.json）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-20 04:22'
updated_date: '2026-07-21 09:09'
labels: []
dependencies:
  - TASK-2
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
勢力名から決定的に色を割り当てる colors.json をビルド時に静的生成し、クライアントは参照のみにする。参照: docs/app-spec.md §4.3
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 NAME をキーに決定的ハッシュで色が割り当てられ、同一勢力は全 20 年代で同色になる
- [x] #2 SUBJECTO を持つ feature は宗主国の色相に寄せた明度違いの色になる
- [x] #3 data/colors.json が生成され、パレットは隣接勢力の色衝突を緩和できる十分な色数・彩度差を持つ
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. ブランチ task-3-colors-json を origin/main から作成
2. 並列化判定: 見送り。成果物が単一スクリプト（scripts/build-colors.ts）+ テストのみで独立した分割単位がなく、worktree 分割・PR conflict 解消のオーバーヘッドが利得を上回るため、subagent 1 体に委譲する
3. TDD: scripts/build-colors_test.ts を先に書き red 確認（決定的ハッシュ / パレット生成 / SUBJECTO 明度派生 / 全年代同色 の純粋関数）
4. scripts/build-colors.ts を実装: data/europe_*.geojson × 20 を読み、NAME をキーに決定的ハッシュでパレットから色割当（同一勢力は全年代同色）。SUBJECTO を持つ feature は宗主国の色相に寄せた明度違い。SUBJECTO の表記ゆれは data/name-overrides.json の renames を通してから解決（TASK-2 レビューで持ち越した論点）
5. パレットは十分な色数・彩度差を持つ設計（HSL ベース等）とし、data/colors.json を生成してコミット
6. deno.json に build-colors タスク追加
7. fmt/lint/test/build green → PR（TASK-3 明記）→ CI green → マージ → finalization
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
mainagent レビュー第1ラウンド: 実装・テスト・SUBJECTO 正規化（renames 経由の宗主国解決）は良好。要修正 1 件を指摘: fnv1a % 288 の誕生日衝突で独立勢力 256 中 150 が完全同色（66 グループ、例: Prussia と Kingdom of Sardinia が同色）。ソート順の線形プロービングによる決定的衝突解決を指示。
観察（スコープ外・将来の name-overrides 候補）: 'Aragón'/'Aragon'、'Norway'/'Kingdom of Norway'、'Burgandy'、'Irlanda' 等の表記ゆれが colors.json のキーに残存。TASK-2 の overrides カバレッジの問題であり本タスクでは非対応。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
scripts/build-colors.ts と data/colors.json を追加し PR #16 で実装。検証エビデンス: (AC1) FNV-1a 起点の決定的プロービング割当。colors.json は単一フラットマップのため同一 NAME は全年代同色。再生成で bit 同一の出力（決定的）、全 20 年代 1506 feature のキー突合で欠落 0 を確認 (AC2) SUBJECTO 持ち feature は renames 正規化した宗主国のプロービング後スロットと同色相・明度差 >=0.08 を全 28 検証対象で確認（不一致 0）。正規化後自己参照は属領扱いせずベース色 (AC3) 色相24段（黄金角）×彩度3段×明度4段=288 色パレット。レビューで発覚したハッシュ衝突（distinct 172/256）をソート順線形プロービングで解決し独立勢力 256/256 全色 distinct。deno test 67 passed、PR #16 CI green・MERGEABLE/CLEAN。
<!-- SECTION:FINAL_SUMMARY:END -->
