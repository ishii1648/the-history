/**
 * 勢力ポリゴンの自己交差と微小破片をクリーンアップする純粋関数群（TASK-81）。
 *
 * 適用箇所は build-data.ts の shrinkToLimit（simplify → 座標丸め → 本モジュール）で、
 * europe_<year> / hre_<year> / france_fiefs_<year> の 3 パイプラインが共有する。
 * simplify 自体が自己交差を作る（凹んだ海岸線を粗くすると辺が交差する）ため、
 * クリーンアップは必ず simplify の後段に置く。
 *
 * ## なぜ必要か
 * 自己交差したリングは「内側」が定義できず、deck.gl の earcut 三角形分割が
 * 破綻して塗りが裏返る・抜ける。@turf/area や @turf/intersect も符号付き面積を
 * 打ち消し合うため、下流の派生データ（build-fief-flat / build-fief-dedupe）の
 * 判定が狂う。微小破片は画面上 1px 未満で意味を持たないうえ、パート数だけ増やして
 * ラベル配置（polylabel）とサイズ上限を圧迫する。
 *
 * ## 手法: polygon clipping による自己 union（buffer(0) 相当）
 * @turf/union（内部は polyclip-ts）に同一ジオメトリを 2 つ渡すと、交差点で
 * リングが分割され OGC 的に妥当な MultiPolygon に正規化される。GEOS の
 * buffer(0) と同じ確立した手法で、@turf/unkink-polygon と違って
 * 「交差で生じた重なり分を二重に数えない」（unkink は交差部を別ポリゴンとして
 * 残すため面積が増える）。実測でヨーロッパ全 20 年代の総面積変化は
 * 相対 1e-7 未満だった。
 *
 * 丸めは union の後にもう一度必要になる（交点の座標は桁が伸びる）が、丸め自体が
 * ごく稀に新しい交差を生む。そのため「union → 丸め → 再検査」を
 * MAX_NORMALIZE_ITERATIONS 回まで繰り返し、収束しない場合だけ丸めを諦めて
 * 交差の無い union 結果を採る（自己交差の解消を丸めより優先する）。
 *
 * ## 自己交差が無いジオメトリは触らない
 * union は交差が無くてもリングの開始頂点・向き・並びを組み替えるため、
 * 健全なジオメトリまで通すと生成物の差分が全ファイルに広がる。cleanGeometry は
 * 自己交差を検出したときだけ正規化する（france_fiefs_<year> は全年代で
 * 自己交差ゼロなので完全に無変更になる）。
 */

import area from "@turf/area";
import { featureCollection, polygon as turfPolygon } from "@turf/helpers";
import kinks from "@turf/kinks";
import truncate from "@turf/truncate";
import union from "@turf/union";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
  Position,
} from "geojson";

/**
 * 残すパート（外環）の面積下限（m²）= 1 km²。
 *
 * 実測分布（europe 全 20 年代・hre 5 年代・france_fiefs 5 年代）の根拠:
 * - europe_<year> には面積 0（測地面積が倍精度で 0 に潰れた線状の残骸）の
 *   パートが計 111 個ある。bbox クリップが境界線上に作る 4 点の細片と、
 *   simplify が細い半島を線に潰した残骸で、いずれも領域ではない。
 * - 0 より大きく 1 km² 未満のパートは 40 個で、うち 36 個は頂点 4〜5 個の
 *   三角形・四角形。最小は Württemberg の 0.0003 km²（30cm 四方相当）。
 *   これらも simplify が細片を潰した残骸で、史料上の飛び地に対応しない。
 * - 1 km² 以上には史実の飛び地が現れる: Lombardy 1.78 km²、Milan 1.88 km²、
 *   Württemberg 1.09 km²、Swiss Confederation 6.76 km²、Cuxhaven 16.65 km²、
 *   Malta 66.4 km²。1 km² はこの帯の直下にある。
 * - County of Bar（バロワ）の飛び地は 4.14 / 4.77 / 8.78 / 14.01 / 42.06 /
 *   61.09 km² で、全て閾値の 4 倍以上。史実として錯綜した飛び地群を 1 つも
 *   削らない。目安として提示された 10 km² ではこのうち 3 つと
 *   Swiss Confederation・Württemberg の飛び地まで消えるため採らない。
 */
