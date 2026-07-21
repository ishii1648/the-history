/**
 * ホバー/クリック情報表示の DOM 非依存な純粋ロジック（TASK-7, docs/app-spec.md §5.2）。
 * feature の properties から人間可読の勢力ラベルを整形する。
 */

import type { GeoJsonProperties } from "geojson";

/** 独立勢力名と属領元を区切る表示用セパレータ（「NAME — SUBJECTO 領」形式） */
export const LABEL_SUBJECT_SEP = " — ";

/** 属領元名の後ろに付ける接尾辞 */
export const LABEL_SUBJECT_SUFFIX = " 領";

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
