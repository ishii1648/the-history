/**
 * 勢力名ラベルの DOM/deck.gl 非依存な純粋ロジック（TASK-20）。
 * - 各勢力ポリゴンの代表点（最大ポリゴンの pole of inaccessibility）の算出
 * - CollisionFilterExtension 用の面積由来ラベル優先度の算出
 * - FeatureCollection → TextLayer 用データへの変換と characterSet の抽出
 *
 * 地図上の常時ラベルは NAME のみとする。属領（SUBJECTO≠NAME）の宗主国込み表記
 * （"NAME — SUBJECTO 領"）はホバー/クリックのツールチップ（info.ts displayLabel）
 * に委ねる。displayLabel も NAME から始まるため両者の表記は矛盾しない。
 */

import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Position,
} from "geojson";
import polylabelModule from "@mapbox/polylabel";

/** polylabel の最小契約（パッケージに型定義が無いため自前で与える） */
type PolylabelFn = (
  rings: Position[][],
  precision?: number,
) => [number, number];
const polylabel = polylabelModule as unknown as PolylabelFn;

/**
 * polylabel の探索精度（座標系の単位 = 度）。0.01° ≒ 1km 弱で、国スケールの
 * ラベル位置には十分細かく、計算量も小さい。
 */
const POLYLABEL_PRECISION = 0.01;

/** CollisionFilterExtension getCollisionPriority の許容レンジ下限 */
export const MIN_LABEL_PRIORITY = -1000;

/** CollisionFilterExtension getCollisionPriority の許容レンジ上限 */
export const MAX_LABEL_PRIORITY = 1000;

/**
 * 勢力ラベルの由来種別（TASK-30）。
 * - "base": 独立国など base データ（europe_*）由来
 * - "hre": HRE 領邦オーバーレイ（hre_*）由来
 */
export type LabelKind = "base" | "hre";

/** TextLayer に渡すラベル 1 件分のデータ */
export interface LabelDatum {
  /** 表示テキスト（NAME） */
  text: string;
  /** アンカー座標 [lon, lat] */
  position: [number, number];
  /** 衝突制御の優先度（大きいほど優先。MIN..MAX_LABEL_PRIORITY） */
  priority: number;
  /** 由来種別（TASK-30 の文字色分け用。省略時は base 扱い） */
  kind?: LabelKind;
}

/** ラベル文字色の RGBA */
export type LabelColor = readonly [number, number, number, number];

/** 独立国など通常ラベルの文字色（濃グレー。TASK-20 から不変） */
export const BASE_LABEL_COLOR: LabelColor = [40, 40, 40, 255];

/**
 * HRE 域内領邦ラベルの文字色（TASK-30 AC #1）。
 * 臙脂（えんじ）系の深い赤。既存のラベル色 — 国名の濃グレー [40,40,40]・
 * 都市の茶 [121,62,22]・河川の水色 [2,119,189] — のいずれとも色相が離れて
 * おり、白 halo 上で判読しつつ「帝国系」の記号として一目で区別できる。
 * 帝国範囲の強調レイヤー（main.ts hre-extent）と同系色で揃える。
 */
export const HRE_LABEL_COLOR: LabelColor = [140, 30, 30, 255];

/**
 * ラベルの文字色を由来種別から決める（純粋関数、TASK-30 AC #1）。
 * kind=hre のみ帝国色、それ以外（base・省略）は従来の濃グレー。
 */
export function labelColorFor(d: Pick<LabelDatum, "kind">): LabelColor {
  return d.kind === "hre" ? HRE_LABEL_COLOR : BASE_LABEL_COLOR;
}

/**
 * 都市名ラベルの文字色（濃茶。TASK-27 から不変）。国名の濃グレー・
 * HRE 領邦の臙脂・河川の水色のいずれとも色相が離れており、白 halo 上で
 * 都市だと一見して区別できる。
 */
export const CITY_LABEL_COLOR: LabelColor = [121, 62, 22, 255];

/**
 * 河川名ラベルの文字色（水色系。TASK-24 から不変）。国名・HRE 領邦・都市の
 * いずれとも異なる色相で「水系の注記」だと一見して区別できる。
 */
export const RIVER_LABEL_COLOR: LabelColor = [2, 119, 189, 255];

/**
 * 全 TextLayer（国名・HRE 領邦名・都市名・河川名）に共通のフォントスタック
 * （TASK-38 AC #2）。日本語ラベル（name-ja.json、TASK-23）と欧文ラベルの
 * 双方を高い可読性で描画できるよう、主要 OS の高品質な和文/欧文 sans-serif を
 * 優先し、最後に総称フォールバックを置く。deck.gl TextLayer は
 * CanvasRenderingContext2D でグリフを生成するため、CSS のフォントスタック
 * 文字列がそのまま使える。
 */
