/**
 * 河川ラインの端点・連続性 横断検査スクリプト（TASK-76 / spike）。
 *
 * TASK-75 で判明したエルベ川の河口欠落と同種の問題が他の河川にも無いかを、
 * data/rivers.geojson の全 feature に対して機械的に検査する。判定基準は
 * すべて定数として明示し（AC#3）、結果は JSON + Markdown に落として
 * `deno task audit-rivers` で再現できるようにする（AC#1）。
 *
 * 検査項目:
 * 1. 連結性  … 正準名ごとにパートを端点距離で連結し、連結成分数と成分間ギャップ
 * 2. 出口    … 河川の頂点が水域（海岸線・湖岸）／他河川／bbox 辺のいずれかに
 *               到達しているか（到達していなければ「行き止まり」）
 * 3. クリップ … ソース bbox が EUROPE_BBOX の外に出ているか（意図的な切断）
 * 4. パイプライン差分 … simplify 前（フィルタ + クリップ直後）と生成物の
 *               パート数・連結成分数・bbox を突き合わせ、生成側の欠落を検出
 * 5. 補助指標 … 河口とみなせる頂点から「開放海域」までの距離（判定には使わない。
 *               採用しない理由は docs/data-inventory/rivers-continuity-audit.md）
 *
 * 実行: deno task audit-rivers
 */

import type {
  BBox,
  Feature,
  FeatureCollection,
  Geometry,
  Position,
} from "geojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { EUROPE_BBOX } from "./build-data.ts";
import {
  canonicalRiverName,
  clipRiversToBbox,
  filterMajorRivers,
  MAX_SCALERANK,
  RIVERS_SOURCE_COMMIT,
  RIVERS_SOURCE_REPO,
} from "./build-rivers.ts";

// ---------------------------------------------------------------------------
// 判定基準（AC#3）
// ---------------------------------------------------------------------------

/**
 * bbox の辺に「接している」とみなす座標許容差（度）。
 * 出力座標は build-data.ts の COORD_PRECISION = 5 桁に丸められる（1e-5 度 ≒ 1 m）
 * ため丸め誤差の 2 倍を採る。実測ではクリップ由来の端点は -25 / 34 / 60 / 72 が
 * そのまま出るので、この値の取り方に判定は敏感でない。
 */
export const BBOX_EDGE_EPS_DEG = 2e-5;

/**
 * 2 つのパートが「連続している（同じ 1 本の川の続き）」とみなす接続距離
 * （端点↔相手ラインの最短距離）の上限（km）。
 *
 * 根拠: Natural Earth 50m の同一河川内のパート接続点は多くが座標完全一致
 * （0 km）だが、別 feature 由来の接続点には最大 0.83 km のノード揺れがある
 * （実測: Donau→Donau 0.83 km, Elbe のパート境界 0.48 km, Volga の分流分岐
 * 0.56 km）。感度分析（sweepJoinTolerance、監査レポートの「接続許容差の感度
 * 分析」）では、許容差 1 km 以上 50 km 以下のどの値でも全 30 河川が単一成分に
 * まとまり結果が変わらない。この平坦域の下端を採って 1.0 km とする
 * （0.5 km 以下では上記のノード揺れを分断と誤判定する）。
 */
export const PART_JOIN_TOLERANCE_KM = 1.0;

/**
 * 河川が水域（海岸線・湖岸）／他河川に「到達している」とみなす距離の上限（km）。
 *
 * 距離は頂点間ではなく点↔線分の距離で測る（50m の海岸線は頂点間隔が
 * 数 km あるため、頂点距離だと到達していても大きな値が出てしまう）。
 * 実測では到達している河川はすべて 0.05 km 未満（座標丸めの範囲）で、
 * 未到達なら数十 km になるため、その中間の 2 km を採る。
 */
export const OUTLET_TOLERANCE_KM = 2.0;

/**
 * 補助指標「開放海域までの距離」で、開放海域とみなす海岸線からの距離（km）。
 * 湾・潟・河口内でないことの目安。判定には使わない（レポート用の参考値）。
 */
export const OPEN_SEA_MARGIN_KM = 5;

/**
 * パイプライン差分（simplify 前後）で有意とみなす bbox のずれ（度）。
 * simplify は端点を保存するため理論上 0 だが、座標丸め（5 桁）と
 * トレランス分の内側化を見込んで 0.01 度（≒ 1 km）を採る。
 */
export const PIPELINE_BBOX_DELTA_DEG = 0.01;

