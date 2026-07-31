/**
 * 中東欧・バルカン・東欧の「base に現れない主権政体」を補完するオーバーレイを
 * OpenHistoricalMap（OHM）から生成するデータパイプライン（#189）。
 *
 * ## 背景
 * base（europe_<year>.geojson）は近世以降のオスマン帝国領・ハプスブルク領を
 * 一枚岩で塗るため、その下で実在した主権政体（オスマン宗主下のハンガリー・
 * ワラキア・クリミア・ハン国・ラグーザ共和国、ロシア帝国内のフィンランド
 * 大公国など）が地図に現れない。また 1200 年のセルビア・1400 年のモスクワ
 * 大公国のように前後の年代では base に居る勢力が特定年だけ消える「退行」、
 * 1880 年のクレタ（Bulgaria 塗り）のような誤帰属もある。2026-07 の Overpass
 * 実測（docs/data-inventory/missing-powers-ledger.md の候補を含む名前照合）で
 * 補完に使えるリレーションを確定し、build-britain-fiefs.ts と同型の
 * パイプラインで data/sovereign_fiefs_<year>.geojson を生成する。
 *
 * ## 許可リストはリレーション ID（ブリテン諸島と同じ方式）
 * 収録対象は主権政体（または base の誤帰属を正す区画）で、base の主権勢力と
 * 同じ admin_level 帯に並ぶため name / level では選別できない。実測で確認した
 * **リレーション ID の静的な許可リスト**（SOVEREIGN_FIEF_ALLOWLIST。実測した
 * 存続区間つき）を唯一の真実とし、年の包含判定も許可リストに記録した区間で
 * 行う。ブリテン諸島との違いは **excludedYears**: 同じ政体を base が個別
 * 収録している年（例: クリミア・ハン国の 1492〜1600）は存続区間内でも除外し、
 * 二重塗りを構造的に防ぐ（除外年も実測に基づき静的に固定する）。
 *
 * ## 実測で判明した最大の制約: 1401〜1751 年のハンガリー王国は面が組めない
 * OHM の Kingdom of Hungary は 1000〜1751 まで AL2 リレーションが連鎖するが、
 * 1401 年以降の 4 本（2829404 / 2750054 / 2829139 / 2829520）は label ノード
 * のみで境界 way を 1 本も持たない（#187 のブラバント公領と同じ状態）。
 * 面を組めるのはハプスブルク統治下の AL3（2829140、1779〜1848）だけで、
 * オスマン期（1530〜1715 年のスナップショット）のハンガリーは補完できない。
 * 出典を持たない形状を合成しない方針（TASK-88 / TASK-102）に従い、この空白は
 * data/known-limitations.json に明示する。
 *
 * ## NAME は base の呼称に合わせる（色・表記の連続性）
 * 同一政体が base に他の年代で居る場合、NAME は base の表記
 * （Kingdom of Hungary / Principality of Wallachia / Grand Duchy of Moscow /
 * Crimean Khanate / Serbia / Montenegro）に合わせる。colorKeyFor は NAME を
 * キーにするため、年代を跨いで同じ政体が同じ色・同じ日本語表記で続く。
 * OHM 側の実測名は ohmName に保持し、tagDrift の比較はそちらで行う。
 *
 * ## 収録しない対象とその根拠: SOVEREIGN_FIEF_EXCLUSIONS を参照
 *
 * ## データ側の限界（本タスクで解消できないもの・data/known-limitations.json）
 * - 1530〜1715 年のハンガリー王国は上記のとおり面が組めず、base の Ottoman /
 *   Austrian Empire 塗りのまま残る。
 * - モルダヴィア公国（1359〜1859）は OHM の収録が 1812 年以降のみで、
 *   1492〜1800 年は埋められない（base の Ottoman / Poland-Lithuania 塗りのまま）。
 * - トランシルヴァニア公国（1570〜1711）は OHM に無く、1600 / 1650 年は
 *   base の Ottoman Empire 塗りのまま残る。
 * - 1400 年のセルビア（ラザレヴィチ公国）・1783 年のモンテネグロ
 *   （OHM の主教公国は 1789 年開始）・1815 年のセルビア（第二次蜂起〜自治公国）
 *   は OHM に該当区間が無い。
 *
 * 出典: OpenHistoricalMap（https://www.openhistoricalmap.org/）
 * ライセンス: CC0 1.0（パブリックドメイン）。既存の諸侯領 4 系統と同じ出典・
 * 同じ独立ファイル構成で、出典管理を単純に保つ。
 *
 * 決定性の担保:
 * - 取得クエリはリレーション ID（昇順・重複除去）だけで決まる
 * - 年ごとの収録は許可リストに記録した存続区間と excludedYears だけで決まる
 * - feature の並びは表示名の昇順 → ID 昇順に固定する
 * - 座標は COORD_PRECISION で丸める
 *
 * 既存年の生成物のバイト不変は #188 と同じ年指定方式（parseTargetYears）で
 * 構造的に保証する（再生成しない年のファイルへ一切触れない）。
 *
 * ロジックは純粋関数として export しテスト対象にする
 * （scripts/build-sovereign-fiefs_test.ts。テストはネットワーク非依存）。
 */

