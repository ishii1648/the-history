---
status: accepted
date: '2026-07-27 16:34'
---

# decision-23: 消滅済み・過大な勢力の NAME は上流の語彙へ propertyFixes で上書きし、形状の限界は known-limitations で補う

## Context

decision-20 は「上流が持つ値の誤りは `propertyFixes` で正す」と決めたが、
`NAME` の上書きは射程外として TASK-106 に残された。TASK-103 の横断監査
（`docs/data-inventory/base-attribution-audit.md` §4）が挙げた 2 件が対象:

- **1400 年 `Seljuk Caliphate`**（約 23.8 万 km²）: ルーム・セルジューク朝は
  1308 年にメスード 2 世の死で滅亡しており、その年代に存在しない勢力名で
  アナトリア中央〜東部が塗られている。
- **1279 / 1300 年 `Ryazan`**（約 131 万 km²）: オカ川中流域の一公国の名で
  ノヴゴロドを除くルーシ全域が塗られている。1492 年（約 15.0 万 km²）・
  1500 年（約 2.0 万 km²）には実体どおりの規模の `Ryazan` が別に存在する。

どちらも「形状が実体と違う」問題だが、`propertyFixes` は properties しか
触れず、ポリゴンを分ける・消すことは decision-14 / decision-18（出典を
たどれない形状を作らない）が禁じている。したがって選択肢は
**(a) NAME を上書きする**か **(b) known-limitations に明記して現状維持**の
二択になり、(a) には前例が無かった（TASK-102 / TASK-104 の 18 エントリは
`SUBJECTO` / `PARTOF` / `BORDERPRECISION` のみ）。

判断材料として次を実測した。

- 表示名は `data/name-ja.json`（decision-6）が担うが、キーは英語 `NAME` なので
  誤った `NAME` を残すと誤った日本語名（「セルジューク朝」「リャザン」）が
  出続ける。上書きしない限り表示層では直せない。
- `Ryazan` を放置すると、131 万 km²（1279 / 1300）と 15 万 km²（1492）が
  同一の勢力・同一の色として繋がって見え、「縮小した公国」という実在しない
  歴史を描いてしまう。
- 上書きの波及: `Ryazan` は色の入れ替えを起こさない（複合キーの色は宗主名から
  導かれ、ベース名の集合が変わらない）。`Seljuk Caliphate` はベース名が 1 つ
  増えるため決定的プロービング（decision-5）の玉突きで無関係な 15 勢力の色が
  入れ替わる。`data/colors.json` の差分は計 +3 キー / -2 キー / 15 色。

## Decision

**「その年代に存在しない勢力名」「実体とかけ離れた広域を覆う代表名」は
`propertyFixes` で `NAME` を上書きする。ただし上書き先は上流
（historical-basemaps）自身が使う語彙に限り、形状が実体と一致しないことは
known-limitations で必ず補う（(a) + (b) の併用）。**

適用条件:

1. **年号付きの根拠がある**こと。「1308 年に滅亡」「1200 年に上流自身が同種の
   広がりへ使っている NAME」のように、`note` に年号で書けること。
2. **上書き先が上流の語彙にある**こと。上流は総称 NAME を持つ
   （`Cuman Khanates` / `Celtic kingdoms` / `Other Rus Principalities` /
   `Baltic Tribes`）ので、これに倣う。1400 年の `Anatolian beyliks` は同年の
   上流が `Beylik of Aydin` を独立勢力として収録していることを裏付けとする。
   独自の造語や、実在の隣接勢力名（例: 1400 年のアナトリアを
   `Ottoman Empire` に寄せる）へは寄せない。後者は形状の帰属まで書き換える
   編集で、上流が描いた版図の意味を変えてしまう。
3. **上書きは対象年代だけに絞る**こと。同じ `NAME` が別年代で正しく使われて
   いる場合（1492 / 1500 の `Ryazan`、1279 / 1300 の `Seljuk Caliphate`）は
   巻き込まない。
4. **`NAME` と自己参照していた `SUBJECTO` / `PARTOF` を同時に書き換える**
   こと。`NAME` だけを変えると上書き前の名前を指す宗主が宙に浮き、色キー
   （`powers.ts colorKeyFor`）が `新NAME|旧NAME` に分裂する。宗主が他勢力を
   指している場合（1279 `Mongol Empire` / 1300 `Khanate of the Golden Horde`）
   はその値に触れない（宗主表記の正規化は TASK-107 の担当）。
5. **`data/name-ja.json` に上書き先の訳を足し、known-limitations の本文を
   「元データの名前は何で、何を表示していて、形状は元データのまま」と読める
   ように更新する**こと。名前を直したことで「範囲も直った」と誤読されるのを
   防ぐ。

`renames` との関係は適用順で決まっており、追加の規約は要らない。
`scripts/build-data.ts` は `applyNameOverrides`（renames）→
`applyPropertyFixes` → 封土切り出し → `normalizeSubjectProps` の順に当てるので、
`propertyFixes` の `name` はリネーム後の名前で指定し、上書き後の `NAME` は
もう `renames` を通らない。

## Consequences

- TASK-106 は 2 件とも採用した。1400 `Seljuk Caliphate` → `Anatolian beyliks`
  （「アナトリア諸侯国（ベイリク）」）、1279 / 1300 `Ryazan` →
  `Other Rus Principalities`（「その他のルーシ諸公国」）。回帰テストは
  `scripts/base-properties_test.ts` の `EXPECTED_NAME_OVERRIDES` と、
  巻き込みを検出する「NAME の上書きが対象年代の外へ波及していない」。
- 色の入れ替えは許容する。ベース名が増えるたびに決定的プロービングで無関係な
  勢力の色が動くのは TASK-71 / TASK-86 / TASK-96 と同じ既知の性質で、
  decision-5 の設計上の帰結。今回は 15 勢力。
- known-limitations の `base-extinct-or-overbroad-powers` は「誤った名前が
  残っている」ではなく「名前は是正済み、形状は元データのまま」を述べる項目に
  変わった。同種の是正を行った場合も同じ書き換えが要る。
- 上流の粒度に由来する残りの「代表名で広域を塗る」ケース（監査 §5 の確度 C・
  検出器 B の残余）にも同じ条件で判断できる。条件 2 を満たす上書き先が
  見つからない場合は (b) だけを採る。
- 形状そのものは一切変えていないので decision-14 / decision-18 とは衝突しない。
  「どの名前にするか」は編集判断であり、その根拠は `propertyFixes` の `note`
  に年号付きで残す（decision-20 と同じ運用）。
