/**
 * 主要山脈ラベルの DOM/deck.gl 非依存な純粋ロジック（TASK-97）。
 * - 山脈ポリゴンからラベルのアンカー座標・表示テキストを組み立てる
 * - Natural Earth の MIN_LABEL をアプリのズーム段へ写す（ズーム別の出し分け）
 * - CollisionFilterExtension 用の SCALERANK 由来の優先度を決める
 *
 * データ（data/mountains.geojson）は scripts/build-mountains.ts の生成物で、
 * 山脈は全年代で同一の地形なので年代非依存の 1 ファイル（河川と同じ扱い）。
 * 取得失敗・未生成時は main.ts が warn + 空データで「山脈ラベルなし」のまま
 * 継続する契約（colors.json 等と同じ縮退方針）。
 */

import type { Feature, FeatureCollection, GeoJsonProperties } from "geojson";
import { labelAnchorFor, type LabelDatum } from "./labels.ts";
import { MAX_ZOOM, MIN_ZOOM } from "./config.ts";

/** 主要山脈 GeoJSON の配信 URL（scripts/build.ts のコピー先と一致させる契約） */
export const MOUNTAINS_DATA_URL = "/data/mountains.geojson";

/**
 * 山脈ラベル priority の上限（SCALERANK 1 = アルプス・ウラル・コーカサス）。
 *
 * 設計根拠（AC #1/#3。TASK-38 / TASK-54 の衝突設計の続き）: 同一衝突空間の
 * 既存の帯は、勢力名が面積由来 100*log10(deg²) で実測 -400〜300、都市名が
 * 人口由来の固定帯 150〜220（cities.ts）。山脈は「動かない地形の注記」で
 * 主題（年代ごとに変わる勢力・都市）ではないため、都市帯より下に置いて
 * 都市名・大国名（面積 10 deg² 超 = priority 100 超。フランス・神聖ローマ
 * 帝国など）には譲らせる。
 *
 * 一方で下限を 80 に取り、公領・伯領規模の勢力名（アルプス周辺の帝国諸領邦は
 * 面積 1〜6 deg² = priority 0〜78）よりは優先する。最初に 0〜60 の帯で実装して
 * ヘッドレス実機で確認したところ、初期表示（z4）で生き残る山脈ラベルが
 * コーカサス・アペニンの 2 件だけになり、AC #1 の 5 山脈が 1 つも出ない
 * 「常時表示なのに常に見えない」状態になった。地形の注記は主題に譲るという
 * 方針は保ちつつ、密集地帯の小領邦に完全に負けない水準として 80〜140 を採る。
 */
export const MOUNTAIN_LABEL_PRIORITY_MAX = 140;

/** 山脈ラベル priority の下限（SCALERANK 欠損・4 以上の副次的な山脈） */
export const MOUNTAIN_LABEL_PRIORITY_MIN = 80;

/** SCALERANK が 1 段下がるごとに priority を下げる幅（帯を 4 段に割る） */
export const MOUNTAIN_LABEL_PRIORITY_STEP = 20;

/**
 * 山脈ラベル 1 件分のデータ。
 * text は日本語化され得るため、後続タスク（TASK-100 のホバー/クリック）の
 * 突合キーとして元の英語名を name に保持する（rivers.ts RiverLabelDatum と同型）。
 */
export interface MountainLabelDatum extends LabelDatum {
  /** 山脈の元名（properties.name、英語）。日本語表記の引き元・突合キー */
  name: string;
  /** このラベルを表示し始めるズーム段（整数。mountainLabelMinZoom） */
  minZoom: number;
}

/** properties から山脈名（name）を取り出す。欠落・空文字・非文字列は null */
export function mountainNameFor(props: GeoJsonProperties): string | null {
  const v = props?.name;
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * Natural Earth の MIN_LABEL（そのラベルを出し始める地図スケール）を、この
 * アプリのズーム段（整数、MIN_ZOOM..MAX_ZOOM）へ写す純粋関数（AC #2）。
 *
 * - 切り上げ: MIN_LABEL 5.3 の山脈は z5 では NE 自身が「まだ早い」と判断して
 *   いる値なので z6 から出す（切り捨てると広域表示で潰れる側に倒れる）。
 * - クランプ: アプリのズームは MIN_ZOOM=4〜MAX_ZOOM=8。MIN_LABEL 2 の
 *   アルプス・ウラル・コーカサスは初期表示（z4）から出す。8 を超える値は
 *   最大ズームでのみ出す。
 * - 欠損・非数値は最大ズーム（最も保守的 = 広域では出さない）に倒す。
 */
export function mountainLabelMinZoom(minLabel: unknown): number {
  if (typeof minLabel !== "number" || !Number.isFinite(minLabel)) {
    return MAX_ZOOM;
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.ceil(minLabel)));
}

