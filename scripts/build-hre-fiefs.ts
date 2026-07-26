/**
 * 神聖ローマ帝国（HRE）領邦オーバーレイのうち、中世（1000〜1492 年）分を
 * OpenHistoricalMap（OHM）から生成するデータパイプライン（TASK-85）。
 *
 * 既存の data/hre_<year>.geojson（1500〜1700。ETH Zürich の Roller データセット
 * 由来・CC BY-NC-SA 4.0）とは別系統・別ファイル data/hre_fiefs_<year>.geojson
 * として生成する。Roller 側は査読済み学術データなので置き換えない（§統一の是非）。
 *
 * 処理は scripts/build-france-fiefs.ts（TASK-70）と同じ流儀で、共通ロジック
 * （Overpass クエリ組み立て・start_date/end_date の年判定・リレーション →
 * MultiPolygon 化）はそちらから import して重複を作らない:
 * - OHM Overpass API から boundary=administrative のリレーションを 2 段階で取得
 *   （1: tags のみで全件 → 2: 対象 ID の geom のみ）
 * - start_date / end_date で「year 時点で有効」な領邦に絞る
 * - 許可リスト（name:en）+ admin_level + 除外規則で領邦のみを選ぶ
 * - simplify + 座標丸め + ポリゴンのクリーンアップ（自己交差の解消・微小破片の
 *   除去、scripts/clean-polygons.ts）で 1 ファイル HRE_FIEF_SIZE_LIMIT_BYTES
 *   以下に収める
 *
 * 出典: OpenHistoricalMap（https://www.openhistoricalmap.org/）
 * ライセンス: CC0 1.0（パブリックドメイン）。Roller 由来の hre_<year>.geojson
 * （CC BY-NC-SA 4.0）とも europe_<year>.geojson（GPL-3.0 派生）とも混合制約が
 * 無いが、出典管理を単純に保つため独立ファイルとして生成する。
 *
 * ## Roller データとの統一の是非（比較根拠のみ記録し現状維持）
 * 1500 年以降も OHM に統一すれば出典が 1 本化されライセンスも CC0 に揃うが、
 * 採らない。理由は 3 点:
 * 1. Roller は査読済みの学術データセット（DOI 10.3929/ethz-b-000472583）で、
 *    宗派・上位関係まで属性化されている。OHM はコミュニティ編集で、属性は
 *    name:en / admin_level / start_date / end_date に限られる。
 * 2. 収録密度が逆方向に厚い。Roller は 1500 年時点で 276 ユニーク領邦、うち
 *    主要 14 領邦を選定して使っている。OHM の帝国中核域は 1492 年で
 *    admin_level 4/5 の許可リスト内 73 件（本パイプラインの実測）で、
 *    選帝侯領クラスの収録が Roller より粗い年代がある。
 * 3. 境界の連続性。既存 hre_1500〜1700 は同一ソースの時系列なので年代間で
 *    形状が整合する。OHM に差し替えると 1492→1500 の境目で不整合が出る。
 * したがって「中世は OHM・近世は Roller」の 2 系統併存とし、年代の重なりは
 * 作らない（HRE_FIEF_YEARS ∩ HRE_OVERLAY_YEARS = ∅）。
 *
 * 決定性の担保:
 * - 取得クエリは bbox とリレーション ID（昇順・重複除去）だけで決まる
 * - feature の並びは英語名（name:en）の昇順に固定する
 * - 座標は COORD_PRECISION で丸める
 *
 * ロジックは純粋関数として export しテスト対象にする
 * （scripts/build-hre-fiefs_test.ts。テストはネットワーク非依存）。
 */

