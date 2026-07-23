/**
 * 主要河川レイヤーの DOM/deck.gl 非依存な純粋ロジック（TASK-24）。
 * - クリックによる河川選択のトグル状態遷移
 * - 選択状態に応じたライン色・線幅の決定
 * - 河川ラベルのアンカー座標（最長 LineString の中点）と優先度の算出
 *
 * TASK-21 で MapLibre style（basemap.ts）の line レイヤーとして描画していた
 * Natural Earth 主要河川を、クリック/ホバー可能にするため deck.gl の
 * GeoJsonLayer（main.ts）へ移行した。RIVERS_DATA_URL はその移設に伴い
 * basemap.ts からここへ移した。
 */

import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Position,
} from "geojson";
import type { Rgba } from "./powers.ts";
import {
  type LabelDatum,
  MAX_LABEL_PRIORITY,
  MIN_LABEL_PRIORITY,
} from "./labels.ts";

/** 主要河川 GeoJSON の配信 URL（scripts/build.ts のコピー先と一致させる契約） */
export const RIVERS_DATA_URL = "/data/rivers.geojson";

/**
 * 通常時のライン色。TASK-21 の MapLibre rivers レイヤーが使っていた
 * @protomaps/basemaps light flavor の water 色（#80deea）と同値。
 * この定数のためだけに basemaps への依存を持ち込まないよう直書きする。
 */
export const RIVER_LINE_COLOR: Rgba = [128, 222, 234, 255];

/** 選択（強調）時のライン色。通常色と同系統の濃い水色（#0288d1） */
export const RIVER_SELECTED_LINE_COLOR: Rgba = [2, 136, 209, 255];

/**
 * 通常時の線幅（px）。TASK-44 でベースマップの川ラインを除外し deck 河川が
 * 唯一の川表示になったため、視認性を確保して 2px から 3px へ引き上げた。
 * deck.gl では選択強調（太線）と層単位の lineWidthMaxPixels が両立しない
 * （clamp が強調幅も潰す）ため、固定 px 幅 + getLineWidth の per-feature
 * 切替で近似する。
 */
export const RIVER_LINE_WIDTH_PX = 3;

/** 選択（強調）時の線幅（px）。通常幅より明確に太くして全体を際立たせる */
export const RIVER_SELECTED_LINE_WIDTH_PX = 4.5;

/** properties から河川名（name）を取り出す。欠落・空文字・非文字列は null */
export function riverNameFor(props: GeoJsonProperties): string | null {
  const v = props?.name;
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * 河川クリックによる選択状態のトグル遷移（純粋関数）。
 * - 選択中の河川を再クリック（current === clickedName）→ 解除（null）
 * - 別の河川をクリック → その河川へ切替
 * - 河川以外のクリック（clickedName null）→ 解除（null）
 */
export function toggleRiverSelection(
  current: string | null,
  clickedName: string | null,
): string | null {
  if (clickedName === null) return null;
  return current === clickedName ? null : clickedName;
}

/**
 * 河川ラインの色を決める（純粋関数）。選択中の河川のみ強調色にし、
 * 他の河川・name の無い feature は通常色のまま。
 */
export function riverLineColor(
  name: string | null,
  selected: string | null,
): Rgba {
  return name !== null && name === selected
    ? RIVER_SELECTED_LINE_COLOR
    : RIVER_LINE_COLOR;
}

/** 河川ラインの線幅（px）を決める（純粋関数）。選択中の河川のみ太くする */
export function riverLineWidth(
  name: string | null,
  selected: string | null,
): number {
  return name !== null && name === selected
    ? RIVER_SELECTED_LINE_WIDTH_PX
    : RIVER_LINE_WIDTH_PX;
}

/** 折れ線の全長（座標系の単位 = 度の平面近似）。ラベル配置用途には十分 */
function lineLength(coords: readonly Position[]): number {
  let sum = 0;
  for (let i = 1; i < coords.length; i++) {
    sum += Math.hypot(
      coords[i][0] - coords[i - 1][0],
      coords[i][1] - coords[i - 1][1],
    );
  }
  return sum;
}

/**
 * 折れ線に沿った中点（全長の 1/2 の地点）を返す。頂点に丸めず頂点間を
 * 線形補間するため、頂点密度の偏りに影響されずライン中央にラベルが乗る。
 */
function midpointAlong(coords: readonly Position[]): [number, number] {
  const total = lineLength(coords);
  if (total === 0) return [coords[0][0], coords[0][1]];
  let remaining = total / 2;
  for (let i = 1; i < coords.length; i++) {
    const seg = Math.hypot(
      coords[i][0] - coords[i - 1][0],
      coords[i][1] - coords[i - 1][1],
    );
    if (seg >= remaining) {
      const t = remaining / seg;
      return [
        coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
        coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
      ];
    }
    remaining -= seg;
  }
  const last = coords[coords.length - 1];
  return [last[0], last[1]];
}

/** feature の折れ線一覧（LineString は 1 本、MultiLineString は全パート）。他は空 */
function riverLines(feature: Feature): Position[][] {
  const geometry = feature.geometry;
  if (geometry === null || geometry === undefined) return [];
  if (geometry.type === "LineString") return [geometry.coordinates];
  if (geometry.type === "MultiLineString") return geometry.coordinates;
  return [];
}

/**
 * ライン長由来のラベル優先度（純粋関数）。長い川ほど高優先で、
 * CollisionFilterExtension の getCollisionPriority に渡す。
 * labels.ts の面積優先度と同じ対数スケール（100 * log10）にそろえ、
 * 勢力ラベルと同一衝突空間で自然に競合させる。
 */
function riverLabelPriority(totalLength: number): number {
  if (totalLength <= 0) return MIN_LABEL_PRIORITY;
  const priority = Math.round(100 * Math.log10(totalLength));
  return Math.min(MAX_LABEL_PRIORITY, Math.max(MIN_LABEL_PRIORITY, priority));
}

/**
 * FeatureCollection から河川ラベルのアンカーデータを組み立てる（純粋関数）。
 * - name を持つ feature ごとに 1 件（name 欠落・折れ線を持たないものは除外）
 * - position は最長 LineString（MultiLineString は最長パート）の中点
 * - priority は全パート合計長由来（長い川を優先表示）
 * - ja（name-ja.json、英語名 → 日本語名）を渡すと text を日本語化。未登録は英語のまま
 */
export function riverLabelAnchors(
  fc: FeatureCollection,
  ja: Record<string, string> = {},
): LabelDatum[] {
  const data: LabelDatum[] = [];
  for (const feature of fc.features) {
    const name = riverNameFor(feature.properties);
    if (name === null) continue;
    const lines = riverLines(feature).filter((c) => c.length >= 2);
    if (lines.length === 0) continue;
    let longest = lines[0];
    let longestLength = lineLength(lines[0]);
    let totalLength = longestLength;
    for (let i = 1; i < lines.length; i++) {
      const len = lineLength(lines[i]);
      totalLength += len;
      if (len > longestLength) {
        longestLength = len;
        longest = lines[i];
      }
    }
    data.push({
      text: ja[name] ?? name,
      position: midpointAlong(longest),
      priority: riverLabelPriority(totalLength),
    });
  }
  return data;
}
