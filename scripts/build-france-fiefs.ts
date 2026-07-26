/**
 * 中世フランスの諸侯領（公領・伯領）オーバーレイのデータパイプライン（TASK-70）。
 * - OpenHistoricalMap（OHM）の Overpass API から boundary=administrative の
 *   リレーションを 2 段階で取得する（1: tags のみで全件 → 2: 対象 ID の geom のみ）
 * - start_date / end_date タグで「year 時点で有効」な諸侯領に絞る
 *   （年のみ表記 `0918` / 年月日表記 `1493-05-23` / end_date 欠損 = 無期限）
 * - メンバー way を端点で連結してリング化し、MultiPolygon を組み立てる
 * - simplify + 座標丸めで 1 ファイル FIEF_SIZE_LIMIT_BYTES 以下に収める
 * - data/france_fiefs_<year>.geojson（year ∈ FRANCE_FIEF_YEARS）を生成する
 *
 * 出典: OpenHistoricalMap（https://www.openhistoricalmap.org/）
 * ライセンス: CC0 1.0（パブリックドメイン）。europe_<year>.geojson（GPL-3.0 派生）
 * とも hre_<year>.geojson（CC BY-NC-SA 4.0）とも混合制約が無い唯一のソースだが、
 * 出典表記の一貫性のため本パイプラインでも独立ファイルとして生成する。
 *
 * 決定性の担保:
 * - 取得クエリは bbox とリレーション ID（昇順・重複除去）だけで決まる
 * - feature の並びは英語名（name:en）の昇順に固定する
 * - リング連結はメンバー出現順から決まり、座標は COORD_PRECISION で丸める
 *
 * ロジックは純粋関数として export しテスト対象にする
 * （scripts/build-france-fiefs_test.ts。テストはネットワーク非依存）。
 */

import type { FeatureCollection, MultiPolygon, Position } from "geojson";
import { shrinkToLimit } from "./build-data.ts";
import { SNAPSHOT_YEARS } from "../src/config.ts";

/** OHM の Overpass API エンドポイント */
export const OHM_SOURCE_URL =
  "https://overpass-api.openhistoricalmap.org/api/interpreter";

/** OHM データのライセンス（パブリックドメイン） */
export const OHM_SOURCE_LICENSE = "CC0-1.0";

/** 出典表示用の OHM トップページ */
export const OHM_SOURCE_HOMEPAGE = "https://www.openhistoricalmap.org/";

/**
 * 取得対象の bbox（Overpass の順序: south, west, north, east）。
 * 中世フランス王国とその周縁（イベリア北部・低地地方・ロレーヌ）を覆う。
 */
export const FRANCE_BBOX: readonly [number, number, number, number] = [
  40.0,
  -6.5,
  52.5,
  10.5,
];

/**
 * 生成対象年。SNAPSHOT_YEARS のうち OHM に諸侯領データが十分にある中世年代。
 * 実データで確定した根拠（許可リスト内で有効な領邦の件数）:
 * 900 = 2 件（Anjou / Maine のみで面として成立しない）、1000 = 7、1100 = 9、
 * 1200 = 12、1279 = 11、1300 = 11、1400 = 6（百年戦争期に多くの伯領が消滅し、
 * 王領への併合で OHM 側の収録も admin_level 2 に移るため対象外）。
 */
export const FRANCE_FIEF_YEARS: readonly number[] = [
  1000,
  1100,
  1200,
  1279,
  1300,
];

/**
 * 諸侯領として採用する admin_level。
 * 2 は主権国家レベル（1204 年にフランス王領へ併合された後の Duchy of Normandy が
 * これに当たる）なので採らない。5 は Ponthieu のように OHM 側で下位に置かれた
 * 伯領があるため含める。
 */
export const FRANCE_FIEF_ADMIN_LEVELS: readonly number[] = [3, 4, 5];

/**
 * 採用する諸侯領の英語名（name:en）許可リスト（昇順）。
 * bbox には神聖ローマ帝国側の領邦（Grafschaft Leiningen 等）・イベリア諸伯領・
 * イタリア都市国家も大量に含まれるため、フランス王国の封建諸侯領のみを名前で
 * 明示的に選ぶ（scripts/build-hre.ts の HRE_TERRITORIES と同じ方針）。
 *
 * OHM に存在せず収録できない諸侯領: Comté de Toulouse・王領（domaine royal）・
 * Foix・Armagnac・Auvergne・Bourbon・Nevers。Provence は 1487 年以降のみ、
 * Flanders は 1237 年以降のみ、Aquitaine / Gascony は 1214 年で収録が切れる。
 * 詳細は docs/data-inventory/README.md を参照。
 */