import type { FeatureCollection, Position } from "geojson";
import { shrinkToLimit } from "./build-data.ts";
import {
  cleanGeometry,
  formatCleanStats,
  type PolygonalGeometry,
  polygonParts,
  selfIntersectionPoints,
} from "./clean-polygons.ts";
import {
  buildGeometryQuery,
  buildTagsQuery,
  type FiefBuildMetadata,
  isActiveAtYear,
  OHM_SOURCE_HOMEPAGE,
  OHM_SOURCE_LICENSE,
  OHM_SOURCE_URL,
  type OhmRelation,
  type OverpassResponse,
  relationGeometry,
} from "./build-france-fiefs.ts";
import { SNAPSHOT_YEARS } from "../src/config.ts";

/**
 * 取得対象の bbox（Overpass の順序: south, west, north, east）。
 * 帝国中核域（低地地方〜北イタリア北端〜ボヘミア・モラヴィア〜バルト海南岸）を
 * 覆う。この範囲の boundary=administrative は 34,005 リレーション。
 */
export const HRE_FIEF_BBOX: readonly [number, number, number, number] = [
  45.5,
  5.5,
  55.0,
  19.0,
];

/**
 * 生成対象年。SNAPSHOT_YEARS のうち OHM に領邦データが十分にある中世年代。
 * 許可リスト内で有効な領邦の実測件数と合計面積（クリップ前・球面近似）:
 * 900 = 6 件 / 247,289 km²、1000 = 19 / 544,855、1100 = 23 / 542,256、
 * 1200 = 26 / 122,184、1279 = 40 / 110,706、1300 = 52 / 151,447、
 * 1400 = 63 / 239,371、1492 = 73 / 226,502。
 *
 * 900 年は対象外（HRE_FIEF_EXCLUSIONS.year900）。1200 年は 1100 年から面積が
 * 1/4 に落ちる「谷」だが収録する（HRE_FIEF_EXCLUSIONS 参照の判断根拠は
 * HRE_FIEF_YEAR_1200_NOTE）。
 *
 * Roller 由来の HRE_OVERLAY_YEARS（1500〜1700）とは互いに素で、同一年に
 * 2 系統の HRE 領邦が並ぶことはない。
 */
export const HRE_FIEF_YEARS: readonly number[] = [
  1000,
  1100,
  1200,
  1279,
  1300,
  1400,
  1492,
];

/**
 * 1200 年を収録する判断の根拠（AC3 の「収録見送りの根拠」の裏返しとして記録）。
 * 1100 → 1200 で合計面積が 542,256 → 122,184 km² に落ちるのは、OHM が
 * 部族大公領（Bayern / Sachsen / Franken / Thüringen。いずれも 1100〜1180 で
 * end_date）を境に「大公領の面」から「個別領邦の面」へ収録方式を切り替えている
 * ためで、データ欠損ではなく粒度の変化である。1200 年（26 件 / 122,184 km²）は
 * 収録済みの 1279 年（40 件 / 110,706 km²）より被覆が広いので、1279 を採る以上
 * 1200 を落とす理由が無い。ただし 1200 年は帝国中核（バイエルン・ザクセン・
 * フランケン・チューリンゲン）が空白になるため、既知の制限として記録する。
 */
export const HRE_FIEF_YEAR_1200_NOTE =
  "1100→1200 の面積減は OHM の収録粒度が部族大公領から個別領邦へ移るためで、" +
  "1200 年（26 件 / 122,184 km²）は 1279 年（40 件 / 110,706 km²）より被覆が広い。" +
  "帝国中核（バイエルン・ザクセン・フランケン・チューリンゲン）は空白になる。";

/**
 * 領邦として採用する admin_level。
 * 2 は主権国家レベル（Holy Roman Empire 自身・Kingdom of France / Hungary /
 * Poland / Croatia・Republic of Venice がここに入る）。3 は帝国の構成王国
 * （Regnum Burgundiae / Regnum Lotharii）と Savoyard state で、配下の領邦と
 * 領域が重なり二重塗りになるため採らない。
 */
export const HRE_FIEF_ADMIN_LEVELS: readonly number[] = [4, 5];

/** オーバーレイ feature の SUBJECTO / PARTOF に入れる帝国名。hre_<year> と同値 */
export const HRE_FIEF_NAME = "Holy Roman Empire";

