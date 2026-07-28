---
id: TASK-143
title: ラベルの自己衝突（偶数文字数×中央空白）を全ラベル層で監査し恒久対策を決める
status: To Do
assignee: []
created_date: '2026-07-28 18:43'
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
- [ ] #1 全ラベル層の走査結果（自己衝突で描画されないラベルの有無と一覧）が記録されている
- [ ] #2 恒久対策の方針が decision として記録されている
- [ ] #3 対処した場合: 既存ラベルの表示バランスが退行しない（CDP 目視確認）
- [ ] #4 deno test が green
<!-- AC:END -->