import type { FeatureCollection } from "geojson";
import { shrinkToLimit } from "./build-data.ts";
import { formatCleanStats, selfIntersectionPoints } from "./clean-polygons.ts";
import {
  buildGeometryQuery,
  type FiefBuildMetadata,
  isActiveAtYear,
  OHM_SOURCE_HOMEPAGE,
  OHM_SOURCE_LICENSE,
  OHM_SOURCE_URL,
  type OhmRelation,
  type OverpassResponse,
  relationGeometry,
} from "./build-france-fiefs.ts";
import { removePinchPointsFromCollection } from "./build-hre-fiefs.ts";
import { SNAPSHOT_YEARS } from "../src/config.ts";

/**
 * 実測に使った bbox（Overpass の順序: south, west, north, east）。
 * アプリの表示域（build-data.ts EUROPE_BBOX = [-25, 34, 60, 72]）と同じ全欧域。
 * 対象政体が中東欧〜フィンランド〜モスクワ〜クリミアまで散らばるため、
 * 局所 bbox では洗い出せない。取得クエリ自体は ID 指定（buildGeometryQuery）で
 * bbox を使わないが、許可リストの洗い出し（名前照合）に使った範囲を再調査の
 * 手掛かりとしてピン留めする。
 */
export const SOVEREIGN_FIEF_BBOX: readonly [number, number, number, number] = [
  34,
  -25,
  72,
  60,
];

/**
 * 生成対象年。SNAPSHOT_YEARS のうち許可リストのいずれかが有効になる 14 年。
 * 件数は 1200=1 / 1400=1 / 1492=1 / 1500=1 / 1530=1 / 1600=1 / 1650=2 /
 * 1700=3 / 1715=4 / 1783=4 / 1800=5 / 1815=7 / 1880=3 / 1900=2
 * （sovereignFiefIdsForYear の実測）。1000〜1100・1279〜1300 は対象政体を
 * base が全て収録済みで、1914 は Finland ほか後継の主権国家を base が個別
 * 収録するため対象にしない。
 */
export const SOVEREIGN_FIEF_YEARS: readonly number[] = [
  1200,
  1400,
  1492,
  1500,
  1530,
  1600,
  1650,
  1700,
  1715,
  1783,
  1800,
  1815,
  1880,
  1900,
];

/** 出力 1 ファイルあたりのサイズ上限（バイト）。既存の諸侯領データと同値 */
export const SOVEREIGN_FIEF_SIZE_LIMIT_BYTES = 200 * 1000;

/** 許可リストの 1 エントリ（実測した OHM のタグ値のピン留め） */
export interface SovereignFiefEntry {
  /**
   * 出力 NAME（表示・色キー）。base が他年代で同じ政体を収録している場合は
   * base の表記に合わせ、色と日本語表記の連続性を保つ
   */
  name: string;
  /** 実測した OHM の name:en（2026-07 時点。tagDrift の比較対象） */
  ohmName: string;
  /** 実測した admin_level */
  adminLevel: number;
  /** 実測した start_date */
  startDate: string;
  /** 実測した end_date */
  endDate: string;
  /** 地域区分（記録用。選別には使わない） */
  region: "danubian" | "balkan" | "eastern" | "northern";
  /**
   * 存続区間内でも収録しない年（実測に基づく静的な固定値）。
   * base（europe_<year>）が同じ政体・同じ土地を個別収録しており、オーバーレイを
   * 重ねると二重塗りになる年。根拠は SOVEREIGN_FIEF_EXCLUSIONS
   * .baseCoveredYearsExcluded を参照。
   */
  excludedYears?: readonly number[];
}

/**
 * 採用するリレーション ID の静的な許可リスト（16 件）。
 * ID・存続区間・admin_level とも 2026-07 に Overpass で実測した値をピン留め
 * する。年ごとの収録はこの表の存続区間の包含判定と excludedYears **だけ**で
 * 決まる（sovereignFiefIdsForYear）。OHM 側のタグが変わっても選別は動かず、
 * 差分は tagDrift として metadata に記録される。
 */
export const SOVEREIGN_FIEF_ALLOWLIST: Readonly<
  Record<number, SovereignFiefEntry>
