---
id: TASK-73
title: ベースマップと地図オーバーレイの配色を羊皮紙/古地図トーンに統一する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 07:35'
updated_date: '2026-07-26 08:14'
labels:
  - 'area:src-main'
dependencies: []
ordinal: 67500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘（2026-07-26）: タイムラインスライダー・情報パネル・ツールチップなど地図外のコンポーネントは羊皮紙風（TASK-40）なのに、地図本体だけが現代的な Web 地図の配色のままで違和感がある。

原因（2026-07-26、CDP スクリーンショットとコード読解で特定）: src/basemap.ts:148 の buildBasemapStyle() が protomaps の `namedFlavor("light")` を無加工で使っており、TASK-40 で確立した羊皮紙トークン（app.css の --parchment #f4ecd7 / --parchment-shade #e7d9b2 / --ink #3a2712 / --frame #5c3d22 / --brass #b8894f / --wax #7a2e22）が地図側に一切適用されていない。

実測した現在値と乖離:
- water = `#80deea`（Material Design Cyan 200）。海と湖が明るいシアンで、羊皮紙 UI との乖離が最も大きい。
- earth = `#e2dfda`。黄みのないニュートラルグレーで、ラベル背景のクリーム（--parchment）と別系統。
- background = `#cccccc`（純グレー）、glacier = `#e7e7e7`、sand = `#e2e0d7`。
- 河川ライン RIVER_LINE_COLOR = `[128, 222, 234, 255]`（src/rivers.ts:35）で water と同じシアン。選択時 `[2, 136, 209, 255]`、ホバー時 `[100, 181, 246, 255]` も現代的な青。
- 勢力境界線 LINE_COLOR = `[255, 255, 255, 200]`（src/powers.ts:24）で白。古地図ならインクの茶が自然。
- hillshade は既に暖色グレー（rgba(80,70,60,*)、TASK-34）で方向性は合っているが、羊皮紙に合わせるならセピア寄りに寄せる余地がある。

提案した配色（ユーザー承認済み。実装時に目視で微調整してよい）:
- water: `#80deea` → `#c7d2d0`（くすんだ青灰）
- earth: `#e2dfda` → `#f0e6cd`（--parchment をわずかに沈めた値）
- background: `#cccccc` → `#e7d9b2`（--parchment-shade を流用）
- glacier: `#e7e7e7` → `#f4efe2`、sand: `#e2e0d7` → `#e8dcc0`
- landcover の緑系: 彩度を大きく落としたくすんだオリーブ
- 勢力境界線: `[255,255,255,200]` → `[92,61,34,190]`（--frame #5c3d22）
- 河川: `[128,222,234,255]` → `[122,148,158,255]`（青灰）。選択時は --wax 系の赤茶 `[122,46,34]` にすると「朱を入れた」古地図表現になり羊皮紙と整合する

TASK-72（地図ラベルの背景パネル撤去と白 halo 実効化）との関係: 両タスクは area:src-main が交差するため同時並列はできない。ordinal 上は TASK-72 が先行するが、TASK-72 で行う halo 幅（outlineWidth 5〜6 の範囲）と衝突パラメータ（COLLISION_SIZE_SCALE）の目視チューニングは下地色に依存するため、本タスクを先に入れた方が手戻りが少ない可能性がある。順序を入れ替えずに実施する場合は、本タスクで下地色を変えた後に TASK-72 で決めた halo の見え方が変わっていないかを再確認すること。加えて、TASK-72 が前提とする「白 halo」は羊皮紙の下地では純白よりクリーム寄り（--parchment 系）の方が整合する可能性があり、本タスクの実装時に halo 色の見直しが必要かを判断すること。

スコープ外: 勢力ポリゴンの塗り色（colors.json、build-colors.ts の彩度・明度段）は変更範囲が全 332 キーに及びレビュー観点も異なるため TASK-74 として分離した。地図全体に紙のテクスチャ・周辺減光を重ねる案は、本タスク完了後の見え方を見てから要否を判断する（現時点では起票しない）。

