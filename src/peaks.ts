/**
 * 主要山峰マーカー/ラベルの DOM/deck.gl 非依存な純粋ロジック（TASK-99）。
 * - peaks.geojson（Point の FeatureCollection）の検証付き変換
 * - マーカー用データ・ラベル用データへの変換
 * - SCALERANK からのズーム出し分けと、CollisionFilterExtension 用の優先度
 *
 * 構造は都市（cities.ts）と同型（「点の記号 + ラベル」で、entries を作って
 * ズームで絞り、マーカー用・ラベル用へ分ける）。年代非依存で起動時に 1 度
 * だけロードする点は山脈（mountains.ts）・河川と同型で、山峰は全年代で同一の
 * 地形なので年代スナップショットとは独立した 1 ファイルにする（AC #5）。
 *
 * data/peaks.geojson は scripts/build-peaks.ts の生成物で、取得失敗・未生成時は
 * main.ts が warn + 空データで「山峰なし」のまま継続する契約
 * （colors.json・河川・山脈と同じ縮退方針）。
 */

import type { FeatureCollection, GeoJsonProperties } from "geojson";
import type { LabelColor, LabelDatum } from "./labels.ts";
import { MAX_ZOOM, MIN_ZOOM } from "./config.ts";

/** 主要山峰 GeoJSON の配信 URL（scripts/build.ts のコピー先と一致させる契約） */
export const PEAKS_DATA_URL = "/data/peaks.geojson";

/** 山峰マーカー（ScatterplotLayer ではない。理由は PEAK_MARKER_GLYPH）のレイヤー ID */
export const PEAK_LAYER_ID = "peaks";

/**
 * 山峰マーカーの記号（AC #2）。都市マーカーは半径 3px の丸ドット
 * （cities.ts CITY_MARKER_RADIUS_PX + 白 stroke）なので、山峰は**形**で
 * 区別する。色だけの区別にしないのは、勢力の半透明塗り・陰影（TASK-98）の
 * 上では色相の判別が弱まるため。三角は地形図の山記号として最も素直。
 *
 * 実現手段に TextLayer のグリフを選んだ根拠（他の選択肢との比較）:
 * - ScatterplotLayer は丸しか描けない（形で区別できない）。
 * - IconLayer は data URI の SVG/PNG を渡せるが、アイコン画像のデコードが
 *   非同期で、失敗しても静かにマーカーが消える経路が増える。バンドルにも
 *   新しいレイヤークラス（@deck.gl/layers IconLayer）と画像データが乗る。
 * - PolygonLayer は座標が世界座標なので「ズームに追従しない固定 px の三角」を
 *   作れない（都市ドットの radiusUnits: "pixels" に相当する指定が無い）。
 * - TextLayer は既に 4 層で使っており（バンドル増分ゼロ）、sizeUnits: "pixels"
 *   で固定 px、SDF の outline（labels.ts labelTextStyleProps）でラベルと同じ
 *   クリーム halo を縁取りとして得られる。グリフが無いフォントでも
 *   LABEL_FONT_FAMILY の総称フォールバックが描く。
 * マーカー層には CollisionFilterExtension を付けない（間引き対象はラベルだけ）。
 * ラベルが衝突で消えても記号は残り、位置の情報は失われない。
 */
export const PEAK_MARKER_GLYPH = "▲";

/**
 * 山峰マーカーの字形サイズ（px）。国土に対する「点」の記号なので、都市ドットと
 * 同じくズームには追従させない（sizeUnits: "pixels"）。
 *
 * 11px の根拠: ▲（U+25B2）の字形は em 幅のおおよそ 0.8 倍なので、実効の一辺は
 * 9px 前後。都市ドットの直径（CITY_MARKER_RADIUS_PX * 2 = 6px + 白 stroke）
 * よりわずかに大きく、密集するアルプス周辺でも塊にならない範囲に収める。
 * これ以上大きくすると陰影の山体より記号が主張してしまう。
 */
export const PEAK_MARKER_SIZE_PX = 11;

