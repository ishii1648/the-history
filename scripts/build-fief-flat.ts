/**
 * 諸侯領オーバーレイ同士の「二重塗り・微小重なり」を解消した派生データを
 * 生成するパイプライン（TASK-79）。
 *
 * 入力は既存の生成物のみ（ネットワーク不要）:
 * - data/france_fiefs_<year>.geojson（scripts/build-france-fiefs.ts）
 *
 * 出力（year ∈ FIEF_FLAT_YEARS）:
 * - data/france_fiefs_flat_<year>.geojson … 重なりを排他化した諸侯領。
 *   ランタイム（src/powers.ts franceFiefDataUrlFor）はこちらを取得し、
 *   france-fiefs レイヤーの塗り・境界線・ラベル・picking の全てに使う。
 *
 * ## なぜ必要か
 * 諸侯領は 1 枚のレイヤーに半透明（src/powers.ts FILL_ALPHA=128）で描かれる。
 * 親公領に内包される伯領（Alençon ⊂ Normandy）は同じ場所を 2 枚の塗りが覆うため
 * 色が濃くなり、境界線も 2 本走って区画が読めなくなる。OHM の別リレーション
 * 同士の境界不一致による微小重なり（Champagne×Bar 等）も同様に濃い帯を作る。
 *
 * ## 方式（実データの分布に基づく設計判断）
 * 重なりを 2 種に分け、削る側を変える:
 * - 内包（被覆率 >= CONTAINMENT_COVERAGE_THRESHOLD）: 親（面積が大きい側）から
 *   子を difference する。子は輪郭・ラベル・picking をそのまま保ち、階層関係は
 *   「親の輪郭の内側に子の区画がある」という入れ子構造で示す。
 * - スリバー（それ未満の重なり）: 面積が小さい側から削る。境界不一致は
 *   どちらの形も正しくないが、より広い（＝代表的な）側の形を保つ方が
 *   地図の読み取りに与える影響が小さい。
 *
 * ### 代替案「子側を塗りなし＋点線輪郭」との比較（不採用）
 * 内包される子を塗らず点線輪郭だけにすれば二重塗りは同じく消える。しかし
 * (1) 子の塗り色（colors.json の諸侯ごとの決定的な色）が失われ、親と子を
 *     色で識別できなくなる（諸侯領オーバーレイの目的そのものを損なう）、
 * (2) 塗りが無いと deck.gl の GeoJsonLayer は内部を picking しない
 *     （filled=false は fill メッシュを描かない）ため、子のホバー/クリックが
 *     効かなくなる（AC の「子の picking は維持」に反する）、
 * (3) 点線は諸侯領の藍紫実線・base の焦茶実線に次ぐ 3 本目の線種となり、
 *     凡例の複雑さに見合わない、
 * という 3 点で劣る。difference 方式はいずれの副作用も持たず、
 * 「見えている塗りの面積 = その諸侯が単独で支配する面」という素直な意味づけになる。
 *
 * ## 閾値の根拠（1000/1100/1200/1279/1300 の全ペアを実測）
 * 小さい側から見た被覆率は 1.0000（Alençon×Normandy）と 0.0541
 * （Bar×Champagne）の 2 群に完全に分かれ、その間に観測値が無い。
 * CONTAINMENT_COVERAGE_THRESHOLD = 0.9 はこの空隙の中にあり、
 * scripts/build-fief-dedupe.ts が「完全内包」と呼ぶ閾値とも一致する。
 * 非内包の重なりは最大 332 km²（Bar×Champagne）で、SLIVER_AREA_LIMIT_M2
 * （1,000 km²）はその 3 倍。これを超える非内包の重なりは境界不一致では
 * 説明できない規模なので、削りはするが警告を残して人が気付けるようにする。
 *
 * 決定性: 判定は常に入力（元）ジオメトリに対して行い、削りは (削る側 index,
 * 相手 index) の昇順で適用する。feature の並び・properties は入力のまま。
 * 座標は base データと同じ COORD_PRECISION へ丸める。
 */

import area from "@turf/area";
import difference from "@turf/difference";
import { featureCollection } from "@turf/helpers";
import intersect from "@turf/intersect";
import truncate from "@turf/truncate";
import type {
  Feature,
  FeatureCollection,
  MultiPolygon,
  Polygon,
} from "geojson";
import { COORD_PRECISION } from "./build-data.ts";
import { FRANCE_FIEF_YEARS } from "./build-france-fiefs.ts";

/** 生成対象年。諸侯領オーバーレイが存在する年と同一 */
export const FIEF_FLAT_YEARS: readonly number[] = FRANCE_FIEF_YEARS;

/**
 * 内包と判定する被覆率（小さい側の面積に対する重なりの割合）の下限。
 * 実測値は 1.0000 と 0.0541 に二分され、その間に観測値は無い。
 */
export const CONTAINMENT_COVERAGE_THRESHOLD = 0.9;