export const FRANCE_FIEF_NAMES: readonly string[] = [
  "County of Alençon",
  "County of Anjou",
  "County of Artois",
  "County of Bar",
  "County of Champagne",
  "County of Flanders",
  "County of Maine",
  "County of Poitou",
  "County of Ponthieu",
  "Duchy of Aquitaine",
  "Duchy of Brittany",
  "Duchy of Burgundy",
  "Duchy of Gascony",
  "Duchy of Normandy",
];

/** 出力 1 ファイルあたりのサイズ上限（バイト）。hre_<year>.geojson と同値 */
export const FIEF_SIZE_LIMIT_BYTES = 200 * 1000;

/** Overpass の member geometry の 1 点 */
export interface OhmPoint {
  lat: number;
  lon: number;
}

/** Overpass のリレーションメンバー */
export interface OhmMember {
  type: string;
  ref: number;
  role?: string;
  geometry?: OhmPoint[];
}

/** Overpass のリレーション要素 */
export interface OhmRelation {
  type: string;
  id: number;
  tags: Record<string, string>;
  members?: OhmMember[];
}

/** Overpass の JSON レスポンス */
export interface OverpassResponse {
  elements: OhmRelation[];
}

/**
 * OHM の日付表記から年を取り出す（純粋関数）。
 * 対応形式: `0918`（ゼロ埋め年のみ）・`970`・`1226-02`（年月）・`1493-05-23`
 * （年月日）・`-0050-03-15`（紀元前）。前後の空白は無視する。
 * 欠損・解釈不能（`unknown` など）は null を返し、呼び出し側で「無期限」として扱う。
 */
export function parseOhmYear(value: string | undefined | null): number | null {
  if (typeof value !== "string") return null;
  const match = /^(-?)(\d{1,4})(?:-|$)/.exec(value.trim());
  if (match === null) return null;
  const year = Number.parseInt(match[2], 10);
  return match[1] === "-" ? -year : year;
}

/**
 * start_date / end_date から year 時点で有効かを判定する（純粋関数）。
 * 年単位の閉区間 start <= year <= end で判定する。OHM の end_date は
 * 「その日まで存在した」を意味するため、end_date と同年は有効に含める
 * （例: Duchy of Aquitaine 1137-04-09〜1214-09-28 は 1137 と 1214 の両方で有効）。
 * start_date 欠損は最初期から、end_date 欠損は無期限として扱う。
 */
export function isActiveAtYear(
  startDate: string | undefined | null,
  endDate: string | undefined | null,
  year: number,
): boolean {
  const start = parseOhmYear(startDate);
  const end = parseOhmYear(endDate);
  if (start !== null && year < start) return false;
  if (end !== null && year > end) return false;
  return true;
}

/**
 * bbox 内の boundary=administrative リレーションを tags だけ取得するクエリ
 * （純粋関数）。geom 付きで全件取ると数百 MB になるため 2 段階取得の 1 段目に使う。
 */
export function buildTagsQuery(
  bbox: readonly [number, number, number, number] = FRANCE_BBOX,
): string {
  return `[out:json][timeout:180];\n` +
    `relation["boundary"="administrative"](${bbox.join(",")});\n` +
    `out tags;\n`;
}

/**
 * 指定リレーションのジオメトリを取得するクエリ（純粋関数）。
 * ID は昇順・重複除去に正規化するため、呼び出し順に依存せず決定的になる。
 */
export function buildGeometryQuery(ids: readonly number[]): string {
  const normalized = [...new Set(ids)].sort((a, b) => a - b);
  return `[out:json][timeout:180];\n` +
    `relation(id:${normalized.join(",")});\n` +
    `out geom;\n`;
}

/**
 * year 時点で有効なフランス諸侯領のリレーションを選ぶ（純粋関数）。
 * 許可リスト（name:en）と admin_level で絞り、同名が複数ある場合は
 * admin_level 昇順 → ID 昇順で最初の 1 件のみ残す（Duchy of Burgundy は
 * admin_level 3 / 4 の 2 リレーションが同一期間で並存する）。
 * 返り値は英語名の昇順で、入力順に依存しない。
 */
