---
id: TASK-152
title: 主要河川の scalerank 閾値を 6 へ引き上げ、ポー川・ローヌ川・テムズ川等の欠落を解消する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-29 15:59'
updated_date: '2026-07-29 18:02'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:docs'
dependencies: []
references:
  - scripts/build-rivers.ts
  - scripts/build-rivers_test.ts
  - data/name-ja.json
documentation:
  - docs/data-inventory/README.md
priority: medium
type: enhancement
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ヨーロッパ史の主要河川であるポー川・ローヌ川・ガロンヌ川・ドン川・ドニエストル川・ドラーヴァ川・ドゥエロ川・ティサ川・テムズ川などが地図に一切描画されていない。

原因はデータソースの欠落ではなく、scripts/build-rivers.ts の `MAX_SCALERANK = 5` によるフィルタである。ピン留めコミット ca96624 の Natural Earth 50m rivers_lake_centerlines を実測したところ、これらはいずれも `scalerank = 6` として収録されており、`filterMajorRivers` で落ちている。同ファイル 55 行目のコメント「6 は細かすぎるため除外」は、当初ドナウ〜エルベを網羅する閾値として決めた際の判断と思われるが、rank 6 の中身（ポー・ローヌ・ガロンヌ・ドン）を踏まえると欧州史の地図としては誤った線引きになっている。

実測値（EUROPE_BBOX クリップ後）:
- MAX_SCALERANK=5: 48 features / ソース名 37
- MAX_SCALERANK=6: 78 features / ソース名 59（+30 features）
- rank 6 の内訳: Ariège, Dalälven, Dniester, Don, Drava, Duero, Ferenc Csatorna, Garonne, Glomma, Göta älv, Kama, Kem, Kemijoki, Kokemäenjoki, Po, Rhône, Soroksari Duna, Thames, Tisa, Tisza, Vorma, Vuoksi
- data/name-ja.json 未登録は上記 22 名（canonicalRiverName 適用後）
- 国境またぎの呼称違いと思われる組: Tisa（セルビア）/Tisza（ハンガリー）、Duero（スペイン）/Douro（ポルトガル。ただし Douro は rank 6 の欧州 bbox 内に未出現のため要実測）。実データの端点座標一致で継続区間かを確認し、該当すれば RIVER_NAME_ALIASES へ登録する（TASK-56/TASK-63 と同じ判定方法）
- Ferenc Csatorna（運河）・Soroksari Duna（ドナウの分流）は河川かどうかの採否判断が要る

サイズ余裕は十分にある。現状 data/rivers.geojson は 51,262 バイトで、RIVERS_SIZE_LIMIT_BYTES = 150,000 の約 1/3。feature 数が 1.6 倍になっても shrinkToLimit の tolerance 調整で収まる見込み。

なお EUROPE_BBOX = [-25, 34, 60, 72] はブリテン諸島を完全に含むため、bbox は原因ではない。Severn / Trent / Shannon は 50m 版に非収録（10m 版に scalerank=8 でのみ存在）であり、本タスクの対象外とする。

