---
id: TASK-99
title: 主要山峰を標高付きマーカーで表示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 17:00'
updated_date: '2026-07-27 14:34'
labels:
  - 'area:scripts'
  - 'area:data'
  - 'area:src-main'
  - 'area:src-cities'
dependencies:
  - TASK-97
ordinal: 92000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景・目的

山脈名ラベル（TASK-97）に加えて、モンブラン・マッターホルンなどの主要山峰を
マーカーで表示し、山岳情報をより具体的に読めるようにする。

調査の詳細は `.outputs/claude/mountain-display-survey.md`。

## 使えるデータ（実物を取得して確認済み、2026-07-27）

Natural Earth の `ne_10m_geography_regions_elevation_points.geojson`（0.86 MB）。
河川・山脈と同じリポジトリ `nvkelso/natural-earth-vector` のピン留めコミット
`ca96624a56bd078437bca8184e78163e5039ad19` から取得できる（Public Domain）。

ヨーロッパ域内（bbox -12〜42, 34〜72）に 87 件。`NAME_JA`（日本語名）と
`ELEVATION`（m）、`SCALERANK` を持つ。

| 名称 | NAME_JA | 標高 m | SCALERANK |
| --- | --- | ---: | ---: |
| Mont Blanc | モンブラン | 4807 | 3 |
| Monte Rosa | モンテ・ローザ | 4634 | 9 |
| Matterhorn | マッターホルン | 4478 | 6 |
| Grossglockner | グロースグロックナー山 | 3798 | 6 |
| Mulhacén | ムラセン山 | 3479 | 7 |
| Pico de Aneto | アネト山 | 3404 | 7 |
| Monte Etna | エトナ山 | 3322 | 6 |
| Zugspitze | ツークシュピッツェ | 2963 | 9 |
| Mount Olympus | オリンポス山 | 2917 | 6 |

## 実装時に判断する点

- **収録件数**: 87 件すべては多すぎる。`SCALERANK` または `ELEVATION` で
  絞り込む閾値を決める（アルプス周辺はラベルが密集するため、TASK-38 / TASK-54 /
  TASK-72 のラベル視認性の知見に沿った密度制御が要る）。
- **マーカー表現**: 都市マーカー（`src/cities.ts`）と同じ経路で描けるが、
  都市と記号を区別する必要がある（古地図らしい山記号にするか、色・形で分けるか）。
- **ラベル内容**: 名称のみか標高を併記するか。併記するとラベル面積が増えて
  衝突が起きやすくなる。
- **ズーム出し分け**: `SCALERANK` を既存のズーム段へ対応づける。
- **年代非依存**: 山峰は全年代で同一なので、年代スナップショットとは独立した
  1 ファイルにする（河川・山脈と同じ扱い）。
- **山脈ラベルとの関係**: TASK-97 の山脈名ラベルと同じ場所に出ると二重になるため、
  優先順位・衝突回避の規則を決める。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 モンブラン・マッターホルン・グロースグロックナーなど主要山峰がマーカーで表示され、日本語名のラベルが付く
- [x] #2 マーカーが都市マーカーと視覚的に区別できる
- [x] #3 山峰ラベルが山脈名・都市名・勢力名のラベルと重なって読めなくなることがない
- [x] #4 ズームに応じて表示件数が変わり、広域表示でマーカーが密集して潰れない
- [x] #5 全年代で同じ山峰が表示される（年代切替で消えたり変わったりしない）
- [x] #6 山峰データの生成処理に、ネットワーク非依存の単体テストが追加され green
- [x] #7 出典・ライセンス（Natural Earth / Public Domain）が attribution に反映される
- [x] #8 deno test が green
- [x] #9 実機でアルプス周辺を目視し、マーカー位置が陰影の山地と一致していることを確認できる
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## 方針

河川（TASK-21）・山脈（TASK-97）と同じ「年代非依存のオーバーレイ 1 ファイル」の
型を踏襲する。新機構は作らない。

- 生成: `scripts/build-peaks.ts` が Natural Earth の
  `ne_10m_geography_regions_elevation_points` をピン留めコミット
  （山脈・河川と同一の `ca96624a56bd078437bca8184e78163e5039ad19`）から取得し、
  `data/peaks.geojson` を出力する。
- 描画: `src/peaks.ts`（純粋ロジック）+ `src/main.ts` の ScatterplotLayer
  （マーカー）と TextLayer（ラベル）。都市（cities.ts）と同型。
- 日本語名: decision-6 に従いデータは英語 NAME のまま。表示名は
  `data/name-ja.json` に追加する（値の出典は NE の `NAME_JA`）。

## データ契約（サブ作業をまたぐ唯一の取り決め）

`data/peaks.geojson` = Point の FeatureCollection。各 feature の properties は

| キー | 型 | 由来 |
| --- | --- | --- |
| `name` | string | NE の `NAME`（英語）。name-ja.json の引き元・突合キー |
| `elevation` | number | NE の `ELEVATION`（m） |
| `scalerank` | number | NE の `SCALERANK`（ズーム出し分けの入力） |