export const MIN_PART_AREA_M2 = 1_000_000;

/**
 * 残す穴（内環）の面積下限（m²）= 1 km²。パートと同じ理由・同じ値。
 * 実測で 1 km² 未満の穴は europe_1500 の 0 km²（潰れた内環）1 個だけで、
 * France 側の飛び地由来の穴（Burgundy 3.95 km²、County of Bar 7.06 / 40.08 km²）は
 * 全て残る。
 */
export const MIN_HOLE_AREA_M2 = 1_000_000;

/** union → 座標丸め → 再検査 の最大反復回数 */
export const MAX_NORMALIZE_ITERATIONS = 5;

/** 座標を丸める既定の小数桁数（build-data.ts の COORD_PRECISION と同値） */
export const DEFAULT_COORD_PRECISION = 5;

/** ポリゴン系ジオメトリ */
export type PolygonalGeometry = Polygon | MultiPolygon;

/**
 * ジオメトリをパート（= リング配列）の配列として見る（純粋関数）。
 * Polygon は 1 パートの MultiPolygon として扱う。返り値は入力を共有する
 * （読み取り専用に使う）。
 */
export function polygonParts(geometry: PolygonalGeometry): Position[][][] {
  return geometry.type === "Polygon"
    ? [geometry.coordinates]
    : geometry.coordinates;
}

/** パート配列からジオメトリを組み立てる。1 パートなら Polygon にする（純粋関数） */
function fromParts(parts: Position[][][]): PolygonalGeometry | null {
  if (parts.length === 0) return null;
  if (parts.length === 1) return { type: "Polygon", coordinates: parts[0] };
  return { type: "MultiPolygon", coordinates: parts };
}

/**
 * ジオメトリの自己交差点を列挙する（純粋関数）。
 * パートごとに @turf/kinks を掛ける。リングが 4 点未満などで polygon として
 * 成立しないパートは交差判定の対象外（後段の微小破片除去で落ちる）。
 */
export function selfIntersectionPoints(
  geometry: PolygonalGeometry,
): Position[] {
  const points: Position[] = [];
  for (const part of polygonParts(geometry)) {
    let candidate: Feature<Polygon>;
    try {
      candidate = turfPolygon(part);
    } catch {
      continue;
    }
    for (const kink of kinks(candidate).features) {
      points.push(kink.geometry.coordinates);
    }
  }
  return points;
}

/** 自己 union（buffer(0) 相当）。面が残らなければ null */
function unionSelf(geometry: PolygonalGeometry): PolygonalGeometry | null {
  const self: Feature<PolygonalGeometry> = {
    type: "Feature",
    properties: {},
    geometry,
  };
  const merged = union(featureCollection([self, self]));
  return merged === null ? null : merged.geometry;
}

/** ジオメトリの座標を precision 桁に丸める（純粋関数） */
function roundGeometry(
  geometry: PolygonalGeometry,
  precision: number,
): PolygonalGeometry {
  const rounded = truncate(
    { type: "Feature", properties: {}, geometry } as Feature<PolygonalGeometry>,
    { precision, coordinates: 2, mutate: false },
  );
  return rounded.geometry;
}

/**
 * 自己交差を解消したジオメトリを返す（純粋関数）。
 * 面が残らない退化ジオメトリ（線・点に潰れたリングだけ）では null を返す。
 * 詳細な方針はファイル冒頭のコメントを参照。
 */