> = {
  // --- ハンガリー王国（ハプスブルク統治下の AL3、1779〜1848） ---
  // base は 1100〜1500 年に Hungary / Kingdom of Hungary / Imperial Hungary を
  // 収録し、1530 年以降は Ottoman / Austrian Empire の一枚岩に呑む。OHM には
  // 1401〜1751 の AL2 リレーション連鎖（2829404 / 2750054 / 2829139 / 2829520）
  // も存在するが、いずれも label ノードのみで境界 way を持たず面が組めない
  // （2026-07 実測。SOVEREIGN_FIEF_EXCLUDED_IDS の geometryUnbuildable）。
  // 面を持つのはこの AL3（1779-04-23..1848-04-10、outer way 321 本）だけで、
  // ハンガリー王国の表示は 1783 / 1800 / 1815 年に限られる。
  // 1751〜1779 の AL3（rel 2829405）は対象スナップショット年が無い。
  2829140: {
    name: "Kingdom of Hungary",
    ohmName: "Kingdom of Hungary",
    adminLevel: 3,
    startDate: "1779-04-23",
    endDate: "1848-04-10",
    region: "danubian",
  },
  // --- トランシルヴァニア（ハプスブルク統治期。1570〜1711 の公国は OHM に無い） ---
  2747433: {
    name: "Transylvania",
    ohmName: "Transylvania",
    adminLevel: 4,
    startDate: "1711-04-29",
    endDate: "1732-12-31",
    region: "danubian",
  },
  2878295: {
    name: "Transylvania",
    ohmName: "Transylvania",
    adminLevel: 4,
    startDate: "1765",
    endDate: "1851-05-12",
    region: "danubian",
  },
  // --- ワラキア公国（オスマン宗主下。NAME は base 1400 年の表記に合わせる） ---
  2929115: {
    name: "Principality of Wallachia",
    ohmName: "Wallachia",
    adminLevel: 4,
    startDate: "1420",
    endDate: "1538",
    region: "balkan",
  },
  2929116: {
    name: "Principality of Wallachia",
    ohmName: "Wallachia",
    adminLevel: 4,
    startDate: "1538",
    endDate: "1829-09-14",
    region: "balkan",
  },
  // --- モルダヴィア公国（OHM の収録は 1812 年以降のみ） ---
  2694163: {
    name: "Principality of Moldavia",
    ohmName: "Principality of Moldavia",
    adminLevel: 4,
    startDate: "1812-05-28",
    endDate: "1856-03-30",
    region: "balkan",
  },
  // --- クリミア・ハン国（オスマン宗主期。NAME は base 1492〜1600 年の表記） ---
  2849499: {
    name: "Crimean Khanate",
    ohmName: "Crimean Khanate",
    adminLevel: 4,
    startDate: "1475",
    endDate: "1774-07-21",
    region: "eastern",
    // base が Crimean Khanate を個別収録する年は除外（1650〜1715 のみ収録）
    excludedYears: [1492, 1500, 1530, 1600],
  },
  // --- ラグーザ共和国 ---
  2830352: {
    name: "Republic of Ragusa",
    ohmName: "Republic of Ragusa",
    adminLevel: 2,
    startDate: "1699-01-25",
    endDate: "1808-01-30",
    region: "balkan",
  },
  // --- モスクワ大公国（1400 年の退行解消。NAME は base 1300/1492 年の表記） ---
  2890623: {
    name: "Grand Duchy of Moscow",
    ohmName: "Grand Principality of Moscow (1392-1478)",
    adminLevel: 2,
    startDate: "1392",
    endDate: "1478",
    region: "eastern",
  },
  // --- セルビア（1200 年の誤帰属解消。NAME は base 1000〜1279 年の表記） ---
  2836150: {
    name: "Serbia",
    ohmName: "Grand Principality of Serbia",
    adminLevel: 2,
    startDate: "1000",
    endDate: "1216",
    region: "balkan",
    // base が Serbia を個別収録する年は除外（1200 年のみ収録）
    excludedYears: [1000, 1100],
  },
  // --- モンテネグロ（主教公国。NAME は base 1715/1880〜 年の表記） ---
  2857706: {
    name: "Montenegro",
    ohmName: "Prince-Bishopric of Montenegro",
    adminLevel: 2,
    startDate: "1789",
    endDate: "1852-03-13",
    region: "balkan",
  },
  // --- フィンランド大公国（ロシア帝国内） ---
  2696816: {
    name: "Grand Duchy of Finland",
    ohmName: "Grand Duchy of Finland",
    adminLevel: 3,
    startDate: "1809",
    endDate: "1917-12-06",
    region: "northern",
    // base が Finland を個別収録する 1914 年は除外
    excludedYears: [1914],
  },
  // --- 東ルメリ自治州（base の Bulgaria 一括塗りの描き分け） ---
  2854743: {
    name: "Eastern Rumelia",
    ohmName: "Eastern Rumelia",
    adminLevel: 4,
    startDate: "1878-07-13",
    endDate: "1885-09-18",
    region: "balkan",
  },
  // --- イオニア諸島合衆国（英保護下） ---
  2827696: {
    name: "United States of the Ionian Islands",
    ohmName: "United States of the Ionian Islands",
    adminLevel: 2,
    startDate: "1815-11-20",
    endDate: "1864-05-28",
    region: "balkan",
  },
  // --- クレタ（1880 年の Bulgaria 誤帰属解消 → 1900 年のクレタ国） ---
  2835765: {
    name: "Eyalet of Crete",
    ohmName: "Eyalet of Crete",
    adminLevel: 4,
    startDate: "1667",
    endDate: "1898",
    region: "balkan",
    // base が Ottoman Empire として正しく塗る年は除外（誤帰属の 1880 年のみ収録）
    excludedYears: [1700, 1715, 1783, 1800, 1815],
  },
  2692586: {
    name: "Cretan State",
    ohmName: "Cretan State",
    adminLevel: 2,
    startDate: "1898",
    endDate: "1913",
    region: "balkan",
  },
};

