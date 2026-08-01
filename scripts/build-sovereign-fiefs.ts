/**
 * 「base に現れない主権政体」を補完するオーバーレイを OpenHistoricalMap（OHM）
 * から生成するデータパイプライン（#189 で中東欧・バルカン・東欧を新設、
 * #190 で西欧・イタリア・地中海を追加）。
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
 * ## #190 で追加した西欧・イタリア・地中海（データ追加のみ・機構は #189 のまま）
 * 1000 年の教皇領（base は Holy Roman Empire 塗り）・1000〜1100 年の
 * バルセロナ伯領（同 Kingdom of France）・1279〜1400 年のアテネ公国と
 * アカイア公国（同 Byzantine Empire）・1400〜1500 年のナポリ王国（同 Sicily /
 * Aragón）・1400〜1500 年のサヴォイア（同 Holy Roman Empire）・1783 年の
 * ジェノヴァ共和国と 1800 年のリグリア共和国（同 Kingdom of Sardinia）・
 * 1400〜1783 年のヨハネ騎士団（ロドス→マルタ。base は Byzantine / Ottoman
 * 塗りか、マルタ島にポリゴンを持たない）を足した。既存 5 系統との分担は
 * 「その年に他系統が同じ政体を収録していない年だけを埋める」で、伊諸侯領の
 * ジェノヴァ（1100〜1500）・ミラノ（1500）と帝国領邦のミラノ（1400）は
 * coveredByOtherOverlay で静的に除外する。
 *
 * ## データ側の限界（本タスクで解消できないもの・data/known-limitations.json）
 * - 1530〜1715 年のハンガリー王国は上記のとおり面が組めず、base の Ottoman /
 *   Austrian Empire 塗りのまま残る。
 * - 1650 / 1700 年のスペイン領ネーデルラント（#190）も同じく label ノードのみ
 *   （rel 2848630 / 2848632、構成領邦のブラバント公領 2812126 も同様）で、
 *   base が低地地方南部を Luxembourg 名義で塗る誤帰属は解消できない。
 * - 1492 年のミラノ公国は OHM に 1447〜1500 年のリレーションが無く埋まらない。
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
 * 生成対象年。SNAPSHOT_YEARS のうち許可リストのいずれかが有効になる 18 年
 * （= 1914 を除く全スナップショット年）。件数は 1000=2 / 1100=1 / 1200=1 /
 * 1279=2 / 1300=2 / 1400=6 / 1492=4 / 1500=4 / 1530=2 / 1600=2 / 1650=3 /
 * 1700=4 / 1715=5 / 1783=6 / 1800=6 / 1815=7 / 1880=3 / 1900=2
 * （sovereignFiefIdsForYear の実測）。1914 は Finland ほか後継の主権国家を
 * base が個別収録するため対象にしない。
 *
 * #190: 西欧・イタリア・地中海の追加（ナポリ王国・サヴォイア・ジェノヴァ /
 * リグリア共和国・アテネ公国 / アカイア公国・バルセロナ伯領・1000 年の
 * 教皇領・ヨハネ騎士団）により 1000 / 1100 / 1279 / 1300 が対象年に加わった。
 * この 4 年は既に仏・帝国・伊・Cliopatria・ブリテンのオーバーレイがあるため
 * BASE_OUTLINE_YEARS（派生データの年集合）は変わらない。
 */
export const SOVEREIGN_FIEF_YEARS: readonly number[] = [
  1000,
  1100,
  1200,
  1279,
  1300,
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
  region:
    | "danubian"
    | "balkan"
    | "eastern"
    | "northern"
    | "western"
    | "italian"
    | "mediterranean";
  /**
   * 存続区間内でも収録しない年（実測に基づく静的な固定値）。
   * base（europe_<year>）が同じ政体・同じ土地を個別収録しており、オーバーレイを
   * 重ねると二重塗りになる年。根拠は SOVEREIGN_FIEF_EXCLUSIONS
   * .baseCoveredYearsExcluded を参照。
   */
  excludedYears?: readonly number[];
}

