---
id: decision-15
title: deck レイヤーの重ね順は layer_stack.ts で一元管理し、政治ポリゴンは水面下・ラベルは overlaid 分離とする
date: '2026-07-26 09:48'
status: Accepted
---
## Context

TASK-77 で、ベースマップ（現代海岸線）と政治ポリゴン（粗い海岸線）の解像度差による海へのはみ出し（西欧域で ≈2.5 万 km²）を、interleaved MapboxOverlay の beforeId で政治ポリゴン 3 層（powers / france-fiefs / hre-powers）を水面ポリゴン直下へ差し込み隠す方式を採った。実装過程で、beforeId により interleaved のレイヤーグループが分割されると CollisionFilterExtension の衝突マップがラベル抜きで再描画され全ラベルが消える問題を実機で特定し、ラベル 3 層（power/river/city-labels）のみ overlaid の別オーバーレイへ分離して解決した。

## Decision

deck.gl レイヤーと MapLibre スタイルの重ね順・オーバーレイ分配は src/layer_stack.ts（純粋ロジック）で一元管理する。政治ポリゴンの塗りは水面より下（beforeId = water、スタイルに water が無ければ従来順へフォールバック）、河川・都市・hre-extent は水面より上、衝突フィルタを使うラベル層は overlaid オーバーレイに載せる。beforeId は必ず現在のスタイルのレイヤー id 列と突き合わせてから付与する（MapLibre は不在 id を例外ではなく error イベント + レイヤー追加放棄で扱い、無言で消えるため）。

### 改訂（TASK-84, 2026-07-26）

TASK-77 の水面下配置により沿岸の政治境界線（総延長の約 2 割）が water に隠れて消えるリグレッション（TASK-84）を受け、重ね順を次のとおり改訂する: **内水面（湖・川・運河 = INLAND_WATER_KINDS）→ 政治ポリゴン → 海洋（ocean/sea/bay + 未知 kind）→ coastline（earth の縁の線描画）**。未知 kind は安全側（海洋 = 塗りを隠す従来挙動）へ倒す許可リスト方式とし、順序は layer_stack.ts の waterStackIsValid で描画ごとに検証する。沿岸の視認性はベースマップ側の coastline が担い（earth と water は同一タイル由来のため線と塗りの境界が定義上一致）、政治輪郭線を water 上へ戻す案（海上に浮く線が最大 26.4 km）・NE 陸マスクでのクリップ案（OSM との海岸線ズレ中央値 0.5 km）は実測により却下した。

### 改訂 2（TASK-80, 2026-07-26）

base 境界線（旧 deck base-outlines）を MapLibre line レイヤーの「概略境界」へ移設し、重ね順を「内水面 → 政治ポリゴンの塗り → 概略境界 → 海洋 → coastline」に更新した。詳細は decision-16 を参照。

## Consequences

- 海岸線の解像度差によるはみ出しはデータ修正なしで視覚的に解消される。陸側の抜け（塗り欠け）はこの方式では解消しない（別タスクの扱い）。
- 内水面（湖・河口）が政治ポリゴンの塗りに染まらなくなる（水面が塗りの上に来るため）。
- 新しい deck レイヤーを追加する際は layer_stack.ts の分配ルール（水面下 / 水面上 / overlaid）への登録が必要。CollisionFilterExtension を使う層を interleaved 側へ置くとグループ分割時にラベル全滅が再発するため禁止。
- 関連タスク: TASK-77 / 関連 decision: decision-9（河川表示の deck 一本化）