注意点: buildBasemapStyle() は純粋関数で既にテストがある（src/basemap_test.ts）ため、flavor のオーバーライドを定数として切り出せば色の単体テストを書ける。河川の色は TASK-36 で「強調スタイルが反映されない」不具合の修正履歴があるため、通常/ホバー/選択の 3 状態の切り替えが退行しないことを確認すること。ラベル（クリーム地・焦茶文字）と都市マーカーの視認性が新しい下地色の上でも保たれるかも併せて確認する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ベースマップの海・陸・背景・氷河・砂地・自然被覆の色が羊皮紙トーンになり、地図外の UI（タイムライン・情報パネル・ツールチップ）と同系統の配色として成立している
- [x] #2 ベースマップの色定義が定数として切り出され、buildBasemapStyle() が生成するスタイルに反映されていることが単体テストで検証されている
- [x] #3 勢力境界線がインク（焦茶）系の色になり、白線でなくなっている
- [x] #4 河川ラインが青灰系になり、通常・ホバー・選択の 3 状態で色が切り替わる挙動が退行していない
- [x] #5 新しい下地色の上で、勢力名ラベル・都市名ラベル・河川名ラベル・都市マーカーの視認性が保たれている
- [x] #6 deno test が green
- [x] #7 目視確認: 1000 / 1200 / 1500 / 1815 年のスクリーンショットで、地図と UI が同一のデザイン言語に見えることを確認済み
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/basemap.ts の buildBasemapStyle() に羊皮紙トーンの flavor オーバーライド定数（water/earth/background/glacier/sand/landcover 等）を切り出し、テスト先行（red→green）で単体テストを追加（AC2）
2. 提案配色（タスク Description、ユーザー承認済み・目視微調整可）を適用: water #c7d2d0 / earth #f0e6cd / background #e7d9b2 / glacier #f4efe2 / sand #e8dcc0 / landcover くすんだオリーブ
3. src/powers.ts LINE_COLOR を白 → インク茶 [92,61,34,190]（--frame）に変更（AC3）。仏諸侯領の藍紫境界（TASK-71）との識別が保たれるか目視確認
4. src/rivers.ts の通常/ホバー/選択 3 状態を青灰系（通常 [122,148,158]、選択は --wax 系赤茶 [122,46,34] を検討）へ変更し、切替挙動の非退行をテストで担保（AC4、TASK-36 の回帰に注意）
5. hillshade のセピア寄せは目視で判断（TASK-34 の暖色グレーから必要なら微調整）
6. ラベル・都市マーカーの視認性を新下地で確認（AC5）。TASK-72 が前提とする白 halo のクリーム寄せ要否を判断し Implementation Notes に記録
7. deno fmt --check / lint / test / build 全 green → mainagent がヘッドレス CDP で 1000/1200/1500/1815 年のスクリーンショット確認（AC7、マージ前）
並列化判定: 見送り（理由: 変更対象が basemap/powers/rivers の配色定数群で相互の見た目調整が必要な単一デザイン作業であり、ファイル競合なく独立検証可能なサブ作業に分割できないため）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス: (AC1,5,7) ヘッドレス CDP で 1000/1200/1500/1815 年のスクリーンショットを取得し、羊皮紙トーン（water #c7d2d0・earth #f0e6cd 等）が UI と同一デザイン言語に見えること、海岸線の可読性、勢力・都市・河川ラベルと都市マーカーの視認性を mainagent が確認（PASS）。(AC2) PARCHMENT_FLAVOR_OVERRIDES / PARCHMENT_LANDCOVER_COLORS / parchmentFlavor() を export し basemap_test.ts で生成スタイルへの反映を検証。(AC3) LINE_COLOR = [92,61,34,190]（--frame）へ変更し powers_test 更新。(AC4) 通常/ホバー/選択 = 青灰/暗青灰/朱（--wax）で rivers_test 更新、1500 年でライン川クリック → 朱の強調と情報パネル表示を実機確認。線幅 3 段は不変。(AC6) deno test 679 passed, 0 failed。fmt/lint/build green。TASK-72 への申し送り: 羊皮紙下地では halo は純白よりクリーム（--parchment #f4ecd7）寄せを推奨。河川ラベル色 [2,119,189] が唯一の高彩度青として残っており、TASK-72 で halo 調整時に青灰〜濃紺へ落とす検討余地あり（labels_test が値固定のため本タスクではスコープ外）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
protomaps light flavor を parchmentFlavor()（羊皮紙トーンの定数上書き）に置き換え、勢力境界をインク茶、河川を青灰/暗青灰/朱の 3 状態に変更して地図と UI の配色を統一。色反映は単体テストで検証し、4 年代のスクリーンショットで目視確認（PASS）。deno test 679 passed。PR #82。
<!-- SECTION:FINAL_SUMMARY:END -->