export function selectFiefsForYear(
  elements: readonly OhmRelation[],
  year: number,
  names: readonly string[] = FRANCE_FIEF_NAMES,
  adminLevels: readonly number[] = FRANCE_FIEF_ADMIN_LEVELS,
): OhmRelation[] {
  const allowed = new Set(names);
  const levels = new Set(adminLevels);
  const candidates = elements.filter((element) => {
    const tags = element.tags ?? {};
    if (!allowed.has(tags["name:en"])) return false;
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

/** 2 点が同一かを厳密比較する（Overpass は共有ノードを同一値で返す） */
function samePoint(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** リングの符号付き面積（靴ひも公式）。反時計回りが正（純粋関数） */
export function signedArea(ring: readonly Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] * ring[i][1]) - (ring[i][0] * ring[j][1]);
  }
  return sum / 2;
}

/** 反時計回り（counterClockwise=true）／時計回りに向きを揃える（純粋関数） */
function orient(ring: Position[], counterClockwise: boolean): Position[] {
  const isCcw = signedArea(ring) > 0;
  return isCcw === counterClockwise ? ring : [...ring].reverse();
}

/** 点がリング内部にあるかを ray casting で判定する（純粋関数） */
export function pointInRing(
  point: Position,
  ring: readonly Position[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = (yi > point[1]) !== (yj > point[1]) &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** assembleRings の結果 */
export interface AssembledRings {
  rings: Position[][];
  /** 端点が繋がらず、始点を追加して強制的に閉じたリングの数 */
  unclosedRings: number;
}

/**
 * 分割された way の座標列を端点で連結してリングにする（純粋関数）。
 * 逆向きの way も端点一致で連結する。way の欠損などで閉じないまま連結が尽きた
 * 場合は始点を追加して閉じ、その件数を unclosedRings として返す
 * （生成を失敗させず、欠損を検出可能にするため）。
 * 3 点未満に潰れたリングは破棄する。
 */
export function assembleRings(
  segments: readonly (readonly OhmPoint[])[],
): AssembledRings {
  const remaining: Position[][] = segments
    .map((seg) => seg.map((p): Position => [p.lon, p.lat]))
    .filter((seg) => seg.length >= 2);
  const rings: Position[][] = [];
  let unclosedRings = 0;
  while (remaining.length > 0) {
    let ring = remaining.shift() as Position[];
    let extended = true;
    while (extended && !samePoint(ring[0], ring[ring.length - 1])) {
      extended = false;
      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const head = ring[0];
        const tail = ring[ring.length - 1];
        if (samePoint(tail, seg[0])) {
          ring = ring.concat(seg.slice(1));
        } else if (samePoint(tail, seg[seg.length - 1])) {
          ring = ring.concat([...seg].reverse().slice(1));
        } else if (samePoint(head, seg[seg.length - 1])) {
          ring = seg.slice(0, -1).concat(ring);
        } else if (samePoint(head, seg[0])) {
          ring = [...seg].reverse().slice(0, -1).concat(ring);
        } else {
          continue;
        }
        remaining.splice(i, 1);
        extended = true;
        break;
      }
    }
    if (!samePoint(ring[0], ring[ring.length - 1])) {
      ring.push(ring[0]);
      unclosedRings++;
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return { rings, unclosedRings };
}

/** buildPolygons の結果 */
export interface BuiltPolygons {
  polygons: Position[][][];
  /** どの外環にも含まれず破棄した内環の数 */
  droppedInnerRings: number;
}

/**
 * 外環・内環から MultiPolygon の座標配列を組み立てる（純粋関数）。
 * 内環は最初の頂点を含む最初の外環に割り当てる。どの外環にも含まれない内環は
 * 破棄し件数を返す。向きは RFC 7946 推奨（外環 = 反時計回り・内環 = 時計回り）
 * に揃える。
 */
export function buildPolygons(
  outerRings: readonly (readonly Position[])[],
  innerRings: readonly (readonly Position[])[],
): BuiltPolygons {
  const polygons: Position[][][] = outerRings.map((
    ring,
  ) => [orient([...ring], true)]);
  let droppedInnerRings = 0;
  for (const inner of innerRings) {
    const index = polygons.findIndex((polygon) =>
      pointInRing(inner[0], polygon[0])
    );
    if (index === -1) {
      droppedInnerRings++;
      continue;
    }
    polygons[index].push(orient([...inner], false));
  }
  return { polygons, droppedInnerRings };
}

/** relationGeometry の結果 */
export interface RelationGeometryResult {
  geometry: MultiPolygon | null;
  /** ジオメトリを取得できなかった way メンバーの ID（昇順） */
  missingWays: number[];
  /** 強制的に閉じたリングの数 */
  unclosedRings: number;
  /** どの外環にも入らず破棄した内環の数 */
  droppedInnerRings: number;
  /** way 以外で無視したメンバー（label ノード・subarea リレーション）の数 */
  unsupportedMembers: number;
}

/**
 * リレーションのメンバー way から MultiPolygon を組み立てる（純粋関数）。
 * - role 省略・空文字の way は outer として扱う（OSM の慣行）
 * - way 以外のメンバー（label ノード・subarea リレーション）は無視して数える
 * - geometry が無い way は missingWays に記録し、そのまま連結を続ける
 *   （欠損があっても生成を失敗させない: AC4）
 * 有効なポリゴンが 1 つも作れなければ geometry は null。
 */
export function relationGeometry(
  relation: OhmRelation,
): RelationGeometryResult {
  const members = relation.members ?? [];
  const missingWays: number[] = [];
  let unsupportedMembers = 0;
  const outerSegments: OhmPoint[][] = [];
  const innerSegments: OhmPoint[][] = [];
  for (const member of members) {
    if (member.type !== "way") {
      unsupportedMembers++;
      continue;
    }
    const role = member.role ?? "";
    if (role !== "" && role !== "outer" && role !== "inner") {
      unsupportedMembers++;
      continue;
    }
    if (member.geometry === undefined) {
      missingWays.push(member.ref);
      continue;
    }
    (role === "inner" ? innerSegments : outerSegments).push(member.geometry);
  }
  missingWays.sort((a, b) => a - b);
  const outer = assembleRings(outerSegments);
  const inner = assembleRings(innerSegments);
  const { polygons, droppedInnerRings } = buildPolygons(
    outer.rings,
    inner.rings,
  );
  return {
    geometry: polygons.length === 0
      ? null
      : { type: "MultiPolygon", coordinates: polygons },
    missingWays,
    unclosedRings: outer.unclosedRings + inner.unclosedRings,
    droppedInnerRings,
    unsupportedMembers,
  };
}

/** 生成物に埋め込むビルドメタデータ（欠損の記録を含む: AC4） */
export interface FiefBuildMetadata {
  source: string;
  sourceUrl: string;
  license: string;
  year: number;
  featureCount: number;
  /** ジオメトリ取得に失敗した way（リレーション ID → way ID 配列） */
  missingWays: Record<string, number[]>;
  /** 強制的に閉じたリング数（リレーション ID → 件数） */
  unclosedRings: Record<string, number>;
  /** 破棄した内環数（リレーション ID → 件数） */
  droppedInnerRings: Record<string, number>;
  /** geom クエリの結果にジオメトリが無かったリレーション ID（昇順） */
  relationsWithoutGeometry: number[];
}

/** buildYearCollection の結果 */
export interface YearCollection {
  fc: FeatureCollection;
  metadata: FiefBuildMetadata;
}

/**
 * year 時点の諸侯領 FeatureCollection とメタデータを組み立てる（純粋関数）。
 * tagged は tags クエリの全リレーション、geometries は geom クエリの結果
 * （リレーション ID → メンバー付きリレーション）。
 * feature の並びは英語名の昇順で決定的。
 */
export function buildYearCollection(
  tagged: readonly OhmRelation[],
  geometries: ReadonlyMap<number, OhmRelation>,
  year: number,
): YearCollection {
  const selected = selectFiefsForYear(tagged, year);
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

/** Overpass に Overpass QL を POST して JSON を得る */
async function runOverpass(query: string): Promise<OverpassResponse> {
  const body = new URLSearchParams({ data: query });
  const res = await fetch(OHM_SOURCE_URL, { method: "POST", body });
  if (!res.ok) {
    throw new Error(
      `Overpass への問い合わせに失敗しました (status ${res.status})`,
    );
  }
  return await res.json() as OverpassResponse;
}

async function main(): Promise<void> {
  for (const year of FRANCE_FIEF_YEARS) {
    if (!SNAPSHOT_YEARS.includes(year)) {
      throw new Error(`${year} は SNAPSHOT_YEARS に含まれない年です`);
    }
  }
  // 1 段目: bbox 内の boundary=administrative を tags のみ取得（約 4,900 件）
  const tagged = (await runOverpass(buildTagsQuery())).elements;
  console.log(`tags: ${tagged.length} relations`);

  // 2 段目: 全対象年で必要になるリレーションのジオメトリだけをまとめて 1 回取得
  const ids = new Set<number>();
  for (const year of FRANCE_FIEF_YEARS) {
    for (const element of selectFiefsForYear(tagged, year)) ids.add(element.id);
  }
  const geomElements =
    (await runOverpass(buildGeometryQuery([...ids]))).elements;
  const geometries = new Map(geomElements.map((e) => [e.id, e]));
  console.log(`geom: ${geometries.size}/${ids.size} relations`);

  for (const year of FRANCE_FIEF_YEARS) {
    const { fc, metadata } = buildYearCollection(tagged, geometries, year);
    const { fc: shrunk, tolerance, size } = shrinkToLimit(
      fc,
      FIEF_SIZE_LIMIT_BYTES,
    );
    // メタデータは simplify / truncate の後に付け直す（AC4: 欠損を生成物に記録）
    const output = { ...shrunk, metadata };
    const outPath = `data/france_fiefs_${year}.geojson`;
    await Deno.writeTextFile(outPath, JSON.stringify(output));
    console.log(
      `${outPath}: ${size} bytes, tolerance=${tolerance}, features=${shrunk.features.length}`,
    );
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
        ? [
          `  ジオメトリ未取得: ${metadata.relationsWithoutGeometry.join(",")}`,
        ]
        : []),
    ];
    for (const warning of warnings) console.warn(warning);
  }
}

if (import.meta.main) {
  await main();
}
