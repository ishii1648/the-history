---
id: TASK-24
title: 主要河川のラベル表示とクリックによるライン強調
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 13:25'
updated_date: '2026-07-21 14:13'
labels: []
dependencies: []
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（agent-loop 実行中の報告）: TASK-21 で追加した主要河川（data/rivers.geojson、properties に name/scalerank あり）について、(1) 河川名のラベルを地図上に表示したい、(2) 河川をクリックしたら該当河川のラインを目立たせて表示したい。

実装の手がかり: 現在の河川はベースマップの MapLibre style レイヤー（src/basemap.ts の rivers ソース + line レイヤー）として描画されており、クリック判定・動的スタイル変更をしやすくするには deck.gl レイヤー（GeoJsonLayer/PathLayer, pickable）への移行が有力。ラベルは TASK-20 と同様 deck.gl TextLayer + CollisionFilterExtension を流用でき、ラインの代表点（最長セグメントの中点等）にアンカーする方式が考えられる。ベースマップの glyphs は未設定のため MapLibre symbol レイヤー（symbol-placement: line）を使う場合は glyphs 追加が必要になる点に注意。勢力名の日本語化（TASK-23）が先に完了している場合は河川名の表記方針（日本語マッピングへの追加）も合わせること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 主要河川（ライン川・ドナウ川・エルベ川等）の名前ラベルが地図上で河川の近傍に表示される
- [x] #2 河川のラインをクリックすると該当河川全体が強調表示（太さ・色の変化等）され、もう一度クリックするか別の場所をクリックすると解除される
- [x] #3 河川のラベル・クリック判定が勢力ポリゴンのホバー/クリック（ツールチップ・情報パネル）を阻害しない
- [x] #4 追加・変更した純粋ロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: 河川の描画を MapLibre style レイヤー（basemap.ts の rivers ソース+line レイヤー）から deck.gl の GeoJsonLayer（line, pickable）へ移行し、クリック判定と動的強調（選択河川の太線・濃色化）を deck.gl 側で実現する。描画順は powers/hre の上（ライン 2px 程度なのでポリゴン視認性への影響は軽微、クリックは最前面判定のため river 線上では river が拾える）。線のクリックしやすさは overlay の pickingRadius で確保。
2. 強調: モジュール状態 selectedRiverName を持ち、getLineColor/getLineWidth を選択状態依存のアクセサ + updateTriggers で切替。同一河川の再クリックで解除、勢力ポリゴン/空白のクリックでも解除。選択時は情報パネルに河川名を表示。
3. ラベル: rivers.geojson の name を持つ feature の最長 LineString 中点にアンカーする純粋関数を src/rivers.ts に実装し、既存 TextLayer（power-labels）とは別に河川用 TextLayer（水色系・やや小さめ・CollisionFilterExtension 共用）を追加。表記は nameJa 適用（未登録は英語）。
4. 日本語訳: data/name-ja.json に rivers.geojson の全ユニーク name（Rhine→ライン川 等）を追加し、scripts/name-ja_test.ts のカバレッジ対象に rivers.geojson を含める。
5. basemap.ts: rivers ソース/レイヤー・buildRiversLayer を撤去（TASK-21 の描画部分の置換。出典表記はフッターに維持）。basemap_test を更新。
6. 並列化判定: 並列可（独立サブ作業 2 件、worktree isolation）
   - subagent A（フロント）: src/rivers.ts / rivers_test.ts 新規（アンカー・強調状態の純ロジック）、src/main.ts（deck レイヤー追加・クリック連動）、src/basemap.ts / basemap_test.ts（style レイヤー撤去）。担当: src/*
   - subagent B（訳データ）: data/name-ja.json への河川名追加と scripts/name-ja_test.ts のカバレッジ拡張。担当: data/name-ja.json / scripts/name-ja_test.ts
   - 契約: 河川ラベルは ja[name] ?? name（A は B の中身に依存しない）。担当ファイルは互いに素
7. TDD: 両 subagent がテスト先行（red→green）→ mainagent 統合レビュー → fmt/lint/test/build 全 green → 目視確認（ラベル・クリック強調・解除・勢力 picking 非阻害）→ PR → CI → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: Chrome（z5.5, 1500 年）でライン川・オーデル川・ヴィスワ川・ロワール川・エルベ川等のラベルが河川近傍に日本語で表示されることを確認（レク川・ネーデルライン川・ワール川等の分流も表示）。
- AC#2: z7 でエルベ川の線上をクリック → 河川全体が太線（4.5px）・濃色（#0288d1）で強調され情報パネルに「エルベ川」を表示。同じ線上を再クリック → 通常表示（2px #80deea）へ解除。勢力クリックでも解除される設計（Deck レベル onClick への集約）。
- AC#3: 勢力ポリゴンのクリック（神聖ローマ帝国・ブランデンブルク）でツールチップ/情報パネルが従来どおり動作することを同セッションで確認。河川ラベルは pickable: false。
- AC#4: src/rivers_test.ts 19 テスト（トグル 3 パターン・最長 LineString 中点・MultiLineString・priority 単調性・色/幅切替）+ name-ja_test カバレッジ拡張。deno fmt --check / lint / test（298 passed / 0 failed）/ build 全 green。PR #33 CI pass。
- 実装: subagent 2 並列（フロント 4faa4ad / 訳データ 1c12a29）+ TDD。deck.gl の per-layer hover の leave/enter レースをソース実読で確認し Deck レベル集約を採用。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
河川描画を MapLibre style から deck.gl の pickable GeoJsonLayer へ移行し、クリックで選択河川を太線・濃色に強調（再クリック/他所クリックで解除・情報パネルに河川名表示）。最長 LineString 中点アンカー + 衝突制御の河川ラベル（日本語 37 件を name-ja.json に追加）を新設。イベントは Deck レベル onHover/onClick に集約し勢力 picking を阻害しない。検証は deno test 298 passed・CI pass・Chrome でのラベル/強調/解除/勢力 picking の目視確認。
<!-- SECTION:FINAL_SUMMARY:END -->