/**
 * 処理対象にする重なり面積の下限（m²）。1,000 m²（0.001 km²）未満は
 * 座標丸め（COORD_PRECISION=5 ≒ 1m）由来のノイズとみなして無視する。
 * 実測の最小重なりは Artois×Flanders の 0.01 km²（= 10,000 m²）で、
 * 実データの重なりは全てこの下限を超える。
 */
export const MIN_OVERLAP_AREA_M2 = 1_000;

/** スリバーとして黙って削れる重なり面積の上限（m²）。実測最大 332 km² の約 3 倍 */
export const SLIVER_AREA_LIMIT_M2 = 1_000e6;

/** 重なりの種別。none は処理対象外 */
export type OverlapKind = "containment" | "sliver" | "none";

/** ポリゴン系ジオメトリを持つ feature */
type PolygonalFeature = Feature<Polygon | MultiPolygon>;

/** feature がポリゴン系ジオメトリを持つか */
function isPolygonal(feature: Feature): feature is PolygonalFeature {
  const type = feature.geometry?.type;
  return type === "Polygon" || type === "MultiPolygon";
}

/** properties.NAME を取り出す。空文字・非文字列は "(no name)" */
function nameOf(feature: Feature): string {
  const value = feature.properties?.NAME;
  return typeof value === "string" && value !== "" ? value : "(no name)";
}

/**
 * 重なり面積と「小さい側の面積」から重なりの種別を決める（純粋関数）。
 * 被覆率は必ず小さい側を分母に取る: 大きい側を分母にすると内包でも比が
 * 小さくなり（Alençon ⊂ Normandy は 0.06）判定できない。
 */
export function classifyOverlap(
  overlapArea: number,
  smallerArea: number,
): OverlapKind {
  if (!(overlapArea >= MIN_OVERLAP_AREA_M2)) return "none";
  if (smallerArea <= 0) return "none";
  return overlapArea / smallerArea >= CONTAINMENT_COVERAGE_THRESHOLD
    ? "containment"
    : "sliver";
}

/** 検出した重なり 1 件（どちらを削るかまで決まっている） */
export interface OverlapPair {
  /** 削る側の feature index（入力配列内） */
  cutIndex: number;
  /** 形を保つ側の feature index */
  keepIndex: number;
  /** 削る側の NAME */
  cutName: string;
  /** 形を保つ側の NAME */
  keepName: string;
  kind: "containment" | "sliver";
  /** 重なりの測地面積（m²） */
  overlapArea: number;
  /** 面積が小さい側から見た被覆率（0..1） */
  coverageOfSmaller: number;
}

/**
 * feature 群の全ペアから処理対象の重なりを列挙する（純粋関数）。
 * 判定は入力ジオメトリのみに依存し、削りの適用順に影響されない。
 * 返り値は (cutIndex, keepIndex) の昇順で決定的。
 */
export function overlapsOf(
  features: readonly Feature[],
  warnFn: (message: string) => void = console.warn,
): OverlapPair[] {
  const pairs: OverlapPair[] = [];
  const areas = features.map((f) => (isPolygonal(f) ? area(f) : 0));
  for (let i = 0; i < features.length; i++) {
    if (!isPolygonal(features[i])) continue;
    for (let j = i + 1; j < features.length; j++) {
      if (!isPolygonal(features[j])) continue;
      let overlap: Feature<Polygon | MultiPolygon> | null;
      try {
        overlap = intersect(
          featureCollection([
            features[i] as PolygonalFeature,
            features[j] as PolygonalFeature,
          ]),
        );
      } catch (error) {
        // 交差計算に失敗したペアは「重なり無し」として続行する
        // （生成を失敗させない: build-fief-dedupe.ts と同方針）
        warnFn(
          `${nameOf(features[i])} と ${
            nameOf(features[j])
          } の交差計算に失敗しました: ${String(error)}`,
        );
        continue;
      }
      if (overlap === null) continue;
      const overlapArea = area(overlap);
      const smallerIndex = areas[i] <= areas[j] ? i : j;
      const largerIndex = smallerIndex === i ? j : i;
      const kind = classifyOverlap(overlapArea, areas[smallerIndex]);
      if (kind === "none") continue;
      // 内包は親（大きい側）を削り、子の形を丸ごと残す。
      // スリバーは小さい側を削り、より広い側の形を保つ。
      const cutIndex = kind === "containment" ? largerIndex : smallerIndex;
      const keepIndex = cutIndex === i ? j : i;
      if (kind === "sliver" && overlapArea > SLIVER_AREA_LIMIT_M2) {
        warnFn(
          `${nameOf(features[i])} と ${nameOf(features[j])} の重なり ${
            (overlapArea / 1e6).toFixed(1)
          } km² は内包でもスリバーの想定規模でもありません（${
            nameOf(features[cutIndex])
          } を削りますが元データの確認が必要です）`,
        );
      }
      pairs.push({
        cutIndex,
        keepIndex,
        cutName: nameOf(features[cutIndex]),
        keepName: nameOf(features[keepIndex]),
        kind,
        overlapArea,
        coverageOfSmaller: overlapArea / areas[smallerIndex],
      });
    }
  }
  pairs.sort((a, b) => a.cutIndex - b.cutIndex || a.keepIndex - b.keepIndex);
  return pairs;
}