/**
 * 山峰マーカーの色。ラベルと同じ苔緑系（labels.ts MOUNTAIN_LABEL_COLOR
 * [53,84,63]）をやや暗くした値で、都市が「ラベルの濃茶 [121,62,22] より暗い
 * ドット [90,46,16]」を使うのと同じ関係（記号は文字より一段沈める）。
 * 山脈名ラベルと同じ色相にすることで「緑 = 地形の注記」という既存の記号性
 * （TASK-97）を山峰にもそのまま広げる。
 */
export const PEAK_MARKER_COLOR: LabelColor = [39, 62, 47, 255];

/** マーカー層の characterSet（グリフ 1 種のみ。フォントアトラスは最小） */
export const PEAK_MARKER_CHARACTER_SET: readonly string[] = [PEAK_MARKER_GLYPH];

/**
 * 山峰ラベルの表示位置のオフセット（px）。マーカー（▲）の真上に置き、記号と
 * 文字が重ならないようにする。都市ラベル（main.ts の getPixelOffset [0,-10]）
 * と同じ「上へ逃がす」向きで、山峰の記号は都市ドットより背が高いぶん 2px 多く
 * 取る。getTextAnchor / getAlignmentBaseline を使わないのは、
 * CollisionFilterExtension の衝突判定パスと相性が悪くラベルが全滅するため
 * （TASK-27 で確認済みの既知の制約）。
 */
export const PEAK_LABEL_PIXEL_OFFSET: readonly [number, number] = [0, -12];

/**
 * 山峰ラベル priority の上限（SCALERANK 3 以下 = モンブラン級）。
 *
 * 設計根拠（AC #3。TASK-97 の帯設計の続き）: 同一衝突空間の既存の帯は、
 * 勢力名が面積由来 100*log10(deg²) で実測 -400〜300、都市名が人口由来の固定帯
 * 150〜220（cities.ts）、山脈名が SCALERANK 由来の 80〜140（mountains.ts）。
 *
 * 山峰は「山脈の中の 1 点」なので、地形の注記という点では山脈と同じ階層に
 * ありつつ、広域の手掛かりとしては山脈名に劣る。そこで山脈帯（80〜140）の
 * 下半分に重ねて 80〜130 を採る。この配置が意味するのは:
 * - 都市名・大国名には常に譲る（地形の注記は主題に譲る。TASK-97 の方針を継承）
 * - 主要山脈（SCALERANK 1〜2 = アルプス・ウラル・コーカサス等 = 140/120）の
 *   ラベルには譲る。山峰は山脈の内部に位置するため両者は近接しやすく、
 *   「アルプス山脈」と「モンブラン」が競合したら広域の手掛かりを残す
 *   （タスク記述の「山脈ラベルと二重にならない規則」）
 * - 一方で下限は山脈帯の下限（80）と同値に留める。TASK-97 は 0〜60 の帯だと
 *   密集地帯（アルプス周辺の帝国諸領邦は面積 1〜6 deg² = priority 0〜78）で
 *   ラベルが 1 つも残らない「常時表示なのに常に見えない」状態になることを
 *   実機で確認している。山峰も同じ場所に出るので、この水準は割らない。
 */
export const PEAK_LABEL_PRIORITY_MAX = 130;

/** 山峰ラベル priority の下限（SCALERANK 欠損・8 以上の副次的な山峰） */
export const PEAK_LABEL_PRIORITY_MIN = 80;

/** SCALERANK が 1 段下がるごとに priority を下げる幅（帯を 5 段に割る） */
export const PEAK_LABEL_PRIORITY_STEP = 10;

/**
 * priority / ズーム出し分けの基準となる SCALERANK（これ以下は最主要として
 * 同じ扱い）。Natural Earth の elevation points はヨーロッパ域内では 3 が最小で
 * モンブランのみ（TASK-99 の調査）。
 */
export const PEAK_TOP_SCALERANK = 3;