配信 URL は `/data/peaks.geojson`（`scripts/build.ts` のコピー対象に追加）。
取得失敗・未生成時は main.ts が warn + 空データで「山峰なし」のまま継続する
（河川・山脈・colors.json と同じ縮退契約）。

## 実装時の判断（各サブ作業で決めて根拠を残す）

- 収録件数の閾値: 欧州域内 87 件は多すぎる。`SCALERANK` / `ELEVATION` で
  15〜30 件程度に絞る（AC #1 の主要 3 山峰は必ず残す）。
- マーカー表現: 都市（半径 3px の丸ドット）と区別できる記号にする（AC #2）。
- ラベル内容: 名称のみか標高併記か。併記は衝突を増やすのでトレードオフを見る。
- ラベル priority の帯: 既存は勢力名 -400〜300・都市名 150〜220・山脈名 80〜140。
  山峰をどこに置くか決める（AC #3）。
- **decision-21 に従い、重なりの解消に `COLLISION_SIZE_SCALE` を上げない**。

## 並列化判定（タスク内）

**並列化する（subagent 2 本を worktree isolation で起動）**。上のデータ契約を
先に確定したことで、生成側と描画側が互いのファイルに触れずに進められ、
どちらも独立にテストできるため。

| 担当 | 範囲（触るファイル） | 成果物 |
| --- | --- | --- |
| A: データ生成 | `scripts/build-peaks.ts` / `scripts/build-peaks_test.ts` / `scripts/build.ts` / `deno.json` / `data/peaks.geojson` / `data/name-ja.json` / `index.html`（attribution）/ `docs/data-inventory/README.md` | 生成スクリプト + ネットワーク非依存の単体テスト（AC #6）+ 出典表記（AC #7） |
| B: 描画 | `src/peaks.ts` / `src/peaks_test.ts` / `src/main.ts` / `src/picking.ts`（必要なら） | マーカー層・ラベル層・ズーム出し分け・priority（AC #1〜#5） |

B は A の生成物を待たずに、契約どおりのフィクスチャに対して実装・テストする。
`docs/app-spec.md` は**両者とも触らない**（衝突を避けるため mainagent が
レビュー時にまとめて書く）。実機確認（AC #9）は両者の成果を統合してから
mainagent が行う。

## タスク間並列

なし。`next-tasks` は TASK-99 の単独集合を返した（TASK-105 / 106 / 107 / 109 は
area 衝突でスキップ）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**実機確認の条件**: ヘッドレス CDP（scripts/verify/cdp.ts）で center=(7.3, 45.9)（モンブランとマッターホルンを含むアルプス）、zoom 4/5/6/7/8 × 年代 900/1400/1914。各ナビゲート後に静止 2 秒を置いてから `window.__getPeakDebug()` の値とスクリーンショットを取得した。

**AC#1**: z6 のスクリーンショットで「モンブラン」「グロースグロックナー山」がマーカー + 日本語ラベルで表示され、z8 で「モンブラン 4807m」「マッターホルン 4478m」が表示されることを確認。

**AC#2**: z8 の拡大画像で、山峰が深緑の ▲ グリフ + クリーム halo、都市（ジュネーヴ・ミラノ・パヴィア）が赤い丸ドット + 赤茶ラベルで、形・色ともに明確に区別できることを確認。

**AC#3**: z6 で「モンブラン」（山峰）・「アルプス山脈」（山脈）・「ミラノ」「リヨン」（都市）・「フランス」「ヴェネツィア共和国」ほか多数の勢力名が同時に表示され、いずれも判読可能。TASK-108 の衝突フェード二値化により、そもそも「中途半端に潰れたラベル」は構造的に発生しない。

**AC#4**: `__getPeakDebug()` の実測で表示件数は z4=2 / z5=2 / z6=22 / z7=23 / z8=26（全 26 峰）。アルプス表示域内（1600x813 px）に入る件数は z4=2 / z5=1 / z6=3 / z7=2 / z8=3 で、広域でマーカーが密集しない。

**AC#5**: 年代 900 / 1400 / 1914 のいずれでも z6 の表示山峰が同一の 22 件（`sameAcrossYears: true`）。`src/peaks.ts` に year 引数が存在しないことをコードでも確認。

**AC#6**: `scripts/build-peaks_test.ts` を追加（ネットワークアクセスなし。純粋関数のフィルタ・properties 間引き・座標丸め・閾値の位置を検証）。

**AC#7**: `index.html` の attribution を「河川・山脈」→ 山峰を含む記載に更新。`docs/data-inventory/README.md` の一覧表と §3.10 に出典（nvkelso/natural-earth-vector @ ca96624a56bd・Public Domain）を記載。

**AC#8**: `deno task test` = 1178 passed / 0 failed / 3 ignored（着手前 1146）。`deno fmt --check`（145 ファイル）green、`deno lint` は `.outputs/claude/` 配下の既存 4 件のみ、`deno task build` green。CI（PR #114）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

**AC#9**: z8 のマッターホルン周辺を 4 倍に拡大し、▲ が陰影の尾根上に載っていることを確認。

## 並列化の実施結果