/**
 * SCALERANK 由来のラベル優先度を返す純粋関数。値が小さい（= NE がより主要と
 * 判定した）山脈ほど高優先。帯の設計は MOUNTAIN_LABEL_PRIORITY_MAX を参照。
 * 欠損・非数値は下限（他の山脈に譲る）。
 */
export function mountainLabelPriority(scalerank: unknown): number {
  if (typeof scalerank !== "number" || !Number.isFinite(scalerank)) {
    return MOUNTAIN_LABEL_PRIORITY_MIN;
  }
  const priority = MOUNTAIN_LABEL_PRIORITY_MAX -
    (scalerank - 1) * MOUNTAIN_LABEL_PRIORITY_STEP;
  return Math.min(
    MOUNTAIN_LABEL_PRIORITY_MAX,
    Math.max(MOUNTAIN_LABEL_PRIORITY_MIN, priority),
  );
}

/**
 * FeatureCollection から山脈ラベルのアンカーデータを組み立てる（純粋関数）。
 * - name を持つポリゴン feature ごとに 1 件
 * - position は最大ポリゴンの pole of inaccessibility（labels.ts labelAnchorFor）
 * - ja（name-ja.json、英語名 → 日本語名）を渡すと text を日本語化。未登録は英語のまま
 *
 * アンカー方式に polylabel（勢力ラベルと共通の labelAnchorFor）を選んだ理由:
 * 山脈は細長く、カルパティア・ポントスのように弓なりに曲がる形状がある。
 * 生成物 data/mountains.geojson の全 17 件で重心（@turf/centroid）と比べた
 * ところ、この 2 件は重心がポリゴンの外 — カルパティアならハンガリー平原、
 * ポントスなら黒海側 — に落ち、陰影の載っていない場所にラベルが立つ。
 * 外に出ない山脈でも重心はアトラスで 5.9 度、スカンディナヴィアで 3.4 度、
 * ウラル・コーカサスで 2.3〜2.5 度ずれる。
 * 河川ラベル方式（rivers.ts の「最長ラインの中点」）は面データにそのままは
 * 適用できず、外環に沿った中点を採ると境界線上（= 山麓）に立つ。
 * polylabel は「内部で最も境界から遠い点」なので、曲がった細長い面でも必ず
 * 山体の中に、かつ最も幅の広い部分に乗る（AC #8 の陰影との位置一致）。
 */
export function mountainLabelAnchors(
  fc: FeatureCollection,
  ja: Record<string, string> = {},
): MountainLabelDatum[] {
  const data: MountainLabelDatum[] = [];
  for (const feature of fc.features) {
    const name = mountainNameFor(feature.properties);
    if (name === null) continue;
    const position = labelAnchorFor(feature as Feature);
    if (position === null) continue;
    data.push({
      name,
      text: ja[name] ?? name,
      position,
      priority: mountainLabelPriority(feature.properties?.scalerank),
      minZoom: mountainLabelMinZoom(feature.properties?.min_label),
    });
  }
  return data;
}

/**
 * 現在のズームで表示する山脈ラベルを選び出す純粋関数（AC #2）。
 * 判定は整数ズーム段（Math.floor）で行い、都市のズーム別表示
 * （cities.ts visibleCityRankLimit）と同じ粒度に揃える。呼び出し側
 * （main.ts）も整数段が変わった時だけレイヤーを作り直す。
 *
 * アンカーは再計算せず、渡された datum の参照をそのまま返す（main.ts 側の
 * メモ化を無効化しないための契約）。入力配列は破壊しない。
 * 非有限のズーム（防御）は最遠段（MIN_ZOOM）として扱う。
 */
export function filterVisibleMountainLabels(
  anchors: readonly MountainLabelDatum[],
  zoom: number,
): MountainLabelDatum[] {
  const step = Number.isFinite(zoom) ? Math.floor(zoom) : MIN_ZOOM;
  return anchors.filter((a) => step >= a.minZoom);
}