/**
 * 収録を見送った対象の分類と根拠。
 * 実測（名前照合）で確認した候補から、ここに挙げる分類で落とした残りが
 * 許可リスト 18 件になる。
 */
export const SOVEREIGN_FIEF_EXCLUSIONS: Record<string, string> = {
  sovereignsCoveredByBase:
    "base（europe_<year>.geojson）が該当年に同じ政体を個別収録している" +
    "リレーション。中世ハンガリー王国の連鎖（base は 1100〜1500 年に Hungary / " +
    "Kingdom of Hungary / Imperial Hungary を収録。1000 年は建国前夜の Magyars " +
    "が同域を担う）、モスクワの前後リレーション（base は 1300 年に Grand Duchy " +
    "of Moscow、1492 年以降に Grand Duchy of Moscow / Tsardom of Muscovy を" +
    "収録）、中世セルビア王国（base は 1279 年に Serbia、1300 年に Raška を" +
    "収録）、近代のセルビア・モンテネグロ（base は 1880 年以降に個別収録）が" +
    "該当する。本オーバーレイは「base に無い政体を足す」補完であり、base と" +
    "同じ主権政体は採らない。",
  noSnapshotYearInSpan:
    "存続区間にスナップショット年（SNAPSHOT_YEARS）が 1 つも含まれない" +
    "リレーション。収録しても表示される年が無い（例: Wallachia 1417〜1420、" +
    "Serbian Empire 1346〜1371、Principality of Montenegro 1852〜1878、" +
    "Transylvania 1732〜1765）。",
  geometryUnbuildable:
    "リレーションは存在するが label ノードのみで境界 way を持たず、面を" +
    "組めない（2026-07 実測。#187 のブラバント公領と同じ状態）。1401〜1751 の " +
    "Kingdom of Hungary の AL2 連鎖（2829404 / 2750054 / 2829139 / 2829520）が" +
    "該当し、オスマン期（1530〜1715 年のスナップショット）のハンガリー王国は" +
    "補完できない。data/known-limitations.json に明示する。",
  annexationYearCollision:
    "クリミア・ハン国の末期リレーション（1774〜1783-04-08）。存続区間は " +
    "1783 年に掛かるが、同年 4 月のロシア併合により base の 1783 年は同地を " +
    "Russian Empire として収録しており、年単位のスナップショットでは併合後の " +
    "base 表現を優先する（重ねると同じ土地に消滅済みのハン国が上書きされる）。",
  subdivisionOfDisplayedPower:
    "表示中の勢力の内部行政区にすぎないリレーション（Beylerbeylik / Eyalet of " +
    "Rumelia などのオスマン州、1667〜1898 のクレタ州の 1700〜1815 年分）。" +
    "base の Ottoman Empire が正しく塗っている土地を州単位に割る表示は" +
    "本オーバーレイ（主権政体の補完）の意味論に反する。例外として 1880 年の" +
    "クレタ州のみ、base の Bulgaria 誤帰属を正す目的で収録する（excludedYears " +
    "で年を絞る）。",
  dependencyOfDisplayedPower:
    "表示中の主権勢力の従属領（Venetian rule in the Ionian Islands " +
    "1363〜1797 など）。base の Venice が同地を含めて塗っており、独立の" +
    "主権政体ではないため採らない。",
  baseCoveredYearsExcluded:
    "許可リスト内のリレーションでも、base が同じ政体を個別収録している年は " +
    "excludedYears で除外する（クリミア・ハン国 1492〜1600、セルビア 1000〜" +
    "1100、フィンランド 1914、クレタ州 1700〜1815）。二重塗り・二重ラベルを" +
    "生成段階で構造的に防ぐ。",
  upstreamGapsRecorded: "OHM に使えるリレーションが無く埋められない政体は " +
    "data/known-limitations.json（sovereign-fiefs-missing-territories）と" +
    "docs/data-inventory/missing-powers-ledger.md に記録する: 1530〜1715 年の" +
    "ハンガリー王国（リレーションはあるが面が組めない = geometryUnbuildable）、" +
    "1492〜1800 年のモルダヴィア公国（OHM は 1812 年以降のみ）、1600〜1700 年の" +
    "トランシルヴァニア公国（OHM は 1711 年以降のみ）、1400 年のセルビア" +
    "（ラザレヴィチ公国）、1783 年のモンテネグロ（OHM の主教公国は 1789 年" +
    "開始）、1815 年のセルビア自治公国。",
};

