---
id: TASK-48
title: タイムラインスライダー操作時に地図データ取得失敗エラーが発生する
status: In Progress
assignee:
  - '@claude'
created_date: '2026-07-24 12:13'
updated_date: '2026-07-24 12:44'
labels:
  - bug
dependencies: []
ordinal: 46000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー報告: タイムラインスライダーを操作すると「◯◯年の地図データ取得に失敗しました」というエラートースト（TASK-9 実装、src/main.ts 該当メッセージ）が表示される。再現手順の詳細（発生する年代・操作の速さ・毎回発生するか間欠的か）は未確定のため、まず実機（ビルド + dev サーバ + ブラウザ）で再現条件を確立すること。調査の手がかり: (1) src/main.ts の年代 GeoJSON ローダ（createYearDataLoader、fetch 失敗時に該当メッセージでトースト表示）周辺のロジック (2) TASK-35 で dev サーバに Cache-Control: no-cache を付与した変更が、連続してスライダーを動かした際の多重 fetch・リクエスト競合に影響していないか (3) HRE オーバーレイローダ（createHreOverlayLoader、対象年代のみ hre_<year>.geojson を要求）が非対象年代で 404 になるケースを正しく空データ扱いできているか（TASK-19 の複合ローダ設計との整合） (4) dist 配下に該当年代の europe_<year>.geojson / hre_<year>.geojson が実際に存在するか（ビルド生成物の欠落がないか）。原因を切り分けたうえで、再現テスト（red）→ 修正（green）の順で対応する。自動テストで再現できない場合に限り目視確認 AC を追加する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 報告された事象（スライダー操作で地図データ取得失敗エラー）の再現条件（年代・操作パターン）が特定されている
- [ ] #2 原因（fetch 競合・404 の扱い漏れ・キャッシュ設定・生成物欠落等）が特定されている
- [ ] #3 再現テスト（red）が追加され、修正により green になる
- [ ] #4 実機確認でタイムラインスライダーを一通り操作してもエラーが発生しないことを確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 原因調査（AC#1/#2）: subagent に委譲 — (a) src/main.ts の createYearDataLoader / createHreOverlayLoader / switchYear のエラー経路とスライダー連打時の並行 fetch・順序逆転・abort の扱いを静的解析 (b) ビルド生成物（dist/data/）に全 SNAPSHOT_YEARS の europe/hre geojson が揃っているか機械確認 (c) ローカルで dev サーバ + 連続リクエストで再現を試行（curl 連打・deno テストハーネス）。
2. TDD（AC#3）: 特定した原因を再現する red テスト（例: 高速切替時の順序逆転で古い応答が新しい年代を上書き/失敗トーストを出す、404 の扱い漏れ等）→ 修正で green。
3. 実機確認（AC#4）: スライダーを全域往復してエラートーストが出ないことを確認。
4. 並列化判定: 見送り（理由: 原因特定に修正が依存する逐次構造。調査・実装とも単一 subagent、実機確認は mainagent）。
<!-- SECTION:PLAN:END -->
