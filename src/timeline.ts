/**
 * タイムラインスライダーの DOM 非依存な純粋ロジック。
 * - スライダー位置（index）↔ 実在年（SNAPSHOT_YEARS）の相互変換とクランプ
 * - 前後ボタン / キーボードのステップ計算（端で停止）
 * - キーボードキー → ステップ方向のマッピング
 * 参照仕様: docs/app-spec.md §5.1
 */

/** index を [0, length-1] にクランプし整数化する（純粋関数）。length<=0 は 0 */
export function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const i = Math.trunc(index);
  if (i < 0) return 0;
  if (i > length - 1) return length - 1;
  return i;
}

/** index に対応する実在年を返す（範囲外は端の年にクランプ）（純粋関数） */
export function yearAtIndex(years: readonly number[], index: number): number {
  return years[clampIndex(index, years.length)];
}

/**
 * 実在年の index を返す（純粋関数）。実在しない年（目盛りの間の年）は -1。
 * 離散スライダーの前提（間の年は選べない）を index 変換側でも担保する。
 */
export function indexOfYear(years: readonly number[], year: number): number {
  return years.indexOf(year);
}

/**
 * 実在年から delta 分だけ隣の年へ進める（純粋関数）。端では停止（クランプ）。
 * 実在しない年が渡された場合はそのまま返す（呼び出し側の想定外入力を握りつぶさない）。
 */
export function stepYear(
  years: readonly number[],
  year: number,
  delta: number,
): number {
  const idx = indexOfYear(years, year);
  if (idx === -1) return year;
  return yearAtIndex(years, idx + delta);
}

/**
 * キーボードのキー名をステップ方向へ写す（純粋関数）。
 * ← は -1、→ は +1、それ以外は 0（＝何もしない）。
 * AC #2 のキーボード操作は ← → のみを対象とする（app-spec §5.1）。
 */
export function keyToStep(key: string): -1 | 0 | 1 {
  if (key === "ArrowLeft") return -1;
  if (key === "ArrowRight") return 1;
  return 0;
}
