---
id: TASK-75
title: エルベ川が下流（ハンブルク〜北海河口）で途切れている
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 08:42'
updated_date: '2026-07-26 09:13'
labels:
  - bug
  - 'area:scripts'
  - 'area:data'
dependencies: []
references:
  - >-
    https://github.com/nvkelso/natural-earth-vector/blob/ca96624a56bd078437bca8184e78163e5039ad19/geojson/ne_50m_rivers_lake_centerlines.geojson
documentation:
  - docs/data-inventory/README.md
priority: high
type: bug
ordinal: 71000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
地図上のエルベ川ラインが下流で途切れ、北海の河口まで描かれていない。ホバー/クリック時の強調も途中で終わるため、河川として不完全に見える。

事前調査で判明していること（要検証・鵜呑みにしない）:
- data/rivers.geojson の Elbe は MultiLineString 1 feature（3 パート・95 頂点・scalerank 5）で、bbox は経度 9.7840〜15.8890 / 緯度 50.0314〜53.5546。西端は 9.784E（ハンブルク西の Wedel 付近）で終端し、クックスハーフェン河口（約 8.6E / 53.9N）に到達していない。経度 8〜9.78 の約 80km が欠落している。
- ピン留めコミット ca96624a56bd078437bca8184e78163e5039ad19 の Natural Earth 50m rivers_lake_centerlines 原データを取得して比較したところ、原ジオメトリの bbox が生成物と完全一致。simplify による頂点削減もほぼ無い（53→52 点、7→6 点）。
- したがって次の仮説は除外済み: EUROPE_BBOX クリップ（-25,34,60,72 で境界は遠い）、MAX_SCALERANK=5 の閾値、名前分割/エイリアス漏れ（ソースに Labe は存在しない）、simplify、描画側の間引き（src/main.ts の rivers レイヤーにクリップ・簡略化処理は無い）。
- 残る原因は「Natural Earth 50m rivers_lake_centerlines がエルベ河口部（幅広エスチュアリ）を河川センターラインとして保持していない」というソースデータ由来のもの。経度 7.5〜10.5 / 緯度 53.0〜54.6 の矩形内に頂点を持つ feature は Elbe ただ 1 本で、別名の下流セグメントも存在しない。
- ベースマップ側は water_river / water_stream を除外済み（decision-9）だが海ポリゴン water は残るため、河口部が海に溶けて消えているようにも見える。

対応方針は実装時に決定する。想定される選択肢: (a) 補完セグメントをデータとして追加し build-rivers パイプラインでマージする、(b) より詳細なソース（NE 10m rivers / rivers_europe 補足レイヤー等）を該当河川のみ併用する、(c) 修正せず既知の制限（src/known_limitations.ts）として明示する。いずれを選ぶ場合も、判断根拠を backlog decision に記録すること。

参考: scripts/build-rivers.ts（ソース取得・フィルタ・クリップ・名寄せ・simplify）、scripts/build-data.ts:33（EUROPE_BBOX）、src/config.ts:32-35（MAP_MAX_BOUNDS）、src/rivers.ts、src/main.ts:620-662 / 763-（河川レイヤー builder）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 エルベ川の下流欠落について根本原因が再現手順つきで特定され、タスク内に記録されている（ソース由来か生成パイプライン由来かが数値根拠で確定している）
- [x] #2 地図上でエルベ川が北海の河口（おおむね経度 8.6E / 緯度 53.9N 付近）まで連続した 1 本のラインとして描画される。修正しない判断を採る場合は、その根拠が backlog decision に記録され、src/known_limitations.ts に既知の制限として表示される
- [x] #3 ホバー/クリック時の強調がエルベ川の全区間に及び、途中で切れない（TASK-56 の回帰を再発させない）
- [x] #4 エルベ川の下流到達点を検証する自動テストが追加され、欠落が再発した場合に red になる（意図的な欠落再現で red を確認してから green にする）
- [x] #5 ソースデータや補完データを追加・変更した場合、data-inventory（docs/data-inventory/）に出典・ライセンス・取得方法が追記されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 根本原因の確定（AC#1）: ピン留めコミットの NE 50m 原データと data/rivers.geojson を数値比較し、欠落がソース由来であることを再現手順つきで確定・記録する。
2. 対応方針の決定: NE 10m rivers_lake_centerlines（同リポジトリ・パブリックドメイン）に Elbe 河口部センターラインが存在するか検証し、存在すれば (b) 該当区間のみ補完ソースとして併用する方式を採用。存在しなければ (a) 補完セグメント追加、それも不適なら (c) known_limitations 明示にフォールバック。採否の根拠を backlog decision に記録する。
3. TDD: エルベ川の下流到達点（西端が経度 8.75 以下・北緯 53.8 以上に達すること等）を検証するテストを scripts/build-rivers 系テストに追加し、現状データで red を確認する（AC#4）。
4. 実装: scripts/build-rivers.ts に補完マージ処理を追加し、data/rivers.geojson を再生成して green にする。名寄せにより Elbe が単一 feature に統合され、ホバー/クリック強調が全区間に及ぶこと（AC#3）を維持する。
5. docs/data-inventory/ に補完ソースの出典・ライセンス・取得方法を追記する（AC#5）。
6. deno fmt --check / lint / test / build を green にして PR 作成 → CI 監視 → マージ後にヘッドレス CDP スモークで河口までの描画・強調を確認する。