発見契機: 「イギリスの河川が地図にないのはデータソースに含まれていないためか」というユーザーの問い合わせ調査。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 MAX_SCALERANK が 6 になり、data/rivers.geojson に Po・Rhône・Garonne・Don・Thames の各 feature が含まれる
- [x] #2 scripts/build-rivers_test.ts の SOURCE_RIVER_NAMES スナップショットが再生成され、既存の 3 つの回帰テスト（正準名の name-ja.json 登録・日本語表示名の収束・死んだエイリアス検出）が green である
- [x] #3 rank 6 で新規に現れる全ソース名が data/name-ja.json に日本語名を持つ
- [x] #4 国境またぎの呼称違い（Tisa/Tisza 等）が実データの端点座標一致で検証され、継続区間であれば RIVER_NAME_ALIASES に登録されている
- [x] #5 data/rivers.geojson が RIVERS_SIZE_LIMIT_BYTES 以下に収まっている
- [x] #6 build-rivers.ts の MAX_SCALERANK に関するコメントが、6 を採用した根拠（rank 6 に欧州史の主要河川が含まれる）へ更新されている
- [x] #7 運河・分流（Ferenc Csatorna・Soroksari Duna）の採否が判断され、除外する場合はその根拠がコード内に記録されている
- [x] #8 実機で地図を開き、ポー川・ローヌ川・テムズ川がラベル付きで描画されクリック/ホバー強調が全区間に及ぶことを確認済みである
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. scripts/build-rivers.ts の MAX_SCALERANK と filterMajorRivers・RIVER_NAME_ALIASES（TASK-56/63 の判定方法）を読む
2. TDD: SOURCE_RIVER_NAMES スナップショット再生成と回帰テスト 3 種の green を先に確認する体制を作り、MAX_SCALERANK を 6 へ（根拠コメント更新 = AC#6）
3. rank 6 の新規 22 名へ日本語名を追加（AC#3）。Tisa/Tisza・Duero/Douro を端点座標一致で検証し継続区間なら ALIASES 登録（AC#4）。運河/分流の採否判断を記録（AC#7）
4. data/rivers.geojson を再生成しサイズ上限内を確認（AC#5）。attribution 追随
5. 実機（ポート 8152）でポー・ローヌ・テムズのラベル描画とクリック/ホバー強調の全区間到達を確認（AC#8）
6. fmt / lint / test / build green

並列化判定: 見送り（理由: 閾値変更 → 再生成 → 訳・エイリアス → 実機確認が直列）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- MAX_SCALERANK 5 → 6。rivers.geojson 48 → 77 features（正準名 30 → 50 河川）、42,540 → 64,134 バイト（上限の 43%・tolerance=0.005 不変）
- AC#4: Tisza（ハンガリー）南端と Tisa（セルビア）北端が [20.178851, 46.260846] で完全一致 = 単一連続ラインを確認しエイリアス登録（正準は流路の大半を占める Tisza）。Douro は 50m 版に feature 不在（Duero がポルト近郊 W8.67° まで達する単一 feature）でエイリアス不要 — Dniester/Drava も同様、実測を ALIASES コメントに記録
- AC#7: Ferenc Csatorna は 1793〜1802 築造の人工運河で本アプリの年代では anachronism → EXCLUDED_WATERWAY_NAMES + excludeArtificialWaterways（純粋関数・テスト付き）で除外。Soroksari Duna はドナウの自然分流で採用（Waal/Nederrijn/Bratul 系の採用前例と整合）
- AC#3: 日本語名 20 件追加。Kem は「ケミ川（カレリア）」として Kemijoki（ケミ川）との表示名衝突を回避（回帰テスト (ii) が検出）
- 波及: Po の中点アンカーがピアチェンツァ 0.053° で TASK-136 の都市回避対象入り → 0.42° の代替点へ移動（テストで Rhine と同列に固定）。rivers.ts のズーム段コメントを z4=27/z5=35/z6=50 本へ更新。ADR-0003・data-inventory README 追随
- AC#8 実機（ポート 8152）: Po（z5・200km 遠点 probe 含む全区間強調）・Rhône（z5・複数 feature）・Thames（z6）のラベル描画 + hover/selected 確認。z4 概観の密度も問題なし
- AC#2: SOURCE_RIVER_NAMES 37 → 58 名・回帰テスト 3 種 green。1557 → main 取り込み後 1587 passed（mainagent 独立検証）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
MAX_SCALERANK を 6 へ引き上げ、ポー川・ローヌ川・ガロンヌ川・ドン川・テムズ川等 20 河川を追加（77 features・サイズ上限の 43%）。Tisa/Tisza は端点一致でエイリアス統合、Douro は不在を実測記録、フランツ運河は根拠付きで除外。日本語名 20 件・Po アンカーの都市回避連動・実機での描画/強調確認済み。1587 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