export function normalizeSelfIntersections(
  geometry: PolygonalGeometry,
  precision: number = DEFAULT_COORD_PRECISION,
  maxIterations: number = MAX_NORMALIZE_ITERATIONS,
): PolygonalGeometry | null {
  let current = geometry;
  // 座標丸め前で自己交差が無い候補（丸めが収束しない場合の退避先）
  let unrounded: PolygonalGeometry | null = null;
  for (let i = 0; i < maxIterations; i++) {
    const merged = unionSelf(current);
    if (merged === null) return null;
    if (unrounded === null && selfIntersectionPoints(merged).length === 0) {
      unrounded = merged;
    }
    const rounded = roundGeometry(merged, precision);
    if (selfIntersectionPoints(rounded).length === 0) return rounded;
    current = rounded;
  }
  return unrounded ?? current;
}

/** dropTinyRings の結果 */
export interface DroppedRings {
  /** 残ったジオメトリ。パートが全て閾値未満なら null */
  geometry: PolygonalGeometry | null;
  /** 落としたパート数 */
  droppedParts: number;
  /** 落とした穴の数 */
  droppedHoles: number;
}

/** リングの測地面積（m²）。polygon として成立しないリングは 0 */
function ringArea(ring: Position[]): number {
  try {
    return area(turfPolygon([ring]));
  } catch {
    return 0;
  }
}

/**
 * 閾値未満のパート（外環）と穴（内環）を落とす（純粋関数）。
 * 穴を落とすのはその内側を親の面で塗り潰すことに等しい。閾値は
 * MIN_PART_AREA_M2 / MIN_HOLE_AREA_M2 の根拠コメントを参照。
 */
export function dropTinyRings(
  geometry: PolygonalGeometry,
  minPartAreaM2: number = MIN_PART_AREA_M2,
  minHoleAreaM2: number = MIN_HOLE_AREA_M2,
): DroppedRings {
  const kept: Position[][][] = [];
  let droppedParts = 0;
  let droppedHoles = 0;
  for (const part of polygonParts(geometry)) {
    if (part.length === 0 || ringArea(part[0]) < minPartAreaM2) {
      droppedParts++;
      continue;
    }
    const holes = part.slice(1).filter((hole) => {
      if (ringArea(hole) >= minHoleAreaM2) return true;
      droppedHoles++;
      return false;
    });
    kept.push([part[0], ...holes]);
  }
  return { geometry: fromParts(kept), droppedParts, droppedHoles };
}

/** cleanGeometry の結果 */
export interface CleanedGeometry extends DroppedRings {
  /** 自己交差を検出して union で作り直したか */
  normalized: boolean;
  /** 反復上限まで自己交差が残ったか（要調査。生成は止めない） */
  unresolved: boolean;
}

/**
 * 1 ジオメトリをクリーンアップする（純粋関数）。
 * 自己交差があるときだけ union で作り直し、そのあと微小破片・微小な穴を落とす。
 * 自己交差が無く落とすものも無い場合は入力ジオメトリをそのまま返す
 * （同一参照。生成物に無用な差分を出さないため）。
 */
export function cleanGeometry(
  geometry: PolygonalGeometry,
  precision: number = DEFAULT_COORD_PRECISION,
  minPartAreaM2: number = MIN_PART_AREA_M2,
  minHoleAreaM2: number = MIN_HOLE_AREA_M2,
): CleanedGeometry {
  const hasKinks = selfIntersectionPoints(geometry).length > 0;
  let normalized = geometry;
  if (hasKinks) {
    const fixed = normalizeSelfIntersections(geometry, precision);
    if (fixed === null) {
      return {
        geometry: null,
        droppedParts: polygonParts(geometry).length,
        droppedHoles: 0,
        normalized: true,
        unresolved: false,
      };
    }
    normalized = fixed;
  }
  const dropped = dropTinyRings(normalized, minPartAreaM2, minHoleAreaM2);
  return {
    ...dropped,
    geometry: dropped.droppedParts === 0 && dropped.droppedHoles === 0
      ? normalized
      : dropped.geometry,
    normalized: hasKinks,
    unresolved: hasKinks && dropped.geometry !== null &&
      selfIntersectionPoints(dropped.geometry).length > 0,
  };
}

