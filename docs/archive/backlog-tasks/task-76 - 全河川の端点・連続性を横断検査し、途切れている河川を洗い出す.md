---
id: TASK-76
title: 全河川の端点・連続性を横断検査し、途切れている河川を洗い出す
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 08:42'
updated_date: '2026-07-26 10:57'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies:
  - TASK-75
type: spike
ordinal: 72000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-75（エルベ川の下流欠落）と同種の問題が他の河川にも無いかを網羅的に調べる。data/rivers.geojson の全 feature について端点・パート間の連続性・地図表示範囲との関係を機械的に検査し、途切れている河川を一覧化する。

事前調査で既に見えている候補（要検証・鵜呑みにしない。data/rivers.geojson は 48 features / 30 ユニーク名）:

EUROPE_BBOX（-25,34,60,72）による意図的クリップ（仕様上の想定内かの確認が必要）
| 河川 | ソース bbox | 出力 bbox | 切断辺 |
|---|---|---|---|
| Amu Darya | 58.32,36.95..68.21,44.43 | 58.32,42.27..60.00,44.43 | 東 60E |
| Euphrates | 37.85,30.90..47.47,40.18 | 37.85,34.00..42.51,40.18 | 南 34N（加えて東端 42.51 が自然終端でない可能性） |
| Tigris | 39.64,31.00..47.44,38.42 | 39.64,34.00..44.36,38.42 | 南 34N |

河口に届かず内陸で終端しているもの（ソース由来の欠落と推定）
- Elbe: 終端 9.784E（河口 約 8.6E）— TASK-75 で対応
- Oder: 終端 14.584E / 53.639N（シュチェチン潟）。バルト海口（シフィノウイシチェ 約 14.25E / 53.9N）に未到達
- Loire: 終端 -1.743E / 47.216N（ナント付近）。サン＝ナゼール河口 約 -2.2E に未到達。加えて原データにジオメトリが空（coordinates: []）の Loire / scalerank 5 feature が 1 件存在し、clipRiversToBbox → cleanLineGeometry で落ちている。Loire の一部区間が原データ側で欠損している可能性を示唆する
- 一方 Vistula（18.976,54.349 グダニスク）、Seine（0.439,49.473）、Tejo（-8.79）、Ebro（0.89）は概ね河口まで到達している

本タスクは調査（spike）であり、個々の河川の修正は含めない。検出された問題は、修正方針つきの個別タスクとして起票する。TASK-75 で確立した原因切り分け手順・検証テストの型を再利用すること（そのため TASK-75 に依存する）。

