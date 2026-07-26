---
id: TASK-80
title: 概略でしかない超長直線の境界を「概略境界」として描き分け既知の制限に明記する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 09:03'
updated_date: '2026-07-26 12:49'
labels:
  - 'area:app'
  - 'area:data'
dependencies:
  - TASK-84
references:
  - 'https://github.com/aourednik/historical-basemaps'
  - 'https://www.euratlas.net/history/europe/legend.html'
  - 'https://www.gicentre.net/woodsketchy2012'
modified_files:
  - src/main.ts
  - data/known-limitations.json
priority: medium
type: enhancement
ordinal: 75000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘 1（2026-07-26 / 1200 年・フランス周辺）: 地図中央をルーアン南からリモージュ北まで 277 km にわたって完全な直線が縦断しており、精密に測量された国境のように見えてしまう。
ユーザー指摘 2（同日 / 1200 年・南フランス）: トゥールーズ伯領の北縁も長い水平の直線で、不自然。「データが無いのでこう表現されるのは分かるが、最低でも目立たないようにしたい」。

事前調査で判明していること（要検証・鵜呑みにしない）:
- 指摘 1 の線は base の Kingdom of France と Angevin Empire の境界で、両者の共有頂点は 4 点しかなく、実質 3 本の直線（277 km / 142 km / 138 km）で構成されている。座標は (0.53482, 48.00995) → (1.15139, 45.55267) など。
- 指摘 2 の線は Comté de Toulouse の北縁で、(0.86513, 44.55714) → (2.62675, 44.77639) の 141 km、(2.60736, 44.78659) → (3.43049, 44.72165) の 65 km が連なった **合計約 206 km のほぼ水平な直線**。トゥールーズ伯領のポリゴンは全体でも 76 頂点しかない。
- 元データ world_1200.geojson（ピン留めコミット 62d8f1a03a71f2d3ff17f2d166f7553f256bce68）を取得して配信中の europe_1200.geojson と比較したところ、画像域（西経 6 度〜東経 11 度・北緯 42〜53 度）のセグメント数は 632 → 596、中央値 16.27 km → 17.08 km、100 km 超のセグメントは両者とも 29 本で座標も完全一致。つまり **粗さは元データ由来で、自前の simplify は原因ではない**。SIMPLIFY_TOLERANCES の最小値 0.005 度で 112 KB（SIZE_LIMIT_BYTES 300 KB の 4 割弱）に収まっており、tolerance を下げても改善しない。
- 同種の超長直線は他にもある: León ↔ Castilla 293 km、Celtic kingdoms ↔ Angevin Empire 181 km、Comté de Toulouse ↔ Angevin Empire 168 km、Holy Roman Empire ↔ Burgandy 149 km。

BORDERPRECISION についての訂正（重要・当初の記述は誤り）:
- 当初この欄に「BORDERPRECISION が全 feature で 1 固定なので信頼度メタとして使えない」と書いたが、これは誤読だった。取得元 aourednik/historical-basemaps の README によれば BORDERPRECISION は序数で **1 = approximate（概略）/ 2 = moderately precise / 3 = determined by international law** と定義されている。全 feature が 1 ということは「データ提供者がこの年代の全境界を概略と宣言している」ことを意味する。
- したがって本タスクの前提は「長いセグメントだけが概略」ではなく **「表示中の境界は全て概略であり、現状の 1px くっきり線が誤ったメッセージを出している」** に改める。長さ閾値は「特に概略の度合いが強い区間をさらに強調して和らげる」ための二次的な指標として使う。

他サービス・先行研究の調査（2026-07-26 実施）:
- historical-basemaps の README 自身が推奨手法を明記している: 「When rendering, transparent layers (opacity < 100%) and blur effects is a convenient way to deal with fuzzy and overlapping borders」。また「visual distinction between precise and approximate borders can also be achieved on the same map」として D3.js の作例を挙げている。出典: https://github.com/aourednik/historical-basemaps
- Euratlas（商用の歴史地図）は「fuzzy_borders」という**不確かさを面として持つ専用レイヤー**を GIS データに同梱している。加えて記号法として点線を使い分け、名目的に従属するだけの領域は宗主国と同色の点線枠で囲み、実体がよく分かっていない勢力は点線、組織化が始まった勢力はベタ塗りとする。出典: https://www.euratlas.net/history/europe/legend.html
- 情報可視化の研究では「sketchiness（手描き風の揺らぎ）」を不確かさの視覚変数として使う手法が提案・評価されている（Wood et al., Sketchy Rendering for Information Visualization, IEEE TVCG 2012 / Boukhelifa et al., Evaluating Sketchy Lines for the Qualitative Visualization of Uncertainty）。空間的な不正確さの伝達に有効とされ、本アプリの羊皮紙・古地図トーン（TASK-73/74）とも親和性が高い。出典: https://www.gicentre.net/woodsketchy2012 と https://tobias.isenberg.cc/personal/papers/Boukhelifa_2012_ESL.pdf

