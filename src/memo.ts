/**
 * 直近 1 回分の呼び出しだけを覚える単一スロットメモ化ヘルパー（TASK-50）。
 *
 * renderLayers() は hover/selection の変化でも全レイヤーを再構築するが、
 * ラベル生成に使う重い計算（polylabel を使う buildLabelData・
 * characterSetFrom）は「年代・元データが変わらない限り」結果が変わらない。
 * これらの呼び出しを memoizeLatest で包み、直前と同じ引数（参照同値）なら
 * 再計算をスキップする。
 *
 * 引数の同値判定は Object.is（参照同値）による浅い比較のみで、ディープ
 * イコールは行わない。呼び出し側は year（プリミティブ）と FeatureCollection
 * などの「同一インスタンスなら同一データ」という参照を渡すことを前提とする
 * （main.ts の currentView は switchYear 成功時のみ新しい参照に置き換わり、
 * hover/selection の再描画では同じ参照が渡り続けるため、この前提と合致する）。
 *
 * 保持数は直近 1 組のみ（多段メモ化はしない）。renderLayers は「今の
 * year/data」に対してのみ呼ばれるため、1 スロットで十分にキャッシュヒットし、
 * 過去の year を跨いで巻き戻る操作（TASK-33 等）でもキャッシュミス＋
 * 再計算に落ちるだけで正しさは保たれる。
 */
export function memoizeLatest<Args extends readonly unknown[], R>(
  fn: (...args: Args) => R,
): (...args: Args) => R {
  let hasCache = false;
  let lastArgs: Args | null = null;
  let lastResult: R;

  return (...args: Args): R => {
    if (hasCache && lastArgs !== null && sameArgs(lastArgs, args)) {
      return lastResult;
    }
    lastResult = fn(...args);
    lastArgs = args;
    hasCache = true;
    return lastResult;
  };
}

/** 引数配列の参照同値比較（Object.is、長さ違いは不一致） */
function sameArgs(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
