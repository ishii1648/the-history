---
status: accepted
date: '2026-07-26 15:24'
---

# decision-18: 現代県ポリゴン合成による中世諸侯領の自作は行わない（出典なきジオメトリ生成の禁止を維持）

## Context

南仏・中央部の諸侯領（Toulouse / Foix / Armagnac / Auvergne / Bourbon / Nevers）と王領は OHM に実データが無く（TASK-70/87/88 で 3 回実測、boundary=administrative 4,923 件でゼロヒット）、現代の県（département）ポリゴン union で合成する案を TASK-88 で定量評価した。実測: 通説的な 6 県合成のトゥールーズ伯領は base（historical-basemaps）と IoU 28.5%（12 県まで広げても 41.6%）、1200 年の南仏空白 208,326 km² のうち埋まるのは 12.7〜27.7%、出典のある OHM 由来 Aquitaine/Gascony と 6,306 km² の新たな重なりを作り、頂点密度は周囲の 4 倍（2018 年 IGN 県境）で TASK-80 の「全境界は概略」表現と正面衝突する。

## Decision

現代県ポリゴンの union による中世諸侯領ジオメトリの自作は行わない。decision-14 の本旨（地図上の全ジオメトリがデータセット + ピン留めコミットまで追跡できること）を「座標の出所」ではなく「地図が主張する内容の出典」に適用する: 県 union の座標は IGN まで遡れるが、1200 年の境界としての出典はゼロであり、どの県を選ぶかという編集判断が成果物の主要部分を決める（同一通説から作った変種間で面積が 1.9 倍ふれる）。空白は known-limitations と data-inventory で実測値つきで説明する。

## Consequences

- 南仏・中央部の空白は残る。known-limitations の france-fiefs-missing-territories に県合成案の検討・却下と実測値を追記して説明する。
- 空白を埋める唯一の整合的な道は出典のあるデータの獲得（OHM への上流貢献・別データセットの調査 = 検討する場合は別タスク。Euratlas は decision-13 で却下済み）。
- 以後の欠落判断の基準: 「作れるものは作る」ではなく「出典が無いなら描かず説明する」を維持する（エルベ川 decision-14 と同一原則）。
- 関連タスク: TASK-70, TASK-87, TASK-88 / 関連 decision: decision-13, decision-14, decision-16
