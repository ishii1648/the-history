/**
 * ラベル層の衝突制御 extension 構成（TASK-108）。
 *
 * deck.gl の `CollisionFilterExtension` は衝突判定を 0/1 ではなく
 * `pow(アンカー近傍 5x5 px の一致率, 2.2)` の連続値（`collision_fade`）で返し、
 * 色の alpha に乗算する。負けかけたラベルは中途半端な alpha で描かれ続け、
 * さらに TextLayer の SDF は halo の alpha を `outlineColor`（不透明なクリーム）
 * から取るため、「文字だけ薄れて白っぽい輪郭が残る」ゴーストになる。
 *
 * ここではその `collision_fade` を後段で二値化する小さな LayerExtension を足し、
 * ラベルを「読める」か「出ない」かの二択に倒す。閾値・GLSL 本体は labels.ts の
 * 純粋関数（labelCollisionCutoffInject）に置き、この層は deck.gl への配線だけを持つ。
 *
 * **順序が本質**: 我々の inject は `collision_fade` が計算された後に走る必要がある。
 * deck.gl の mergeShaders は shader module を extensions の順に concat し、
 * luma.gl の assembleShaders は「top-level inject → modules の inject」の順に
 * hook 本体を積む（order 同値なら安定ソートで順序維持）。したがって
 * collision 側が module で inject している以上、こちらも **module** で出したうえで
 * extensions 配列の後ろに置く必要がある。top-level `inject` で書くと
 * collision より先に走り、修正が丸ごと無効になる。
 */

import { LayerExtension } from "@deck.gl/core";
import type { Layer } from "@deck.gl/core";
import { CollisionFilterExtension } from "@deck.gl/extensions";
import {
  LABEL_COLLISION_FADE_CUTOFF,
  labelCollisionCutoffInject,
} from "./labels.ts";

/** 二値化 GLSL を運ぶだけのシェーダモジュール名（uniform も vs/fs 本体も持たない） */
export const LABEL_COLLISION_CUTOFF_MODULE_NAME = "labelCollisionCutoff";

/** LabelCollisionCutoffExtension のオプション */
export interface LabelCollisionCutoffOptions {
  /** 二値化の閾値。既定は labels.ts の LABEL_COLLISION_FADE_CUTOFF */
  cutoff: number;
}

/**
 * `CollisionFilterExtension` の後段に置き、`collision_fade` を二値化する
 * LayerExtension（TASK-108）。単体では意味を持たず、必ず
 * `CollisionFilterExtension` と組で、かつその**後ろ**に置いて使う
 * （labelCollisionExtensions がその組を返す唯一の入口）。
 */
export class LabelCollisionCutoffExtension
  extends LayerExtension<LabelCollisionCutoffOptions> {
  static override readonly extensionName = "LabelCollisionCutoffExtension";

  constructor(
    { cutoff = LABEL_COLLISION_FADE_CUTOFF }: Partial<
      LabelCollisionCutoffOptions
    > = {},
  ) {
    super({ cutoff });
  }

  override getShaders(this: Layer, extension: LabelCollisionCutoffExtension) {
    return {
      modules: [{
        name: LABEL_COLLISION_CUTOFF_MODULE_NAME,
        inject: labelCollisionCutoffInject(extension.opts.cutoff),
      }],
    };
  }
}

/**
 * 全ラベル TextLayer が共有する extensions（TASK-108）。順序に意味があるため
 * （モジュール冒頭のコメント参照）、必ずこの関数から組み立てる。
 * deck.gl は extension の同値判定を `constructor` と `opts` の deep equal で
 * 行うため、レンダリングのたびに新しいインスタンスを返しても再コンパイルは
 * 起きない（従来 `new CollisionFilterExtension()` を毎回作っていたのと同じ）。
 */
export function labelCollisionExtensions(): [
  CollisionFilterExtension,
  LabelCollisionCutoffExtension,
] {
  return [new CollisionFilterExtension(), new LabelCollisionCutoffExtension()];
}
