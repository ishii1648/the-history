---
id: TASK-84
title: 沿岸部で政治境界線が水面レイヤーに隠れて消える（TASK-77 のリグレッション）
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 10:59'
updated_date: '2026-07-26 11:51'
labels:
  - bug
  - 'area:app'
  - 'area:data'
dependencies: []
modified_files:
  - src/main.ts
  - src/basemap.ts
priority: high
type: bug
ordinal: 78000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘（2026-07-26）: フランス沿岸の境界線が消えた。ユーザーは TASK-78 の影響と認識していたが、**調査の結果 原因は TASK-77（政治ポリゴンを水面レイヤーの下へ差し込む変更）であり、TASK-78 は無関係**であることを 3 コミットの実機比較で確定した。

事前調査で判明していること（再現手順つき。要検証・鵜呑みにしない）:
- 比較方法: 各コミットを git worktree に取り出して deno task build → dist を配信 → scripts/verify/cdp.ts で year=1200・zoom=7・center=-2.8,48.2（ブルターニュ）を撮影。
  - e2c6e23（TASK-77 の直前）: ブルターニュ半島の海岸線に沿って藍紫の境界線が明瞭に描かれている。
  - 9e331c5（TASK-77 のマージ直後・TASK-78 適用前）: **沿岸の線が完全に消えている**。塗りのエッジだけが残る。
  - c9dc39c（現 HEAD・TASK-78/82 適用後）: 9e331c5 と同じ。TASK-78 の差分は base ラベル「ブルターニュ」が 1 つ消えたことのみで、線の消失には寄与していない。
- 機序: TASK-77 で powers / france-fiefs / hre-powers を beforeId で不透明な水面ポリゴン（water）の下へ入れた。政治ポリゴンは海岸線が粗く海側へはみ出しているため、その輪郭線も water に覆われて不可視になる。1200 年・画像域（西経 6 度〜東経 11 度・北緯 42〜53 度）の実測では、輪郭線の総延長のうち海上にある割合は base 18.6% / 諸侯領 21.7% / TASK-78 の base_outline 18.0% で、いずれも約 2 割が構造的に隠れる。
- 併発している劣化: 海岸線の細部（ジロンド河口・アキテーヌ沿岸の潟湖）で塗りが water に食われて虫食い状に途切れる。head-aquitaine の撮影で確認。
- TASK-78 の base_outline_<year>.geojson 側に欠落は無い。europe_1200 の Angevin Empire / Britany / Kingdom of France の画像域頂点のうち outline に無いものは全て諸侯領の内側（それぞれ 87/87・41/41・28/28 件）で、諸侯領の外側の輪郭が誤って削られた形跡は 0 件。
- TASK-77 自体を revert するのは不可。TASK-77 前の画像では海上に浮いた政治ポリゴンの塗り（ブルターニュ沖の孤立した塗りなど）がはっきり見えており、あれは明確な不具合だった。塗りを隠す効果は維持したまま線を取り戻す必要がある。

対処の選択肢（実装時に比較し、採否と根拠を notes に記録すること）:
- (a) ベースマップ側で陸の輪郭（海岸線）を描き、政治境界は内陸のみとする。地図学的には基図が海岸線を担うのが定石で、コストも低い。ただし「諸侯領の範囲が沿岸で線として示されない」状態は残る。
- (b) 政治ポリゴンの輪郭線だけを water の上に戻す。最小コストで TASK-77 前の見た目に近づくが、粗い輪郭線が海上に浮き、隠した塗りとの境界がズレて見える懸念がある。
- (c) ビルド時に輪郭線を陸マスク（Natural Earth。decision-3 で 50m をピン留め済み。10m の採用可否も検討）でクリップし、陸側だけの線を water の上に描く。見た目は最良だが、Natural Earth と Protomaps の海岸線もズレるためズームインでの一致は保証されない。頂点増によるサイズ影響も要確認。
- 判断材料として、TASK-77 の decision（水面下グループの分配ルール・decision-15）を更新するか新しい decision を起こすかも合わせて検討すること。

