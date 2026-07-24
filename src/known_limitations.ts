/**
 * データの既知の制限（表示できない情報）一覧（TASK-46）。DOM 非依存の純粋ロジック。
 *
 * データは /data/known-limitations.json（コードと分離して管理し、今後の制限事項
 * 追加はデータ編集のみで可能にする。AC #3）で、
 * `{ "limitations": [{ id, years?: { from, to }, text }] }` の形を持つ。
 * fetch 由来で信頼できないため、ここでは「壊れたデータを安全に受け流す」
 * パース/バリデーションと、任意機能として「年代該当判定」だけを提供する
 * （notes.ts / footer.ts と同じ構成方針）。
 *
 * バリデーション方針: 壊れたデータで画面を壊さないことを最優先し、
 * - トップレベルが不正形（オブジェクトでない・limitations が非配列）なら
 *   空配列を返し console.warn する（notes.ts の parseNotesData は null を
 *   返す設計だが、known-limitations は「1 件も無ければ何も表示しない」が
 *   自然な扱いのため、呼び出し側の分岐を減らす空配列で統一する）
 * - 個々のエントリは 1 件単位で検証し、不正な要素だけを除外して残りは
 *   表示する（notesForYear の points と同じ「部分的に壊れていても使える分は
 *   使う」方針）
 */

/** known-limitations.json の URL（build 後の dist でも同じ相対パスで配信される） */
export const KNOWN_LIMITATIONS_DATA_URL = "/data/known-limitations.json";

/** 制限事項が該当する年代範囲（両端含む） */
export interface KnownLimitationYears {
  readonly from: number;
  readonly to: number;
}

/** 1 件の既知の制限事項（検証済み） */
export interface KnownLimitation {
  /** 一覧内で一意な識別子（今のところ表示には使わないが将来のキー用に保持） */
  readonly id: string;
  /** 該当する年代範囲。省略時は常時該当（例: 全年代で共通の制限） */
  readonly years?: KnownLimitationYears;
  /** 制限事項の説明文（UI にそのまま表示） */
  readonly text: string;
}

/** 非空文字列かどうか */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * years フィールドの妥当性を検証する。有効なら KnownLimitationYears を、
 * 無効なら undefined を返す。呼び出し側は undefined を「検証失敗」として
 * エントリごと除外する（years 自体は任意項目だが、指定されていて壊れている
 * 場合は不正なエントリとして扱う）。
 */
function parseYears(value: unknown): KnownLimitationYears | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const { from, to } = value as { from?: unknown; to?: unknown };
  if (typeof from !== "number" || typeof to !== "number") return undefined;
  if (from > to) return undefined;
  return { from, to };
}

/**
 * 1 件のエントリを検証し、有効なら KnownLimitation を、無効なら null を返す。
 */
function parseLimitation(raw: unknown): KnownLimitation | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const { id, text, years } = raw as {
    id?: unknown;
    text?: unknown;
    years?: unknown;
  };
  if (!isNonEmptyString(id) || !isNonEmptyString(text)) return null;

  if (years === undefined) return { id, text };

  const parsedYears = parseYears(years);
  if (parsedYears === undefined) return null;
  return { id, text, years: parsedYears };
}

/**
 * fetch した JSON を KnownLimitation[] として受け入れる（AC #3）。
 * トップレベルが不正形のときは空配列 + console.warn。個々のエントリが
 * 不正なときはそのエントリだけ除外し console.warn（一覧全体は破棄しない）。
 */
export function parseKnownLimitations(json: unknown): KnownLimitation[] {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    console.warn(
      "known-limitations.json の形式が不正です（オブジェクトではありません）。制限事項なしで継続します。",
    );
    return [];
  }
  const { limitations } = json as { limitations?: unknown };
  if (!Array.isArray(limitations)) {
    console.warn(
      "known-limitations.json の limitations が配列ではありません。制限事項なしで継続します。",
    );
    return [];
  }

  const result: KnownLimitation[] = [];
  limitations.forEach((raw, index) => {
    const parsed = parseLimitation(raw);
    if (parsed === null) {
      console.warn(
        `known-limitations.json の limitations[${index}] が不正な形式のため除外しました。`,
      );
      return;
    }
    result.push(parsed);
  });
  return result;
}

/**
 * 指定した年に制限事項が該当するか判定する。years 省略時は常時該当。
 * from/to は両端含む（inclusive）。
 */
export function isKnownLimitationActiveForYear(
  limitation: KnownLimitation,
  year: number,
): boolean {
  if (limitation.years === undefined) return true;
  return year >= limitation.years.from && year <= limitation.years.to;
}

/** UI 描画用に年代該当フラグを付与した制限事項（TASK-52） */
export interface KnownLimitationEntry extends KnownLimitation {
  /** isKnownLimitationActiveForYear(this, year) の結果。この年代に該当するか */
  readonly active: boolean;
}

/**
 * 全件を保持したまま各項目に isKnownLimitationActiveForYear の判定結果を
 * 付与する（TASK-52）。UI 側はこれを使って「全件表示 + 該当年代を視覚強調」
 * できる（絞り込み・除外はしない。既存の全件表示という挙動は変えない方針）。
 * 順序は入力の limitations と同一のまま維持する。
 */
export function knownLimitationEntries(
  limitations: readonly KnownLimitation[],
  year: number,
): KnownLimitationEntry[] {
  return limitations.map((limitation) => ({
    ...limitation,
    active: isKnownLimitationActiveForYear(limitation, year),
  }));
}