/**
 * 採用するリレーション ID の静的な許可リスト（30 件 = #189 の 16 + #190 の 14）。
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

  // =========================================================================
  // #190: 西欧・イタリア・地中海の追加分（14 件）
  // =========================================================================

  // --- 教皇領（1000 年のみ。base は 1000 年のローマを Holy Roman Empire で塗る） ---
  // OHM の教皇領は 0754 年から連鎖するが、base は 1100 年以降 Papal States を
  // 個別収録するため、退行が起きている 1000 年だけを埋める（rel 2805421 =
  // 1020〜1201 は base 収録年に重なるので SOVEREIGN_FIEF_EXCLUDED_IDS で落とす）。
  // NAME は base の呼称（Papal States）に揃え、1000→1100 年で色・和名が続く。
  2889237: {
    name: "Papal States",
    ohmName: "Papal States",
    adminLevel: 2,
    startDate: "0988",
    endDate: "1020",
    region: "italian",
  },
  // --- バルセロナ伯領（base は 1000 / 1100 年のカタルーニャを Kingdom of France 塗り） ---
  // 実際には 988 年以降フランス王への臣従を停止した事実上の独立伯領。
  // 仏諸侯領オーバーレイは「フランス王国の封建諸侯領ではない」として
  // カタルーニャ諸伯領を対象外にしており（build-france-fiefs.ts catalanCounties）、
  // base に現れない主権政体を補う本系統が引き受ける。
  // 2 本のリレーションは OHM 名が異なる（1050〜1150 は "Comtat de Barcelona
  // 1050-1150"）が、表示名は County of Barcelona に統一する。
  2739884: {
    name: "County of Barcelona",
    ohmName: "County of Barcelona",
    adminLevel: 4,
    startDate: "0950",
    endDate: "1050",
    region: "western",
  },
  2739885: {
    name: "County of Barcelona",
    ohmName: "Comtat de Barcelona 1050-1150",
    adminLevel: 4,
    startDate: "1050",
    endDate: "1150",
    region: "western",
  },
  // --- アテネ公国・アカイア公国（base は 1279〜1400 年のギリシアを Byzantine Empire 塗り） ---
  // 第 4 回十字軍後のラテン系政体で、当該年代のビザンツ帝国は実際には
  // これらの土地を支配していない（base の誤帰属）。アカイア公国は 1432 年に
  // モレアス専制公領へ吸収され、アテネ公国は 1458 年にオスマンへ降るため、
  // 1492 年以降は base の Ottoman Empire 塗りが正しい。
  2809440: {
    name: "Duchy of Athens",
    ohmName: "Duchy of Athens",
    adminLevel: 4,
    startDate: "1205",
    endDate: "1458",
    region: "balkan",
  },
  2809441: {
    name: "Principality of Achaea",
    ohmName: "Principality of Achaea",
    adminLevel: 2,
    startDate: "1205",
    endDate: "1432",
    region: "balkan",
  },
  // --- ナポリ王国（base は 1400 年を Sicily、1492 / 1500 年を Aragón の一枚岩で塗る） ---
  // 1282 年の晩祷戦争以降、イタリア半島南部（ナポリ）とシチリア島は別々の
  // 王国で、1400 年はアンジュー家、1492 / 1500 年はアラゴン系ナポリ王家が
  // 大陸側を治めた。base の一枚岩塗りではこの区別が読めない。
  // NAME は base 1530 年以降の呼称（Naples = ナポリ王国）に合わせ、
  // 1400→1530 年で色・和名が続く。1442〜1463 / 1501〜1504 のリレーションは
  // スナップショット年を含まず、1504 年以降は base が Naples /
  // Kingdom of the Two Sicilies として同じ土地を収録している。
  2750042: {
    name: "Naples",
    ohmName: "Kingdom of Naples",
    adminLevel: 2,
    startDate: "1302-08-31",
    endDate: "1442-06-02",
    region: "italian",
  },
  2892793: {
    name: "Naples",
    ohmName: "Kingdom of Naples",
    adminLevel: 2,
    startDate: "1463",
    endDate: "1501-08-02",
    region: "italian",
  },
  // --- サヴォイア（base は 1400〜1500 年のサヴォイア・ピエモンテを Holy Roman Empire 塗り） ---
  // 名目上は帝国封土だが、1416 年の公領昇格前後を通じて自立した領邦国家。
  // base は 1530 / 1600 年に Savoy、1650 年以降に Sardinia-Piedmont /
  // Kingdom of Sardinia として個別収録するため、その間だけを埋める。
  // NAME は base の呼称（Savoy）に合わせる（OHM 名は Savoyard state）。
  2893918: {
    name: "Savoy",
    ohmName: "Savoyard state",
    adminLevel: 3,
    startDate: "1388",
    endDate: "1401",
    region: "western",
  },
  2893921: {
    name: "Savoy",
    ohmName: "Savoyard state",
    adminLevel: 3,
    startDate: "1427",
    endDate: "1536",
    region: "western",
    // base が Savoy を個別収録する年は除外（1530 年）
    excludedYears: [1530],
  },
  // --- ジェノヴァ共和国・リグリア共和国（base は 1783 / 1800 年のリグリアを Kingdom of Sardinia 塗り） ---
  // ジェノヴァがサルデーニャ王国へ併合されるのは 1815 年のウィーン会議で、
  // 1783 年は独立共和国、1800 年はその後身のリグリア共和国（1797〜1805）。
  // base の 1783 / 1800 年は先取りしてサルデーニャ王国で塗っており誤帰属。
  // NAME は base 1530〜1715 年の呼称（Genoa）に合わせる: 伊諸侯領オーバーレイ
  // （1100〜1500 の Republic of Genoa）とは別キーになり、同じ土地を 2 系統で
  // 塗らない検査（build-sovereign-fiefs_test.ts の名前重複テスト）も通る。
  2851381: {
    name: "Genoa",
    ohmName: "Republic of Genoa",
    adminLevel: 2,
    startDate: "1768",
    endDate: "1797-06-13",
    region: "italian",
  },
  2750805: {
    name: "Ligurian Republic",
    ohmName: "Ligurian Republic",
    adminLevel: 4,
    startDate: "1797-06-14",
    endDate: "1805-06-09",
    region: "italian",
  },
  // --- ヨハネ騎士団（ロドス期 1310〜1522 / マルタ期 1530〜1798） ---
  // base はロドス島を 1400 年に Byzantine Empire、1492 / 1500 年に
  // Ottoman Empire で塗る（いずれも誤帰属。島は 1522 年まで騎士団領）。
  // マルタ島は base にポリゴンが無く、1880 年の Malta まで空白のままになる。
  // 3 本のリレーションを単一 NAME（Knights Hospitaller）で継ぎ、拠点が
  // 移っても同じ色・同じ日本語表記が続くようにする。1651〜1665 の
  // リレーションはスナップショット年を含まず、1798 年の失陥後（French Malta
  // 以降）は本 Issue の対象外。
  2861791: {
    name: "Knights Hospitaller",
    ohmName: "Knights Hospitaller",
    adminLevel: 2,
    startDate: "1310-08-15",
    endDate: "1522",
    region: "mediterranean",
  },
  2861790: {
    name: "Knights Hospitaller",
    ohmName: "Knights Hospitaller",
    adminLevel: 2,
    startDate: "1530",
    endDate: "1651",
    region: "mediterranean",
  },
  2861788: {
    name: "Knights Hospitaller",
    ohmName: "Knights Hospitaller",
    adminLevel: 2,
    startDate: "1665",
    endDate: "1798-06-11",
    region: "mediterranean",
  },
};

/**
 * 収録を見送った対象の分類と根拠。
 * 実測（名前照合）で確認した候補から、ここに挙げる分類で落とした残りが
 * 許可リスト 30 件になる。
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
    "該当する。#190 では 1504 年以降のナポリ王国（base は 1530〜1715 年に " +
    "Naples、1783〜1815 年に Kingdom of the Two Sicilies）、1576 年以降の" +
    "サヴォイア（base は 1530 / 1600 年に Savoy、1650〜1715 年に " +
    "Sardinia-Piedmont、1783 年以降に Kingdom of Sardinia）、1580〜1742 年の" +
    "ジェノヴァ共和国（base は 1530〜1715 年に Genoa）、1512 年以降のミラノ" +
    "（base は 1530〜1715 年に Milan、1783 年に Milano (Austria)、1800 年に " +
    "Lombardy）、1020〜1201 年の教皇領（base は 1100 / 1200 年に Papal States）、" +
    "1769〜1797 年のブルグント帝国クライス（base は 1783 年に Austrian " +
    "Netherlands）が加わる。本オーバーレイは「base に無い政体を足す」補完で" +
    "あり、base と同じ主権政体は採らない。",
  coveredByOtherOverlay:
    "既存のオーバーレイ系統が該当年に同じ政体を収録しているリレーション。" +
    "1395〜1404 年のミラノ公国は hre_fiefs_1400（TASK-85 の Duchy of Milan）、" +
    "1500〜1512 年のミラノ公国と 1099〜1540 年のジェノヴァ共和国の連鎖は " +
    "italy_fiefs_<year>（TASK-95 / #188 の Duchy of Milan / Republic of Genoa）" +
    "が担う。同じ土地を 2 系統のオーバーレイで塗ると半透明が二重に重なるため、" +
    "後から足す本系統は「他系統に無い年・政体」だけを埋める。",
  duplicateRelationChain:
    "同じ土地・同じ時期を指すリレーションが OHM に二重に存在し、片方だけを" +
    "採るもの。マルタ島の Monastic State of the Order of Malta（1530〜1753）は " +
    "Knights Hospitaller の連鎖（1530〜1651 / 1651〜1665 / 1665〜1798）と" +
    "同一の島・同一の騎士団を指すため、年代を跨いで単一 NAME で継げる後者を採る。",
  outOfIssueScope:
    "面は組めるが本 Issue（#190: 西欧・イタリア・地中海の主要政体）の対象に" +
    "含まれず、後続課題として docs/data-inventory/missing-powers-ledger.md に" +
    "記録するリレーション。1230〜1337 年の Empire of Thessalonica（エピロス系" +
    "の後継国家。base は 1279 / 1300 年の同域を Byzantine Empire で塗る）、" +
    "1798 年以降のマルタ（French Malta / British Protectorate of Malta / " +
    "Crown Colony of Malta）が該当する。",
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
    "補完できない。#190 のスペイン領ネーデルラント（2848632 = 1556〜1581 / " +
    "2848630 = 1581〜1714）と 1648〜1797 年のブラバント公領（2812126）も同じ" +
    "状態で、base が 1650 / 1700 年の低地地方南部を Luxembourg 名義で塗る" +
    "誤帰属は本オーバーレイでは解消できない。data/known-limitations.json に" +
    "明示する。",
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
    "1363〜1797、Duchy of the Archipelago 1207〜1566、Kingdom of Candia " +
    "1212〜1667 など）。base の Venice が同地を含めて塗っており、独立の" +
    "主権政体ではないため採らない。",
  baseCoveredYearsExcluded:
    "許可リスト内のリレーションでも、base が同じ政体を個別収録している年は " +
    "excludedYears で除外する（クリミア・ハン国 1492〜1600、セルビア 1000〜" +
    "1100、フィンランド 1914、クレタ州 1700〜1815、#190 のサヴォイア 1530）。" +
    "二重塗り・二重ラベルを生成段階で構造的に防ぐ。",
  upstreamGapsRecorded: "OHM に使えるリレーションが無く埋められない政体は " +
    "data/known-limitations.json（sovereign-fiefs-missing-territories）と" +
    "docs/data-inventory/missing-powers-ledger.md に記録する: 1530〜1715 年の" +
    "ハンガリー王国（リレーションはあるが面が組めない = geometryUnbuildable）、" +
    "1492〜1800 年のモルダヴィア公国（OHM は 1812 年以降のみ）、1600〜1700 年の" +
    "トランシルヴァニア公国（OHM は 1711 年以降のみ）、1400 年のセルビア" +
    "（ラザレヴィチ公国）、1783 年のモンテネグロ（OHM の主教公国は 1789 年" +
    "開始）、1815 年のセルビア自治公国。#190 では 1650 / 1700 年の" +
    "スペイン領ネーデルラント（面が組めない = geometryUnbuildable）、" +
    "1492 年のミラノ公国（OHM は 1447〜1500 年のリレーションを持たない）、" +
    "1279 / 1300 年のナポリ（OHM の Kingdom of Naples は 1302 年開始）、" +
    "1279 / 1300 年のミラノ（Lordship of Milan は面が組めない）、" +
    "1000〜1300 年の南イタリア諸侯領（ベネヴェント公国・サレルノ公国など）が" +
    "加わる。",
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

  // ---------------------------------------------------------------------
  // #190: 西欧・イタリア・地中海の候補のうち収録しないもの
  // ---------------------------------------------------------------------
  // ナポリ王国の前後リレーション
  2750043: "noSnapshotYearInSpan", // Kingdom of Naples 1442-1458
  2750044: "noSnapshotYearInSpan", // Kingdom of Naples 1458-1463
  2750046: "noSnapshotYearInSpan", // Kingdom of Naples 1501-1504
  2750045: "sovereignsCoveredByBase", // Kingdom of Naples 1504-1647（base: Naples）
  2750048: "sovereignsCoveredByBase", // Kingdom of Naples 1648-1714（base: Naples）
  2750049: "sovereignsCoveredByBase", // Kingdom of Naples 1714-1735（base: Naples）
  2750050: "sovereignsCoveredByBase", // Kingdom of Naples 1735-1799（base: Two Sicilies）
  2750744: "sovereignsCoveredByBase", // Kingdom of Naples 1799-1806（base: Two Sicilies）
  2750051: "sovereignsCoveredByBase", // Kingdom of Naples 1806-1815（base: Two Sicilies）
  2750052: "sovereignsCoveredByBase", // Kingdom of Naples 1815-1816（base: Two Sicilies）
  2888434: "noSnapshotYearInSpan", // Duchy of Naples 0661-0763
  2888433: "sovereignsCoveredByBase", // Duchy of Naples 0763-1139（base: Dutchy of Benevento）
  // サヴォイアの前後リレーション
  2893919: "noSnapshotYearInSpan", // Savoyard state 1401-1416
  2893917: "noSnapshotYearInSpan", // Savoyard state 1416-1427
  2840765: "noSnapshotYearInSpan", // Savoyard state 1536-1576
  2851942: "sovereignsCoveredByBase", // Savoyard state 1576-1601（base: Savoy）
  2893900: "sovereignsCoveredByBase", // Savoyard state 1601-1713（base: Sardinia-Piedmont）
  2893920: "sovereignsCoveredByBase", // Savoyard state 1713-1720（base: Sardinia-Piedmont）
  2810446: "sovereignsCoveredByBase", // Duchy of Savoy 1601-1792（base: Sardinia-Piedmont / Kingdom of Sardinia）
  2852040: "noSnapshotYearInSpan", // Savoy-Piedmont 1815-06-09..1816-03-16
  2832164: "noSnapshotYearInSpan", // Savoy-Piedmont 1816-1847
  // ジェノヴァ共和国の前後リレーション（中世は伊諸侯領オーバーレイが担う）
  2854760: "coveredByOtherOverlay", // Republic of Genoa 1099-1191（italy_fiefs 1100）
  2750806: "coveredByOtherOverlay", // Republic of Genoa 1192-1259（italy_fiefs 1200）
  2851367: "coveredByOtherOverlay", // Republic of Genoa 1266-1284（italy_fiefs 1279）
  2751186: "coveredByOtherOverlay", // Republic of Genoa 1298-1304（italy_fiefs 1300）
  2851376: "coveredByOtherOverlay", // Republic of Genoa 1354-1453（italy_fiefs 1400）
  2851369: "coveredByOtherOverlay", // Republic of Genoa 1475-1540（italy_fiefs 1492/1500）
  2848942: "sovereignsCoveredByBase", // Republic of Genoa 1580-1648（base: Genoa）
  2852275: "sovereignsCoveredByBase", // Republic of Genoa 1648-1742（base: Genoa）
  2851379: "noSnapshotYearInSpan", // Republic of Genoa 1742-1768
  // ミラノ（1492 年は OHM に 1447-1500 のリレーションが無く埋まらない）
  2751478: "noSnapshotYearInSpan", // Lordship of Milan 1259-1349
  2751477: "noSnapshotYearInSpan", // Lordship of Milan 1350-1395
  2750055: "coveredByOtherOverlay", // Duchy of Milan 1395-1404（hre_fiefs 1400）
  2751475: "noSnapshotYearInSpan", // Duchy of Milan 1405-1430
  2795658: "noSnapshotYearInSpan", // Duchy of Milan 1431-1440
  2848818: "noSnapshotYearInSpan", // Duchy of Milan 1440-1447
  2800654: "coveredByOtherOverlay", // Duchy of Milan 1500-1512（italy_fiefs 1500）
  2848874: "sovereignsCoveredByBase", // Duchy of Milan 1512-1559（base: Milan）
  2848848: "sovereignsCoveredByBase", // State of Milan 1559-1707（base: Milan）
  2848873: "noSnapshotYearInSpan", // Duchy of Milan 1707-1714
  2832183: "sovereignsCoveredByBase", // Duchy of Milan 1714-1734（base: Milan）
  2830845: "sovereignsCoveredByBase", // Duchy of Milan 1734-1786（base: Milano (Austria)）
  2809350: "noSnapshotYearInSpan", // Duchy of Milan 1786-1791
  2830844: "noSnapshotYearInSpan", // Duchy of Milan 1791-1796
  // 低地地方（面が組めない）
  2848632: "geometryUnbuildable", // Spanish Netherlands 1556-1581
  2848630: "geometryUnbuildable", // Spanish Netherlands 1581-1714
  2812126: "geometryUnbuildable", // Duchy of Brabant 1648-1797
  2810173: "sovereignsCoveredByBase", // Burgundian Circle 1769-1797（base: Austrian Netherlands）
  // 教皇領の前後リレーション（base が 1100 年以降を収録）
  2805421: "sovereignsCoveredByBase", // Papal States 1020-1201
  // バルセロナ伯領の前後リレーション
  2739868: "noSnapshotYearInSpan", // Comtat de Barcelona 897-950
  2739887: "noSnapshotYearInSpan", // County of Barcelona 1150-1163
  // ギリシア・エーゲ海
  2850421: "outOfIssueScope", // Empire of Thessalonica 1230-1337
  2751425: "dependencyOfDisplayedPower", // Duchy of the Archipelago 1207-1566
  2751426: "dependencyOfDisplayedPower", // Kingdom of Candia 1212-1667
  // ヨハネ騎士団・マルタ
  2861789: "noSnapshotYearInSpan", // Knights Hospitaller 1651-1665
  2801186: "duplicateRelationChain", // Monastic State of the Order of Malta 1530-1753
  2801183: "outOfIssueScope", // French Malta 1798-1800
  2801184: "outOfIssueScope", // British Protectorate of Malta 1800-1814
  2801185: "outOfIssueScope", // Crown Colony of Malta 1814-1964
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