/** 出力 1 ファイルあたりのサイズ上限（バイト）。hre_<year>.geojson と同値 */
export const HRE_FIEF_SIZE_LIMIT_BYTES = 200 * 1000;

/**
 * 収録を見送った対象の分類と根拠（AC3）。
 * bbox 内の boundary=administrative から admin_level 4 / 5・対象年に有効・
 * name:en ありで絞ると 171 件が残り、そのうち 72 件をここに挙げる分類で落とし、
 * さらに 900 年専用の 1 件を外して許可リスト HRE_FIEF_NAMES（98 件）にした。
 */
export const HRE_FIEF_EXCLUSIONS: Record<string, string> = {
  freeImperialCities:
    "帝国都市・帝国自由都市・ハンザ都市（Free Imperial City of * 39 件 + " +
    "Free and Hanseatic City of Lübeck / Imperial City of Goslar / " +
    "Imperial City of Schweinfurt / Republic of Mulhouse）。帝国等族ではあるが" +
    "領邦ではなく、市域だけの数十 km² のポリゴンなので簡略化で微小破片になる（AC2・AC5）。",
  hungarianCounties:
    "ハンガリー王国の県（vármegye。Bars / Moson / Nyitra / Pozsony / Sopron / " +
    "Trencsén / Turóc / Vas / Zólyom county の 9 件）。bbox の東端が西ハンガリーに" +
    "掛かるため入ってくるが帝国外（AC2）。",
  croatianCounties:
    "クロアチア王国（ハンガリー王冠領）の県 Varasdin County。同じく bbox の" +
    "南東端に掛かる帝国外の行政区画（AC2）。",
  polishVoivodeships:
    "ポーランド王国の県（Brześć Kujawski / Chełmno / Inowrocław / Kalisz / " +
    "Kraków / Łęczyca / Malbork / Pomeranian / Poznań / Sieradz Voivodeship の " +
    "10 件）と Royal Prussia。bbox の北東端に掛かる帝国外の行政区画（AC2）。",
  danishHerredAndItalianPlebis:
    "デンマークの Herred（13 件）と北イタリアの Plebis（11 件）は OHM ではすべて " +
    "admin_level 6 なので、HRE_FIEF_ADMIN_LEVELS = [4, 5] の段で自動的に落ちる" +
    "（許可リストに現れない。AC2）。",
  imperialKingdoms:
    "帝国の構成王国 Kingdom of Burgundy・Lotharingia と Savoyard state は " +
    "admin_level 3 で、配下の領邦（Prince-Bishopric of Basel・" +
    "County/Principality of Neuchâtel 等）と領域が重なるため採らない。",
  saxonTribalRegions:
    "Angria / Eastphalia / Nordalbingia / Westphalia（900〜1100）は " +
    "Duchy of Saxony に内包される部族地域で、領主のいる領邦ではない。" +
    "同時に採ると同じ土地が二重に塗られる。",
  franceFiefOverlap:
    "County of Bar・County of Champagne・Duchy of Burgundy は " +
    "france_fiefs_<year>.geojson（TASK-70）で収録済みなので採らない。" +
    "1400 / 1492 年は france_fiefs 側にファイルが無いため、同じバロワ地方でも " +
    "Duchy of Bar は許可リストに入れている。",
  nestedUnions:
    "County of Schaumburg and Holstein-Pinneberg は County of Schaumburg と " +
    "County of Holstein-Pinneberg を合わせた連合体（place=union）で、" +
    "構成 2 伯領を採るため連合体側は落とす。",
  unusableNames:
    "County of Ratzeburg (1143-1204) は name:en に期間の曖昧性解消が入っており" +
    "表示名に使えない。1200 年にしか掛からないため代替を立てずに落とす。",
  ohmDateErrors:
    "Golden Ambrosian Republic（史実は 1447〜1450 のミラノ市共和国）が " +
    "1492 年でも有効判定になる。OHM 側の end_date 誤りと判断して落とし、" +
    "結果として 1492 年はミラノが空白になる（1400 年は Duchy of Milan で収録）。",
  year900:
    "900 年は生成対象にしない。神聖ローマ帝国の成立は 962 年で 900 年時点は" +
    "東フランク王国であり、許可リストで有効なのも 6 件（Duchy of Lotharingia / " +
    "Duchy of Saxony / March of Verona の 3 件で面積の 99.7% を占め、残る 3 件は " +
    "Hersfeld 452 km² / Worms 145 km² / Werden 106 km² の点に近い領域）にとどまる。" +
    "これに伴い 900 年にしか掛からない Duchy of Lotharingia は許可リストからも外した。",
};