証拠画像はローカルの .outputs/claude/task78-coastline/ に保存（gitignore 対象・他 worktree からは参照できないため、必要なら上記手順で再取得すること）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1200 年のブルターニュ・ノルマンディー・アキテーヌ沿岸で、陸の輪郭に沿った線が視認できる
- [x] #2 TASK-77 で解消した「海上に浮く政治ポリゴンの塗り」が再発しない
- [x] #3 海岸線の細部（ジロンド河口・アキテーヌ沿岸）で塗りが虫食い状に途切れない
- [x] #4 諸侯領オーバーレイのある 1000〜1300 年と、対象外の年代（900・1500・1815 など）の双方で回帰確認する
- [x] #5 採用方式と却下した案の根拠が Implementation Notes に記録され、TASK-77 の decision と矛盾しない（必要なら decision を更新または新規記録する）
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方式比較（実装冒頭で確定・根拠を notes に記録）: 本命は (a)+(c) のハイブリッド評価。まず (a) ベースマップの陸輪郭（海岸線）描画で沿岸の視認性を回復できるか検証し、諸侯領の沿岸範囲表示が要件なら (c) ビルド時に輪郭線を陸マスク（NE 50m・decision-3 ピン留め）でクリップして water の上に描く方式を比較する。(b) 輪郭線を無加工で water 上へ戻す案は海上に浮く粗い線の懸念があるため、(c) との差を実測して判断。虫食い（AC#3）は水面下配置に起因するため、方式によっては塗り側の扱い（水面上へ戻すか）も含めて評価する。
2. TDD: 採用方式に応じたビルド時処理（陸マスククリップ等）の単体テストと layer_stack 分配テストを先に書き red 確認。
3. 実装: TASK-77 の水面下配置（decision-15）の目的『海上の塗りを隠す』を維持したまま沿岸の線を回復。decision-15 の更新 or 新規 decision を判定（AC#5）。
4. 全チェック green → CDP で 1200 年ブルターニュ・ノルマンディー・アキテーヌ（ジロンド河口含む）+ 900/1500/1815 の回帰を目視確認（AC#1〜#4）。
5. PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 方式決定がビルド処理・描画・decision 更新のすべてを規定する単一意思決定のため。単一 subagent に委譲）。
タスク間並列: なし（next-tasks の集合は本タスク単独。TASK-80 は area 競合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
採用方式: ベースマップのみで解決（deck 側の beforeId・picking・派生データは不変）。(1) coastline レイヤー = earth の縁を海洋の上に線描画（earth と water が同一タイル由来のため線と塗りの境界が定義上一致）。(2) water を kind で 2 分割し、内水面（INLAND_WATER_KINDS）は政治ポリゴンより下・海洋 + 未知 kind は上（未知は安全側 = 従来挙動へ倒す許可リスト方式）。layer_stack.ts の waterStackIsValid で順序を描画ごとに検証。
却下案（実測根拠）: (b) 政治輪郭線を water 上へ戻す = 仏沿岸で輪郭線の 26.4〜32.9% が海側・浮き幅中央値 1.2〜5.6 km 最大 26.4 km で誤った海岸線になる。(c) NE 陸マスクでクリップ = NE 10m と Protomaps(OSM) の海岸線ズレ中央値 0.5 km・p90 2 km（ブルターニュ 311 点実測）、decision-3 ピン留めの 50m はさらに粗い。

検証エビデンス:
- AC#1: CDP（1200 年ブルターニュ zoom7・ノルマンディー・アキテーヌ）で陸の輪郭に沿った coastline を視認確認。
- AC#2: 同スクリーンショットで海上に浮く塗りの再発なし（海洋レイヤーが政治ポリゴンの上のため構造的に再発しない）。
- AC#3: ジロンド河口・アキテーヌ沿岸（zoom8）で虫食い解消を確認（内水面が政治ポリゴンの下になったため）。
- AC#4: 1200（諸侯領あり）と 900/1500/1815（対象外年代）の 6 ビューで回帰なしを目視確認。verify:smoke PASS（picking 回帰なし）。
- AC#5: 採用・却下の根拠を本 notes に記録し、decision-15 に TASK-84 改訂（水面 2 分割 + coastline の重ね順）を追記。
- TDD: basemap_test / layer_stack_test を先に追加し red 確認 → green（コミット 665230b）。全チェック: fmt/lint clean、deno test 795 passed、build green、PR #92 CI green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-77 のリグレッション（沿岸の政治境界線が水面に隠れて消失・内水面の虫食い）を、ベースマップ側のみの変更で解消。coastline レイヤー（earth の縁）で沿岸の視認性を回復し、water を内水面/海洋に 2 分割して「海上の浮き塗りを隠す」効果と虫食い解消を両立。重ね順は waterStackIsValid で常時検証し decision-15 を改訂。却下案は浮き幅・海岸線ズレの実測で根拠化。795 テスト green、CDP 6 ビューで目視確認、CI green（PR #92）。
<!-- SECTION:FINAL_SUMMARY:END -->