/** 解消結果 1 件（レポート・メタデータ用の表示形） */
export interface OverlapResolution {
  kind: "containment" | "sliver";
  /** 削られた諸侯領の NAME */
  cutName: string;
  /** 形を保った諸侯領の NAME */
  keptName: string;
  /** 重なりの面積（km²、小数 2 桁） */
  overlapKm2: number;
  /** 面積が小さい側から見た被覆率（0..1、小数 4 桁） */
  coverageOfSmaller: number;
}

/** resolveOverlaps の結果 */
export interface ResolvedOverlaps {
  fc: FeatureCollection;
  resolutions: OverlapResolution[];
}

/**
 * 諸侯領同士の重なりを排他化した FeatureCollection を返す（純粋関数）。
 * - feature の並び・properties・非ポリゴン feature はそのまま保つ
 * - 削る側だけジオメトリを差し替える（相手の元ジオメトリで difference）
 * - difference が null（削った結果が消滅）になる場合は元のまま残して警告する
 *   （面が消えるより二重塗りが残る方が安全）
 * 座標は COORD_PRECISION へ丸める（新しくできる交点の桁が伸びるため）。
 */
export function resolveOverlaps(
  fc: FeatureCollection,
  warnFn: (message: string) => void = console.warn,
): ResolvedOverlaps {
  const original = fc.features;
  const pairs = overlapsOf(original, warnFn);
  const geometries = original.map((f) => f.geometry);
  for (const pair of pairs) {
    const target = original[pair.cutIndex];
    const current: PolygonalFeature = {
      ...target,
      geometry: geometries[pair.cutIndex] as Polygon | MultiPolygon,
    };
    let cut: Feature<Polygon | MultiPolygon> | null;
    try {
      cut = difference(
        featureCollection([
          current,
          original[pair.keepIndex] as PolygonalFeature,
        ]),
      );
    } catch (error) {
      warnFn(
        `${pair.cutName} から ${pair.keepName} を差し引けませんでした: ${
          String(error)
        }`,
      );
      continue;
    }
    if (cut === null) {
      warnFn(
        `${pair.cutName} は ${pair.keepName} を差し引くと消滅するため元のまま残します`,
      );
      continue;
    }
    geometries[pair.cutIndex] = cut.geometry;
  }
  const features = original.map((feature, index) =>
    geometries[index] === feature.geometry
      ? feature
      : { ...feature, geometry: geometries[index] }
  );
  const truncated = truncate(
    { type: "FeatureCollection", features } as FeatureCollection,
    { precision: COORD_PRECISION, coordinates: 2 },
  );
  return {
    fc: truncated,
    resolutions: pairs.map((pair) => ({
      kind: pair.kind,
      cutName: pair.cutName,
      keptName: pair.keepName,
      overlapKm2: Number((pair.overlapArea / 1e6).toFixed(2)),
      coverageOfSmaller: Number(pair.coverageOfSmaller.toFixed(4)),
    })),
  };
}

/** 入力（build-france-fiefs.ts の生成物）のパス */
export function rawPathFor(year: number): string {
  return `data/france_fiefs_${year}.geojson`;
}

/** 出力（重なり解消済み）のパス */
export function flatPathFor(year: number): string {
  return `data/france_fiefs_flat_${year}.geojson`;
}

/** france_fiefs_flat_<year>.geojson に埋め込むメタデータ */
export interface FiefFlatMetadata {
  generatedBy: string;
  /** 入力ファイルのパス */
  input: string;
  year: number;
  containmentCoverageThreshold: number;
  minOverlapAreaM2: number;
  sliverAreaLimitM2: number;
  /** 解消した重なりの一覧（削る側 → 相手の feature 並び順で決定的） */
  resolutions: OverlapResolution[];
}

async function main(): Promise<void> {
  for (const year of FIEF_FLAT_YEARS) {
    const raw = JSON.parse(
      await Deno.readTextFile(rawPathFor(year)),
    ) as FeatureCollection;
    const { fc, resolutions } = resolveOverlaps(raw);
    const metadata: FiefFlatMetadata = {
      generatedBy: "scripts/build-fief-flat.ts",
      input: rawPathFor(year),
      year,
      containmentCoverageThreshold: CONTAINMENT_COVERAGE_THRESHOLD,
      minOverlapAreaM2: MIN_OVERLAP_AREA_M2,
      sliverAreaLimitM2: SLIVER_AREA_LIMIT_M2,
      resolutions,
    };
    const outPath = flatPathFor(year);
    const json = JSON.stringify({ ...fc, metadata });
    await Deno.writeTextFile(outPath, json);
    console.log(
      `${outPath}: ${json.length} bytes, features=${fc.features.length}, 解消=${resolutions.length} 件`,
    );
    for (const r of resolutions) {
      console.log(
        `  ${
          r.kind === "containment" ? "内包  " : "スリバー"
        } ${r.cutName} -= ${r.keptName} (${r.overlapKm2} km², 被覆率 ${r.coverageOfSmaller})`,
      );
    }
  }
}

if (import.meta.main) {
  await main();
}