/**
 * 名前で明示的に落とす対象（name:en → HRE_FIEF_EXCLUSIONS のキー）。
 * パターンで落とせない個別事例だけをここに置く。
 */
const HRE_FIEF_EXCLUDED_NAMES: Record<string, string> = {
  "Angria": "saxonTribalRegions",
  "County of Bar": "franceFiefOverlap",
  "County of Champagne": "franceFiefOverlap",
  "County of Ratzeburg (1143-1204)": "unusableNames",
  "County of Schaumburg and Holstein-Pinneberg": "nestedUnions",
  "Duchy of Burgundy": "franceFiefOverlap",
  "Eastphalia": "saxonTribalRegions",
  "Free and Hanseatic City of Lübeck": "freeImperialCities",
  "Golden Ambrosian Republic": "ohmDateErrors",
  "Imperial City of Goslar": "freeImperialCities",
  "Imperial City of Schweinfurt": "freeImperialCities",
  "Kingdom of Burgundy": "imperialKingdoms",
  "Lotharingia": "imperialKingdoms",
  "Nordalbingia": "saxonTribalRegions",
  "Republic of Mulhouse": "freeImperialCities",
  "Royal Prussia": "polishVoivodeships",
  "Varasdin County": "croatianCounties",
  "Westphalia": "saxonTribalRegions",
};

/**
 * 領邦として収録しない対象なら、その根拠を返す（純粋関数）。収録するなら null。
 * 許可リスト HRE_FIEF_NAMES とは独立に適用する二重の防波堤で、将来の許可リスト
 * 編集で帝国都市や帝国外の行政区画が紛れ込んでも生成物に入らないようにする（AC2）。
 * nameLocal は OHM の `name`（ハンガリー県は name:en が "Bars county" でも
 * ローカル名が "Bars vármegye" になるため両方で判定する）。
 */
export function hreFiefExclusionReason(
  nameEn: string,
  nameLocal: string,
): string | null {
  const explicit = HRE_FIEF_EXCLUDED_NAMES[nameEn];
  if (explicit !== undefined) return HRE_FIEF_EXCLUSIONS[explicit];
  if (
    nameEn.startsWith("Free Imperial City of ") ||
    nameEn.startsWith("Imperial City of ") ||
    nameEn.includes("Hanseatic City")
  ) {
    return HRE_FIEF_EXCLUSIONS.freeImperialCities;
  }
  if (/ [Cc]ounty$/.test(nameEn) || nameLocal.endsWith("vármegye")) {
    return HRE_FIEF_EXCLUSIONS.hungarianCounties;
  }
  if (nameEn.endsWith(" Voivodeship")) {
    return HRE_FIEF_EXCLUSIONS.polishVoivodeships;
  }
  return null;
}