/**
 * ID で明示的に落とす対象（リレーション ID → SOVEREIGN_FIEF_EXCLUSIONS のキー）。
 * 実測で確認した候補のうち収録しないものを ID で記録する（採否の根拠を
 * コード内に残す）。
 */
export const SOVEREIGN_FIEF_EXCLUDED_IDS: Readonly<Record<number, string>> = {
  // 中世ハンガリー王国の連鎖（base が 1000〜1500 年の同域を収録）
  2750053: "sovereignsCoveredByBase", // Grand Principality of Hungary 0895-1000
  2891972: "sovereignsCoveredByBase", // Kingdom of Hungary 1000-1017
  2891978: "sovereignsCoveredByBase", // Kingdom of Hungary 1017-1043
  2836112: "sovereignsCoveredByBase", // Kingdom of Hungary 1043-1102
  2836151: "sovereignsCoveredByBase", // Kingdom of Hungary 1102-1400
  2829404: "geometryUnbuildable", // Kingdom of Hungary 1401-1526（base 収録年でもある）
  2750054: "geometryUnbuildable", // Kingdom of Hungary 1526-1699
  2829139: "geometryUnbuildable", // Kingdom of Hungary 1699-1732
  2829520: "geometryUnbuildable", // Kingdom of Hungary 1732-1751
  2829405: "noSnapshotYearInSpan", // Kingdom of Hungary (AL3) 1751-1779
  // モスクワの前後リレーション
  2849503: "sovereignsCoveredByBase", // Principality of Moscow 1263-1389
  2849502: "noSnapshotYearInSpan", // Grand Principality of Moscow 1389-1392
  2890622: "noSnapshotYearInSpan", // Grand Principality of Moscow 1478-1485
  2890621: "sovereignsCoveredByBase", // Grand Principality of Moscow 1485-1521
  2890626: "sovereignsCoveredByBase", // Grand Principality of Moscow 1521-1537
  2890619: "noSnapshotYearInSpan", // Grand Principality of Moscow 1537-1547
  // セルビアの前後リレーション
  2855620: "sovereignsCoveredByBase", // Kingdom of Serbia 1217-1346
  2855619: "noSnapshotYearInSpan", // Serbian Empire 1346-1371
  2692353: "sovereignsCoveredByBase", // Principality of Serbia 1878-1882
  2692716: "sovereignsCoveredByBase", // Kingdom of Serbia 1882-1913
  // モンテネグロの前後リレーション
  2857708: "noSnapshotYearInSpan", // Principality of Montenegro 1852-1878
  2692715: "sovereignsCoveredByBase", // Principality of Montenegro 1878-1910
  2739656: "sovereignsCoveredByBase", // Kingdom of Montenegro 1913-1918
  // クリミア・ハン国の前後リレーション
  2849500: "noSnapshotYearInSpan", // Crimean Khanate (AL2) 1441-1475
  2849498: "annexationYearCollision", // Crimean Khanate (AL2) 1774-1783
  // ワラキア・モルダヴィア・トランシルヴァニアの前後リレーション
  2694164: "noSnapshotYearInSpan", // Wallachia 1417-1420
  2929117: "noSnapshotYearInSpan", // Wallachia 1829-1859
  2746689: "noSnapshotYearInSpan", // Principality of Moldavia 1856-1859
  2690518: "noSnapshotYearInSpan", // Transylvania 1732-1765
  2829384: "noSnapshotYearInSpan", // Transylvania 1851-1867
  // オスマン州・従属領
  2923274: "subdivisionOfDisplayedPower", // Beylerbeylik of Rumelia 1365-1540
  2923273: "subdivisionOfDisplayedPower", // Beylerbeylik of Rumelia 1540-1591
  2694200: "subdivisionOfDisplayedPower", // Eyalet of Rumelia 1591-1650
  2923272: "subdivisionOfDisplayedPower", // Eyalet of Rumelia 1650-1867
  2694169: "subdivisionOfDisplayedPower", // Serbia Eyalet 1840-1860
  2827694: "dependencyOfDisplayedPower", // Venetian rule in the Ionian Islands
};

