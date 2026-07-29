---
status: accepted
date: '2026-07-28 17:20'
---

# decision-28: 帝国塗りに埋もれた封土の是正は BASE_FIEF_SPLITS の切り出しと propertyFixes を併用する

## Context

decision-20 は base の帰属誤りの是正手段を「上流が持つ値の誤り →
`propertyFixes`／上流に無い関係の追加 → `suzerains`」と二分した。しかし
TASK-124 で、1279 / 1300 年の Artois・Saint-Pol・Flanders（史実は仏封土）と
1300 年のリミニ（1278 年にロマーニャの帝国権は教皇へ譲渡済み）を是正しようと
したところ、**これらの地域には base の feature がそもそも存在しなかった**。
全域が単一の `Holy Roman Empire` MultiPolygon に塗り込められており、
`propertyFixes` は properties の上書きしかできないため、上書きすべき対象が
無い。`suzerains` は色（`scripts/build-colors.ts`）に波及するため使えない
（decision-27）。

一方 TASK-101 は「上流が王国領に一括で含めている半独立の封土」を
`BASE_FIEF_SPLITS`（諸侯領オーバーレイの区画 ∩ base ポリゴンの切り出し）で
独立 feature にする機構を既に持っていた。

## Decision

**上流 base が誤った勢力のポリゴンに封土を塗り込めていて独立 feature が
無い場合は、`BASE_FIEF_SPLITS`（scripts/build-data.ts）で OHM 由来の同名
区画 ∩ 当該ポリゴンを切り出して feature を立て、宗主の宣言と年号付きの根拠
note は `propertyFixes`（data/name-overrides.json）側に置く。**
「形状の出所は OHM（decision-18）・帰属の是正は propertyFixes（decision-20）」
という既存の分担を保つ。

これを機能させるため、ビルドパイプラインの `applyPropertyFixes` を切り出し
（`applyBaseFiefSplits`）の**後段**へ移した。切り出し前には対象 feature が
存在しないためである。上流由来 feature の NAME は切り出しで変わらないので、
既存 propertyFixes エントリの挙動は変わらない（順序変更の非退行はテストと
他 18 年代の出力バイト同一で確認済み）。

TASK-101 のノルマンディー（subjecto = 自己参照 = 独立勢力）と違い、TASK-124
系の切り出しは subjecto に**正しい宗主**（France / Papal States）を宣言する。
「王の実効支配が及ばない半独立の封土」ではなく「上流が誤って他勢力側に
塗った封土」だからである。

## Consequences

- 切り出しの適用条件は従来どおり decision-14 / decision-18 に従属する:
  **出典付きの区画（OHM 等）が存在する範囲しか切り出せない**。リミニ以外の
  ロマーニャ一帯（ファエンツァ・フォルリ等）や帝国フランドル（スヘルデ川
  以東）は区画が無く、known-limitations（`base-imperial-paint-flanders-romagna`）
  に明記して帝国塗りのまま残した。
- 色は `colorKeyFor` の複合キー（`NAME|SUBJECTO`）で新キーが増えるだけで、
  既存キーの色は変わらない（TASK-124 実測: colors.json は追加 4 キーのみ）。
  `suzerains` を使わないため decision-27 の配色波及も起きない。
- 切り出した封土は被覆率判定（fief-dedupe）で base ラベル抑制・flat からの
  脱落が自動的に起き、TASK-101 のノルマンディーと同じ表示挙動になる。
- 外枠（suzerain_extent.ts）は SUBJECTO 宣言により宗主の union に含まれる。
  諸侯領オーバーレイ側の包含解決（decision-27 の containingSuzerainKey）とも
  一致する。
