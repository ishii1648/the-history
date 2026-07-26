/**
 * 配色のコントラスト評価に使う色計算（TASK-93）。DOM・deck.gl 非依存の純粋関数。
 *
 * ラベルの判読性は「文字色」と「その文字が載る面の色」の相対輝度比で決まる。
 * 地図の面は半透明の塗り（勢力塗り・アクティブ塗り）が羊皮紙の下地に重なった
 * 合成結果なので、compositeOver で合成してから contrastRatio を取る。
 *
 * 計算式は WCAG 2.1 の relative luminance / contrast ratio に従う。
 */

/** 不透明色の [r,g,b]（各 0..255） */
export type Rgb = readonly [number, number, number];

/** 半透明色の [r,g,b,a]（各 0..255） */
export type Rgba = readonly [number, number, number, number];

/** sRGB の 1 チャンネル（0..255）を線形 RGB（0..1）へ（WCAG 2.1） */
export function srgbChannelToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** 相対輝度（0..1）。WCAG 2.1 の定義 */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb;
  return 0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b);
}

/**
 * 2 色のコントラスト比（1..21）。順序に依存しない（明るい方が分子）。
 * WCAG の基準値: 通常テキスト 4.5:1 / 大きめテキスト 3:1。
 */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 半透明色 fg を不透明な背景 bg の上に載せた合成色（source-over、非乗算）。
 * 端数は丸めない（丸め位置の違いで基準判定が揺れないようにするため）。
 */
export function compositeOver(fg: Rgba, bg: Rgb): Rgb {
  const alpha = fg[3] / 255;
  return [
    fg[0] * alpha + bg[0] * (1 - alpha),
    fg[1] * alpha + bg[1] * (1 - alpha),
    fg[2] * alpha + bg[2] * (1 - alpha),
  ];
}