/**
 * 収録しない対象なら、その根拠を返す（純粋関数）。収録するなら null。
 * 許可リスト SOVEREIGN_FIEF_ALLOWLIST とは独立に適用する二重の防波堤で、
 * 将来の許可リスト編集で base 側の主権政体やオスマン州が紛れ込んでも生成物に
 * 入らないようにする（build-britain-fiefs.ts britainFiefExclusionReason と
 * 同じ方針）。
 */
export function sovereignFiefExclusionReason(id: number): string | null {
  const key = SOVEREIGN_FIEF_EXCLUDED_IDS[id];
  return key === undefined ? null : SOVEREIGN_FIEF_EXCLUSIONS[key];
}

/**
 * year 時点で有効な許可リストのリレーション ID を返す（純粋関数）。
 * 判定は許可リストに記録した存続区間（実測値）と excludedYears だけで行い、
 * ネットワークにも OHM の現在のタグにも依存しない。返り値は ID 昇順で決定的。
 */
export function sovereignFiefIdsForYear(
  year: number,
  allowlist: Readonly<Record<number, SovereignFiefEntry>> =
    SOVEREIGN_FIEF_ALLOWLIST,
): number[] {
  return Object.entries(allowlist)
    .filter(([id, entry]) =>
      sovereignFiefExclusionReason(Number(id)) === null &&
      isActiveAtYear(entry.startDate, entry.endDate, year) &&
      !(entry.excludedYears ?? []).includes(year)
    )
    .map(([id]) => Number(id))
    .sort((a, b) => a - b);
}

/**
 * year 時点で収録するリレーションを選ぶ（純粋関数）。
 * sovereignFiefIdsForYear の ID 集合に一致する要素だけを残す（OHM のタグは
 * 判定に使わない）。返り値は表示名の昇順 → ID 昇順で入力順に依存しない。
 */
export function selectSovereignFiefsForYear(
  elements: readonly OhmRelation[],
  year: number,
  allowlist: Readonly<Record<number, SovereignFiefEntry>> =
    SOVEREIGN_FIEF_ALLOWLIST,
): OhmRelation[] {
  const active = new Set(sovereignFiefIdsForYear(year, allowlist));
  const selected = elements.filter((element) => active.has(element.id));
  return [...selected].sort((a, b) => {
    const nameDiff = allowlist[a.id].name.localeCompare(
      allowlist[b.id].name,
      "en",
    );
    return nameDiff !== 0 ? nameDiff : a.id - b.id;
  });
}

/**
 * OHM 側のタグが許可リストの実測値から動いていれば差分を文で返す（純粋関数）。
 * 動いていなければ null。選別は静的な許可リストが決めるため、この差分は
 * 生成物の metadata（tagDrift）と警告ログに記録するだけで、収録は変えない。
 * 名前の比較対象は表示名（name）ではなく実測した OHM 名（ohmName）:
 * 表示名は base の呼称へ意図的に揃えており、その差は drift ではない。
 */
export function sovereignFiefTagDrift(
  element: OhmRelation,
  allowlist: Readonly<Record<number, SovereignFiefEntry>> =
    SOVEREIGN_FIEF_ALLOWLIST,
): string | null {
  const entry = allowlist[element.id];
  if (entry === undefined) return null;
  const tags = element.tags ?? {};
  const drifts: string[] = [];
  const observed = {
    name: tags["name:en"] ?? tags["name"],
    start_date: tags["start_date"],
    end_date: tags["end_date"],
  };
  const recorded = {
    name: entry.ohmName,
    start_date: entry.startDate,
    end_date: entry.endDate,
  };
  for (const key of ["name", "start_date", "end_date"] as const) {
    if (observed[key] !== recorded[key]) {
      drifts.push(
        `${key}: 実測 ${recorded[key]} -> 現在 ${observed[key] ?? "(欠損)"}`,
      );
    }
  }
  return drifts.length === 0 ? null : drifts.join(", ");
}

/** 生成物に埋め込むビルドメタデータ */
export interface SovereignFiefBuildMetadata extends FiefBuildMetadata {
  /** OHM 側のタグが実測から動いたリレーション（ID → 差分の説明） */
  tagDrift: Record<string, string>;
}