/** cleanFeatureCollection の集計 */
export interface CleanStats {
  /** 自己交差を解消した feature 数 */
  normalizedFeatures: number;
  /** 落としたパートの合計 */
  droppedParts: number;
  /** 落とした穴の合計 */
  droppedHoles: number;
  /** 面が残らず丸ごと落とした feature の NAME（入力順） */
  droppedFeatures: string[];
  /** 自己交差が残った feature の NAME（入力順。要調査） */
  unresolvedFeatures: string[];
}

/** cleanFeatureCollection の結果 */
export interface CleanedCollection {
  fc: FeatureCollection;
  stats: CleanStats;
}

/** properties.NAME を表示用文字列にする */
function nameOf(feature: Feature): string {
  const value = feature.properties?.NAME;
  return typeof value === "string" && value !== "" ? value : "(no name)";
}

/**
 * FeatureCollection 全体をクリーンアップする（純粋関数）。
 * feature の並び・properties は保つ。ポリゴン以外のジオメトリ（rivers の
 * LineString など）は同一参照でそのまま通す。面が残らなくなった feature は
 * 落とし、NAME を stats に記録する（描画されない残骸なので残す意味が無い）。
 */
export function cleanFeatureCollection(
  fc: FeatureCollection,
  precision: number = DEFAULT_COORD_PRECISION,
  minPartAreaM2: number = MIN_PART_AREA_M2,
  minHoleAreaM2: number = MIN_HOLE_AREA_M2,
): CleanedCollection {
  const features: Feature[] = [];
  const stats: CleanStats = {
    normalizedFeatures: 0,
    droppedParts: 0,
    droppedHoles: 0,
    droppedFeatures: [],
    unresolvedFeatures: [],
  };
  for (const feature of fc.features) {
    const geometry = feature.geometry;
    if (
      geometry === null ||
      (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")
    ) {
      features.push(feature);
      continue;
    }
    const cleaned = cleanGeometry(
      geometry,
      precision,
      minPartAreaM2,
      minHoleAreaM2,
    );
    if (cleaned.normalized) stats.normalizedFeatures++;
    stats.droppedParts += cleaned.droppedParts;
    stats.droppedHoles += cleaned.droppedHoles;
    if (cleaned.unresolved) stats.unresolvedFeatures.push(nameOf(feature));
    if (cleaned.geometry === null) {
      stats.droppedFeatures.push(nameOf(feature));
      continue;
    }
    features.push(
      cleaned.geometry === geometry
        ? feature
        : { ...feature, geometry: cleaned.geometry },
    );
  }
  return { fc: { type: "FeatureCollection", features }, stats };
}

/**
 * ビルドログ用に stats を 1 行にまとめる（純粋関数）。
 * 何も起きていなければ null を返す（ログを出さない）。
 */
export function formatCleanStats(stats: CleanStats): string | null {
  const parts: string[] = [];
  if (stats.normalizedFeatures > 0) {
    parts.push(`自己交差を解消: ${stats.normalizedFeatures} feature`);
  }
  if (stats.droppedParts > 0) {
    parts.push(`微小パートを除去: ${stats.droppedParts}`);
  }
  if (stats.droppedHoles > 0) {
    parts.push(`微小な穴を除去: ${stats.droppedHoles}`);
  }
  if (stats.droppedFeatures.length > 0) {
    parts.push(`面が残らず除去: ${stats.droppedFeatures.join(", ")}`);
  }
  if (stats.unresolvedFeatures.length > 0) {
    parts.push(
      `自己交差が残存（要調査）: ${stats.unresolvedFeatures.join(", ")}`,
    );
  }
  return parts.length === 0 ? null : `  ${parts.join(" / ")}`;
}