/**
 * ラベルに標高を併記し始めるズーム段（AC #1 の「標高付き」と AC #3 の
 * 衝突回避の折り合い）。
 *
 * 併記するかの判断: **低ズームでは名称のみ、z7 以上でのみ「名称 標高m」**と
 * する。根拠は文字数で、「モンブラン」5 文字に対し「モンブラン 4807m」は
 * 11 文字と幅が約 2.2 倍になる。ラベルの衝突箱は COLLISION_SIZE_SCALE（2.8）
 * 倍で評価されるため、幅 2.2 倍は同じ場所で競合する勢力名・都市名を巻き込んで
 * 潰す（decision-21 により負けた側は半透明ではなく完全に消える）。一方で
 * 標高は「主要山峰」の主要たる所以であり、常に隠すのも惜しい。
 *
 * z7 を採るのは、山峰が出そろう段（peakMinZoom で SCALERANK 7 まで解禁）で
 * ありながら画面が覆う面積が初期表示 z4 の 1/512 になり、都市ラベル
 * （visibleCityRankLimit は z7 で 160 件まで解禁だが実データは年 23 件）と
 * 競合しても余白が残るため。ホバー/クリックでの詳細表示（TASK-100）とは
 * 独立に、地図を読み込んだときに標高が読めることを保証する。
 */
export const PEAK_ELEVATION_LABEL_MIN_ZOOM = 7;

/** peaks.geojson の山峰 1 件分（山峰名は英語。表示時に name-ja.json で日本語化） */
export interface PeakEntry {
  name: string;
  lon: number;
  lat: number;
  /** 標高（m）。不明は null */
  elevation: number | null;
  /** Natural Earth の SCALERANK（小さいほど主要）。不明は null */
  scalerank: number | null;
}

/** 山峰マーカー層に渡す 1 件分のデータ */
export interface PeakMarkerDatum {
  /** 英語の山峰名（TASK-100 のホバー/クリックの突合キー） */
  name: string;
  /** マーカー座標 [lon, lat] */
  position: [number, number];
}

/**
 * 山峰ラベル 1 件分のデータ。text は日本語化され得るため、後続タスク
 * （TASK-100）の突合キーとして元の英語名を name に保持する
 * （mountains.ts MountainLabelDatum・rivers.ts RiverLabelDatum と同型）。
 */
export interface PeakLabelDatum extends LabelDatum {
  /** 山峰の元名（properties.name、英語）。日本語表記の引き元・突合キー */
  name: string;
  /** 標高（m）。不明は null */
  elevation: number | null;
  /** 標高併記版のテキスト（PEAK_ELEVATION_LABEL_MIN_ZOOM 以上でのみ使う） */
  detailedText: string;
}

