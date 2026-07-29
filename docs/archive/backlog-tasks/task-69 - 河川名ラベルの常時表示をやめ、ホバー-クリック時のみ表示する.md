---
id: TASK-69
title: 河川名ラベルの常時表示をやめ、ホバー/クリック時のみ表示する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 06:59'
updated_date: '2026-07-26 07:35'
labels:
  - 'area:src-main'
dependencies: []
ordinal: 66000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（2026-07-26）: 現在は全河川の名前ラベルが地図上に常時表示されており、地図が煩雑になっている。常時表示をやめ、ホバー中の河川・クリック選択中の河川に限って河川名を表示したい。現状の実装: 河川名ラベルは src/main.ts の buildRiverLabelLayer()（レイヤー ID は RIVER_LABEL_LAYER_ID）が memoizedRiverLabelData(riversData, nameJa) で全河川分のアンカー（src/rivers.ts の riverLabelAnchors、最長 LineString の中点）を生成し、CollisionFilterExtension でライン長 priority による衝突制御をかけて描画している（TASK-24）。ホバー時は Deck レベル onHover 集約による河川名ツールチップ、クリック時は情報パネルへの河川名表示とライン強調が既に動作する（TASK-29 / TASK-36 / TASK-42 / TASK-56）。注意点: (1) TASK-50 で「ホバーのたびに全レイヤー再構築が走りラベル polylabel を再計算する」問題を memo 化で解消済みのため、hover/selected に応じてラベルを切り替える際も再計算コストを増やさないこと（アンカー生成は年代非依存の全河川分を 1 度だけ行い、hover/selected に依存させるのは表示対象のフィルタのみ）。(2) 河川名ラベルは国名・都市名ラベルと同一の衝突空間を共有しているため、常時表示の削除で他ラベルの配置が変わらないか確認すること。(3) ホバー時に既存ツールチップと地図上ラベルが二重表示になる場合、どちらに寄せるかは実装時に判断し Implementation Notes に記録すること。既存のツールチップ・情報パネル・ライン強調の挙動は非退行とする。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 通常状態（ホバーなし・河川未選択）では地図上に河川名ラベルが 1 つも表示されない
- [x] #2 河川ラインにホバーすると、その河川の名前（日本語表記、name-ja.json 適用）が表示され、ホバーを外すと消える
- [x] #3 河川をクリックして選択している間はその河川の名前が表示され続け、選択解除で消える。既存のライン強調・情報パネルへの河川名表示は従来どおり動作する
- [x] #4 国名（勢力）ラベル・都市名ラベルの表示・衝突制御が本変更で退行しない
- [x] #5 ホバー/選択状態から表示対象の河川ラベルを決める処理が純粋関数として実装され単体テストがあり、deno test が green
- [x] #6 ホバーを連続して動かしてもラベルアンカー（polylabel/中点）の再計算が走らないことがテストまたは計測で確認されている（TASK-50 の非退行）
- [x] #7 目視確認: 通常時にラベルが出ないこと、ホバー時・クリック選択時に該当河川名が表示されることをブラウザで確認済み
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/rivers.ts の riverLabelAnchors（全河川アンカー生成・memo 化）は変更しない。hover/selected の河川 id から表示対象ラベルを決める純粋関数を新設し、テスト先行（red→green）で実装する
2. src/main.ts の buildRiverLabelLayer を hover/selected 連動のフィルタ表示に変更する（アンカー生成は従来どおり年代非依存で 1 回のみ。hover/selected に依存するのは表示フィルタだけにして TASK-50 の非退行を守る）
3. ホバー時のツールチップと地図上ラベルの二重表示の扱いを実装時に判断し Implementation Notes に記録する
4. 国名・都市名ラベルの衝突制御の非退行を確認する
5. deno fmt --check / lint / test / build green → ヘッドレス CDP で目視確認（通常時ラベル無し・ホバー/選択時のみ表示）
並列化判定: 見送り（理由: 変更対象が src/main.ts と rivers 関連の単一領域に集中し、ファイル競合なく独立にテスト可能なサブ作業に分割できないため）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス: (AC1-3,7) ヘッドレス CDP チェック（scripts/verify/cdp.ts + 専用チェックスクリプト）で year=1200・ライン川中心の画面にて initial={hovered:null,selected:null,visibleLabels:[]} → クリックで {selected:'Rhine',visibleLabels:['Rhine']}＋情報パネル『ライン川』 → 再クリックで選択解除後はホバー由来のみ表示 → 川から離れると visibleLabels=[] を確認（PASS、スクリーンショット 4 枚取得）。検証用に読み取り専用フック __getRiverLabelDebug を追加（TASK-66 の前例に倣う）。(AC4) 河川ラベルレイヤーの data 以外は無変更（labelLayerBaseProps・CollisionFilterExtension・priority 設計は不変）、スクリーンショットでも都市名・勢力名ラベル表示を確認。(AC5) filterVisibleRiverLabels 純粋関数 + 単体テスト 8 件。(AC6) memoizeLatest 経由の呼び出し回数が hover 連続変更でも 1 回であることをテストで検証。deno test 616 passed。ツールチップ二重表示はツールチップ残置と判断（カーソル直下の即応表示と川中点の注記で役割が異なる。理由は handlePickHover の doc コメントに記録）
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
河川名ラベルの常時表示を廃止し、ホバー中・クリック選択中の河川のみ表示するよう変更。純粋関数 filterVisibleRiverLabels（同名分割 feature は最高 priority の 1 件に集約）を新設し、アンカー生成は従来どおり全河川分 1 回の memo 化を維持（TASK-50 非退行をテストで担保）。ヘッドレス CDP で通常時 0 件・選択/ホバー時のみ表示を実機確認（PASS）。deno fmt/lint/test(616 passed)/build 全 green。PR #79。
<!-- SECTION:FINAL_SUMMARY:END -->