/** buildYearCollection の結果 */
export interface SovereignFiefYearCollection {
  fc: FeatureCollection;
  metadata: SovereignFiefBuildMetadata;
}

/**
 * year 時点の主権政体 FeatureCollection とメタデータを組み立てる（純粋関数）。
 * tagged は取得したリレーション（tags 付き）、geometries は ID → メンバー付き
 * リレーション。properties は既存 4 系統と同じ形（NAME / ADMIN_LEVEL /
 * OHM_RELATION_ID / START_DATE / END_DATE）で、flat 化・表示は既存の機構に
 * そのまま載る。NAME と START/END_DATE は許可リストの実測値を使う（タグの
 * 変動に依存させず生成物を決定的にするため。タグとの差分は tagDrift に記録）。
 */
export function buildYearCollection(
  tagged: readonly OhmRelation[],
  geometries: ReadonlyMap<number, OhmRelation>,
  year: number,
): SovereignFiefYearCollection {
  const selected = selectSovereignFiefsForYear(tagged, year);
  const features: FeatureCollection["features"] = [];
  const missingWays: Record<string, number[]> = {};
  const unclosedRings: Record<string, number> = {};
  const droppedInnerRings: Record<string, number> = {};
  const tagDrift: Record<string, string> = {};
  const relationsWithoutGeometry: number[] = [];
  for (const element of selected) {
    const entry = SOVEREIGN_FIEF_ALLOWLIST[element.id];
    const drift = sovereignFiefTagDrift(element);
    if (drift !== null) tagDrift[String(element.id)] = drift;
    const withGeometry = geometries.get(element.id);
    const result = withGeometry === undefined
      ? null
      : relationGeometry(withGeometry);
    if (result === null || result.geometry === null) {
      relationsWithoutGeometry.push(element.id);
      continue;
    }
    const key = String(element.id);
    if (result.missingWays.length > 0) missingWays[key] = result.missingWays;
    if (result.unclosedRings > 0) unclosedRings[key] = result.unclosedRings;
    if (result.droppedInnerRings > 0) {
      droppedInnerRings[key] = result.droppedInnerRings;
    }
    features.push({
      type: "Feature",
      properties: {
        NAME: entry.name,
        ADMIN_LEVEL: entry.adminLevel,
        OHM_RELATION_ID: element.id,
        START_DATE: entry.startDate,
        END_DATE: entry.endDate,
      },
      geometry: result.geometry,
    });
  }
  relationsWithoutGeometry.sort((a, b) => a - b);
  return {
    fc: { type: "FeatureCollection", features },
    metadata: {
      source: "OpenHistoricalMap",
      sourceUrl: OHM_SOURCE_HOMEPAGE,
      license: OHM_SOURCE_LICENSE,
      year,
      featureCount: features.length,
      missingWays,
      unclosedRings,
      droppedInnerRings,
      tagDrift,
      relationsWithoutGeometry,
    },
  };
}

/**
 * CLI 引数から生成対象年を決める（純粋関数、#188 と同じ方式）。
 * 引数なしなら全対象年。年を並べる（例: `1815 1880`）とその年だけを生成・
 * 書き込みし、他の年の生成物へ一切触れない。既存年の生成物のバイト不変を
 * 「再生成しない」ことで構造的に保証するための仕組みで、対象年に無い年の
 * 指定はエラーにする。
 */
export function parseTargetYears(args: readonly string[]): number[] {
  if (args.length === 0) return [...SOVEREIGN_FIEF_YEARS];
  const years = args.map((arg) => Number.parseInt(arg, 10));
  for (const year of years) {
    if (!SOVEREIGN_FIEF_YEARS.includes(year)) {
      throw new Error(`${year} は SOVEREIGN_FIEF_YEARS に含まれない年です`);
    }
  }
  return [...new Set(years)].sort((a, b) => a - b);
}

/** Overpass の連続クエリの間に空ける待ち時間（ミリ秒）。レート制限対策 */
const OVERPASS_COOLDOWN_MS = 5_000;

/** Overpass に Overpass QL を POST して JSON を得る（429 / 504 は指数後退で再試行） */
async function runOverpass(
  query: string,
  attempts = 4,
): Promise<OverpassResponse> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const res = await fetch(OHM_SOURCE_URL, {
      method: "POST",
      headers: {
        "User-Agent": "zeitreise-data-pipeline/1.0 (build-sovereign-fiefs)",
      },
      body: new URLSearchParams({ data: query }),
    });
    if (res.ok) return await res.json() as OverpassResponse;
    await res.body?.cancel();
    const retryable = res.status === 429 || res.status === 504;
    if (!retryable || attempt === attempts) {
      throw new Error(
        `Overpass への問い合わせに失敗しました (status ${res.status})`,
      );
    }
    const waitMs = OVERPASS_COOLDOWN_MS * 2 ** (attempt - 1);
    console.warn(`  Overpass ${res.status}: ${waitMs} ms 待って再試行します`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error("到達しない");
}

