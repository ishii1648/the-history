---
id: TASK-143
title: ラベルの自己衝突（偶数文字数×中央空白）を全ラベル層で監査し恒久対策を決める
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 18:43'
updated_date: '2026-07-29 16:52'
labels:
  - 'area:src-labels'
dependencies: []
priority: low
ordinal: 124000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 背景

TASK-136 で、ライン川ラベルが一度も描画されない真因が **CollisionFilterExtension の自己衝突**であることが判明した。

- 衝突可視判定は「衝突 FBO 上の自アンカー画素（±2px の 5x5 サンプル）が自分の描画で占有されているか」を見る（deck.gl 9.3.7 collision_isVisible）
- TASK-72 の背景パネル撤去以降、FBO にはグリフ字形しか描かれない（SDF 透明部は picking シェーダの alpha==0 discard で消える）
- そのため**偶数文字数でテキスト中央が文字間空白に落ちるラベルは、自分の可視判定に常に失敗して永遠に表示されない**（「ライン川」= 4 文字の「イ|ン」境界が該当した）

TASK-136 は河川層のみ TextLayer background + ほぼ不可視の背景クアッド（alpha 1/255）で対処した。同じ機構は**都市・勢力（国名）・HRE 領邦・諸侯領・山脈・山峰の各ラベル層でも起こり得る**。

## やること

1. 全ラベル層のラベル文字列を機械的に走査し、「偶数文字数 × 中央が空白・文字間になる」候補と、実際に一度も描画されないラベルを CDP で特定する（characterSet とアンカー位置から静的に絞り込めるはず）
2. 該当があれば恒久対策を決める: (a) 全ラベル層に背景クアッドを敷く（TASK-136 方式の一般化。衝突挙動が「字形の隙間頼み」から「テキスト矩形」に変わるため既存の表示バランスへの影響を確認） (b) 該当ラベルのみ個別対処 (c) 影響なしと確認して記録のみ
3. 判断は decision として記録する（タスク横断のラベル描画方式に関わるため）

**発見契機**: TASK-136 の実装 subagent が申し送り、mainagent がイテレーション末にバッチ起票。

## 関連
- TASK-136（河川層の対処実績・実証手順）・TASK-72（背景パネル撤去）・TASK-108（collision_fade の二値化）
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 全ラベル層の走査結果（自己衝突で描画されないラベルの有無と一覧）が記録されている
- [x] #2 恒久対策の方針が decision として記録されている
- [x] #3 対処した場合: 既存ラベルの表示バランスが退行しない（CDP 目視確認）
- [x] #4 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 全ラベル層（都市/勢力/HRE 領邦/諸侯領/山脈/山峰/河川）のラベル文字列とアンカーを静的に走査し、「偶数文字数×中央が文字間空白」候補を抽出
2. 候補を CDP 実機で検証し、実際に一度も描画されないラベルを特定（AC#1、ポート 8143。TASK-136 の実証手順を流用）
3. 恒久対策を判断: (a) 全層に背景クアッド一般化 (b) 個別対処 (c) 記録のみ。既存表示バランスへの影響を CDP で確認（AC#3）
4. decision 記録は mainagent が行う（AC#2。subagent は判断材料と推奨案を報告）
5. deno fmt --check / lint / test / build 全 green（AC#4）

並列化判定: 見送り（理由: 走査 → 実証 → 対策判断が直列依存）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）
- AC#1: 実表示テキスト 1146 件（power-base 238 / hre 111 / fief 65 / city 633 / mountain 17 / peak 26+26 / river 30）を静的走査 + 実機オーディット（1000/1200/1300 × z4〜z7、判定対象 326 ラベル、色検出 + 目視）。一度も描画されない自己衝突ラベル 11 件を確定（都市 10: ローマ・ボローニャ・ルーアン・カイセリ・ヴェリコ・タルノヴォ・メス・ソルターニーイェ・ヘレス・デ・ラ・フロンテーラ・カン・イーペル、勢力 1: 1300 ボヘミア王国）。canvas シミュレーション単体は較正不能で実機を正とした
- 重要な知見: 失敗パターンは偶数文字数×中央空白に加え「中央グリフが ー・ でアンカー行にインクが無い」ケース。**偶数文字数は必要条件ではない**（奇数のローマが該当）。衝突サンプル点は getPosition 投影位置で pixelOffset 非追従（deck.gl ソースで確認）
- AC#2: decision-30 に記録（全層一般化を採用。個別対処・記録のみ・COLLISION_SIZE_SCALE 再調整の却下理由付き）
- AC#3: before/after 69 ビュー再オーディットで被疑 11 件が全て描画・表示総数はほぼ全ビューで同数以上（-1 は 4 ビューのみ、全て隣接ズーム段で表示）。ライン川の TASK-136 AC（z4〜6 のいずれか）を全年維持。mainagent もローマ z6 の描画を追認
- AC#4: fmt / lint / test（main 取り込み後 1495 passed、mainagent 独立検証）/ build green
- 実装: LABEL_COLLISION_BACKGROUND_COLOR + labelCollisionBackgroundProps を labels.ts に新設し labelLayerBaseProps で全 5 層に展開。TASK-136 の河川個別対処は移設・撤去。TASK-72 の「見える背景パネル無し」契約は labelTextStyleProps 側で維持
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
全ラベル層の自己衝突を監査し、一度も描画されないラベル 11 件（ローマ・ボヘミア王国等）を実機で確定。原因は中央グリフにインクが無いケースを含み偶数文字数は必要条件でなかった。TASK-136 の不可視背景クアッドを全 5 層へ一般化（decision-30）し、69 ビューの before/after で 11 件全描画・非退行を確認。1495 passed。
<!-- SECTION:FINAL_SUMMARY:END -->
