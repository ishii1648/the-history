/**
 * 年代ごとの歴史解説パネル（TASK-33）。DOM 非依存の純粋ロジック。
 *
 * データは /data/notes.json（別タスクで生成）で、年文字列 → { points, summary }
 * のマップを持つ。取得失敗・未生成時は main.ts がトグルごと非表示にして従来
 * 表示を維持するため、ここでは「JSON の受け入れ判定」「年の解説の取り出し」
 * 「折りたたみ状態の遷移」だけを純粋関数で提供する（footer.ts と同じ構成）。
 *
 * 折りたたみの閉じ方はトグル再クリックと Escape のみで、outside-click は
 * 採用しない: 地図クリック操作が主のアプリなので、地図を操作するたびに解説が
 * 誤って閉じるのを防ぐ（footer.ts の attribution とは逆の方針）。
 */

/** notes.json の URL（build 後の dist でも同じ相対パスで配信される） */
export const NOTES_DATA_URL = "/data/notes.json";

/**
 * notes.json 全体の形。years の値は fetch 由来で信頼できないため unknown とし、
 * 形の検証は表示時の notesForYear が行う（cities.ts の CitiesData と同じ方針）。
 */
export interface NotesData {
  readonly years: Record<string, unknown>;
  readonly source?: unknown;
}

/** 1 年分の解説（検証済み） */
export interface NotesYearEntry {
  /** 出来事の箇条書き */
  readonly points: string[];
  /** まとめの段落 */
  readonly summary: string;
}

/**
 * fetch した JSON を NotesData として受け入れるか判定する。
 * years が非オブジェクト・欠落・空のときは null（= 表示する解説が 1 年分も
 * 無いので、main.ts はトグルごと非表示のまま従来表示を維持する）。
 */
export function parseNotesData(json: unknown): NotesData | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return null;
  }
  const years = (json as { years?: unknown }).years;
  if (typeof years !== "object" || years === null || Array.isArray(years)) {
    return null;
  }
  const record = years as Record<string, unknown>;
  if (Object.keys(record).length === 0) return null;
  return { ...(json as object), years: record } as NotesData;
}

/**
 * 指定年の解説を取り出す。キー欠落・不正形（エントリ非オブジェクト・points
 * 非配列・summary 非文字列）は null を返し、呼び出し側はその年の解説なしとして
 * 扱う。points 内の非文字列要素だけは 1 件単位で除外する（一部の要素が壊れて
 * いても残りの解説は表示したほうが有用なため。構造ごと壊れている場合のみ
 * 年単位で不採用にする）。
 */
export function notesForYear(
  data: NotesData,
  year: number,
): NotesYearEntry | null {
  const raw = data.years[String(year)];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return null;
  }
  const { points, summary } = raw as { points?: unknown; summary?: unknown };
  if (!Array.isArray(points) || typeof summary !== "string") return null;
  return {
    points: points.filter((p): p is string => typeof p === "string"),
    summary,
  };
}

/** パネル見出しの表記（例: 1500 → "1500 年"） */
export function notesHeadingFor(year: number): string {
  return `${year} 年`;
}

/** 解説パネルの折りたたみ状態 */
export interface NotesState {
  /** 解説パネルが展開表示されているか */
  readonly expanded: boolean;
}

/**
 * 解説パネルへのユーザー操作イベント。
 * outside-click は意図的に存在しない（モジュール先頭コメント参照）。
 */
export type NotesEvent = "toggle" | "escape";

/** 初期状態を作る（起動時は折りたたみで地図操作を妨げない） */
export function createNotesState(): NotesState {
  return { expanded: false };
}

/**
 * イベントから次状態を導く純粋関数。元の state は破壊しない。
 * escape は「閉じる」専用で、未展開時は状態を変えない。
 */
export function reduceNotesEvent(
  state: NotesState,
  event: NotesEvent,
): NotesState {
  switch (event) {
    case "toggle":
      return { expanded: !state.expanded };
    case "escape":
      return { expanded: false };
  }
}

/** トグルボタンの aria-expanded 属性値を導出する */
export function notesAriaExpanded(state: NotesState): "true" | "false" {
  return state.expanded ? "true" : "false";
}

/** 解説パネルの hidden 属性値を導出する */
export function isNotesPanelHidden(state: NotesState): boolean {
  return !state.expanded;
}
