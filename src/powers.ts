/**
 * 勢力圏レイヤーの DOM 非依存な純粋ロジック。
 * - colors.json の参照キー組み立て（build-colors.ts の compositeKey と同一規則）
 * - HEX → deck.gl の [r,g,b,a] 変換と塗り/境界線の定数
 * - 年代 GeoJSON のメモリキャッシュ付きローダ（fetch はモック可能な形に分離）
 * 参照仕様: docs/app-spec.md §3.3, §4.3
 */

import type { FeatureCollection, GeoJsonProperties } from "geojson";

/** deck.gl のカラー表現（0..255 の RGBA タプル） */
export type Rgba = [number, number, number, number];

/** 独立勢力キーと属領キー（NAME|SUBJECTO）を区切る文字。国名には現れない */
export const SUBJECT_KEY_SEP = "|";

/** 塗り opacity 0.5 相当の alpha（0..255） */
export const FILL_ALPHA = 128;

/** キー欠落（NAME null 等）時のニュートラルなデフォルト塗り色（グレー系・同 opacity） */
export const DEFAULT_FILL_COLOR: Rgba = [136, 136, 136, FILL_ALPHA];

/**
 * 境界線の色（インク＝焦茶系・やや不透明。TASK-73）。
 *
 * 従来の白 [255,255,255,200] は現代的な light ベースマップ前提の色で、羊皮紙
 * トーンの下地（basemap.ts PARCHMENT_FLAVOR_OVERRIDES）の上では白抜きの線が
 * 浮き、地図外 UI（app.css の --frame #5c3d22 / --ink #3a2712）とも乖離して
 * いた。古地図の「ペンで引いた境界」に合わせて --frame と同値の焦茶にする。
 * alpha は従来どおり 190 前後に留め、下の塗り分けが線に潰されないようにする。
 *
 * 他の境界線との識別: HRE 外縁の臙脂 [140,30,30]（main.ts
 * HRE_EXTENT_LINE_COLOR、3px）、仏諸侯領の藍紫 [74,42,130]（同 FIEF_LINE_COLOR、
 * 1.5px）とは色相・太さの双方で区別できる（本色は最も細い 1px の茶）。
 */
export const LINE_COLOR: Rgba = [92, 61, 34, 190];

/** 境界線の幅（ピクセル） */
export const LINE_WIDTH_PX = 1;