/** 有限数値なら number、それ以外は null */
function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** properties から山峰名（name）を取り出す。欠落・空文字・非文字列は null */
function peakNameFor(props: GeoJsonProperties): string | null {
  const v = props?.name;
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * peaks.geojson（Point の FeatureCollection）を PeakEntry 列へ変換する
 * （純粋関数）。データ契約は properties = { name, elevation, scalerank }。
 *
 * - Point 以外のジオメトリ・name 欠落・座標が非有限の feature は 1 件単位で除外
 * - elevation / scalerank は有限数値以外（欠落・文字列等）を null に正規化
 * - 不正形（null・features 非配列）は空配列にし、fetch 失敗と同様
 *   「山峰なし」で継続できるようにする
 */
export function peakEntries(fc: FeatureCollection): PeakEntry[] {
  const features = (fc as unknown as Record<string, unknown> | null)?.features;
  if (!Array.isArray(features)) return [];
  const entries: PeakEntry[] = [];
  for (const feature of features) {
    if (typeof feature !== "object" || feature === null) continue;
    const { properties, geometry } = feature as {
      properties?: GeoJsonProperties;
      geometry?: { type?: string; coordinates?: unknown };
    };
    const name = peakNameFor(properties ?? null);
    if (name === null) continue;
    if (geometry?.type !== "Point") continue;
    const coordinates = geometry.coordinates;
    if (!Array.isArray(coordinates)) continue;
    const lon = finiteNumber(coordinates[0]);
    const lat = finiteNumber(coordinates[1]);
    if (lon === null || lat === null) continue;
    entries.push({
      name,
      lon,
      lat,
      elevation: finiteNumber(properties?.elevation),
      scalerank: finiteNumber(properties?.scalerank),
    });
  }
  return entries;
}

/**
 * Natural Earth の SCALERANK を、この山峰を表示し始めるアプリのズーム段
 * （整数、MIN_ZOOM..MAX_ZOOM）へ写す純粋関数（AC #4）。
 *
 * 段の設計（欧州域内の実データ・TASK-99 の調査表に対応させた）:
 * - 3 以下 → z4（初期表示）: モンブラン（4807m / SCALERANK 3）のみ。z4 は
 *   欧州全域が入る縮尺で、緯度 46 度では経度 1 度が約 8px しかない。
 *   モンブランとマッターホルンの距離 0.8 度は約 6px なので、ここで複数の
 *   アルプスの山峰を出すと記号が団子になる（AC #4 の「密集して潰れない」）。
 * - 5 以下 → z5
 * - 6 以下 → z6: マッターホルン・グロースグロックナー・エトナ・オリンポス。
 *   AC #1 の主要 3 山峰はこの段で揃う（0.8 度 ≒ 32px の間隔になる）。
 * - 7 以下 → z7: ムラセン・アネト。
 * - それ以外（8 以上）→ z8: モンテ・ローザ・ツークシュピッツェ（SCALERANK 9）。
 *   標高では上位でも NE の主要度は低く、いずれも他の山峰の至近にある。
 * - 欠損・非数値は最大ズーム（最も保守的 = 広域では出さない）に倒す
 *   （mountains.ts mountainLabelMinZoom と同じ倒し方）。
 *
 * ズーム 1 段で画面内の対象面積は約 1/4 になるため、1 段ごとに数件ずつ
 * 解禁しても画面上の密度はほぼ一定に保たれる（cities.ts visibleCityRankLimit の
 * 段階設計と同じ考え方）。判定は整数ズーム段で行い、都市・山脈と粒度を揃える。
 */
export function peakMinZoom(scalerank: unknown): number {
  if (typeof scalerank !== "number" || !Number.isFinite(scalerank)) {
    return MAX_ZOOM;
  }
  if (scalerank <= PEAK_TOP_SCALERANK) return MIN_ZOOM;
  if (scalerank <= 5) return 5;
  if (scalerank <= 6) return 6;
  if (scalerank <= 7) return 7;
  return MAX_ZOOM;
}

/**
 * SCALERANK 由来のラベル優先度を返す純粋関数。値が小さい（= NE がより主要と
 * 判定した）山峰ほど高優先。帯の設計は PEAK_LABEL_PRIORITY_MAX を参照。
 * 欠損・非数値は下限（他の山峰に譲る）。
 */
export function peakLabelPriority(scalerank: unknown): number {
  if (typeof scalerank !== "number" || !Number.isFinite(scalerank)) {
    return PEAK_LABEL_PRIORITY_MIN;
  }
  const priority = PEAK_LABEL_PRIORITY_MAX -
    (scalerank - PEAK_TOP_SCALERANK) * PEAK_LABEL_PRIORITY_STEP;
  return Math.min(
    PEAK_LABEL_PRIORITY_MAX,
    Math.max(PEAK_LABEL_PRIORITY_MIN, priority),
  );
}

/**
 * 現在のズームで表示する山峰を選び出す純粋関数（AC #4）。マーカー層と
 * ラベル層の両方がこの結果を使うため、記号と名前の出し入れが必ず一致する。
 *
 * 判定は整数ズーム段（Math.floor）で行い、都市（visibleCityRankLimit）・
 * 山脈（filterVisibleMountainLabels）と同じ粒度に揃える。呼び出し側
 * （main.ts）も整数段が変わった時だけレイヤーを作り直す。
 *
 * 入力配列は破壊せず、渡された entry の参照をそのまま返す（main.ts 側の
 * メモ化を無効化しないための契約）。非有限のズーム（防御）は最遠段
 * （MIN_ZOOM）として扱う。
 */
export function filterVisiblePeaks(
  entries: readonly PeakEntry[],
  zoom: number,
): PeakEntry[] {
  const step = Number.isFinite(zoom) ? Math.floor(zoom) : MIN_ZOOM;
  return entries.filter((entry) => step >= peakMinZoom(entry.scalerank));
}

/**
 * 山峰の表示名を返す（純粋関数）。decision-6 に従いデータは英語名のままで、
 * 表示時に name-ja.json（英語名 → 日本語名）を引く。未登録は英語のまま。
 * 都市（cities.ts cityDisplayName）と違い勢力名との綴り衝突は起きないため
 * オーバーライド表は持たない。
 */
export function peakDisplayName(
  name: string,
  ja: Record<string, string> = {},
): string {
  return ja[name] ?? name;
}

/**
 * ラベルに併記する標高の表記を返す（純粋関数）。不明（null）は null。
 * 単位付きの整数メートル表記（例: "4807m"）で、小数は四捨五入する
 * （元データ NE の ELEVATION は整数だが、値が揺れても表示は整数に固定する）。
 */
export function formatPeakElevation(elevation: number | null): string | null {
  if (elevation === null) return null;
  return `${Math.round(elevation)}m`;
}

/**
 * 山峰エントリをマーカー層用データへ変換する（純粋関数）。
 * name は TASK-100 のホバー/クリック時の表示（ja 適用）に使うため保持する。
 */
export function buildPeakMarkerData(
  entries: readonly PeakEntry[],
): PeakMarkerDatum[] {
  return entries.map((entry) => ({
    name: entry.name,
    position: [entry.lon, entry.lat] as [number, number],
  }));
}

/**
 * 山峰エントリを TextLayer 用ラベルデータへ変換する（純粋関数）。
 * - text は日本語名（未登録は英語名）
 * - detailedText は標高併記版（高ズームでのみ使う。peakLabelText を参照）。
 *   標高不明のときは text と同一にして「名称 nullm」のような表記を作らない
 * - priority は SCALERANK 由来の山峰固定帯（PEAK_LABEL_PRIORITY_MIN..MAX）
 *
 * ズームには依存しない（main.ts がこの結果をメモ化し、characterSet も
 * 全山峰・両方のテキストから 1 度だけ作る。ズーム段が変わってもフォント
 * アトラスを作り直さない = 河川・山脈ラベルと同じ扱い）。
 */
export function buildPeakLabelData(
  entries: readonly PeakEntry[],
  ja: Record<string, string> = {},
): PeakLabelDatum[] {
  return entries.map((entry) => {
    const text = peakDisplayName(entry.name, ja);
    const elevationText = formatPeakElevation(entry.elevation);
    return {
      name: entry.name,
      text,
      detailedText: elevationText === null ? text : `${text} ${elevationText}`,
      position: [entry.lon, entry.lat] as [number, number],
      priority: peakLabelPriority(entry.scalerank),
      elevation: entry.elevation,
    };
  });
}

/**
 * ズーム段に応じたラベル文字列を返す純粋関数。
 * PEAK_ELEVATION_LABEL_MIN_ZOOM 以上でのみ標高を併記する（根拠は同定数の
 * コメント）。非有限のズーム（防御）は名称のみ = 衝突箱が最も小さい側へ倒す。
 */
export function peakLabelText(d: PeakLabelDatum, zoom: number): string {
  if (!Number.isFinite(zoom)) return d.text;
  return Math.floor(zoom) >= PEAK_ELEVATION_LABEL_MIN_ZOOM
    ? d.detailedText
    : d.text;
}

/**
 * TextLayer の characterSet に渡す文字列の集合（純粋関数）。名称のみ版と
 * 標高併記版の両方を含めることで、ズーム段が変わってもフォントアトラスを
 * 作り直さずに済む（河川・山脈ラベルと同じ「常に全件分を渡す」契約）。
 */
export function peakLabelTexts(
  data: readonly PeakLabelDatum[],
): string[] {
  return data.flatMap((d) => [d.text, d.detailedText]);
}
