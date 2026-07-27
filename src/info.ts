/**
 * ホバー/クリック情報表示の DOM 非依存な純粋ロジック（TASK-7, docs/app-spec.md §5.2）。
 * feature の properties から人間可読の勢力ラベルを整形する。
 */

import type { GeoJsonProperties } from "geojson";

/** 独立勢力名と属領元を区切る表示用セパレータ（「NAME — SUBJECTO 領」形式） */
export const LABEL_SUBJECT_SEP = " — ";

/** 属領元名の後ろに付ける接尾辞 */
export const LABEL_SUBJECT_SUFFIX = " 領";

/** カーソルとツールチップが重ならないよう右へずらす量（px） */
export const TOOLTIP_OFFSET_X = 12;

/** 同じく下へずらす量（px） */
export const TOOLTIP_OFFSET_Y = 12;

/** ツールチップの配置座標（親の左上を原点とする px） */
export interface TooltipPlacement {
  left: number;
  top: number;
}

/** 2 次元の点・寸法（px）。カーソル座標／実測サイズ／viewport サイズに使う */
interface Point {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

/** 1 軸分のフリップ + クランプ。start=カーソル座標, offset=ずらし量 */
function place(
  start: number,
  offset: number,
  extent: number,
  limit: number,
): number {
  let pos = start + offset;
  // 手前側（右／下）へはみ出すならカーソルの反対側へフリップする
  if (pos + extent > limit) pos = start - offset - extent;
  // フリップしても収まらない狭い viewport では viewport 内へ寄せる
  return Math.max(0, Math.min(pos, limit - extent));
}

/**
 * ホバーツールチップの配置座標を返す純粋関数（TASK-111）。
 *
 * 既定はカーソルの右下（+TOOLTIP_OFFSET_X / +TOOLTIP_OFFSET_Y）。viewport の
 * 右端・下端ではみ出す軸だけカーソルの反対側へフリップし、フリップしても
 * 収まらない（ツールチップが viewport より大きい）場合は viewport 内へ
 * クランプする。水平・垂直は独立に判定するので、右端では左へ・下端では上へ・
 * 右下の角では両方フリップする。
 *
 * size はツールチップの実測サイズ（getBoundingClientRect）を想定する。CSS 側の
 * max-width で折り返し済みの寸法が渡る前提で、この関数は改行判断を行わない。
 */
export function tooltipPlacement(
  cursor: Point,
  size: Size,
  viewport: Size,
): TooltipPlacement {
  return {
    left: place(cursor.x, TOOLTIP_OFFSET_X, size.width, viewport.width),
    top: place(cursor.y, TOOLTIP_OFFSET_Y, size.height, viewport.height),
  };
}

/** properties から文字列プロパティを取り出す。空文字・非文字列は null */
function stringProp(props: GeoJsonProperties, key: string): string | null {
  const v = props?.[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * feature の NAME / SUBJECTO から表示ラベルを整形する（純粋関数）。
 *
 * SUBJECTO は生値（補正前の綴りゆれを含む）なので、build-colors.ts の色割当と同じく
 * name-overrides.json の renames で正規化してから NAME と比較・表示する。これにより
 * NAME 補正済み × SUBJECTO 生値の自己参照（例: Scotland|Scottland）を潰し、宗主国名も
 * 正規化名で表示する（例: Granada|Castille → "Granada — Castile 領"）。
 *
 * - 正規化後の SUBJECTO を持ち、かつ NAME と異なる場合は「NAME — SUBJECTO 領」
 * - SUBJECTO が無い／正規化後に NAME 自身／空文字の場合は NAME のみ
 * - NAME が無い（null・空・非文字列）feature は null（ツールチップを出さない）
 *
 * TASK-23: ja（英語 NAME → 日本語名のフラットマップ、name-ja.json）を渡すと
 * NAME と宗主国名（renames 正規化後）の双方を日本語表記にする。ja に無い名前は
 * 英語のままフォールバックし、省略時（空マップ）は従来どおり英語で整形する。
 * 自己参照判定（SUBJECTO == NAME）は英語の正規化名同士で行い、表示だけ差し替える。
 */
export function displayLabel(
  props: GeoJsonProperties,
  renames: Record<string, string> = {},
  ja: Record<string, string> = {},
): string | null {
  const name = stringProp(props, "NAME");
  if (name === null) return null;
  const displayName = ja[name] ?? name;
  const rawSubjecto = stringProp(props, "SUBJECTO");
  if (rawSubjecto === null) return displayName;
  const subjecto = renames[rawSubjecto] ?? rawSubjecto;
  if (subjecto !== name) {
    const displaySubjecto = ja[subjecto] ?? subjecto;
    return `${displayName}${LABEL_SUBJECT_SEP}${displaySubjecto}${LABEL_SUBJECT_SUFFIX}`;
  }
  return displayName;
}

/** パネルに出す出典行の種別（DOM 側の class 接尾辞にもそのまま使う） */
export type SourceLineKey =
  | "source"
  | "license"
  | "borderPrecision"
  | "commit";

/** 出典行の見出し。行の種別と見出し文言の対応はここ 1 箇所に閉じる */
export const SOURCE_LINE_LABELS: Record<SourceLineKey, string> = {
  source: "出典",
  license: "ライセンス",
  borderPrecision: "境界",
  commit: "コミット",
};

/** 情報パネルに出す出典の 1 行（DOM 非依存の中間表現） */
export interface SourceLine {
  /** 行の種別（表示順は sourceLines の戻り値の並びが決める） */
  key: SourceLineKey;
  /** 見出し（SOURCE_LINE_LABELS 由来） */
  label: string;
  /** 表示テキスト */
  value: string;
  /** リンクにする場合の URL。無ければただのテキスト行にする */
  href?: string;
}

/** コミットハッシュを短縮表示する桁数（git の短縮 SHA と同じ 7 桁） */
export const SHORT_COMMIT_LENGTH = 7;

/** 短縮の対象とみなす 16 進ハッシュ（DOI 等の識別子を巻き込まないための判定） */
const COMMIT_HASH_PATTERN = /^[0-9a-f]{7,}$/i;

/** metadata から文字列値を取り出す。空文字・非文字列・非オブジェクトは null */
function metadataString(metadata: unknown, key: string): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  if (Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>)[key];
  return typeof v === "string" && v !== "" ? v : null;
}

/**
 * FeatureCollection の `metadata` から情報パネルの出典行を組み立てる純粋関数
 * （TASK-109, docs/app-spec.md §5.2）。DOM を作らず、行の並びだけを決める。
 *
 * データ契約（TASK-109 実装プラン）で決めたキーだけを読む:
 * `source` / `sourceUrl` / `license` / `commit` / `borderPrecision`。いずれも
 * 欠けうるので、**存在する行だけ**を決まった順（出典 → ライセンス → 境界 →
 * コミット）で返す。metadata そのものが無いデータ（現行の rivers / mountains /
 * peaks / cities など）では空配列になり、呼び出し側は出典欄ごと出さない。
 *
 * 意図的にしないこと:
 * - `borderPrecision` の語彙の解釈（区分名はデータ側の設計。表示側が語彙を
 *   持つと、データ側が区分を増減しただけで表示が壊れる）
 * - `year` / `featureCount` など契約外の生成メタの表示（パネルは出典の開示が
 *   目的で、ビルド統計はフッターや docs の担当）
 *
 * 出典行だけは `sourceUrl` があればリンクにする（取得元 URL を別行に立てると
 * 幅 320px のパネルで URL 1 本に 2〜3 行を取られるため）。`source` が無く
 * `sourceUrl` だけがある場合は URL 自体を表示テキストにする。
 */
export function sourceLines(metadata: unknown): SourceLine[] {
  const lines: SourceLine[] = [];
  const source = metadataString(metadata, "source");
  const sourceUrl = metadataString(metadata, "sourceUrl");
  if (source !== null || sourceUrl !== null) {
    lines.push({
      key: "source",
      label: SOURCE_LINE_LABELS.source,
      value: source ?? sourceUrl!,
      ...(sourceUrl === null ? {} : { href: sourceUrl }),
    });
  }
  const license = metadataString(metadata, "license");
  if (license !== null) {
    lines.push({
      key: "license",
      label: SOURCE_LINE_LABELS.license,
      value: license,
    });
  }
  const borderPrecision = metadataString(metadata, "borderPrecision");
  if (borderPrecision !== null) {
    lines.push({
      key: "borderPrecision",
      label: SOURCE_LINE_LABELS.borderPrecision,
      value: borderPrecision,
    });
  }
  const commit = metadataString(metadata, "commit");
  if (commit !== null) {
    lines.push({
      key: "commit",
      label: SOURCE_LINE_LABELS.commit,
      // 40 桁のハッシュは幅を食うだけなので短縮する。DOI 等は原形を保つ
      value: COMMIT_HASH_PATTERN.test(commit)
        ? commit.slice(0, SHORT_COMMIT_LENGTH)
        : commit,
    });
  }
  return lines;
}
