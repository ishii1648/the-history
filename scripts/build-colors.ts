/**
 * 色割当の静的生成スクリプト。
 * - data/europe_<year>.geojson × 20 から NAME / SUBJECTO を収集する
 * - NAME をキーに決定的ハッシュでパレット色を割り当てる（同一勢力は全年代で同色）
 * - SUBJECTO を持つ feature（属領・植民地）は宗主国の色相に寄せた明度違いの色にする。
 *   SUBJECTO は name-overrides.json の renames で正規化してから宗主国色を引く。
 * - data/colors.json を生成する。クライアントは NAME（属領は "NAME|SUBJECTO"）で
 *   O(1) 参照するのみ（実行時のハッシュ計算・色衝突の揺れを避ける）。
 *
 * ロジックは純粋関数として export しテスト対象にする（scripts/build-colors_test.ts）。
 * 参照仕様: docs/app-spec.md §4.3
 */

import type { FeatureCollection } from "geojson";
import { SNAPSHOT_YEARS } from "../src/config.ts";
import { HRE_OVERLAY_YEARS } from "./build-hre.ts";

const DATA_DIR = "data";
const OVERRIDES_PATH = `${DATA_DIR}/name-overrides.json`;
const COLORS_PATH = `${DATA_DIR}/colors.json`;

/** 独立勢力キーと属領キー（NAME|SUBJECTO）を区切る文字。国名には現れない */
export const SUBJECT_KEY_SEP = "|";

/** name-overrides.json の構造（表記ゆれ・別名のリネームマップ） */
export interface NameOverrides {
  renames: Record<string, string>;
}

/** HSL 色（h: 0..360, s: 0..1, l: 0..1） */
export interface Hsl {
  h: number;
  s: number;
  l: number;
}

/** NAME/複合キー → HEX 色 の割当マップ */
export type ColorMap = Record<string, string>;

/**
 * パレット設計（docs/app-spec.md §4.3）。
 * ヨーロッパ域の全年代合算ユニーク NAME は 272。色衝突を緩和するため、
 * 色相を黄金角で分散させた 24 段 × 彩度 3 段 × 明度 4 段 = 288 色を用意し、
 * 想定ユニーク数を上回る実効色数を確保する。彩度・明度差で隣接色の識別性も高める。
 */
export const HUE_COUNT = 24;

/** 黄金角（度）。色相をインデックス順で大きく分散させ、隣接色の衝突を緩和する */
export const GOLDEN_ANGLE = 137.508;

/** 彩度段（塗り opacity 0.5 でも視認できる範囲） */
export const SATURATIONS: readonly number[] = [0.45, 0.6, 0.75];

/** 明度段（暗すぎ・明るすぎを避けた中間帯） */
export const LIGHTNESSES: readonly number[] = [0.4, 0.52, 0.64, 0.76];

/** パレット総色数 */
export const PALETTE_SIZE = HUE_COUNT * SATURATIONS.length * LIGHTNESSES.length;

/**
 * FNV-1a 32bit ハッシュ（純粋関数・決定的）。
 * Math.random を使わず、文字列から安定した非負整数を得る。
 */
