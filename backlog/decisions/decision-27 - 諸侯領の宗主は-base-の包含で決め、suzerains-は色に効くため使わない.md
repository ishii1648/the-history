---
id: decision-27
title: 諸侯領の宗主は base の包含で決め、suzerains は色に効くため使わない
date: '2026-07-28 15:52'
status: accepted
---

## Context

勢力圏の外枠（decision-19）は `SUBJECTO` 由来の宗主キーの union で描く。base
（`europe_*`）と HRE 領邦オーバーレイ（`hre_fiefs_flat_*`）は全 feature が
`SUBJECTO` を持つので、宣言された宗主から直接キーを引ける。

しかし **OHM 由来の仏諸侯領（`france_fiefs_flat_*`）と Cliopatria 由来の
仏封土は `SUBJECTO` / `PARTOF` をそもそも持たない**（properties は `NAME` /
`ADMIN_LEVEL` / `OHM_RELATION_ID` / `START_DATE` / `END_DATE` のみ）。そのため
封土をホバー/クリックしても外枠が出ず、「この封土がどの勢力の内側にあるか」を
読み取れなかった（TASK-120 の bug）。

decision-20 の二分法（上流が持つ値の誤り → `propertyFixes` / 上流に無い関係の
追加 → `suzerains`）の字義では `suzerains` の担当に見える。しかし
`data/name-overrides.json` の `suzerains` は `src/suzerain_extent.ts` だけでなく
**`scripts/build-colors.ts` も読む**。実測すると配色への波及が許容できない。

| 案 | `"\|France"` キー数 / ユニーク色 | 無関係キーの変色 |
| --- | --- | ---: |
| A: `suzerains` に仏封土 33 件を足す | 39 件 → **ユニーク色 1 件**（全部 `#72a176`） | 118 |
| B: A + `France` を `INDEPENDENT_SUBJECT_SUZERAINS` へ | 39 件 → 39 色 | 57 |

案 A は `effectiveSubjecto` が `France` を返し、`France` が
`INDEPENDENT_SUBJECT_SUZERAINS` に無いため属領規則（宗主国色の明度シフト）が
全封土に適用され、**33 件が単一色に潰れる**。諸侯ごとに異なる色を与える
TASK-71 / decision-5 の設計と正面から衝突する。案 B は封土色を保てるが、
`Kingdom of France|France`（base のフランス本体）の色が変わり、フランスの属領
（Algeria・Sardinia・Britany）も宗主色ファミリーから外れる。decision-5 の
「属領は宗主国の色相ファミリー」を France だけ例外化することになる。

## Decision

**諸侯領オーバーレイの宗主キーは、その封土を包含する base 勢力から決める。**
`suzerains` には封土名を足さない。

`src/suzerain_extent.ts` の `containingSuzerainKey()` が、諸侯領レイヤーの
picking に限り次の優先順で解決する。

1. 宗主補正テーブル（`suzerains`）— 従来どおり最優先
2. 宣言された `SUBJECTO`（Cliopatria 由来の HRE 領邦はここで解決する）
3. **その封土を包含する base 勢力**（`labels.ts` の `labelAnchorFor` =
   最大ポリゴンの pole of inaccessibility を point-in-polygon で判定）

この経路は**関係データを 1 つも足さない**。base が既に描いている包含関係を
読むだけである。諸侯領オーバーレイはビルドパイプライン（`build-fief-flat` /
`build-fief-dedupe`）が base の内側を細分して作ったものなので、「包含する base
勢力＝その封土を含む勢力圏」は定義上の帰結にあたる。`suzerain_extent.ts` が
データ源を base に一本化している根拠（「オーバーレイは勢力圏の外縁を広げない」）
とまったく同じ論理である。

**伊諸侯領（`italy-fiefs`）は当面この機構に載せない**（TASK-121 の対象。帝国内の
コムーネと教皇領側が混在し、帰属の判断が仏諸侯領と別問題になる）。載せる場合は
`FIEF_EXTENT_SOURCE_LAYER_IDS` に 1 行足すだけで同じ機構に乗る。

## Consequences

- **判断の主体が「実装者の史実解釈」から「base が既に描いている帰属」へ移る。**
  これは decision-19 の「宗主補正は歴史的に明白な関係に限る／出典の無い関係を
  作らない」を最も強く満たす形になる。判断が割れる封土（Flanders・Aquitaine・
  Bar 等）に実装者が史実判断を下す必要が無い。
- 既存の decision がそのまま効く。1200 年のアンジュー系封土は
  `Angevin Empire` へ解決し（decision-19 の「アンジュー帝国は独立の複合勢力の
  まま扱う」）、1000/1100 の `Duchy of Normandy` は自分自身へ解決する
  （TASK-101 の「臣従礼は名目に留まり宗主補正の基準に当たらない」）。
- **base の帰属誤りはそのまま外枠に出る。**1279/1300 年の Artois・
  Counts of Saint-Pol・Flanders は base が `Holy Roman Empire` として塗るため
  帝国の外枠が出る。史実ではアルトワ・サンポルはフランス王領。これは外枠機構の
  問題ではなく base 側の誤りなので、decision-20 に従って `propertyFixes` で
  正す（別タスク）。**外枠の正しさは base の帰属の正しさに従属する**という
  関係を受け入れる。
- `colors.json` に一切影響しない。データファイルの追加・変更もゼロ。
- 解決コストは 1 回 0.061ms（1200 年の 19 封土 × 200 回で 231ms）。加えて
  `memoizeLatest` で 1 スロット覚えるため、同一封土上の `mousemove` では
  再計算しない。
- 将来 decision-19 の基準で個別に上書きしたくなれば、`suzerains` が第 1 段で
  効くので従来の語彙で書ける（その場合は色への波及も従来どおり発生する）。