参考: scripts/build-rivers.ts、scripts/build-rivers_test.ts:267-299（SOURCE_RIVER_NAMES スナップショット）、scripts/build-data.ts:33（EUROPE_BBOX）、src/config.ts:32-35（MAP_MAX_BOUNDS）、src/known_limitations.ts。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 data/rivers.geojson の全 feature について、パート数・端点座標・パート間ギャップ距離・出力 bbox とソース bbox の差分を機械的に算出する検査手段が用意され、結果が再現可能な形で残っている
- [x] #2 「途切れている」と判定された河川が一覧化され、各件について原因が (a) EUROPE_BBOX による意図的クリップ (b) Natural Earth ソース由来の欠落 (c) 生成パイプラインの不具合 のいずれかに分類されている
- [x] #3 判定基準（何をもって途切れとみなすか。例: パート間ギャップの閾値、河口到達の判定方法）が明文化され、恣意的でないことが説明されている
- [x] #4 調査結果が調査ドキュメントとして残され、(c) に分類された件および対応すべき (b) の件が個別の backlog タスクとして起票されている（起票不要と判断した件はその理由が記録されている）
- [x] #5 将来のソース更新で新たな途切れが混入した場合に検知できる回帰テストを追加するか、追加しない場合はその判断理由が記録されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 検査スクリプトの作成: data/rivers.geojson の全 feature についてパート数・端点座標・パート間ギャップ距離・出力 bbox とソース bbox（ピン留めコミットの NE 50m 原データ）の差分を機械的に算出する。再現可能な形（deno run で再実行可能なスクリプト + 結果出力）で残す（AC#1）。
2. 判定基準の明文化（AC#3）: パート間ギャップ閾値・河口到達判定（海岸線 or 既知河口座標との距離）・EUROPE_BBOX 辺への接触判定を定義し、恣意性を排した根拠を記述する。
3. 途切れ判定された河川を (a) EUROPE_BBOX 意図的クリップ (b) ソース由来欠落 (c) パイプライン不具合 に分類（AC#2）。TASK-75 で確立した切り分け手順（原データ bbox 比較・代替ソース実測）と decision-14（出典なき補完はせず known-limitations 明示）を適用する。
4. 調査ドキュメントを docs/data-inventory/ 配下（または既存規約に従う場所）に残す（AC#4 前半）。
5. 回帰テスト（AC#5）: ソース更新時に新たな途切れを検知するテストを追加するか、しない場合の理由を記録。
6. (c) 該当件・対応すべき (b) 件の個別タスク起票（AC#4 後半）は mainagent が finalization 時に調査結果に基づき backlog CLI で行う（subagent には backlog を操作させない）。
7. 全チェック green → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 検査スクリプト → 判定 → 分類 → ドキュメントが単一の調査フローとして直列依存するため。単一 subagent に委譲）。
タスク間並列: next-tasks の集合判定により TASK-82（area:app）と並列実行（本タスクは area:scripts,data で互いに素）。worktree isolation で衝突回避。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: scripts/audit-rivers.ts（deno task audit-rivers・約 9 秒）が全 30 河川のパート数・端点・パート間ギャップ・ソース bbox 差分を機械算出し .outputs/claude/task-76/rivers-audit.{json,md} を出力。mainagent が再実行し同一結果を再現確認。
- AC#2: 成分分断 0 / 出口欠如 0 / (c) パイプライン起因 0 / (a) EUROPE_BBOX クリップ 3 件（Amu Darya=east 60E, Euphrates・Tigris=south 34N）。(b) 候補（Oder・Loire 等）は終端が ne_50m_coastline に接し（0.00〜0.01 km）NE 全体の一貫仕様と判明、10m 版でも補完不能を実測。
- AC#3: 接続閾値 1.0 km は感度分析（0.5 km→32 件、1〜50 km→30 件で平坦）で決定し 2 桁動かしても結論不変。河口到達は水域への点↔線分距離 2 km。却下した基準（開放海域距離: Tejo 62.8 km が連続分布で閾値不能）も実測付きで docs/data-inventory/rivers-continuity-audit.md に記録。
- AC#4: 調査ドキュメント docs/data-inventory/rivers-continuity-audit.md（README §9 からリンク）。起票: TASK-83（known-limitations の Elbe 限定記述を NE 全体仕様へ一般化・low）。(a)3 件は MAP_MAX_BOUNDS 外縁と一致し視認不能のため起票不要、(b) 個別修正は decision-14 により起票不要、空ジオメトリ Loire feature は別 feature が連続被覆しており起票不要（いずれも理由をドキュメントに記録）。
- AC#5: 回帰テスト 3 件を scripts/audit-rivers_test.ts に追加（オフラインで data/rivers.geojson を検証: 単一連結成分・bbox クリップ 3 件固定・意図的分断の検出）。red 確認（閾値 0.05 km で 7 河川検出）→ green。CI の deno test に --allow-read=data を追加。
- 副次修正: Volga 分断疑い（93.2 km）は端点距離ベース判定の誤検出と判明し、判定を端点↔相手ライン距離へ変更。
- 全チェック: fmt/lint clean、deno test 774 passed（main 取り込み後）、build green、PR #89 CI green。
- decision 記録判定: 新規 decision なし（decision-14 の適用範囲確認が主結論。判定基準・閾値は調査ドキュメントに記録し、タスク横断の新方針は含まない）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
data/rivers.geojson 全 30 河川の端点・連続性を機械検査する監査スクリプト（deno task audit-rivers）と再現可能な調査ドキュメントを整備。結果は成分分断 0・パイプライン起因 0・bbox クリップ 3 件（視認不能・起票不要）で、河口未到達は NE 全体の一貫仕様（10m 版でも補完不能を実測）と確定し、known-limitations 文言の一般化のみ TASK-83 として起票。閾値は感度分析で非恣意性を担保し、ソース更新時の新規途切れを検知する回帰テスト 3 件を追加（red→green 確認）。deno test 774 passed・CI green（PR #89）。
<!-- SECTION:FINAL_SUMMARY:END -->
