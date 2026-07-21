/**
 * 神聖ローマ帝国（HRE）の域内範囲強調の DOM/deck.gl 非依存な純粋ロジック
 * （TASK-30）。
 * - HRE 本体・域内領邦の判定（isHreFeature）
 * - base FeatureCollection からの帝国範囲（本体ポリゴン）の抽出（extractHreExtent）
 * - picking 結果から強調表示すべきかの判定（shouldHighlightHre）
 *
 * HRE は base データ（europe_*）に NAME=Holy Roman Empire の単一（年代によっては
 * 複数）ポリゴンとして常に存在し、領邦オーバーレイ年代（hre_*）では
 * SUBJECTO=Holy Roman Empire の領邦がその上に重なる。帝国「全体の範囲」は
 * 常に base 側の本体ポリゴンから取れるため、強調レイヤーのデータ源は base に
 * 一本化する（オーバーレイの有無に依らず AC #2/#4 を同じ経路で満たす）。
 */

import type { FeatureCollection, GeoJsonProperties } from "geojson";
import { HRE_LAYER_ID, POWER_LAYER_ID } from "./picking.ts";

/** データ上の神聖ローマ帝国の正規化名（NAME / renames 正規化後の SUBJECTO） */
export const HRE_NAME = "Holy Roman Empire";

/** properties から文字列プロパティを取り出す。空文字・非文字列は null */
function stringProp(props: GeoJsonProperties, key: string): string | null {
  const v = props?.[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * feature が HRE 本体または域内領邦かを判定する（純粋関数）。
 * - NAME が Holy Roman Empire（本体）
 * - または SUBJECTO（name-overrides.json の renames で正規化後）が
 *   Holy Roman Empire（域内の領邦・従属勢力）
 * のとき true。properties 欠落・無関係な勢力は false。
 * SUBJECTO の正規化は info.ts displayLabel と同じ規約（renames 適用）に揃える。
 */
export function isHreFeature(
  props: GeoJsonProperties,
  renames: Record<string, string>,
): boolean {
  if (stringProp(props, "NAME") === HRE_NAME) return true;
  const rawSubjecto = stringProp(props, "SUBJECTO");
  if (rawSubjecto === null) return false;
  return (renames[rawSubjecto] ?? rawSubjecto) === HRE_NAME;
}

/**
 * base FeatureCollection から帝国範囲（NAME=Holy Roman Empire の本体
 * ポリゴン）だけを抜き出した FeatureCollection を返す（純粋関数）。
 * SUBJECTO=HRE の従属勢力は本体の範囲外（別領土）なので含めない。
 * 該当 feature が無ければ空の FeatureCollection。
 */
export function extractHreExtent(fc: FeatureCollection): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: fc.features.filter(
      (f) => stringProp(f.properties, "NAME") === HRE_NAME,
    ),
  };
}

/**
 * picking 結果から帝国範囲を強調表示すべきかを判定する（純粋関数）。
 * - hre-powers レイヤー: 領邦オーバーレイは全 feature が域内なので常に true
 * - powers レイヤー: isHreFeature（HRE 本体・SUBJECTO=HRE の従属勢力）なら true
 * - それ以外（都市・河川・picking なし = layerId undefined）は false
 *
 * レイヤー ID を先に判定するため、都市マーカーのように GeoJSON Feature で
 * ない picking 結果（props が取れない）でも安全に false を返せる。
 */
export function shouldHighlightHre(
  pickedLayerId: string | undefined,
  pickedProps: GeoJsonProperties | undefined,
  renames: Record<string, string>,
): boolean {
  if (pickedLayerId === HRE_LAYER_ID) return true;
  if (pickedLayerId === POWER_LAYER_ID) {
    return isHreFeature(pickedProps ?? null, renames);
  }
  return false;
}
