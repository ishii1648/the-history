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
import { labelAnchorFor, type LabelColor, type LabelDatum } from "./labels.ts";
import { MAX_ZOOM, MIN_ZOOM } from "./config.ts";

/** 主要山脈 GeoJSON の配信 URL（scripts/build.ts のコピー先と一致させる契約） */
export const MOUNTAINS_DATA_URL = "/data/mountains.geojson";

/**
 * 山脈の透明ヒット層（ScatterplotLayer）のレイヤー ID（TASK-100）。
 * cities-hit（TASK-82）・rivers-hit（TASK-43）と同型の「見た目に出さない
 * 判定専用レイヤー」で、picking の優先順は picking.ts の PICKING_PRIORITY が決める。
 *
 * **判定対象を massif ポリゴンそのものにしない**という設計判断（AC #1/#3）:
 * 山脈ポリゴンは広大（アルプスだけでスイス・オーストリア・北イタリアを覆う）で、
 * これを勢力ポリゴンより上の pickable 層にすると、その領域では勢力を一切
 * クリックできなくなる（AC #3 に真正面から反する）。逆に勢力より下へ置くと、
 * 陸上はほぼ全面が勢力ポリゴンに覆われているため直下 pick が常に勢力を返し、
 * 山脈は**一度も拾えない**（優先順で下に置くことは「拾えない」と同義）。
 * つまり「面をそのまま判定に使う」選択肢は AC #1 と AC #3 のどちらかを必ず壊す。
 *
 * そこで判定対象を「山脈ラベルのアンカー（labels.ts labelAnchorFor =
 * 山体内部で最も境界から遠い点）を中心とする固定 px の円」に絞る。地図上で
 * 山脈名が書かれている場所がそのまま当たり判定になるので操作の予測が付き、
 * 勢力の picking を奪う面積は山脈 1 件あたり半径 MOUNTAIN_HIT_RADIUS_PX の円
 * （実データで全 17 件）に限定される。範囲そのものは強調表示（輪郭、
 * MOUNTAIN_OUTLINE_LAYER_ID）でホバー時に可視化するため、情報は失われない。
 */
export const MOUNTAIN_HIT_LAYER_ID = "mountains-hit";

/**
 * 山脈の判定円の半径（px）（TASK-100）。
 *
 * 18px を採る根拠:
 * - 都市の判定円（cities.ts CITY_HIT_RADIUS_PX = 9px）より広く取る。都市は
 *   常時可視のドット（3px + 白 stroke）という「狙う的」があるが、山脈には
 *   常時可視の点記号が無く、狙えるのは山脈名ラベルだけ。ラベルは
 *   CollisionFilterExtension で間引かれることもあるため、的を都市と同じ
 *   大きさにすると「どこを指せばよいか分からない」操作になる。
 * - 山脈名ラベルの字高（labels.ts MOUNTAIN_LABEL_SIZE_PX = 12px）は
 *   アンカーを中心に上下 ±6px なので、18px はラベルの高さ方向を完全に覆い、
 *   横方向はラベル中央部の 3 文字前後を覆う。
 * - 上げすぎない理由: この円の内側だけは勢力・領邦の picking が山脈に
 *   奪われる（AC #3 のコスト）。実データは 17 件なので 18px でも画面に対する
 *   占有はごく小さいが、これ以上広げると密集する帝国諸領邦のクリックを
 *   目に見えて妨げ始める。
 */
export const MOUNTAIN_HIT_RADIUS_PX = 18;

/**
 * 山脈の判定円の塗り色。完全透明（alpha 0）で見た目には一切出さない
 * （cities.ts CITY_HIT_FILL_COLOR・rivers.ts RIVER_HIT_LINE_COLOR と同型）。
 * deck.gl の picking は表示色の alpha ではなく picking color の有効性で
 * 判定するため、alpha 0 でも直下 pick は成立する（cities-hit で実証済み）。
 */
export const MOUNTAIN_HIT_FILL_COLOR: LabelColor = [0, 0, 0, 0];

