import { assert, assertEquals } from "@std/assert";
import { CollisionFilterExtension } from "@deck.gl/extensions";
import {
  LABEL_COLLISION_CUTOFF_MODULE_NAME,
  LabelCollisionCutoffExtension,
  labelCollisionExtensions,
} from "./label_collision.ts";
import {
  LABEL_COLLISION_FADE_CUTOFF,
  LABEL_COLLISION_INJECT_HOOK,
  labelCollisionCutoffInject,
} from "./labels.ts";

/** deck.gl が組み立てるシェーダ仕様のうち、順序の前提に関わる部分だけ */
interface ShaderSpec {
  inject?: Record<string, string>;
  modules?: { name: string; inject?: Record<string, string> }[];
}

/**
 * extension の getShaders を呼ぶ。deck.gl 側の宣言が
 * `getShaders(this: Layer, extension: this)` で Layer を this に要求するが、
 * 実体は this を使わず extension 引数だけを見る（core layer.ts の
 * `extension.getShaders.call(this, extension)`）ため、テストからは
 * this なしで呼べる。
 */
function shadersOf(extension: object): ShaderSpec {
  const fn = (extension as { getShaders: (e: unknown) => ShaderSpec })
    .getShaders;
  return fn.call(null, extension);
}

/**
 * TASK-108: ラベル層の extensions 構成。
 *
 * この修正は「CollisionFilterExtension が計算した collision_fade を、その直後に
 * 二値化する」ことで成立している。順序が崩れる（= 我々の inject が先に走る）と
 * collision_fade はまだ 1.0 で、何も間引かれず修正が丸ごと無効になる。
 */
Deno.test("TASK-108: ラベルの extensions は衝突判定 → 二値化の順に並ぶ", () => {
  const exts = labelCollisionExtensions();
  assertEquals(exts.length, 2);
  assert(
    exts[0] instanceof CollisionFilterExtension,
    "1 つ目は CollisionFilterExtension（collision_fade を計算する側）",
  );
  assert(
    exts[1] instanceof LabelCollisionCutoffExtension,
    "2 つ目は二値化 extension（collision_fade を読む側）",
  );
});

Deno.test("TASK-108: 二値化は shader module の inject として提供される", () => {
  // deck.gl の mergeShaders は同一フックの top-level inject を文字列連結するが、
  // luma.gl は「top-level inject → modules の inject」の順に hook 本体へ積む。
  // つまり top-level inject で書くと collision モジュールより **先** に走る。
  // collision 側の inject が module 内にある以上、こちらも module で出す。
  const collisionShaders = shadersOf(new CollisionFilterExtension());
  assert(
    collisionShaders.inject === undefined,
    "CollisionFilterExtension が top-level inject を持つようになった（順序の前提が崩れる）",
  );
  assert(
    collisionShaders.modules?.[0]?.inject?.[LABEL_COLLISION_INJECT_HOOK]
      ?.includes("collision_fade = collision_isVisible"),
    "collision モジュールが GL_POSITION フックで collision_fade を計算していない",
  );

  const cutoffShaders = shadersOf(new LabelCollisionCutoffExtension());
  assert(
    cutoffShaders.inject === undefined,
    "top-level inject では collision より先に走るため順序が保証できない",
  );
  assertEquals(cutoffShaders.modules?.length, 1);
  assertEquals(
    cutoffShaders.modules?.[0].name,
    LABEL_COLLISION_CUTOFF_MODULE_NAME,
  );
  assertEquals(cutoffShaders.modules?.[0].inject, labelCollisionCutoffInject());
});

Deno.test("TASK-108: cutoff は extension の opts で差し替えられる", () => {
  const ext = new LabelCollisionCutoffExtension({ cutoff: 0.8 });
  assertEquals(
    shadersOf(ext).modules?.[0].inject,
    labelCollisionCutoffInject(0.8),
  );
  // 既定値は labels.ts の定数（実機で調整するのはこの 1 箇所だけ）
  assertEquals(
    shadersOf(new LabelCollisionCutoffExtension()).modules?.[0].inject,
    labelCollisionCutoffInject(LABEL_COLLISION_FADE_CUTOFF),
  );
});

Deno.test("TASK-108: 同一 opts の extension は deck.gl 的に同値（再コンパイルを招かない）", () => {
  const [, a] = labelCollisionExtensions();
  const [, b] = labelCollisionExtensions();
  assert(
    a !== b,
    "毎回新しいインスタンスを返す（従来の CollisionFilterExtension と同じ）",
  );
  assert(a.equals(b), "opts が同じなら同値と判定される必要がある");
  assert(
    !a.equals(new LabelCollisionCutoffExtension({ cutoff: 0.9 })),
    "cutoff が違えば非同値",
  );
});