並列化判定: 見送り（理由: 方針決定→テスト→パイプライン修正→データ再生成→docs が単一のデータフローに直列依存しており、独立サブ作業に分割できないため。単一 subagent に委譲する）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: 根本原因はソース由来で確定。NE 50m @ ca96624a の Elbe 西端 = 東経 9.784034 / 北緯 53.554638 で河口部センターラインが元データに無い。再現手順（raw URL からの取得と最小経度・bbox 内頂点数の確認方法）を docs/data-inventory/README.md §10 に記録。
- AC#2: 修正しない判断（選択肢 c）を採用。補完候補 ne_10m_rivers_lake_centerlines（西端 9.819021E で 50m より手前）・ne_10m_rivers_europe（河口部 feature 無し）を実測却下。根拠を decision-14 に記録し、data/known-limitations.json の rivers-elbe-estuary-missing として表示（表示経路は src/known_limitations.ts パーサ → main.ts パネル）。ヘッドレス CDP で year=1000 / 1500 の両方でパネルに表示・active であることを確認（found=true, active=true）。
- AC#3: データ・描画コードとも無変更（git diff に data/rivers.geojson の差分なし）で Elbe は単一 MultiLineString feature のまま。TASK-56 回帰テストを含む deno test 686 passed。強調は描画されている全区間に及ぶ（描画範囲自体の下流欠落が本タスクで明示した既知の制限）。
- AC#4: 選択肢 c の採用に伴い『下流到達点を検証するテスト』は『制限エントリの存在・内容・全年代 active を検証するテスト』（scripts/known-limitations-json_test.ts）として実装。エントリ欠落（=制限の明示が失われる再発）で red になる。TDD: エントリ追加前に red を確認してから green（実装 subagent 報告・コミット 2349774）。
- AC#5: docs/data-inventory/README.md の河川行に出典（nvkelso/natural-earth-vector @ ca96624a）とライセンス（Public Domain）を追記、§9 に制限、§10 に実測値と再現手順を追記。
- 全チェック: deno fmt --check / lint（repo 管理ファイルは clean）、deno test 686 passed、deno task build 成功、verify:smoke PASS、PR #85 CI green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
エルベ川下流欠落の根本原因をソースデータ由来（NE 50m に河口部センターラインが存在しない）と数値根拠つきで確定し、10m 版・rivers_europe にも同区間が無いことを実測。出典なき座標合成を避け、修正せず既知の制限（rivers-elbe-estuary-missing）として明示する方針を decision-14 に記録した。制限エントリの存在・全年代 active を TDD（red→green）で検証するテストを追加し、data-inventory に出典・ライセンス・再現手順を追記。ヘッドレス CDP でパネル表示を実機確認し、deno test 686 passed・CI green（PR #85）。
<!-- SECTION:FINAL_SUMMARY:END -->