export const LABEL_FONT_FAMILY =
  '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", ' +
  '"Noto Sans JP", "Segoe UI", "Helvetica Neue", Arial, sans-serif';

/**
 * 全 TextLayer 共通の fontSettings（TASK-38 AC #1）。sdf: true は
 * outlineWidth/outlineColor（白 halo）の前提であり、既存の日本語グリフ対応
 * （characterSet をラベル文字列から動的に導出する運用、TASK-23）とも両立する
 * （sdf は生成された characterSet 内のグリフに対して機能するため、
 * characterSet を明示的に絞り込んでいる既存実装への影響はない）。
 * smoothing はやや低め（デフォルト 0.1 よりわずかに強調）にして輪郭を
 * くっきりさせ、白 halo との境界を判別しやすくする。
 */
export const LABEL_FONT_SETTINGS = { sdf: true, smoothing: 0.15 } as const;

/** 全 TextLayer 共通のアウトライン（白 halo）色。十分に白く・不透明（TASK-38 AC #1） */
export const LABEL_OUTLINE_COLOR: LabelColor = [255, 255, 255, 235];

/** 全 TextLayer 共通のアウトライン幅（px）。0 より大きく、視認性補強に十分な太さ（TASK-38 AC #1） */
export const LABEL_OUTLINE_WIDTH = 2;

/**
 * 国名・HRE 領邦名ラベルのサイズ（px）。従来 13px から 14px へ（TASK-38 AC #2）。
 * +1px 程度の控えめな引き上げに留め、CollisionFilterExtension による
 * ラベル間引き（sizeScale: 2 の衝突判定）への影響を小さくする。
 */
export const POWER_LABEL_SIZE_PX = 14;

/**
 * 河川名ラベルのサイズ（px）。従来 11px から 12px へ（TASK-38 AC #2）。
 * 国名ラベル（14px）より小さいままとし、既存の「注記」としての位置づけを保つ。
 */
export const RIVER_LABEL_SIZE_PX = 12;

/**
 * 都市名ラベルのサイズ（px）。従来 11px から 12px へ（TASK-38 AC #2）。
 * 国名ラベル（14px）より小さいままとし、既存の視覚的な階層を保つ。
 */
export const CITY_LABEL_SIZE_PX = 12;

/**
 * 全 TextLayer（国名・HRE 領邦名・河川名・都市名）共通のラベル背景パネル色
 * （TASK-54 AC #1/#2。案A: TextLayer の background/getBackgroundColor）。
 * 密集地域（ケルン大司教領周辺・ザクセン選帝侯領/公領周辺）で下の勢力塗りや
 * HRE 外縁の赤境界線（main.ts hre-extent、3px 不透明）と文字が重なっても
 * コントラストを保てるよう、basemap の羊皮紙系の地色と調和する明るい暖色を
 * 半透明で敷く。alpha 200（約 78%）は「白 halo + 背景で文字は確実に読めるが、
 * 下の地物の塗り・境界線の存在も透けて分かる」バランスで、完全不透明にして
 * 領域把握を妨げることを避けた値。
 */
export const LABEL_BACKGROUND_COLOR: LabelColor = [244, 236, 215, 200];

/**
 * ラベル背景パネルの余白（[padding_x, padding_y] px。TASK-54 AC #1）。
 * 文字の際まで背景だと下地の効果が縁の 1px に届かず可読性向上が薄い一方、
 * 大きすぎるとパネル同士が密集地帯で重なって逆効果になるため、
 * 「縁取り（LABEL_OUTLINE_WIDTH = 2px）の外側にわずかな下地が見える」
 * 最小限の値に留める。
 */
export const LABEL_BACKGROUND_PADDING: readonly [number, number] = [3, 2];

/**
 * CollisionFilterExtension の collisionTestProps.sizeScale（TASK-54 案B）。
 * 従来値 2（TASK-20 以来）から 2.6 へ引き上げ、衝突判定領域を実表示より
 * 広く取ることで、ケルン大司教領・ザクセン選帝侯領/公領のような密集地帯で
 * 下位優先のラベルをより積極的に間引く。3 以上にするとズーム 5〜6 の
 * 全体観で中小勢力ラベルが消えすぎるため、密集 3 箇所の判読性とラベル
 * 残存数のバランスを実測（ヘッドレス CDP スクリーンショット）で確認して
 * 決めた値。国名/HRE 領邦・河川・都市の全 3 TextLayer が共有する衝突空間で
 * 共通に使う（priority 設計は不変: 国名の面積 > 都市の人口バンド > 河川の
 * ライン長）。
 */
export const COLLISION_SIZE_SCALE = 2.6;