/** 山脈の強調輪郭（GeoJsonLayer）のレイヤー ID（TASK-100。pickable: false） */
export const MOUNTAIN_OUTLINE_LAYER_ID = "mountain-outline";

/**
 * 山岳（山脈の輪郭・山峰マーカー）の強調色（オリーブ #5F7A1E、alpha 235）
 * （TASK-100 AC #4）。
 *
 * 形の選択（塗りではなく輪郭）: 山脈は面だが、アクティブ塗りにすると
 * 勢力・領邦のアクティブ塗り（power_highlight.ts ACTIVE_FILL_COLOR）と
 * 「半透明の面が色を変える」という同じ表現になり、同時に出たときに
 * どちらが何を指しているのか読めない。輪郭だけにすれば「面の塗り = 勢力」
 * 「線で囲う = 山岳の範囲」と表現の種類そのもので区別できる。
 * 山峰は点なので記号（▲）の色とサイズで同じ強調色を共有する。
 *
 * 色の選定: 既存 4 種の強調色と色相環で 60 度以上離す（AC #4。判定基準は
 * power_highlight.ts ACTIVE_FILL_COLOR と同じで、単体テストで固定する）。
 * 既存の色相は HRE 外縁の臙脂 0 度・勢力アクティブの緑青 167 度・河川強調の
 * 青灰 200 度・諸侯領境界の藍紫 262 度で、空いている帯は 40〜100 度と
 * 280〜340 度。後者（マゼンタ〜ピンク）は諸侯領の藍紫に寄るうえ、
 * 羊皮紙トーン（TASK-73/74 の褪せ顔料方針）から浮く。前者の中で
 * HRE の臙脂から十分離れる位置として色相 78 度のオリーブを採る
 * （臙脂 78 度・緑青 89 度・青灰 122 度・藍紫 176 度の差）。
 * オリーブ（緑土＝テール・ヴェルトの黄寄り）は古地図の彩色にある土性顔料で、
 * 山脈名ラベルの苔緑（labels.ts MOUNTAIN_LABEL_COLOR、色相 139 度）と
 * 同じ「地形の色」の系統に属しつつ、通常時とは一目で区別できる。
 */
export const MOUNTAIN_HIGHLIGHT_COLOR: LabelColor = [95, 122, 30, 235];

/** 非強調時の山脈輪郭の色（完全透明 = 通常表示では線を出さない） */
export const MOUNTAIN_OUTLINE_HIDDEN_COLOR: LabelColor = [0, 0, 0, 0];

/**
 * 選択中（クリック）の山脈輪郭の線幅（px）。ホバーより太くして
 * 「選択 > ホバー > 通常」の 3 段を作る（rivers.ts の線幅設計と同じ考え方。
 * 色は 2 値のままにして、段階は幅だけで表す）。
 */
export const MOUNTAIN_SELECTED_OUTLINE_WIDTH_PX = 4;

/** ホバー中の山脈輪郭の線幅（px） */
export const MOUNTAIN_HOVERED_OUTLINE_WIDTH_PX = 3;

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
      text: mountainDisplayName(name, ja),
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

/**
 * 山脈の判定円層（MOUNTAIN_HIT_LAYER_ID）に渡すデータを返す（TASK-100 AC #1）。
 *
 * ラベル層と**同一の絞り込み**であることを実装と単体テストで固定するための
 * 薄い委譲。判定層に独自のズーム条件を持たせると「名前が出ていない山脈が
 * 拾える／出ているのに拾えない」という食い違いが生まれ、しかもそれは
 * ラベル側を直すと静かに壊れる。ここを経由させることで、ズーム出し分けの
 * 変更が常に両方へ同時に効く。
 */
export function mountainHitData(
  anchors: readonly MountainLabelDatum[],
  zoom: number,
): MountainLabelDatum[] {
  return filterVisibleMountainLabels(anchors, zoom);
}

