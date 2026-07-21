---
id: TASK-19
title: 神聖ローマ帝国内の主要領邦を地図上で表現する
status: To Do
assignee: []
created_date: '2026-07-21 12:09'
labels: []
dependencies: []
references:
  - 'https://github.com/aourednik/historical-basemaps'
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザ動作確認での指摘: 神聖ローマ帝国が全年代（1000〜1715）で単一ポリゴン表示になっており、内部の領邦が一切分からない。

原因調査結果: 取得元データ aourednik/historical-basemaps（ピン留めコミット 62d8f1a・最新 master とも）が HRE を単一 feature（NAME=Holy Roman Empire）で表現しており、内部領邦のポリゴンが上流に存在しない。データパイプライン（scripts/build-data.ts）の問題ではなくデータソースの限界。

対応の方向性: HRE 内部の主要諸侯（選帝侯クラス: オーストリア（ハプスブルク）、ブランデンブルク、ザクセン、バイエルン、ボヘミア、プファルツ等）を表現できるオープンデータの調査・選定、または最小限の手作業キュレーション GeoJSON をオーバーレイとして統合する。ライセンス（現状 GPL-3.0 派生）との整合も確認すること。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 HRE が存在するスナップショット年代のうち少なくとも代表的な年代（例: 1500）で、主要諸侯（オーストリア・ブランデンブルク・ザクセン・バイエルン・ボヘミアを含む）が個別の色・ポリゴンで識別できる
- [ ] #2 HRE 全体の外縁境界も引き続き視認できる（領邦表示によって帝国の範囲が分からなくならない）
- [ ] #3 追加データの出典・ライセンスが data/index.json またはフッター表記に反映されている
- [ ] #4 追加・変更したデータ処理ロジックにテストがあり deno test が green
<!-- AC:END -->
