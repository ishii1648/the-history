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

/** 境界線の色（白系・やや不透明） */
export const LINE_COLOR: Rgba = [255, 255, 255, 200];

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
 */
export function createYearDataLoader(fetchFn: FetchLike): YearDataLoader {
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
          const res = await fetchFn(dataUrlFor(year));
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

/** createYearSwitcher が必要とする loader の最小契約（load のみ） */
export interface YearLoaderLike {
  load(year: number): Promise<FeatureCollection>;
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
 */
export function createYearSwitcher(
  loader: YearLoaderLike,
  applyFn: (year: number, data: FeatureCollection) => void,
): YearSwitcher {
  let latestToken = 0;
  let applied: number | undefined = undefined;

  return {
    currentYear: () => applied,
    async switchTo(year) {
      const token = ++latestToken;
      const data = await loader.load(year);
      // 自分より後に発行された要求があれば、この解決は古い ＝ 破棄する
      if (token !== latestToken) return;
      applied = year;
      applyFn(year, data);
    },
  };
}