/**
 * 山脈の表示名を返す（純粋関数）。decision-6 に従いデータは英語名のままで、
 * 表示時に name-ja.json（英語名 → 日本語名）を引く。未登録は英語のまま
 * （peaks.ts peakDisplayName と同型）。
 */
export function mountainDisplayName(
  name: string,
  ja: Record<string, string> = {},
): string {
  return ja[name] ?? name;
}

/**
 * ホバーのツールチップ・クリックの情報パネルへ出す山脈のラベルを返す
 * （純粋関数、TASK-100 AC #1/#6）。
 *
 * 出す情報は**名称のみ**。山脈は面なので「標高」は 1 つに定まらず（アルプスの
 * 最高点はモンブランだが、それは山峰側が持つ情報）、Natural Earth の
 * 山脈ポリゴンも標高属性を持たない。SCALERANK / MIN_LABEL は描画制御の
 * 内部値でユーザーに意味が無い。
 *
 * 引数に年を取らないことが、そのまま「年代を切り替えても内容が変わらない」
 * （AC #5）の担保になっている。山脈は年代非依存の地形で、データ
 * （mountains.geojson）も年代スナップショットとは独立した 1 ファイル。
 */
export function mountainPickLabel(
  d: { name: string },
  ja: Record<string, string>,
): string {
  return mountainDisplayName(d.name, ja);
}

/**
 * クリックによる山脈選択の遷移（純粋関数）。rivers.ts toggleRiverSelection /
 * power_highlight.ts togglePowerSelection と同一規則にし、「クリックの意味」を
 * 河川・勢力・山岳で揃える（TASK-100 AC #4）。
 * - 選択中と同じ山脈を再クリック → 解除
 * - 別の山脈をクリック → その山脈へ移動
 * - 山脈以外のクリック（clickedName が null）→ 解除
 */
export function toggleMountainSelection(
  current: string | null,
  clickedName: string | null,
): string | null {
  if (clickedName === null) return null;
  return current === clickedName ? null : clickedName;
}

/**
 * 山脈が強調状態（選択中またはホバー中）かを判定する（純粋関数）。
 * power_highlight.ts isPowerActive と同じく選択とホバーを OR で扱い、
 * 名前を持たない feature（key が null）は決して強調しない。
 */
export function isMountainActive(
  name: string | null,
  selected: string | null,
  hovered: string | null,
): boolean {
  if (name === null) return false;
  return name === selected || name === hovered;
}

/**
 * 山脈の輪郭色を決める（純粋関数、TASK-100 AC #4）。
 * 強調時のみオリーブの線を出し、通常時は完全透明にする。輪郭を常時表示に
 * しないのは、山脈は年代に依らない地形の注記であり、常に線で囲うと勢力の
 * 境界線（概略境界）・領邦境界と線種が競合して政治地図が読みにくくなるため。
 */
export function mountainOutlineColor(
  props: GeoJsonProperties,
  selected: string | null,
  hovered: string | null,
): LabelColor {
  return isMountainActive(mountainNameFor(props), selected, hovered)
    ? MOUNTAIN_HIGHLIGHT_COLOR
    : MOUNTAIN_OUTLINE_HIDDEN_COLOR;
}

/**
 * 山脈の輪郭の線幅（px）を決める（純粋関数、TASK-100 AC #4）。
 * 選択 > ホバー > 通常（0）の 3 段で、色は 2 値のまま幅だけで段階を付ける
 * （rivers.ts riverLineWidth と同じ設計）。通常時に 0 を返すのは、完全透明でも
 * 太い線があると deck.gl が無駄な頂点を持つため。
 */
export function mountainOutlineWidth(
  props: GeoJsonProperties,
  selected: string | null,
  hovered: string | null,
): number {
  const name = mountainNameFor(props);
  if (name !== null && name === selected) {
    return MOUNTAIN_SELECTED_OUTLINE_WIDTH_PX;
  }
  if (name !== null && name === hovered) {
    return MOUNTAIN_HOVERED_OUTLINE_WIDTH_PX;
  }
  return 0;
}