実装プランの判定どおり subagent 2 体（データ生成 / 描画）を worktree isolation で並列起動した。データ契約（peaks.geojson の properties = name / elevation / scalerank）を先に確定させたことで、描画側は生成物の完成を待たずフィクスチャに対して実装・テストできた。**ファイル衝突はゼロ**。両者とも許可リスト外のファイルを 1〜2 件触ったが（データ側: scripts/name-ja_test.ts・scripts/build_test.ts の既存テスト更新／描画側: src/layer_stack.ts の OVERLAID_LAYER_IDS 追加）、いずれも回避不能かつ相手の担当範囲と非干渉で、双方が報告してきたため衝突しなかった。

## mainagent が加えた変更

- `docs/app-spec.md`: §2.2 に山峰の節を追加、§3.3 の「ラベル 4 層」→「5 層」に更新（並列担当の衝突を避けるため両者に触らせず、統合時に mainagent がまとめて書いた）。
- `data/name-ja.json` / `docs/data-inventory/README.md`: `Djebel Chelia` の日本語表記を NE の「ドジュベル・シェリア山」から「ジェベル・シェリア山」へ修正。同じアラビア語 جبل を含む `Jebel Tidirhine` が「ジェベル・ティディリーヌ山」で、同一データ内で同じ語の音写が割れていたため。原則（値は NE の name_ja）からの逸脱として README §3.10 に明記した。

## 既知の残件（このタスクのスコープ外）

- `deno check src/main.ts` の型エラーが 4 → 6 件に増える。全て既存と同じ種類（`labelTextStyleProps().outlineColor` が `number[]` で deck.gl は `Color` を要求する）で、既存の全ラベル層が同じエラーを出している。CI は `deno check` を実行していない（fmt / lint / test / build のみ）ため CI は green。既存 4 件と揃えており、直すなら `labels.ts` 側でまとめて直すのが筋。
- NE の英語 `name` に ASCII 化の取りこぼしがある（`Galdhpiggen` = Galdhøpiggen、`Hvannadalshnkur` = Hvannadalshnúkur）。表示は日本語名なので地図の見た目には影響しない。`name-ja.json` のキーは突合キーとして NE の綴りのまま揃えた（README §3.10 に明記）。

## decision 記録の判定

**記録しない**と判断した。理由:

- データソースは河川（decision-3）・山脈（TASK-97）で既に採用済みの Natural Earth・同一ピン留めコミットで、新規の採用判断ではない。同じ構図の TASK-97（山脈を NE から追加）も decision を作っていない。
- マーカーの表現方法（TextLayer に ▲）・標高併記のズーム閾値・priority の帯は、いずれもこのタスクのスコープで完結する実装判断で、後続タスクの実装を制約しない。挙動は `docs/app-spec.md` §2.2 に、根拠は各定数の doc コメントに残した（development-style 2.1 章の「記録しない判断」に該当）。
- 唯一タスク横断に効きうるのは「ラベル幅を増やす変更は decision-21 により周囲のラベルを消す形で跳ね返る」という知見だが、これは decision-21 の Consequences そのものであり、重複記録は禁止されている。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Natural Earth 10m の標高点から data/peaks.geojson（26 峰・年代非依存）を生成し、▲ マーカーと日本語ラベルで主要山峰を表示した。収録条件は scalerank <= 6 または elevation >= 4600m。OR 条件が要るのは NE の scalerank が標高と一致せずモンテ・ローザ 4634m 等が scalerank 9 に落ちるためで、4600 は scalerank 7 以下を標高降順に並べたときの最大の空き（4634 と 4494 の間の 140m）に置き上流の微修正で収録集合が揺れないようにした。マーカーは TextLayer に ▲ グリフを描かせる（ScatterplotLayer は円しか描けず都市ドットと形で区別できず、IconLayer はバンドルに新レイヤークラスと画像バイトを足す。TextLayer は既存 4 層が使用中でバンドル差分ゼロ）。マーカー層は衝突フィルタに参加させず、名前が間引かれても頂の位置は残す。標高の併記は z7 以上に限る（ラベル幅が約 2.2 倍になり、decision-21 で負けたラベルが消えるようになった以上、広域での併記は周囲の勢力名・都市名を消す形で跳ね返るため）。ラベル priority は 80〜130 で山脈名の帯の下半分に置き、同じ場所で競合したら位置の見当をつける役の山脈名を残す。実装はデータ生成と描画の 2 サブ作業に分けて subagent を worktree isolation で並列起動し（データ契約を先に確定したためファイル衝突ゼロ）、docs/app-spec.md は衝突回避のため mainagent が統合時に記述した。検証: 新規テスト 5 ファイルを先行追加して red → green、deno test 1178 passed / 0 failed（着手前 1146）、fmt --check / lint / build green、ヘッドレス CDP でアルプスを z4〜z8 × 年代 900/1400/1914 で確認し表示件数 z4=2 → z8=26・年代非依存 22 件・▲ が陰影の尾根上に載ることを確認、CI（PR #114）green。
<!-- SECTION:FINAL_SUMMARY:END -->