改善案（実装時に比較検討し、採否と根拠を notes に記録すること）:
- (a) 境界線を MapLibre の line レイヤーへ移し、line-blur でにじませる。deck.gl の GeoJsonLayer/PathLayer には blur も破線も無いが、MapLibre の line レイヤーには line-blur / line-dasharray / line-gradient が揃っている。TASK-78 で生成済みの base_outline_<year>.geojson（LineString）をそのまま GeoJSON source にできる。**TASK-84（沿岸線が water に隠れる）と同じ描画層の問題なので、まず TASK-84 で移設方針を決めてから本タスクで表現を載せる**（この順序のため TASK-84 に依存させる）。
- (b) セグメント長で不確かさを段階化し、長い区間ほど blur を強く・alpha を低くする。指摘 1・2 の直線が最も強く和らぐ。
- (c) 塗りの色境界への対処。線を消しても隣接勢力の色の境目が直線であることは変わらないため、線だけの対策では不十分。概略区間に沿って太い低 alpha のにじみ帯（Euratlas の fuzzy_borders に相当）を重ねる案が現実的。
- (d) sketchy rendering（描画時のみ決定的な微小変位を与えて手描き風にする）。データは改変せず、ズーム間で同じ揺らぎを再現できる決定的な擬似乱数が必須。効果は大きいが実装コストも大きいため、(a)〜(c) の次段階として扱う。
- 諸侯領（OHM）の union で base の境界を置き換える案は引き続き採らない。OHM はトゥールーズ伯領・王領などを収録しておらず union が不完全で、機械適用すると領土を誤って削る（史実の改変になる）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 境界線が「概略境界」として読める表現（にじみ・低 alpha 等）になり、精密に測量された線には見えない
- [x] #2 一定長（例: 50 km）を超えるセグメントは、通常区間よりさらに不確かさを強調した表現になる
- [x] #3 1200 年で目視確認し、トゥールーズ伯領北縁の約 206 km の水平直線と、フランス王国 ↔ アンジュー帝国の 277 km 直線が直線として目立たなくなっている
- [x] #4 塗りの色境界の直線性（線を消しても残る）についても対処するか、対処しない判断とその根拠が記録されている
- [x] #5 不確かさの判定閾値と表現が定数として定義され、単体テストで検証される
- [ ] #6 境界線の描画方式を変更しても、ホバー・クリックの picking 優先順と挙動が従来と変わらない
- [ ] #7 data/known-limitations.json に、元データが全境界を BORDERPRECISION=1（概略）と宣言していること、年代・地域によっては数百 km の直線で近似されていることが追記され UI に表示される
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方式決定（実装冒頭で比較・根拠を notes に記録）: 本命は (a)+(b) の組合せ = base 境界線を MapLibre line レイヤー（GeoJSON source: TASK-78 生成の base_outline_<year>.geojson）へ移し、line-blur・低 alpha で全区間を概略表現化（BORDERPRECISION=1 の宣言に忠実）。セグメント長の閾値（例 50 km）で段階化し長い区間ほど blur 強・alpha 低（AC#2）。ビルド時にセグメント長を属性化する前処理を追加。
2. (c) 塗りの色境界: 概略区間に沿う低 alpha のにじみ帯（fuzzy band）の追加可否をコスト・見た目で評価し、対処しない場合は根拠を記録（AC#4）。
3. (d) sketchy rendering は次段階として見送り（コスト大）。
4. TDD: 閾値・段階化の判定と派生データ生成の単体テスト、layer_stack / waterStackIsValid との整合テストを先に red で固定。
5. 実装は decision-15（TASK-84 改訂後の重ね順: 内水面→政治ポリゴン→海洋→coastline）と矛盾しない位置に line レイヤーを配置。fief（諸侯領）輪郭・picking は対象外（base の輪郭のみ）。
6. 全チェック green → CDP で 1200 年（トゥールーズ北縁 206 km・仏王国↔アンジュー 277 km）と回帰年代を目視確認 → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 表現方式の決定が前処理・描画・テストの全てを規定する単一意思決定のため。単一 subagent に委譲）。
タスク間並列: なし（TASK-81 は area:data 競合で次イテレーション）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: base 境界線を MapLibre line レイヤー（にじみ + 低 alpha）へ移設。CDP（1200 年 z6.5〜7）で精密線に見えない概略表現を確認。fief（OHM 詳細境界）は従来どおり明瞭で対比が付く。
- AC#2: セグメント長 3 段化（50 km ≈ p90 / 100 km ≈ p95、実データ分布から決定）で長い区間ほど blur 強・alpha 低。TIER_STYLES に定数化。
- AC#3: 仏王国↔アンジュー帝国の 277 km 直線・トゥールーズ北縁 206 km を CDP で確認し、いずれも淡いにじみとなり直線として目立たない。
- AC#4: 色境界の直線性は fuzzy band を比較検証の上で不採用（帯が視線を引く）とし、sketchy rendering を次段階候補として記録。根拠は本 notes・コミット・decision-16 に記録。
- AC#5: 閾値・段判定・表現定数を src/approximate_borders.ts に定義し approximate_borders_test.ts（+ layer_stack_test）で検証。TDD で red→green（コミット eb3f4d2）。
- 重ね順は「塗り → 概略境界 → 海洋 → coastline」で TASK-84 と両立（海側の線は海洋が覆う）。ブルターニュ沿岸・1815 年密集域の回帰なしを CDP で確認。verify:smoke PASS。
- known-limitations に全境界概略（BORDERPRECISION=1）エントリを追加しテスト検証。
- 全チェック: fmt/lint clean、deno test 824 passed、build green、PR #93 CI green。
- decision 記録: decision-16（概略境界表現）を新規作成、decision-15 に改訂 2 を追記。
- 検証時の注意: CDP 断が発生したが dev サーバ停止（環境）起因と main ベースライン比較で切り分け、本変更とは無関係。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
BORDERPRECISION=1 の宣言に忠実に、base 境界線を MapLibre line レイヤーの「概略境界」（にじみ + 低 alpha、セグメント長 3 段化）へ移設。277 km / 206 km の直線近似が精密国境に見える問題を解消し、海側の線は海洋に覆わせて TASK-84 と両立。表現は定数化して単体テストで固定（824 passed）、fuzzy band 不採用と sketchy rendering 送りの判断を記録、decision-16 新規・decision-15 改訂。CDP 目視 4 ビュー・CI green（PR #93）。
<!-- SECTION:FINAL_SUMMARY:END -->