export function fnv1a(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    // 32bit FNV prime 乗算を Math.imul で正確に行い、符号なし化する
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** 0..1 を 2 桁 16 進に変換する */
function toHex2(v: number): string {
  const n = Math.round(v * 255);
  const clamped = Math.max(0, Math.min(255, n));
  return clamped.toString(16).padStart(2, "0");
}

/**
 * HSL → HEX 変換（純粋関数）。h: 0..360, s/l: 0..1 → "#rrggbb"。
 */
export function hslToHex(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = hue / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return `#${toHex2(r + m)}${toHex2(g + m)}${toHex2(b + m)}`;
}

/**
 * パレットのインデックス（任意整数）から HSL を返す（純粋関数）。
 * 連続インデックスでは色相が黄金角ぶん離れ（隣接色衝突の緩和）、
 * 一巡するごとに明度・彩度が変化して実効色数を稼ぐ。
 */
export function paletteHslForIndex(index: number): Hsl {
  const i = ((index % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE;
  const hueIdx = i % HUE_COUNT;
  const rest = Math.floor(i / HUE_COUNT);
  const lightIdx = rest % LIGHTNESSES.length;
  const satIdx = Math.floor(rest / LIGHTNESSES.length) % SATURATIONS.length;
  return {
    h: (hueIdx * GOLDEN_ANGLE) % 360,
    s: SATURATIONS[satIdx],
    l: LIGHTNESSES[lightIdx],
  };
}

/** NAME → 割当 HSL（決定的・純粋関数） */
export function assignColorHsl(name: string): Hsl {
  return paletteHslForIndex(fnv1a(name));
}

/** NAME → 割当 HEX（決定的・純粋関数） */
export function assignColor(name: string): string {
  const { h, s, l } = assignColorHsl(name);
  return hslToHex(h, s, l);
}

/** 明度シフト量。属領を宗主国と明確に識別できる差をつける */
export const SUBJECT_LIGHTNESS_SHIFT = 0.18;

/**
 * 宗主国のベース色（HSL）から属領用の HSL を作る（純粋関数）。
 * 色相・彩度を保ち、明度だけをずらして「同系色の明度違い」にする。
 * 宗主国が明るめなら暗く、暗めなら明るくして [0,1] に収める。
 */
export function shiftLightnessForSubject(base: Hsl): Hsl {
  const l = base.l >= 0.58
    ? base.l - SUBJECT_LIGHTNESS_SHIFT
    : base.l + SUBJECT_LIGHTNESS_SHIFT;
  return { h: base.h, s: base.s, l };
}

/**
 * 宗主国名 → 属領用の HSL（純粋関数・生ハッシュ起点）。
 * プロービングを介さない自然スロットからの派生で、式（同色相・明度シフト）の単体確認用。
 * buildColorMap 内ではプロービング後の宗主国スロットから派生する。
 */
export function deriveSubjectColorHsl(suzerain: string): Hsl {
  return shiftLightnessForSubject(assignColorHsl(suzerain));
}

/** 宗主国名 → 属領用の HEX（純粋関数・生ハッシュ起点） */
export function deriveSubjectColor(suzerain: string): string {
  const { h, s, l } = deriveSubjectColorHsl(suzerain);
  return hslToHex(h, s, l);
}

/**
 * 勢力名の集合に決定的にパレットスロットを割り当てる（純粋関数）。
 * - 入力順に依存しないよう内部でソートしてから割り当てる
 * - 各名前は fnv1a のスロットを起点に、使用済みなら線形プロービング（+1, mod）で
 *   最初の空きスロットを取る。これにより名前数 <= PALETTE_SIZE なら全員が相異なる色になる
 * - 名前数が PALETTE_SIZE を超えた場合のみ、自然スロットの再利用を許容する
 * Math.random 不使用・同一入力なら常に同一出力。
 */
export function probeAssignSlots(names: string[]): Map<string, number> {
  const sorted = [...names].sort();
  const used = new Set<number>();
  const result = new Map<string, number>();
  for (const name of sorted) {
    if (result.has(name)) continue;
    let slot = fnv1a(name) % PALETTE_SIZE;
    if (used.size < PALETTE_SIZE) {
      while (used.has(slot)) slot = (slot + 1) % PALETTE_SIZE;
      used.add(slot);
    }
    result.set(name, slot);
  }
  return result;
}

/**
 * feature の NAME / SUBJECTO からクライアント参照キーを組み立てる（純粋関数）。
 * SUBJECTO を持ち、かつ自分自身でない場合のみ "NAME|SUBJECTO"（属領キー）。
 * それ以外は NAME（独立勢力キー）。SUBJECTO は生の値（クライアントが持つ値）を使う。
 */
export function compositeKey(name: string, subjecto: string | null): string {
  if (subjecto !== null && subjecto !== "" && subjecto !== name) {
    return `${name}${SUBJECT_KEY_SEP}${subjecto}`;
  }
  return name;
}

/** properties から文字列プロパティを取り出す。空文字・非文字列は null */
function stringProp(
  props: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const v = props?.[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/** buildColorMap の第 1 パスで抽出する 1 エントリ分の割当情報 */
interface ColorEntry {
  /** クライアント参照キー（NAME または NAME|SUBJECTO） */
  key: string;
  /** ベース色を引く勢力名（独立勢力は自分、属領は正規化した宗主国名） */
  baseName: string;
  /** 属領（宗主国色から明度シフトで派生）なら true */
  subject: boolean;
}

/**
 * 「属領でも独立色にする宗主国名」の既定集合（TASK-19）。
 * HRE 領邦オーバーレイ（data/hre_<year>.geojson）は全 feature が
 * SUBJECTO="Holy Roman Empire" のため、従来の「宗主国色の明度シフト」では
 * 全領邦が同色になってしまう。HRE 配下は NAME ベースの独立プロービング色にする。
 */
export const INDEPENDENT_SUBJECT_SUZERAINS: ReadonlySet<string> = new Set([
  "Holy Roman Empire",
]);

/**
 * 全年代の FeatureCollection から色割当マップを組み立てる（純粋関数）。
 * - NAME が null の feature は載せない（クライアント側でデフォルト色）
 * - 独立勢力は決定的プロービングで相異なるパレット色を割り当てる（ハッシュ衝突での同色を回避）
 * - 属領（SUBJECTO を持ち NAME と異なる）は複合キーで、宗主国のプロービング後スロットの
 *   色相を保ち明度をずらした色にする（宗主国の実表示色と同色相ファミリーになる）
 * - SUBJECTO は overrides.renames で正規化してから宗主国色を引く。
 *   正規化後に自分自身へ帰着する自己参照は属領扱いせずベース色にする
 * - 正規化後の宗主国名が independentSubjectSuzerains に入る feature は属領扱いせず、
 *   NAME ベースの独立プロービング色を割り当てる（キーは複合キーのまま）
 */
export function buildColorMap(
  collections: FeatureCollection[],
  overrides: NameOverrides,
  independentSubjectSuzerains: ReadonlySet<string> = new Set(),
): ColorMap {
  // 第 1 パス: 参照キーごとに割当情報を集め、ベース色が必要な勢力名を収集する。
  // 独立勢力の NAME に加え、属領の宗主国名も「色相の供給元」としてスロットを予約する。
  const entries: ColorEntry[] = [];
  const seenKeys = new Set<string>();
  const baseNames = new Set<string>();
  for (const fc of collections) {
    for (const f of fc.features) {
      const props = f.properties as Record<string, unknown> | null;
      const name = stringProp(props, "NAME");
      if (name === null) continue;
      const subjecto = stringProp(props, "SUBJECTO");
      const key = compositeKey(name, subjecto);
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      if (subjecto !== null && subjecto !== name) {
        const suzerain = overrides.renames[subjecto] ?? subjecto;
        if (suzerain === name) {
          // 補正前綴りの自己参照 → 属領扱いせずベース色
          entries.push({ key, baseName: name, subject: false });
          baseNames.add(name);
        } else if (independentSubjectSuzerains.has(suzerain)) {
          // 独立色にする宗主国（HRE 等）配下 → NAME ベースの独立プロービング色
          entries.push({ key, baseName: name, subject: false });
          baseNames.add(name);
        } else {
          entries.push({ key, baseName: suzerain, subject: true });
          baseNames.add(suzerain);
        }
      } else {
        entries.push({ key, baseName: name, subject: false });
        baseNames.add(name);
      }
    }
  }

  // 第 2 パス: ベース勢力名に決定的プロービングでスロットを割り当てる。
  const slots = probeAssignSlots([...baseNames]);

  // 第 3 パス: キーごとに最終色を確定する。
  const map: ColorMap = {};
  for (const { key, baseName, subject } of entries) {
    const base = paletteHslForIndex(slots.get(baseName)!);
    const hsl = subject ? shiftLightnessForSubject(base) : base;
    map[key] = hslToHex(hsl.h, hsl.s, hsl.l);
  }
  return map;
}

/** キーをソートした安定な ColorMap を返す（diff を安定させる） */
function sortColorMap(map: ColorMap): ColorMap {
  const sorted: ColorMap = {};
  for (const key of Object.keys(map).sort()) sorted[key] = map[key];
  return sorted;
}

/** name-overrides.json を読み込む。存在しなければ空のマップを返す */
async function loadOverrides(path: string): Promise<NameOverrides> {
  try {
    const data = JSON.parse(await Deno.readTextFile(path));
    const renames = data && typeof data === "object" && data.renames &&
        typeof data.renames === "object"
      ? data.renames as Record<string, string>
      : {};
    return { renames };
  } catch {
    return { renames: {} };
  }
}

/**
 * data/europe_<year>.geojson を全年代ぶんと、存在する data/hre_<year>.geojson
 * （HRE 主要領邦オーバーレイ・`deno task build-hre` で生成）を読み込む。
 */
async function loadCollections(): Promise<FeatureCollection[]> {
  const collections: FeatureCollection[] = [];
  for (const year of SNAPSHOT_YEARS) {
    const path = `${DATA_DIR}/europe_${year}.geojson`;
    const fc = JSON.parse(await Deno.readTextFile(path)) as FeatureCollection;
    collections.push(fc);
  }
  for (const year of HRE_OVERLAY_YEARS) {
    const path = `${DATA_DIR}/hre_${year}.geojson`;
    try {
      const fc = JSON.parse(await Deno.readTextFile(path)) as FeatureCollection;
      collections.push(fc);
    } catch (error) {
      if (!(error instanceof Deno.errors.NotFound)) throw error;
      // 未生成環境（build-hre 前）ではスキップして従来どおり動かす
    }
  }
  return collections;
}

async function main(): Promise<void> {
  const overrides = await loadOverrides(OVERRIDES_PATH);
  const collections = await loadCollections();
  const map = sortColorMap(
    buildColorMap(collections, overrides, INDEPENDENT_SUBJECT_SUZERAINS),
  );
  await Deno.writeTextFile(COLORS_PATH, `${JSON.stringify(map, null, 2)}\n`);

  const subjectKeys = Object.keys(map).filter((k) =>
    k.includes(SUBJECT_KEY_SEP)
  );
  console.log(
    `${COLORS_PATH}: ${Object.keys(map).length} entries ` +
      `(${subjectKeys.length} subject-derived), palette=${PALETTE_SIZE}`,
  );
}

if (import.meta.main) {
  await main();
}