/** properties から文字列プロパティを取り出す。空文字・非文字列は null */
function stringProp(props: GeoJsonProperties, key: string): string | null {
  const v = props?.[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * 地図上の常時ラベルのテキストを返す（純粋関数）。NAME のみ。
 * NAME が無い（null・空・非文字列）feature は null（ラベルを出さない）。
 *
 * TASK-23: ja（英語 NAME → 日本語名のフラットマップ、name-ja.json）を渡すと
 * 日本語表記を返す。ja に無い NAME は英語のままフォールバックし、省略時
 * （空マップ）は従来どおり NAME を返す。
 */
export function labelTextFor(
  props: GeoJsonProperties,
  ja: Record<string, string> = {},
): string | null {
  const name = stringProp(props, "NAME");
  if (name === null) return null;
  return ja[name] ?? name;
}

/** 外環リングの近似面積（shoelace、座標系の単位²）。閉環前提 */
function ringArea(ring: Position[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  }
  return Math.abs(sum) / 2;
}

/**
 * feature から最大ポリゴン（外環の近似面積が最大）のリング一覧を返す。
 * Polygon はそのまま、MultiPolygon は面積最大の要素を選ぶ。
 * Polygon/MultiPolygon 以外・空・面積 0 の退化形は null。
 */
function largestPolygonRings(feature: Feature): Position[][] | null {
  const geometry = feature.geometry;
  if (geometry === null || geometry === undefined) return null;

  let polygons: Position[][][];
  if (geometry.type === "Polygon") {
    polygons = [geometry.coordinates];
  } else if (geometry.type === "MultiPolygon") {
    polygons = geometry.coordinates;
  } else {
    return null;
  }

  let best: Position[][] | null = null;
  let bestArea = 0;
  for (const rings of polygons) {
    if (rings.length === 0) continue;
    const area = ringArea(rings[0]);
    if (area > bestArea) {
      bestArea = area;
      best = rings;
    }
  }
  return best;
}

/**
 * ラベルのアンカー座標 [lon, lat] を返す（純粋関数）。
 * 最大ポリゴンの pole of inaccessibility（内部で最も境界から遠い点）を
 * polylabel で求めるため、凹形状や飛び地持ちでもラベルが本体の内部に乗る。
 * Polygon/MultiPolygon 以外・空ジオメトリは null。
 */
export function labelAnchorFor(feature: Feature): [number, number] | null {
  const rings = largestPolygonRings(feature);
  if (rings === null) return null;
  const p = polylabel(rings, POLYLABEL_PRECISION);
  return [p[0], p[1]];
}

/**
 * 面積由来のラベル優先度を返す（純粋関数）。大きい勢力ほど高優先で、
 * CollisionFilterExtension の getCollisionPriority に渡す。
 *
 * 対数スケール（100 * log10(面積)）で、欧州の勢力ポリゴン（1e-4〜1e3 deg² 程度)
 * が -400〜300 付近に散らばる単調写像になる。極端値は許容レンジ
 * MIN..MAX_LABEL_PRIORITY（-1000..1000）にクランプし、ポリゴンを持たない
 * feature は最低優先度とする。
 */
export function labelPriorityFor(feature: Feature): number {
  const rings = largestPolygonRings(feature);
  if (rings === null) return MIN_LABEL_PRIORITY;
  const area = ringArea(rings[0]);
  if (area <= 0) return MIN_LABEL_PRIORITY;
  const priority = Math.round(100 * Math.log10(area));
  return Math.min(MAX_LABEL_PRIORITY, Math.max(MIN_LABEL_PRIORITY, priority));
}

/**
 * FeatureCollection を TextLayer 用のラベルデータへ変換する（純粋関数）。
 * NAME が無い・ポリゴンを持たない feature は除外する。
 * TASK-23: ja を渡すと text を日本語表記にする（未登録 NAME は英語のまま）。
 * TASK-30: kind を渡すと全 datum に由来種別を付与する（文字色分け用）。
 * 省略時は kind キー自体を持たない（従来の呼び出しと完全互換）。
 */
export function buildLabelData(
  fc: FeatureCollection,
  ja: Record<string, string> = {},
  kind?: LabelKind,
): LabelDatum[] {
  const data: LabelDatum[] = [];
  for (const feature of fc.features) {
    const text = labelTextFor(feature.properties, ja);
    if (text === null) continue;
    const position = labelAnchorFor(feature);
    if (position === null) continue;
    const datum: LabelDatum = {
      text,
      position,
      priority: labelPriorityFor(feature),
    };
    if (kind !== undefined) datum.kind = kind;
    data.push(datum);
  }
  return data;
}

/**
 * 全ラベルテキストに現れる文字の重複なし配列を返す（純粋関数）。
 * TextLayer の characterSet に渡し、Württemberg の ü などデフォルトの
 * ASCII セットに無い文字もグリフを生成させる。
 */
export function characterSetFrom(texts: readonly string[]): string[] {
  return [...new Set(texts.join(""))];
}