/**
 * 採用する領邦の英語名（name:en）許可リスト（昇順・98 件）。
 * bbox 内の admin_level 4 / 5 かつ対象年に有効な 171 件から、
 * HRE_FIEF_EXCLUSIONS の分類で 72 件を落とし、さらに 900 年にしか掛からない
 * Duchy of Lotharingia（0900-08-13〜0959）を除いて確定した実測ベースのリスト。
 * 全 98 件が HRE_FIEF_YEARS のいずれかの生成物に実際に現れる。
 *
 * 採用の分類（帝国等族のうち領域を持つもの）:
 * - 世俗領邦: Duchy（公領）/ Archduchy / March・Burgraviate・Landgraviate
 *   （辺境伯領・城伯領・方伯領）/ County（伯領）/ Lordship（領主領）/
 *   Principality（侯領）/ Electorate（選帝侯領）
 * - 聖界領邦: Prince-Archbishopric / Prince-Bishopric（大司教領・司教領）/
 *   Imperial Abbey・Princely Abbey（帝国修道院領・侯領修道院）
 * - 特殊: Peasant Republic of Dithmarschen（農民共和国・帝国等族）/
 *   Erfurt Territory（マインツ大司教領の飛び地行政体）/ Moravia（ボヘミア王冠領）
 */
export const HRE_FIEF_NAMES: readonly string[] = [
  "Billung March",
  "Burgraviate of Nuremberg",
  "County of Abensberg",
  "County of Bentheim",
  "County of Castell",
  "County of Drenthe",
  "County of East Frisia",
  "County of Falkenstein",
  "County of Henneberg-Schleusingen",
  "County of Hohenlohe",
  "County of Hohnstein",
  "County of Holland",
  "County of Holstein-Pinneberg",
  "County of Horne",
  "County of Kladsko",
  "County of Leiningen",
  "County of Mark",
  "County of Moers",
  "County of Montbéliard",
  "County of Ravensberg",
  "County of Rietberg",
  "County of Schaumburg",
  "County of Schaunberg",
  "County of Spiegelberg",
  "County of Sponheim",
  "County of Tecklenburg",
  "County/Principality of Neuchâtel",
  "Danish March",
  "Dauphiné of Viennois",
  "Duchy of Austria",
  "Duchy of Bar",
  "Duchy of Bavaria",
  "Duchy of Berg",
  "Duchy of Bohemia",
  "Duchy of Carinthia",
  "Duchy of Carniola",
  "Duchy of Cleves",
  "Duchy of Crossen",
  "Duchy of Franconia",
  "Duchy of Guelders",
  "Duchy of Lorraine",
  "Duchy of Lower Lotharingia",
  "Duchy of Luxembourg",
  "Duchy of Milan",
  "Duchy of Pless",
  "Duchy of Pomerania",
  "Duchy of Pomerania-Stettin",
  "Duchy of Saxe-Wittenberg",
  "Duchy of Saxony",
  "Duchy of Siewierz",
  "Duchy of Swabia",
  "Duchy of Thuringia",
  "Duchy of Upper Lotharingia",
  "Duchy of Westphalia",
  "Electorate of Cologne",
  "Electorate of Saxony(-Wittenberg)",
  "Erfurt Territory",
  "Friesland",
  "Imperial Abbey of Berchtesgaden",
  "Imperial Abbey of Burtscheid",
  "Imperial Abbey of Corvey",
  "Imperial Abbey of Essen",
  "Imperial Abbey of Hersfeld",
  "Imperial Abbey of Ottobeuren",
  "Imperial Abbey of Thorn",
  "Imperial Abbey of Werden",
  "Landgraviate of Thurgau",
  "Lordship of Cottbus",
  "Lordship of Ruppin",
  "Lordship of Verona",
  "March of Cham",
  "March of Meissen",
  "March of Verona",
  "Moravia",
  "Peasant Republic of Dithmarschen",
  "Prince-Archbishopric of Bremen",
  "Prince-Archbishopric of Magdeburg",
  "Prince-Archbishopric of Salzburg",
  "Prince-Bishopric of Bamberg",
  "Prince-Bishopric of Basel",
  "Prince-Bishopric of Cammin",
  "Prince-Bishopric of Eichstätt",
  "Prince-Bishopric of Freising",
  "Prince-Bishopric of Lübeck",
  "Prince-Bishopric of Minden",
  "Prince-Bishopric of Paderborn",
  "Prince-Bishopric of Passau",
  "Prince-Bishopric of Regensburg",
  "Prince-Bishopric of Utrecht",
  "Prince-Bishopric of Verden",
  "Prince-Bishopric of Worms",
  "Prince-Bishopric of Würzburg",
  "Princely Abbey of Fulda",
  "Princely Abbey of Kempten",
  "Princely Abbey of Stavelot-Malmedy",
  "Principality of Ansbach",
  "Principality of Bayreuth",
  "Saxon Eastern March",
];

