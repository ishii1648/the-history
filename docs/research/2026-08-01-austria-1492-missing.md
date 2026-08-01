# 1492 年にオーストリア大公領・ミラノ公国が地図から消える原因の調査

- 調査日: 2026-08-01
- 契機: ユーザー報告「1492 年にオーストリアが消えている」（Issue
  が無い状態からの 一次観測。調査の結果 Issue #202 を起票した）
- 使用した手段: `data/*_1492.geojson` 全レイヤーへの point-in-polygon 判定
  （アドホックな Python スクリプト）、OpenHistoricalMap Overpass API
  （`https://overpass-api.openhistoricalmap.org/api/interpreter`）への直接クエリ
- 結論の反映先: Issue #202 / Issue #203（借用方針の ADR）

## 症状

1492 年のスナップショットで、ウィーン・グラーツ・インスブルックが base
（`europe_1492.geojson`）の `Holy Roman Empire` 一枚塗りのままになり、
オーストリア（大公領）の領邦ポリゴンが存在しない。1400 年と 1500
年には存在する。

点内判定の結果（1492 年・`*_flat_*` を除く全レイヤー）:

| 地点      | 該当レイヤー       | NAME                             |
| --------- | ------------------ | -------------------------------- |
| Wien      | `europe_1492` のみ | Holy Roman Empire                |
| Graz      | `europe_1492` のみ | Holy Roman Empire                |
| Innsbruck | `europe_1492` のみ | Holy Roman Empire                |
| Milano    | `europe_1492` のみ | Holy Roman Empire                |
| Linz      | `hre_fiefs_1492`   | County of Schaunberg             |
| Salzburg  | `hre_fiefs_1492`   | Prince-Archbishopric of Salzburg |

## 原因

1. 1492 年の HRE 領邦は OHM 由来の `hre_fiefs_1492.geojson` のみが担当する。
   Roller 由来の `hre_<year>.geojson` は 1500〜1700 のみで `hre_1492.geojson` は
   存在しない（`HRE_FIEF_YEARS ∩ HRE_OVERLAY_YEARS = ∅` の設計。
   `scripts/build-hre-fiefs.ts` 冒頭）。
2. OHM 側にオーストリアの領域ポリゴンが 1453〜1512 の間、存在しない。Overpass
   実測 （bbox 45.0,5.5,55.0,19.0・`boundary=administrative`・`admin_level` 2〜5
   の 2,463 リレーションを全件走査。うち 1492 年に有効なのは 164 件）:

   | relation | name:en          | admin_level | start      | end            |
   | -------- | ---------------- | ----------- | ---------- | -------------- |
   | 2852946  | Duchy of Austria | 4           | 1254-04-03 | 1390           |
   | 2852945  | Duchy of Austria | 4           | 1390       | **1453-01-06** |
   | 2852596  | Austrian Circle  | 3           | **1512**   | 1565           |
   | 2848818  | Duchy of Milan   | 4           | 1440       | **1447**       |
   | 2800654  | Duchy of Milan   | 4           | **1500**   | 1512           |

   1453-01-06 は Privilegium maius
   承認による大公位昇格日で、領域の消滅ではない。 にもかかわらず OHM に後継の
   `Archduchy of Austria` リレーションが無いため、 `isActiveAtYear(1492)` が
   false になって落ちる。ミラノは 1447〜1500 が空白で、 台帳
   `docs/data-inventory/missing-powers-ledger.md` の 1492 年節に 「△ 1447〜1500
   は OHM 側も空白」として既記載。
3. `HRE_FIEF_NAMES` 許可リスト（`scripts/build-hre-fiefs.ts`）には
   `Duchy of Austria` しか無い。ただし `Archduchy of Austria` を足しても上流に
   実体が無いので解決しない。

同じ空白により Styria / Tyrol / Carinthia も 1492 年に不在。Carniola だけは
relation 2830843（1364〜1500）が生き残るため表示されている。

## 副次的な欠落

`hre_fiefs_1400` → `hre_fiefs_1492` で消える 6
件のうち、他レイヤーでも補われないもの:

- **Duchy of Milan** — 1492 年はスフォルツァ全盛期。`italy_fiefs_1492` にも
  `sovereign_fiefs_1492` にも無い
- County of Abensberg / Duchy of Pomerania-Stettin / Peasant Republic of
  Dithmarschen（小領邦・影響は軽微）

`Electorate of Saxony(-Wittenberg)` は `cliopatria_fiefs_1492` の
`Electorate of Saxony` が担うため実害なし。

## 結論

OHM から取得できない以上、隣接年の既存ジオメトリを 1492 年へ流用するほかない
（Issue #202 の方針）:

- オーストリア大公領: `data/hre_1500.geojson` の `Archduchy of Austria` （Roller
  / ETH Zürich・CC BY-NC-SA 4.0・30,693 km²）。1490 年のチロル継承・ 1493
  年の世襲領統合を経ており 1500 年との領域差はほぼ無い。
- ミラノ公国: `data/italy_fiefs_1500.geojson` の `Duchy of Milan` （OHM rel
  2800654・CC0 1.0）。1492 年・1500 年ともスフォルツァ期で領域はほぼ同一 （1499
  年のフランス占領は支配者の交代であり領域の変化ではない）。

この「他年ジオメトリの借用」を一般的に認めるかどうかの判断は Issue #203 で ADR
化する。