/** ピン留めコミットから取得する Natural Earth データセット */
export const AUDIT_SOURCE_FILES = {
  rivers50m: "ne_50m_rivers_lake_centerlines",
  coastline50m: "ne_50m_coastline",
  lakes50m: "ne_50m_lakes",
  ocean50m: "ne_50m_ocean",
} as const;

/** 入力（生成物）パス */
export const RIVERS_PATH = "data/rivers.geojson";
/** 出力先 */
export const AUDIT_OUTPUT_DIR = ".outputs/claude/task-76";
export const AUDIT_JSON_PATH = `${AUDIT_OUTPUT_DIR}/rivers-audit.json`;
export const AUDIT_MARKDOWN_PATH = `${AUDIT_OUTPUT_DIR}/rivers-audit.md`;
/** ダウンロードキャッシュ（再実行の冪等化用） */
export const AUDIT_CACHE_DIR = `${AUDIT_OUTPUT_DIR}/cache`;

// ---------------------------------------------------------------------------
// 幾何ユーティリティ（純粋関数）
// ---------------------------------------------------------------------------

const EARTH_RADIUS_KM = 6371.0088;
const DEG = Math.PI / 180;

/** 2 点間の大円距離（km） */
export function haversineKm(a: Position, b: Position): number {
  const dLat = (b[1] - a[1]) * DEG;
  const dLon = (b[0] - a[0]) * DEG;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * DEG) * Math.cos(b[1] * DEG) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * 点と線分の距離（km）。点の緯度でスケールした局所平面近似
 * （数十 km スケールでは誤差 < 1%）。
 */
