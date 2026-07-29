---
status: accepted
date: '2026-07-27 13:10'
---

# decision-20: 上流データの帰属の誤りは propertyFixes で正し、suzerains は上流に無い関係の追加に限る

## Context

勢力の宗主・帰属（`SUBJECTO` / `PARTOF`）を上書きする機構が 2 つある。

- `data/name-overrides.json` の `propertyFixes`（TASK-102）: ビルド時に
  `scripts/build-data.ts` の `applyPropertyFixes` が当てる。年代付きで
  properties を上書きし、生成物 `data/europe_<year>.geojson` に焼き付く。
- `data/name-overrides.json` の `suzerains`（TASK-94 / decision-19）: ランタイム
  側（`src/suzerain_extent.ts`）と色割当（`scripts/build-colors.ts`）が読む
  宗主補正テーブル。

TASK-103 の横断監査（`docs/data-inventory/base-attribution-audit.md`）で上流
（historical-basemaps）の帰属の乖離を 20 年代ぶんリストアップした結果、確度 A
（明確な誤り）が 15 件見つかり、どちらの機構で是正するかを決める必要が出た。

判断が要る理由は、decision-19 が `suzerains` に「歴史的に明白な関係に限る」
という高い基準を課している点にある。この基準をすべての帰属是正に課すと、
`SUBJECTO="Suom"` のような単なる切り詰め異常値の修正まで史実判断の議論を
要することになり、逆に基準を緩めると decision-19 が防いでいた「アンジュー帝国の
ような複合勢力を勝手に従属として描く」ことへの歯止めが効かなくなる。

また `docs/app-spec.md` §4.5 は TASK-102 時点の記述として「上書きは『上流の
入力ミスを直す』範囲に留め、史実に基づく宗主の付け替えはここでは行わない。
それは `suzerains` の担当」と書いており、この記述のままでは確度 A の是正が
すべて `suzerains` 側に流れ込む読み方になっていた。

## Decision

**機構の選択は「史実判断の重さ」ではなく「上流データが値を持っているか」で
決める。**

- **上流が持っている値が誤っている**場合 → ビルド時の `propertyFixes` で正す。
  文字化け（`Arag<U+FFFD>n`）・列ずれ（`SUBJECTO="3"`）・切り詰め
  （`SUBJECTO="Suom"`）といった機械的な異常も、史実と食い違う宗主
  （1400 年に存在しない `Mongol Empire` を宗主に持つ等）も、どちらもここに入る。
- **上流がその関係そのものを欠いている**場合 → ランタイム側の `suzerains`
  （decision-19、`Britany` → `France`）が担当する。データに無い封建関係を
  **足す**操作。

前者は元データの誤りの**訂正**、後者は元データへの**追加**であり、
decision-19 の「歴史的に明白な関係に限る」という基準は後者にのみ適用する。
追加は出典の無い関係を作り出すリスクを伴うため高い基準が要るが、訂正は上流の
値が誤っていることを年号付きで示せれば足りる。

是正の根拠は `propertyFixes` の各エントリの `note` に年号付きで残し、判定の
過程は監査ドキュメント側に置く（TASK-103 の
`docs/data-inventory/base-attribution-audit.md` §2 が確度 A / B / C の三段階で
記録している）。

`propertyFixes` は properties の上書きしかできず、ポリゴンを消す・分ける・
形を変えることはできない（decision-14 / decision-18）。「存在しない勢力が
描かれている」「実体よりはるかに広い範囲が一勢力の名で塗られている」類は
この decision の射程外で、`NAME` の上書き可否として個別に判断する。

## Consequences

- TASK-104 は確度 A の 14 件（`propertyFixes` エントリ 15）をこの方針で是正し、
  `docs/app-spec.md` §4.5 を「propertyFixes = 訂正 / suzerains = 追加」の軸で
  書き直した。旧記述（史実に基づく付け替えは suzerains の担当）は撤回された。
- 後続タスクの機構選択が決定的になる。TASK-107（確度 B の一貫性正規化）は
  上流が値を持っているケースなので `propertyFixes`、TASK-106（1400
  `Seljuk Caliphate`）は `NAME` の上書き可否という射程外の判断が要るため
  この decision では決まらない。
- 是正は生成物に焼き付くため、`data/europe_<year>.geojson` の再生成が必要に
  なる。色キー（`powers.ts` の `colorKeyFor`）は `NAME|SUBJECTO` で作られるので
  宗主を変えると配色が変わる。決定的プロービング（decision-5）により無関係な
  勢力の色まで動くが、これは既知の性質として許容する。
- ランタイム側の `suzerains` は肥大化しない。上流の誤りが混ざらないため、
  decision-19 の「歴史的に明白な関係」という基準を維持したまま運用できる。
