/**
 * src/ui/ 配下の DOM 配線モジュールが共有する最小 document インターフェース
 * （TASK-146。main.ts の U3 抽出）。
 *
 * collapsible.ts（TASK-53）と同じ方針で、DOM 型には直接依存せず Document が
 * 構造的に満たす最小インターフェースで受ける（Deno のユニットテストで fake を
 * 渡せるようにする）。getElementById / createElement の返り値は unknown とし、
 * 各モジュールが従来 main.ts で行っていた `as HTMLXxxElement | null` キャストと
 * 同じ粒度で、必要な最小形へ絞り込む。実呼び出し側の main.ts は document を
 * そのまま渡す。
 */

/** 要素の取得と生成の最小インターフェース（Document が満たす） */
export interface UiDocument {
  getElementById(id: string): unknown;
  createElement(tag: string): unknown;
}

/**
 * document 宛 keydown の購読口の最小インターフェース（Document が満たす）。
 * target / preventDefault はタイムラインの二重発火防止（フォーカス判定）と
 * 既定スクロールの抑止に使う。key しか読まないモジュール（解説パネル）も
 * 同じ形で受ける。
 */
export interface UiKeydownSource {
  addEventListener(
    type: "keydown",
    listener: (event: {
      key: string;
      target: unknown;
      preventDefault(): void;
    }) => void,
  ): void;
}