export function pointSegmentKm(p: Position, a: Position, b: Position): number {
  const kx = 111.32 * Math.cos(p[1] * DEG);
  const ky = 110.57;
  const px = p[0] * kx, py = p[1] * ky;
  const ax = a[0] * kx, ay = a[1] * ky;
  const bx = b[0] * kx, by = b[1] * ky;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** LineString / MultiLineString をパート（座標列）の配列に展開する */
export function explodeParts(geometry: Geometry | null): Position[][] {
  if (geometry === null) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

/** 座標列の bbox（[west, south, east, north]）。空なら null */
export function bboxOfPositions(positions: Position[]): BBox | null {
  if (positions.length === 0) return null;
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of positions) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

/** 点が bbox のどの辺に接しているか */
export function bboxEdgesTouched(
  point: Position,
  bbox: BBox,
  eps: number = BBOX_EDGE_EPS_DEG,
): string[] {
  const [w, s, e, n] = bbox as [number, number, number, number];
  const edges: string[] = [];
  if (Math.abs(point[0] - w) <= eps) edges.push("west");
  if (Math.abs(point[0] - e) <= eps) edges.push("east");
  if (Math.abs(point[1] - s) <= eps) edges.push("south");
  if (Math.abs(point[1] - n) <= eps) edges.push("north");
  return edges;
}

/** 点からポリラインへの最短距離（km） */
export function pointLineKm(point: Position, line: Position[]): number {
  let min = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const d = pointSegmentKm(point, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * 2 つのパートの「接続距離」（km）。
 * 片方の端点からもう片方のライン（線分列）への最短距離を採る。
 *
 * 端点同士の距離ではなくライン距離を使うのは、河川網では分流が本流の途中の
 * 点から分岐するため（実測: Volga の下流分流は本流ラインから 0.56 km の位置で
 * 分岐しており、端点距離では 93 km 離れているように見えてしまう）。
 */
export function partDistanceKm(a: Position[], b: Position[]): number {
  const ends = (p: Position[]): Position[] => [p[0], p[p.length - 1]];
  let min = Infinity;
  for (const p of ends(a)) min = Math.min(min, pointLineKm(p, b));
  for (const p of ends(b)) min = Math.min(min, pointLineKm(p, a));
  return min;
}

/**
 * パート群を接続距離 <= tolerance で連結し、連結成分に分割する（Union-Find）。
 * 成分をまたぐ最短接続距離（= 分断ギャップ）も併せて返す。
 */
export function connectParts(
  parts: Position[][],
  toleranceKm: number = PART_JOIN_TOLERANCE_KM,
): { components: number[][]; gapsKm: number[] } {
  const n = parts.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const cache = new Map<string, number>();
  const pairMin = (i: number, j: number): number => {
    const key = i < j ? `${i}:${j}` : `${j}:${i}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const d = partDistanceKm(parts[i], parts[j]);
    cache.set(key, d);
    return d;
  };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pairMin(i, j) <= toleranceKm) {
        const ra = find(i), rb = find(j);
        if (ra !== rb) parent[ra] = rb;
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root) ?? [];
    list.push(i);
    groups.set(root, list);
  }
  const components = [...groups.values()];

  // 成分ごとの「最も近い他成分までの距離」= 分断ギャップ
  const gaps: number[] = [];
  if (components.length > 1) {
    for (let ci = 0; ci < components.length; ci++) {
      let min = Infinity;
      for (const i of components[ci]) {
        for (let j = 0; j < n; j++) {
          if (find(i) === find(j)) continue;
          min = Math.min(min, pairMin(i, j));
        }
      }
      gaps.push(min);
    }
  }
  return { components, gapsKm: gaps };
}

/**
 * 同一河川内の全パート対の接続距離を列挙する。
 * PART_JOIN_TOLERANCE_KM の妥当性（距離分布の空白帯）を示すための実測値。
 */
export function joinDistancesKm(parts: Position[][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      out.push(partDistanceKm(parts[i], parts[j]));
    }
  }
  return out;
}

/**
 * 「自由端」（他パートのラインに接続していない端点）を返す。
 * 本流の途中から分岐する分流の分岐点も接続とみなす（partDistanceKm と同じ基準）。
 */
export function freeEndpoints(
  parts: Position[][],
  toleranceKm: number = PART_JOIN_TOLERANCE_KM,
): Position[] {
  const free: Position[] = [];
  for (let i = 0; i < parts.length; i++) {
    for (const endpoint of [parts[i][0], parts[i][parts[i].length - 1]]) {
      const connected = parts.some(
        (other, j) => j !== i && pointLineKm(endpoint, other) <= toleranceKm,
      );
      if (!connected) free.push(endpoint);
    }
  }
  return free;
}

/**
 * 接続許容差を掃引して、全河川の連結成分数の合計を求める（閾値の感度分析）。
 * 採用値が「成分数が変化しない平坦域」の中にあることを示すために使う（AC#3）。
 */
export function sweepJoinTolerance(
  partsByRiver: Position[][][],
  tolerancesKm: number[],
): { toleranceKm: number; totalComponents: number }[] {
  return tolerancesKm.map((toleranceKm) => ({
    toleranceKm,
    totalComponents: partsByRiver.reduce(
      (sum, parts) => sum + connectParts(parts, toleranceKm).components.length,
      0,
    ),
  }));
}

// ---------------------------------------------------------------------------
// 空間インデックス（線分集合への最短距離）
// ---------------------------------------------------------------------------

/** 線分集合。緯度経度 1 度グリッドで粗く索引する */
export class SegmentIndex {
  private cells = new Map<string, [Position, Position][]>();

  constructor(segments: [Position, Position][]) {
    for (const seg of segments) {
      const [a, b] = seg;
      const x0 = Math.floor(Math.min(a[0], b[0]));
      const x1 = Math.floor(Math.max(a[0], b[0]));
      const y0 = Math.floor(Math.min(a[1], b[1]));
      const y1 = Math.floor(Math.max(a[1], b[1]));
      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          const key = `${x}:${y}`;
          const list = this.cells.get(key) ?? [];
          list.push(seg);
          this.cells.set(key, list);
        }
      }
    }
  }

  /** 点からの最短距離（km）。半径 radiusDeg 度まで段階的に広げて探索する */
  distanceKm(point: Position, maxRadiusDeg = 12): number {
    let best = Infinity;
    for (let r = 1; r <= maxRadiusDeg; r *= 2) {
      const cx = Math.floor(point[0]);
      const cy = Math.floor(point[1]);
      const seen = new Set<[Position, Position]>();
      for (let x = cx - r; x <= cx + r; x++) {
        for (let y = cy - r; y <= cy + r; y++) {
          for (const seg of this.cells.get(`${x}:${y}`) ?? []) seen.add(seg);
        }
      }
      for (const [a, b] of seen) {
        const d = pointSegmentKm(point, a, b);
        if (d < best) best = d;
      }
      // 探索半径の内側で見つかった距離なら確定
      if (best <= (r - 1) * 100) return best;
    }
    return best;
  }
}

/** GeoJSON の全ライン／ポリゴン外周を線分列に展開する */
export function toSegments(fc: FeatureCollection): [Position, Position][] {
  const segments: [Position, Position][] = [];
  const walk = (coords: unknown): void => {
    if (!Array.isArray(coords) || coords.length === 0) return;
    const first = coords[0];
    if (typeof first === "number") return;
    if (Array.isArray(first) && typeof first[0] === "number") {
      const line = coords as Position[];
      for (let i = 0; i + 1 < line.length; i++) {
        segments.push([line[i], line[i + 1]]);
      }
      return;
    }
    for (const c of coords) walk(c);
  };
  for (const feature of fc.features) {
    if (feature.geometry === null) continue;
    walk((feature.geometry as { coordinates?: unknown }).coordinates);
  }
  return segments;
}

// ---------------------------------------------------------------------------
// 検査結果の型
// ---------------------------------------------------------------------------

/** 自由端 1 個ぶんの検査結果 */
export interface EndpointReport {
  position: Position;
  bboxEdges: string[];
  waterKm: number;
  otherRiverKm: number;
}

/** 河川 1 本ぶんの検査結果 */
export interface RiverReport {
  name: string;
  featureCount: number;
  partCount: number;
  componentCount: number;
  /** 成分ごとの最寄り他成分までの距離（km）。単一成分なら空 */
  componentGapsKm: number[];
  /** パート間の端点距離の全実測値（閾値の妥当性検証用） */
  joinDistancesKm: number[];
  outputBbox: BBox | null;
  sourceBbox: BBox | null;
  /** ソース bbox が EUROPE_BBOX の外へ出ている辺 */
  clippedEdges: string[];
  /** 河川の全頂点から水域（海岸線・湖岸）への最短距離 */
  outletWaterKm: number;
  /** 河川の全頂点から他河川ラインへの最短距離 */
  outletRiverKm: number;
  /** 出口（水域／他河川／bbox 辺）に到達しているか */
  hasOutlet: boolean;
  endpoints: EndpointReport[];
  /** 河口とみなせる頂点から開放海域までの距離（補助指標。判定には使わない） */
  openSeaKm: number | null;
  /** simplify 前（フィルタ + クリップ直後）との差分 */
  pipelineDiff: {
    partCountBefore: number;
    componentCountBefore: number;
    bboxBefore: BBox | null;
    maxBboxDeltaDeg: number;
    changed: boolean;
  } | null;
  /** 判定 */
  broken: boolean;
  classification: "ok" | "clip" | "source-gap" | "pipeline";
  reasons: string[];
}

/** ソース側の異常（空ジオメトリ feature 等） */
export interface SourceAnomaly {
  name: string;
  emptyGeometryFeatures: number;
}

export interface AuditResult {
  source: { repo: string; commit: string };
  thresholds: Record<string, number>;
  /** 接続許容差の感度分析（閾値が平坦域にあることの根拠） */
  toleranceSweep: { toleranceKm: number; totalComponents: number }[];
  rivers: RiverReport[];
  sourceAnomalies: SourceAnomaly[];
}

/** 感度分析で掃引する接続許容差（km） */
export const SWEEP_TOLERANCES_KM = [
  0.01,
  0.05,
  0.1,
  0.25,
  0.5,
  1,
  2,
  5,
  10,
  25,
  50,
];

// ---------------------------------------------------------------------------
// 検査本体
// ---------------------------------------------------------------------------

/** feature を正準名でグルーピングする */
export function groupByCanonicalName(
  fc: FeatureCollection,
): Map<string, Feature[]> {
  const groups = new Map<string, Feature[]>();
  for (const feature of fc.features) {
    const raw = feature.properties?.name;
    const name = typeof raw === "string"
      ? canonicalRiverName(raw)
      : "(no name)";
    const list = groups.get(name) ?? [];
    list.push(feature);
    groups.set(name, list);
  }
  return groups;
}

/** 河川群からパート配列を作る（点数 2 未満は除外） */
export function partsOf(features: Feature[]): Position[][] {
  const parts: Position[][] = [];
  for (const feature of features) {
    for (const part of explodeParts(feature.geometry)) {
      if (part.length >= 2) parts.push(part);
    }
  }
  return parts;
}

/**
 * 生成物だけで判定できる「連続性の破れ」を列挙する（純粋関数・ネットワーク不要）。
 * 回帰テスト（scripts/audit-rivers_test.ts）の本体。
 * 正準名ごとにパートを接続し、連結成分が 2 個以上になった河川を返す。
 */
export function findContinuityIssues(
  fc: FeatureCollection,
  toleranceKm: number = PART_JOIN_TOLERANCE_KM,
): { name: string; componentCount: number; gapsKm: number[] }[] {
  const issues: { name: string; componentCount: number; gapsKm: number[] }[] =
    [];
  for (const [name, features] of groupByCanonicalName(fc)) {
    const parts = partsOf(features);
    if (parts.length === 0) continue;
    const { components, gapsKm } = connectParts(parts, toleranceKm);
    if (components.length > 1) {
      issues.push({ name, componentCount: components.length, gapsKm });
    }
  }
  return issues.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/**
 * 自由端が EUROPE_BBOX の辺に接する河川（= クリップで切断されている河川）を
 * 列挙する（純粋関数・ネットワーク不要）。回帰テストで既知集合と突き合わせる。
 */
export function findBboxClippedRivers(
  fc: FeatureCollection,
  bbox: BBox = EUROPE_BBOX,
): { name: string; edges: string[] }[] {
  const out: { name: string; edges: string[] }[] = [];
  for (const [name, features] of groupByCanonicalName(fc)) {
    const parts = partsOf(features);
    if (parts.length === 0) continue;
    const edges = new Set<string>();
    for (const endpoint of freeEndpoints(parts)) {
      for (const edge of bboxEdgesTouched(endpoint, bbox)) edges.add(edge);
    }
    if (edges.size > 0) out.push({ name, edges: [...edges].sort() });
  }
  return out.sort((a, b) => (a.name < b.name ? -1 : 1));
}

/** 補助指標の計算に使う外部データ */
export interface WaterContext {
  /** 海岸線 + 湖岸の線分索引 */
  water: SegmentIndex;
  /** 海ポリゴン（開放海域判定用）。null なら openSeaKm は算出しない */
  oceanFeatures: Feature[] | null;
}

/**
 * 点から「開放海域」（海ポリゴン内かつ海岸線から OPEN_SEA_MARGIN_KM 以上）
 * までの最短距離（km）。同心の正方リングを 0.05 度刻みで広げて探索する。
 * 補助指標なので見つからなければ null。
 */
export function openSeaDistanceKm(
  point: Position,
  ctx: WaterContext,
  maxRadiusDeg = 2.0,
): number | null {
  if (ctx.oceanFeatures === null) return null;
  const step = 0.05;
  const lonScale = 1 / Math.max(0.2, Math.cos(point[1] * DEG));
  for (let r = step; r <= maxRadiusDeg + 1e-9; r += step) {
    let best = Infinity;
    for (let dx = -r; dx <= r + 1e-9; dx += step) {
      for (let dy = -r; dy <= r + 1e-9; dy += step) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) < r - step / 2) continue;
        const q: Position = [point[0] + dx * lonScale, point[1] + dy];
        const d = haversineKm(point, q);
        if (d >= best) continue;
        if (ctx.water.distanceKm(q) < OPEN_SEA_MARGIN_KM) continue;
        const inOcean = ctx.oceanFeatures.some((f) =>
          booleanPointInPolygon(q as [number, number], f as never)
        );
        if (!inOcean) continue;
        best = d;
      }
    }
    if (best < Infinity) return best;
  }
  return null;
}

/**
 * 検査本体（純粋関数。外部データは引数で受け取る）。
 * @param output data/rivers.geojson（正準名済み・クリップ済み・simplify 済み）
 * @param clipped simplify 前（filterMajorRivers + clipRiversToBbox 直後）
 * @param source NE 50m rivers（scalerank フィルタのみ、クリップ前）
 */
export function auditRivers(
  output: FeatureCollection,
  clipped: FeatureCollection,
  source: FeatureCollection,
  ctx: WaterContext,
): AuditResult {
  const outputGroups = groupByCanonicalName(output);
  const clippedGroups = groupByCanonicalName(clipped);
  const sourceGroups = groupByCanonicalName(source);

  const positionsByName = new Map<string, Position[]>();
  for (const [name, features] of outputGroups) {
    positionsByName.set(name, partsOf(features).flat());
  }

  const rivers: RiverReport[] = [];
  const names = [...outputGroups.keys()].sort();
  for (const name of names) {
    const features = outputGroups.get(name)!;
    const parts = partsOf(features);
    const { components, gapsKm } = connectParts(parts);
    const positions = parts.flat();
    const outputBbox = bboxOfPositions(positions);
    const sourceBbox = bboxOfPositions(
      partsOf(sourceGroups.get(name) ?? []).flat(),
    );

    // 1) EUROPE_BBOX クリップ
    const clippedEdges: string[] = [];
    if (sourceBbox !== null) {
      const [sw, ss, se, sn] = sourceBbox as [number, number, number, number];
      const [w, s, e, n] = EUROPE_BBOX as [number, number, number, number];
      if (sw < w - BBOX_EDGE_EPS_DEG) clippedEdges.push("west");
      if (se > e + BBOX_EDGE_EPS_DEG) clippedEdges.push("east");
      if (ss < s - BBOX_EDGE_EPS_DEG) clippedEdges.push("south");
      if (sn > n + BBOX_EDGE_EPS_DEG) clippedEdges.push("north");
    }

    // 2) 出口（水域 / 他河川 / bbox 辺）への到達
    const otherRiverSegments: [Position, Position][] = [];
    for (const [other, otherFeatures] of outputGroups) {
      if (other === name) continue;
      for (const part of partsOf(otherFeatures)) {
        for (let i = 0; i + 1 < part.length; i++) {
          otherRiverSegments.push([part[i], part[i + 1]]);
        }
      }
    }
    const otherIndex = new SegmentIndex(otherRiverSegments);
    let outletWaterKm = Infinity;
    let outletRiverKm = Infinity;
    for (const p of positions) {
      outletWaterKm = Math.min(outletWaterKm, ctx.water.distanceKm(p));
      outletRiverKm = Math.min(outletRiverKm, otherIndex.distanceKm(p));
      if (outletWaterKm === 0 && outletRiverKm === 0) break;
    }
    const endpoints: EndpointReport[] = freeEndpoints(parts).map((
      position,
    ) => ({
      position,
      bboxEdges: bboxEdgesTouched(position, EUROPE_BBOX),
      waterKm: ctx.water.distanceKm(position),
      otherRiverKm: otherIndex.distanceKm(position),
    }));
    const touchesBboxEdge = endpoints.some((e) => e.bboxEdges.length > 0);
    const hasOutlet = outletWaterKm <= OUTLET_TOLERANCE_KM ||
      outletRiverKm <= OUTLET_TOLERANCE_KM || touchesBboxEdge;

    // 3) パイプライン差分（simplify 前後）
    const beforeParts = partsOf(clippedGroups.get(name) ?? []);
    let pipelineDiff: RiverReport["pipelineDiff"] = null;
    if (beforeParts.length > 0) {
      const before = connectParts(beforeParts);
      const bboxBefore = bboxOfPositions(beforeParts.flat());
      let maxDelta = 0;
      if (bboxBefore !== null && outputBbox !== null) {
        for (let i = 0; i < 4; i++) {
          maxDelta = Math.max(
            maxDelta,
            Math.abs((bboxBefore as number[])[i] - (outputBbox as number[])[i]),
          );
        }
      }
      pipelineDiff = {
        partCountBefore: beforeParts.length,
        componentCountBefore: before.components.length,
        bboxBefore,
        maxBboxDeltaDeg: maxDelta,
        changed: before.components.length !== components.length ||
          beforeParts.length !== parts.length ||
          maxDelta > PIPELINE_BBOX_DELTA_DEG,
      };
    }

    // 4) 補助指標: 河口候補（水域に接する頂点）から開放海域までの距離
    let openSeaKm: number | null = null;
    if (outletWaterKm <= OUTLET_TOLERANCE_KM && ctx.oceanFeatures !== null) {
      const seen = new Set<string>();
      const candidates: Position[] = [];
      for (const p of positions) {
        if (ctx.water.distanceKm(p) > OUTLET_TOLERANCE_KM) continue;
        const key = `${p[0].toFixed(1)}:${p[1].toFixed(1)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(p);
      }
      for (const p of candidates) {
        const d = openSeaDistanceKm(p, ctx);
        if (d !== null && (openSeaKm === null || d < openSeaKm)) openSeaKm = d;
      }
    }

    // 判定
    const reasons: string[] = [];
    const broken = components.length > 1 || !hasOutlet ||
      (pipelineDiff?.changed ?? false);
    if (components.length > 1) {
      reasons.push(
        `連結成分が ${components.length} 個（成分間ギャップ ${
          gapsKm.map((g) => g.toFixed(1)).join(" / ")
        } km）`,
      );
    }
    if (!hasOutlet) {
      reasons.push(
        `水域まで ${outletWaterKm.toFixed(1)} km・他河川まで ${
          outletRiverKm.toFixed(1)
        } km で、いずれの出口にも到達していない`,
      );
    }
    if (pipelineDiff?.changed) {
      reasons.push(
        `simplify 前後でパート数 ${pipelineDiff.partCountBefore}→${parts.length}・` +
          `成分数 ${pipelineDiff.componentCountBefore}→${components.length}・` +
          `bbox 最大差 ${pipelineDiff.maxBboxDeltaDeg.toFixed(4)} 度`,
      );
    }
    if (clippedEdges.length > 0) {
      reasons.push(
        `ソース bbox が EUROPE_BBOX の ${
          clippedEdges.join("/")
        } 辺の外に出ており、地図の可動域（MAP_MAX_BOUNDS）と同じ位置で切断される`,
      );
    }

    let classification: RiverReport["classification"] = "ok";
    if (pipelineDiff?.changed) classification = "pipeline";
    else if (broken) classification = "source-gap";
    else if (clippedEdges.length > 0) classification = "clip";

    rivers.push({
      name,
      featureCount: features.length,
      partCount: parts.length,
      componentCount: components.length,
      componentGapsKm: gapsKm,
      joinDistancesKm: joinDistancesKm(parts),
      outputBbox,
      sourceBbox,
      clippedEdges,
      outletWaterKm,
      outletRiverKm,
      hasOutlet,
      endpoints,
      openSeaKm,
      pipelineDiff,
      broken,
      classification,
      reasons,
    });
  }

  const sourceAnomalies: SourceAnomaly[] = [];
  for (const [name, features] of [...sourceGroups].sort()) {
    const empty = features.filter(
      (f) => explodeParts(f.geometry).every((p) => p.length < 2),
    ).length;
    if (empty > 0) sourceAnomalies.push({ name, emptyGeometryFeatures: empty });
  }

  const partsByRiver = names.map((name) => partsOf(outputGroups.get(name)!));

  return {
    source: { repo: RIVERS_SOURCE_REPO, commit: RIVERS_SOURCE_COMMIT },
    toleranceSweep: sweepJoinTolerance(partsByRiver, SWEEP_TOLERANCES_KM),
    thresholds: {
      bboxEdgeEpsDeg: BBOX_EDGE_EPS_DEG,
      partJoinToleranceKm: PART_JOIN_TOLERANCE_KM,
      outletToleranceKm: OUTLET_TOLERANCE_KM,
      openSeaMarginKm: OPEN_SEA_MARGIN_KM,
      pipelineBboxDeltaDeg: PIPELINE_BBOX_DELTA_DEG,
    },
    rivers,
    sourceAnomalies,
  };
}

/** 監査結果を Markdown に整形する（純粋関数） */
export function formatAuditMarkdown(result: AuditResult): string {
  const fmtBbox = (b: BBox | null) =>
    b === null ? "-" : (b as number[]).map((v) => v.toFixed(3)).join(", ");
  const L: string[] = [];
  L.push("# 河川連続性 横断検査レポート（TASK-76・自動生成）");
  L.push("");
  L.push(`- ソース: ${result.source.repo} @ ${result.source.commit}`);
  L.push(
    `- 閾値: ${
      Object.entries(result.thresholds).map(([k, v]) => `${k}=${v}`).join(" / ")
    }`,
  );
  L.push(`- 対象: ${result.rivers.length} 河川（正準名ベース）`);
  L.push("");
  L.push("## 河川別サマリ");
  L.push("");
  L.push(
    "| 河川 | feature | パート | 成分 | 成分間ギャップ km | 水域まで km | 他河川まで km | 出口 | 開放海域 km | 出力 bbox | ソース bbox | クリップ辺 | 判定 |",
  );
  L.push(
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  );
  for (const r of result.rivers) {
    L.push(
      `| ${r.name} | ${r.featureCount} | ${r.partCount} | ${r.componentCount} | ${
        r.componentGapsKm.map((g) => g.toFixed(1)).join(" / ") || "-"
      } | ${r.outletWaterKm.toFixed(2)} | ${r.outletRiverKm.toFixed(2)} | ${
        r.hasOutlet ? "有" : "**無**"
      } | ${r.openSeaKm === null ? "-" : r.openSeaKm.toFixed(1)} | ${
        fmtBbox(r.outputBbox)
      } | ${fmtBbox(r.sourceBbox)} | ${
        r.clippedEdges.join("/") || "-"
      } | ${r.classification} |`,
    );
  }
  L.push("");
  L.push("## 自由端（他パートと接続しない端点）");
  L.push("");
  L.push("| 河川 | 端点 (lon, lat) | bbox 辺 | 水域まで km | 他河川まで km |");
  L.push("| --- | --- | --- | --- | --- |");
  for (const r of result.rivers) {
    for (const e of r.endpoints) {
      L.push(
        `| ${r.name} | ${e.position[0].toFixed(4)}, ${
          e.position[1].toFixed(4)
        } | ${e.bboxEdges.join("/") || "-"} | ${e.waterKm.toFixed(2)} | ${
          e.otherRiverKm === Infinity ? "-" : e.otherRiverKm.toFixed(2)
        } |`,
      );
    }
  }
  L.push("");
  L.push("## 接続許容差の感度分析（閾値の妥当性）");
  L.push("");
  L.push("| 許容差 km | 全河川の連結成分数の合計 |");
  L.push("| --- | --- |");
  for (const s of result.toleranceSweep) {
    L.push(`| ${s.toleranceKm} | ${s.totalComponents} |`);
  }
  L.push("");
  L.push("## パート間接続距離の分布");
  L.push("");
  const all = result.rivers.flatMap((r) => r.joinDistancesKm).sort((a, b) =>
    a - b
  );
  const buckets: [string, (d: number) => boolean][] = [
    ["0 km（座標一致）", (d) => d < 0.001],
    ["0〜0.5 km", (d) => d >= 0.001 && d < 0.5],
    ["0.5〜1 km", (d) => d >= 0.5 && d < 1],
    ["1〜5 km", (d) => d >= 1 && d < 5],
    ["5〜10 km", (d) => d >= 5 && d < 10],
    ["10 km 以上", (d) => d >= 10],
  ];
  L.push("| 距離帯 | 件数 |");
  L.push("| --- | --- |");
  for (const [label, pred] of buckets) {
    L.push(`| ${label} | ${all.filter(pred).length} |`);
  }
  L.push("");
  L.push("## ソース側の空ジオメトリ feature");
  L.push("");
  if (result.sourceAnomalies.length === 0) L.push("なし");
  else {
    for (const a of result.sourceAnomalies) {
      L.push(`- ${a.name}: ${a.emptyGeometryFeatures} 件`);
    }
  }
  L.push("");
  L.push("## 途切れ判定に該当した河川");
  L.push("");
  const broken = result.rivers.filter((r) => r.broken);
  if (broken.length === 0) {
    L.push("なし（成分分断・出口欠如・パイプライン差分いずれも 0 件）");
  } else {
    for (const r of broken) {
      L.push(
        `- **${r.name}**（${r.classification}）: ${r.reasons.join(" / ")}`,
      );
    }
  }
  L.push("");
  L.push("## EUROPE_BBOX クリップに該当した河川");
  L.push("");
  const clipped = result.rivers.filter((r) => r.clippedEdges.length > 0);
  if (clipped.length === 0) L.push("なし");
  else {
    for (const r of clipped) {
      L.push(
        `- **${r.name}**: ${r.clippedEdges.join("/")} 辺で切断（ソース bbox ${
          fmtBbox(r.sourceBbox)
        } → 出力 bbox ${fmtBbox(r.outputBbox)}）`,
      );
    }
  }
  L.push("");
  return L.join("\n");
}

// ---------------------------------------------------------------------------
// 実行部
// ---------------------------------------------------------------------------

/** ピン留めコミットの raw GeoJSON URL */
export function buildAuditSourceUrl(file: string): string {
  return `https://raw.githubusercontent.com/${RIVERS_SOURCE_REPO}/${RIVERS_SOURCE_COMMIT}/geojson/${file}.geojson`;
}

/** キャッシュ付きでピン留めソースを取得する */
async function fetchCached(file: string): Promise<FeatureCollection> {
  const path = `${AUDIT_CACHE_DIR}/${file}.geojson`;
  try {
    return JSON.parse(await Deno.readTextFile(path)) as FeatureCollection;
  } catch {
    // 未キャッシュ
  }
  const url = buildAuditSourceUrl(file);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} の取得に失敗しました (${res.status})`);
  const text = await res.text();
  await Deno.mkdir(AUDIT_CACHE_DIR, { recursive: true });
  await Deno.writeTextFile(path, text);
  return JSON.parse(text) as FeatureCollection;
}

async function main(): Promise<void> {
  const output = JSON.parse(
    await Deno.readTextFile(RIVERS_PATH),
  ) as FeatureCollection;
  const raw = await fetchCached(AUDIT_SOURCE_FILES.rivers50m);
  const source = filterMajorRivers(raw, MAX_SCALERANK);
  const clipped = clipRiversToBbox(source, EUROPE_BBOX);
  const coastline = await fetchCached(AUDIT_SOURCE_FILES.coastline50m);
  const lakes = await fetchCached(AUDIT_SOURCE_FILES.lakes50m);
  const ocean = await fetchCached(AUDIT_SOURCE_FILES.ocean50m);
  const water = new SegmentIndex([
    ...toSegments(coastline),
    ...toSegments(lakes),
  ]);

  const result = auditRivers(output, clipped, source, {
    water,
    oceanFeatures: ocean.features,
  });
  await Deno.mkdir(AUDIT_OUTPUT_DIR, { recursive: true });
  await Deno.writeTextFile(AUDIT_JSON_PATH, JSON.stringify(result, null, 2));
  const markdown = formatAuditMarkdown(result);
  await Deno.writeTextFile(AUDIT_MARKDOWN_PATH, markdown);
  console.log(markdown);
  console.log(`\n${AUDIT_JSON_PATH} / ${AUDIT_MARKDOWN_PATH} を出力しました`);
}

if (import.meta.main) {
  await main();
}