/** properties から文字列プロパティを取り出す。空文字・非文字列は null */
function stringProp(props: GeoJsonProperties, key: string): string | null {
  const v = props?.[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * feature の NAME / SUBJECTO から colors.json の参照キーを組み立てる（純粋関数）。
 * SUBJECTO を持ち、かつ NAME と異なる場合のみ "NAME|SUBJECTO"（属領キー）。
 * それ以外は NAME（独立勢力キー）。NAME が無い feature は null。
 * build-colors.ts の compositeKey と同一規則に揃える。
 */
export function colorKeyFor(props: GeoJsonProperties): string | null {
  const name = stringProp(props, "NAME");
  if (name === null) return null;
  const subjecto = stringProp(props, "SUBJECTO");
  if (subjecto !== null && subjecto !== name) {
    return `${name}${SUBJECT_KEY_SEP}${subjecto}`;
  }
  return name;
}

/** "#rrggbb" を [r,g,b] に変換する（純粋関数）。不正な形式は null */
export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (m === null) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * feature の properties と色マップから塗り色 [r,g,b,a] を決める（純粋関数）。
 * キーが引けない／HEX が不正な場合はデフォルトのグレーにフォールバックする。
 */
export function fillColorFor(
  props: GeoJsonProperties,
  colors: Record<string, string>,
): Rgba {
  const key = colorKeyFor(props);
  if (key === null) return DEFAULT_FILL_COLOR;
  const hex = colors[key];
  if (hex === undefined) return DEFAULT_FILL_COLOR;
  const rgb = hexToRgb(hex);
  if (rgb === null) return DEFAULT_FILL_COLOR;
  return [rgb[0], rgb[1], rgb[2], FILL_ALPHA];
}

/** 年代スナップショット GeoJSON の同一オリジン配信 URL を返す（純粋関数） */
export function dataUrlFor(year: number): string {
  return `/data/europe_${year}.geojson`;
}

/** HRE（神聖ローマ帝国）領邦オーバーレイ GeoJSON の配信 URL を返す（純粋関数） */
export function hreDataUrlFor(year: number): string {
  return `/data/hre_${year}.geojson`;
}

/** 指定年に HRE オーバーレイが存在するか（純粋関数）。対象年は config.HRE_OVERLAY_YEARS */
export function hasHreOverlay(
  year: number,
  overlayYears: readonly number[],
): boolean {
  return overlayYears.includes(year);
}

/**
 * 中世フランス諸侯領オーバーレイ GeoJSON の配信 URL を返す（純粋関数、TASK-71）。
 * 生成は scripts/build-france-fiefs.ts（OpenHistoricalMap / CC0）。
 */
export function franceFiefDataUrlFor(year: number): string {
  return `/data/france_fiefs_${year}.geojson`;
}

/**
 * 指定年にフランス諸侯領オーバーレイが存在するか（純粋関数、TASK-71）。
 * 対象年は config.FRANCE_FIEF_OVERLAY_YEARS。判定規則は hasHreOverlay と同一だが、
 * 呼び出し側で「どちらのオーバーレイの話か」を取り違えないよう別名で公開する。
 */
export function hasFranceFiefOverlay(
  year: number,
  overlayYears: readonly number[],
): boolean {
  return overlayYears.includes(year);
}

/**
 * base 境界線オーバーレイ GeoJSON の配信 URL を返す（純粋関数、TASK-78）。
 * 中身は base 勢力ポリゴンの環を諸侯領 union の外側だけに切り出した LineString
 * 群（生成は scripts/build-fief-dedupe.ts）。諸侯領オーバーレイ対象年に限り、
 * powers レイヤーの stroke を止めてこの層で境界線を描くことで、諸侯領の内側を
 * 走る base 境界線（= 二重輪郭）だけを消す。
 */
export function baseOutlineDataUrlFor(year: number): string {
  return `/data/base_outline_${year}.geojson`;
}

/**
 * 指定年に base 境界線オーバーレイが存在するか（純粋関数、TASK-78）。
 * 諸侯領オーバーレイと同じ年集合（config.FRANCE_FIEF_OVERLAY_YEARS）を渡す：
 * 派生データは諸侯領がある年にしか生成されない。
 */
export function hasBaseOutline(
  year: number,
  overlayYears: readonly number[],
): boolean {
  return overlayYears.includes(year);
}

/**
 * feature を持たない空の FeatureCollection（非対象年の HRE オーバーレイ用）。
 * 同一参照を返し続けることで deck.gl の data 差分判定を最小化する。
 */
export const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: "FeatureCollection",
  features: [],
};

/** fetch の最小契約（テストでモックできるよう Response 全体には依存しない） */
export interface FetchResponseLike {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/** URL を受け取りレスポンスを返す fetch 相当の関数 */
export type FetchLike = (url: string) => Promise<FetchResponseLike>;

/** 年代 GeoJSON のメモリキャッシュ付きローダ */
export interface YearDataLoader {
  /** 年代 GeoJSON を取得する（取得済みならキャッシュを返す） */
  load(year: number): Promise<FeatureCollection>;
  /** 年代がキャッシュ済みか */
  has(year: number): boolean;
}

/**
 * 年代 GeoJSON のメモリキャッシュ付きローダを作る。
 * - 取得済み年代はキャッシュから即返す
 * - 同一年代への並行呼び出しは 1 回の fetch に集約する（inflight 共有）
 * - 失敗時はキャッシュも inflight も残さず、再試行できるようにする
 * fetch 部を引数で受けることで DOM 非依存にテストできる。
 * urlFor で URL 規則を差し替えられる（既定は base の europe_<year>、HRE は hre_<year>）。
 */
export function createYearDataLoader(
  fetchFn: FetchLike,
  urlFor: (year: number) => string = dataUrlFor,
): YearDataLoader {
  const cache = new Map<number, FeatureCollection>();
  const inflight = new Map<number, Promise<FeatureCollection>>();

  return {
    has: (year) => cache.has(year),
    load(year) {
      const cached = cache.get(year);
      if (cached !== undefined) return Promise.resolve(cached);
      const existing = inflight.get(year);
      if (existing !== undefined) return existing;

      const promise = (async () => {
        try {
          const res = await fetchFn(urlFor(year));
          if (!res.ok) {
            throw new Error(
              `GeoJSON 取得失敗 (year=${year}, status=${res.status})`,
            );
          }
          const data = await res.json() as FeatureCollection;
          cache.set(year, data);
          return data;
        } finally {
          inflight.delete(year);
        }
      })();
      inflight.set(year, promise);
      return promise;
    },
  };
}

/**
 * 年代限定オーバーレイ（HRE 領邦・フランス諸侯領）共通のローダを作る（TASK-71）。
 * - オーバーレイが無い年（overlayYears に含まれない）は fetch せず空 FC を即返す
 * - 対象年は urlFor(year) をキャッシュ・inflight 共有付きで取得する
 * - 取得失敗は reject せず warnFn へ通知して空 FC で解決する。オーバーレイは
 *   base 地図の付加情報であり、その欠落で年代切替全体（base の表示・ローディング
 *   /エラー UI）を失敗扱いにしない方針のため。失敗はキャッシュされず、次の
 *   切替時に再試行される。
 */
function createOverlayLoader(
  fetchFn: FetchLike,
  overlayYears: readonly number[],
  urlFor: (year: number) => string,
  overlayLabel: string,
  warnFn: (message: string) => void,
): YearDataLoader {
  const inner = createYearDataLoader(fetchFn, urlFor);
  return {
    // 非対象年は fetch 自体が不要なので常に「取得済み」扱い（スピナー抑止）
    has: (year) => !overlayYears.includes(year) || inner.has(year),
    load(year) {
      if (!overlayYears.includes(year)) {
        return Promise.resolve(EMPTY_FEATURE_COLLECTION);
      }
      return inner.load(year).catch((error: unknown) => {
        warnFn(
          `${overlayLabel}の取得に失敗しました。基本地図のみ表示します: ${
            String(error)
          }`,
        );
        return EMPTY_FEATURE_COLLECTION;
      });
    },
  };
}

/**
 * HRE 領邦オーバーレイ用のローダを作る（TASK-19）。
 * 挙動は createOverlayLoader（非対象年は空 FC・取得失敗は warn + 空 FC）に従う。
 */
export function createHreOverlayLoader(
  fetchFn: FetchLike,
  overlayYears: readonly number[],
  warnFn: (message: string) => void = console.warn,
): YearDataLoader {
  return createOverlayLoader(
    fetchFn,
    overlayYears,
    hreDataUrlFor,
    "HRE オーバーレイ",
    warnFn,
  );
}

/**
 * 中世フランス諸侯領オーバーレイ用のローダを作る（TASK-71）。
 * HRE 領邦オーバーレイと同じ機構（createOverlayLoader）に載せることで、
 * 非対象年（近世以降）は fetch せず空 FC を返し、ベースマップの France
 * ポリゴンと二重表示にならないことを構造的に保証する（AC #4）。
 */
export function createFranceFiefOverlayLoader(
  fetchFn: FetchLike,
  overlayYears: readonly number[],
  warnFn: (message: string) => void = console.warn,
): YearDataLoader {
  return createOverlayLoader(
    fetchFn,
    overlayYears,
    franceFiefDataUrlFor,
    "フランス諸侯領オーバーレイ",
    warnFn,
  );
}

/**
 * base 境界線オーバーレイ用のローダを作る（TASK-78）。
 * HRE 領邦・諸侯領オーバーレイと同じ機構（createOverlayLoader）に載せるため、
 * 非対象年は fetch せず空 FC、取得失敗は warn + 空 FC になる。空 FC のときは
 * main.ts が powers レイヤーの stroke を従来どおり残すので、この派生データが
 * 欠けても見た目は TASK-78 以前と同じになる（縮退しても壊れない）。
 */
export function createBaseOutlineLoader(
  fetchFn: FetchLike,
  overlayYears: readonly number[],
  warnFn: (message: string) => void = console.warn,
): YearDataLoader {
  return createOverlayLoader(
    fetchFn,
    overlayYears,
    baseOutlineDataUrlFor,
    "base 境界線オーバーレイ",
    warnFn,
  );
}

/**
 * 年代切替で同時に反映する base（europe_*）・hre（hre_*）・
 * fiefs（france_fiefs_*、TASK-71）・outlines（base_outline_*、TASK-78）の
 * データ組
 */
export interface YearLayerData {
  /** 勢力圏 base レイヤーの FeatureCollection */
  base: FeatureCollection;
  /** HRE 領邦オーバーレイの FeatureCollection（非対象年・取得失敗時は空） */
  hre: FeatureCollection;
  /** 中世フランス諸侯領オーバーレイの FeatureCollection（非対象年・取得失敗時は空） */
  fiefs: FeatureCollection;
  /**
   * base 境界線オーバーレイ（諸侯領の内側を除いた base 輪郭）の
   * FeatureCollection（非対象年・取得失敗時は空 = powers の stroke で描く）
   */
  outlines: FeatureCollection;
}

/** base + hre + fiefs をまとめてロードする複合ローダ */
export interface CombinedYearLoader {
  /** base・hre・fiefs を並行ロードし、全て揃ってから返す */
  load(year: number): Promise<YearLayerData>;
  /** base・hre・fiefs の全てが取得済み（fetch 不要）か */
  has(year: number): boolean;
}

/**
 * base ローダと 2 系統のオーバーレイローダ（HRE 領邦・フランス諸侯領）を束ねた
 * 複合ローダを作る。Promise.all で並行ロードし、全て揃ってから解決するため、
 * applyFn には常に同じ年の base / hre / fiefs が対になって渡る（一部だけ先に
 * 反映されるちらつきが無い）。base の失敗は reject（既存のローディング/エラー
 * UI が処理）、オーバーレイの失敗は各 createXxxOverlayLoader 側で空 FC に
 * 落ちるため、ここでは特別扱いしない。
 *
 * fiefLoader（TASK-71）・outlineLoader（TASK-78）は任意（それ以前の呼び出しと
 * 後方互換）。省略時はそれぞれ常に空 FC になり、従来どおりの挙動になる。
 */
export function createCombinedYearLoader(
  baseLoader: YearDataLoader,
  hreLoader: YearDataLoader,
  fiefLoader?: YearDataLoader,
  outlineLoader?: YearDataLoader,
): CombinedYearLoader {
  return {
    has: (year) =>
      baseLoader.has(year) && hreLoader.has(year) &&
      (fiefLoader === undefined || fiefLoader.has(year)) &&
      (outlineLoader === undefined || outlineLoader.has(year)),
    async load(year) {
      const [base, hre, fiefs, outlines] = await Promise.all([
        baseLoader.load(year),
        hreLoader.load(year),
        fiefLoader?.load(year) ?? Promise.resolve(EMPTY_FEATURE_COLLECTION),
        outlineLoader?.load(year) ?? Promise.resolve(EMPTY_FEATURE_COLLECTION),
      ]);
      return { base, hre, fiefs, outlines };
    },
  };
}

/** createYearSwitcher が必要とする loader の最小契約（load のみ） */
export interface YearLoaderLike<T = FeatureCollection> {
  load(year: number): Promise<T>;
}

/** 表示年代の切替を担う（並行要求の競合ガード付き） */
export interface YearSwitcher {
  /** 指定年代へ切り替える。最新要求以外は解決しても反映しない */
  switchTo(year: number): Promise<void>;
  /** 直近に反映（適用）された年代。未適用なら undefined */
  currentYear(): number | undefined;
}

/**
 * 年代切替のロジック（DOM/deck.gl 非依存）。
 *
 * switchTo(1200) → switchTo(1300) と高頻度に呼ばれた際（TASK-6 のスライダードラッグ）、
 * 古い 1200 の fetch が新しい 1300 の後に解決すると表示が巻き戻る競合が起きる。
 * これを防ぐため要求ごとに単調増加トークンを発行し、解決時点で自分が最新要求で
 * なければ applyFn を呼ばない（＝表示・currentYear を巻き戻さない）。
 *
 * applyFn は「取得済みデータを実際に表示へ反映する」副作用（overlay 更新など）を担う。
 * loader はキャッシュ・fetch を担い、ここには DOM も deck.gl も持ち込まない。
 * データ型はジェネリクス T（既定 FeatureCollection）で、複合ローダの
 * YearLayerData（base+hre）もそのまま扱える。
 */
export function createYearSwitcher<T = FeatureCollection>(
  loader: YearLoaderLike<T>,
  applyFn: (year: number, data: T) => void,
): YearSwitcher {
  let latestToken = 0;
  let applied: number | undefined = undefined;

  return {
    currentYear: () => applied,
    async switchTo(year) {
      const token = ++latestToken;
      let data: T;
      try {
        data = await loader.load(year);
      } catch (error) {
        // TASK-48: 追い越された（stale）要求の失敗は成功時と同様に黙殺する。
        // reject を伝播すると、呼び出し側（switchYear）が現在表示と無関係な
        // 年代の失敗トーストを出してしまう。最新要求の失敗のみ伝播する。
        if (token !== latestToken) return;
        throw error;
      }
      // 自分より後に発行された要求があれば、この解決は古い ＝ 破棄する
      if (token !== latestToken) return;
      applied = year;
      applyFn(year, data);
    },
  };
}