async function main(): Promise<void> {
  for (const year of SOVEREIGN_FIEF_YEARS) {
    if (!SNAPSHOT_YEARS.includes(year)) {
      throw new Error(`${year} は SNAPSHOT_YEARS に含まれない年です`);
    }
  }
  const targetYears = parseTargetYears(Deno.args);
  console.log(`target years: ${targetYears.join(", ")}`);
  // 許可リストは ID が確定しているため、tags 全件取得（1 段目）は不要で、
  // 対象年で必要になるリレーションのジオメトリを 1 回の geom クエリで取る
  // （out geom は tags も返すので、選別・drift 検出にも同じ応答を使う）
  const ids = new Set<number>();
  for (const year of targetYears) {
    for (const id of sovereignFiefIdsForYear(year)) ids.add(id);
  }
  const elements = (await runOverpass(buildGeometryQuery([...ids]))).elements;
  const geometries = new Map(elements.map((e) => [e.id, e]));
  console.log(`geom: ${geometries.size}/${ids.size} relations`);

  for (const year of targetYears) {
    const { fc, metadata } = buildYearCollection(elements, geometries, year);
    const { fc: shrunk, tolerance, cleanStats } = shrinkToLimit(
      fc,
      SOVEREIGN_FIEF_SIZE_LIMIT_BYTES,
    );
    // 座標丸めで生じた「くびれ」を解消する（build-britain-fiefs.ts と同じ理由で、
    // data/ 全体の「自己交差ゼロ」不変条件を満たすのに必要）
    const { fc: unpinched, removed, droppedFeatures } =
      removePinchPointsFromCollection(shrunk);
    // メタデータは simplify / truncate の後に付け直す（欠損を生成物に記録）
    const output = { ...unpinched, metadata };
    const outPath = `data/sovereign_fiefs_${year}.geojson`;
    const json = JSON.stringify(output);
    const finalBytes = new TextEncoder().encode(json).length;
    if (finalBytes > SOVEREIGN_FIEF_SIZE_LIMIT_BYTES) {
      throw new Error(`${outPath} が上限を超えました (${finalBytes} バイト)`);
    }
    const residual = unpinched.features.filter((feature) =>
      (feature.geometry.type === "Polygon" ||
        feature.geometry.type === "MultiPolygon") &&
      selfIntersectionPoints(feature.geometry).length > 0
    ).map((feature) => String(feature.properties?.NAME));
    if (residual.length > 0) {
      throw new Error(
        `${outPath} に自己交差が残りました: ${residual.join(", ")}`,
      );
    }

    await Deno.writeTextFile(outPath, json);
    console.log(
      `${outPath}: ${finalBytes} bytes, tolerance=${tolerance}, features=${unpinched.features.length}`,
    );
    console.log(
      `  ${
        unpinched.features.map((f) => String(f.properties?.NAME)).join(" / ")
      }`,
    );
    if (removed > 0) {
      console.log(`  くびれを解消: 重複頂点 ${removed} 個を除去`);
    }
    if (droppedFeatures.length > 0) {
      console.warn(`  面が残らず除外: ${droppedFeatures.join(", ")}`);
    }
    const cleanLog = formatCleanStats(cleanStats);
    if (cleanLog !== null) console.log(`  ${cleanLog.trim()}（くびれ解消前）`);
    const warnings = [
      ...Object.entries(metadata.missingWays).map(([id, ways]) =>
        `  欠損 way: relation ${id} -> ${ways.join(",")}`
      ),
      ...Object.entries(metadata.unclosedRings).map(([id, count]) =>
        `  強制クローズしたリング: relation ${id} -> ${count}`
      ),
      ...Object.entries(metadata.droppedInnerRings).map(([id, count]) =>
        `  破棄した内環: relation ${id} -> ${count}`
      ),
      ...Object.entries(metadata.tagDrift).map(([id, drift]) =>
        `  タグが実測から変化: relation ${id} -> ${drift}`
      ),
      ...(metadata.relationsWithoutGeometry.length > 0
        ? [`  ジオメトリ未取得: ${metadata.relationsWithoutGeometry.join(",")}`]
        : []),
    ];
    for (const warning of warnings) console.warn(warning);
  }
}

if (import.meta.main) {
  await main();
}