/**
 * year 時点で有効な HRE 領邦のリレーションを選ぶ（純粋関数）。
 * 許可リスト（name:en）・admin_level・除外規則で絞り、同名が複数ある場合は
 * admin_level 昇順 → ID 昇順で最初の 1 件のみ残す（County of Tecklenburg のように
 * 同名リレーションが期間を分けて複数ある場合に二重計上しない）。
 * 返り値は英語名の昇順で、入力順に依存しない。
 */
export function selectHreFiefsForYear(
  elements: readonly OhmRelation[],
  year: number,
  names: readonly string[] = HRE_FIEF_NAMES,
  adminLevels: readonly number[] = HRE_FIEF_ADMIN_LEVELS,
): OhmRelation[] {
  const allowed = new Set(names);
  const levels = new Set(adminLevels);
  const candidates = elements.filter((element) => {
    const tags = element.tags ?? {};
    const nameEn = tags["name:en"];
    if (!allowed.has(nameEn)) return false;
    if (hreFiefExclusionReason(nameEn, tags["name"] ?? "") !== null) {
      return false;
    }
    const level = Number.parseInt(tags["admin_level"] ?? "", 10);
    if (!Number.isInteger(level) || !levels.has(level)) return false;
    return isActiveAtYear(tags["start_date"], tags["end_date"], year);
  });
  candidates.sort((a, b) => {
    const nameDiff = a.tags["name:en"].localeCompare(b.tags["name:en"], "en");
    if (nameDiff !== 0) return nameDiff;
    const levelDiff = Number.parseInt(a.tags["admin_level"], 10) -
      Number.parseInt(b.tags["admin_level"], 10);
    if (levelDiff !== 0) return levelDiff;
    return a.id - b.id;
  });
  const seen = new Set<string>();
  return candidates.filter((element) => {
    const name = element.tags["name:en"];
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

/** removePinchPoints の結果 */
export interface PinchRemoval {
  /** くびれを解消したジオメトリ。面が残らなければ null */
  geometry: PolygonalGeometry | null;
  /** 落とした重複頂点の数 */
  removed: number;
}

/**
 * 1 点で接触するリング（くびれ）を単純なリングに直す（純粋関数）。
 *
 * shrinkToLimit の座標丸め（COORD_PRECISION = 5 桁 ≒ 1 m）で近接した 2 頂点が
 * 同一座標へ潰れると、パート内のリングが 1 点だけを共有した状態になる。実データの
 * 内訳は 2 種類:
 * - 外環が自分自身に触れる（P → L1 → P → L2 → P と同じ点を 2 回通る）
 * - 穴が外環に接する（例: Prince-Bishopric of Passau は穴の始点が外環の頂点 6 と
 *   同一座標 [13.44967, 48.57576] になる）
 * どちらも面としては正しいので @turf/union では形が変わらず、clean-polygons.ts の
 * normalizeSelfIntersections では unresolved のまま残る。しかし
 * @turf/kinks は自己交差として検出するため、data/ 全体の「自己交差ゼロ」不変条件
 * （scripts/clean-polygons_test.ts）を満たせない。
 *
 * ここではパート単位で同一座標の 2 回目以降の出現を落として接触を解く。外環を先に
 * 見るので、外環と穴が共有する頂点は穴側から落ちる（穴がその角の分だけ小さくなる）。
 * 落とす頂点の前後は元々その点の隣で、丸めで潰れるほど近いので、形状の変化は
 * 丸め誤差の範囲に収まる。
 *
 * 重複が無ければ入力をそのまま（同一参照で）返し、生成物に無用な差分を出さない。
 * 3 頂点未満に潰れたリングは落とし、外環が残らなければパートごと落とす。
 */
export function removePinchPoints(
  geometry: PolygonalGeometry,
): PinchRemoval {
  let removed = 0;
  const parts: Position[][][] = [];
  for (const part of polygonParts(geometry)) {
    // 同一座標の判定はパート全体で行う（外環と穴の接触も解くため）
    const seen = new Set<string>();
    const rings: Position[][] = [];
    for (const [index, ring] of part.entries()) {
      // 閉じたリングの末尾（先頭と同一）は重複判定から外す
      const deduped: Position[] = [];
      for (const point of ring.slice(0, -1)) {
        const key = `${point[0]},${point[1]}`;
        if (seen.has(key)) {
          removed++;
          continue;
        }
        seen.add(key);
        deduped.push(point);
      }
      if (deduped.length < 3) {
        // 外環が潰れたらパートごと捨てる
        if (index === 0) {
          rings.length = 0;
          break;
        }
        continue;
      }
      rings.push([...deduped, deduped[0]]);
    }
    if (rings.length === 0) continue;
    parts.push(rings);
  }
  if (removed === 0) return { geometry, removed };
  if (parts.length === 0) return { geometry: null, removed };
  return {
    geometry: parts.length === 1
      ? { type: "Polygon", coordinates: parts[0] }
      : { type: "MultiPolygon", coordinates: parts },
    removed,
  };
}

/**
 * FeatureCollection 全体のくびれを解消し、その後もう一度クリーンアップして
 * 微小破片・微小な穴の不変条件を保つ（純粋関数）。
 * くびれの解消で新たな微小パートが生じても cleanGeometry が落とす。
 * 面が残らなくなった feature は除く（実データでは発生しない）。
 */
export function removePinchPointsFromCollection(
  fc: FeatureCollection,
): { fc: FeatureCollection; removed: number; droppedFeatures: string[] } {
  let removed = 0;
  const droppedFeatures: string[] = [];
  const features: FeatureCollection["features"] = [];
  for (const feature of fc.features) {
    const geometry = feature.geometry;
    if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
      features.push(feature);
      continue;
    }
    const result = removePinchPoints(geometry);
    removed += result.removed;
    if (result.removed === 0) {
      features.push(feature);
      continue;
    }
    const cleaned = result.geometry === null
      ? null
      : cleanGeometry(result.geometry).geometry;
    if (cleaned === null) {
      droppedFeatures.push(String(feature.properties?.NAME));
      continue;
    }
    features.push({ ...feature, geometry: cleaned });
  }
  return {
    fc: { type: "FeatureCollection", features },
    removed,
    droppedFeatures,
  };
}

/** buildYearCollection の結果 */
export interface HreFiefYearCollection {
  fc: FeatureCollection;
  metadata: FiefBuildMetadata;
}

/**
 * year 時点の HRE 領邦 FeatureCollection とメタデータを組み立てる（純粋関数）。
 * tagged は tags クエリの全リレーション、geometries は geom クエリの結果
 * （リレーション ID → メンバー付きリレーション）。
 *
 * properties は既存 hre_<year>.geojson の { NAME, SUBJECTO, PARTOF } を含む
 * 上位集合にして表示側の互換を保ちつつ、france_fiefs_<year>.geojson と同じ
 * OHM 出典プロパティ（ADMIN_LEVEL / OHM_RELATION_ID / START_DATE / END_DATE）
 * も持たせる。feature の並びは英語名の昇順で決定的。
 */
export function buildYearCollection(
  tagged: readonly OhmRelation[],
  geometries: ReadonlyMap<number, OhmRelation>,
  year: number,
  names: readonly string[] = HRE_FIEF_NAMES,
): HreFiefYearCollection {
  const selected = selectHreFiefsForYear(tagged, year, names);
  const features: FeatureCollection["features"] = [];
  const missingWays: Record<string, number[]> = {};
  const unclosedRings: Record<string, number> = {};
  const droppedInnerRings: Record<string, number> = {};
  const relationsWithoutGeometry: number[] = [];
  for (const element of selected) {
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
        NAME: element.tags["name:en"],
        SUBJECTO: HRE_FIEF_NAME,
        PARTOF: HRE_FIEF_NAME,
        ADMIN_LEVEL: Number.parseInt(element.tags["admin_level"], 10),
        OHM_RELATION_ID: element.id,
        START_DATE: element.tags["start_date"] ?? null,
        END_DATE: element.tags["end_date"] ?? null,
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
      relationsWithoutGeometry,
    },
  };
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
  for (const year of HRE_FIEF_YEARS) {
    if (!SNAPSHOT_YEARS.includes(year)) {
      throw new Error(`${year} は SNAPSHOT_YEARS に含まれない年です`);
    }
  }
  // 1 段目: bbox 内の boundary=administrative を tags のみ取得（約 34,000 件）
  const tagged = (await runOverpass(buildTagsQuery(HRE_FIEF_BBOX))).elements;
  console.log(`tags: ${tagged.length} relations`);

  // 2 段目: 全対象年で必要になるリレーションのジオメトリだけをまとめて 1 回取得
  const ids = new Set<number>();
  for (const year of HRE_FIEF_YEARS) {
    for (const element of selectHreFiefsForYear(tagged, year)) {
      ids.add(element.id);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, OVERPASS_COOLDOWN_MS));
  const geomElements =
    (await runOverpass(buildGeometryQuery([...ids]))).elements;
  const geometries = new Map(geomElements.map((e) => [e.id, e]));
  console.log(`geom: ${geometries.size}/${ids.size} relations`);

  for (const year of HRE_FIEF_YEARS) {
    const { fc, metadata } = buildYearCollection(tagged, geometries, year);
    const { fc: shrunk, tolerance, cleanStats } = shrinkToLimit(
      fc,
      HRE_FIEF_SIZE_LIMIT_BYTES,
    );
    // 座標丸めで生じた「くびれ」を解消する（clean-polygons.ts の union では
    // 解消できず unresolved として残るため。data/ 全体の「自己交差ゼロ」不変条件を
    // 満たすのに必要 = scripts/clean-polygons_test.ts の全年代テスト）
    const { fc: unpinched, removed, droppedFeatures } =
      removePinchPointsFromCollection(shrunk);
    // メタデータは simplify / truncate の後に付け直す（AC4: 欠損を生成物に記録）
    const output = { ...unpinched, metadata };
    const outPath = `data/hre_fiefs_${year}.geojson`;
    const json = JSON.stringify(output);
    // 上限判定は UTF-8 のバイト数で行う（領邦名に ü / é 等の多バイト文字がある）。
    // shrinkToLimit は簡略化段階での判定なので、くびれ解消後の最終状態で担保する
    // （頂点を落とすだけなので増えることは無い）
    const finalBytes = new TextEncoder().encode(json).length;
    if (finalBytes > HRE_FIEF_SIZE_LIMIT_BYTES) {
      throw new Error(`${outPath} が上限を超えました (${finalBytes} バイト)`);
    }
    // data/ 全体の「自己交差ゼロ」不変条件（scripts/clean-polygons_test.ts の
    // 全年代テスト）を、壊れたファイルを書く前に確認する
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
    if (removed > 0) {
      console.log(`  くびれを解消: 重複頂点 ${removed} 個を除去`);
    }
    if (droppedFeatures.length > 0) {
      console.warn(`  面が残らず除外: ${droppedFeatures.join(", ")}`);
    }
    const cleanLog = formatCleanStats(cleanStats);
    // cleanStats は shrinkToLimit 時点の集計なので、「自己交差が残存」は
    // くびれ解消の前の状態を指す（最終状態は上で 0 件を確認済み）
    if (cleanLog !== null) console.log(`  ${cleanLog.trim()}（くびれ解消前）`);
    console.log("  自己交差: 0 件（最終状態）");
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
