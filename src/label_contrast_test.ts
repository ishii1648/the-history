/**
 * 強調（ホバー/クリック）中のラベル判読性のコントラスト基準（TASK-93）。
 *
 * 判読性は「文字色 vs その文字が載る面の色」で決まる。面はアクティブ塗り
 * （power_highlight.ts ACTIVE_FILL_COLOR、半透明）が羊皮紙の下地
 * （basemap.ts PARCHMENT_FLAVOR_OVERRIDES.earth）に重なった合成色なので、
 * compositeOver で合成してから contrastRatio を取る。基準値の根拠は
 * docs/app-spec.md「強調中のラベル判読性」を参照。
 */

import { assert, assertEquals } from "@std/assert";
import { compositeOver, contrastRatio, type Rgb } from "./contrast.ts";
import {
  ACTIVE_BASE_LABEL_COLOR,
  ACTIVE_FIEF_LABEL_COLOR,
  ACTIVE_HRE_LABEL_COLOR,
  BASE_LABEL_COLOR,
  buildLabelData,
  CITY_LABEL_COLOR,
  FIEF_LABEL_COLOR,
  HRE_LABEL_COLOR,
  LABEL_OUTLINE_COLOR,
  labelColorFor,
  MIN_ACTIVE_LABEL_CONTRAST,
  MIN_HALO_LABEL_CONTRAST,
  MIN_HIGHLIGHT_VISIBILITY_CONTRAST,
  MIN_SECONDARY_LABEL_CONTRAST,
  RIVER_LABEL_COLOR,
} from "./labels.ts";
import {
  ACTIVE_FILL_COLOR,
  createPowerHighlightStore,
  powerLabelColor,
} from "./power_highlight.ts";
import { memoizeLatest } from "./memo.ts";
import type { FeatureCollection } from "geojson";
import { PARCHMENT_FLAVOR_OVERRIDES } from "./basemap.ts";
import { hexToRgb } from "./powers.ts";

/** 地図の下地（羊皮紙の陸地色）。basemap.ts の定義から引く（値の二重管理を避ける） */
const EARTH: Rgb = hexToRgb(PARCHMENT_FLAVOR_OVERRIDES.earth)!;

/** アクティブ塗りを下地に合成した、強調中のラベルの実背景色 */
const ACTIVE_BG: Rgb = compositeOver(ACTIVE_FILL_COLOR, EARTH);

/** TASK-93 修正前のアクティブ塗り（回帰の before 値として固定） */
const LEGACY_ACTIVE_FILL = [46, 110, 102, 214] as const;
const LEGACY_ACTIVE_BG: Rgb = compositeOver(LEGACY_ACTIVE_FILL, EARTH);

/** RGB から 3 チャンネルだけ取り出す（LabelColor は RGBA） */
function rgb(color: readonly number[]): Rgb {
  return [color[0], color[1], color[2]];
}

// ---- AC #2: 強調中のラベル色は基準値以上のコントラストを持つ ----

Deno.test("強調中の国名・諸侯領名ラベルはアクティブ塗りの上で基準コントラストを満たす", () => {
  const cases: Record<string, readonly number[]> = {
    "独立国（濃インク）": ACTIVE_BASE_LABEL_COLOR,
    "HRE 領邦（深臙脂）": ACTIVE_HRE_LABEL_COLOR,
    "仏諸侯領（深藍紫）": ACTIVE_FIEF_LABEL_COLOR,
  };
  for (const [label, color] of Object.entries(cases)) {
    const ratio = contrastRatio(rgb(color), ACTIVE_BG);
    assert(
      ratio >= MIN_ACTIVE_LABEL_CONTRAST,
      `${label} のコントラストが基準未満: ${ratio.toFixed(2)}:1`,
    );
  }
});

// ---- AC #7: 回帰の再現条件（修正前の配色では基準を満たせない）----

Deno.test("通常色のままではアクティブ塗り上で基準を満たせない（TASK-93 の再現条件）", () => {
  // 修正前は塗りが暗く（LEGACY）、かつラベル色が強調状態に依存しなかったため、
  // 国名・諸侯領名のいずれも基準を大きく下回っていた。
  for (const color of [BASE_LABEL_COLOR, HRE_LABEL_COLOR, FIEF_LABEL_COLOR]) {
    const ratio = contrastRatio(rgb(color), LEGACY_ACTIVE_BG);
    assert(
      ratio < MIN_ACTIVE_LABEL_CONTRAST,
      `修正前の配色が基準を満たしてしまっている: ${ratio.toFixed(2)}:1`,
    );
  }
  // 塗りを明るくしただけでは、色みを持つ諸侯領（藍紫）・HRE 領邦（臙脂）が
  // なお基準に届かない。文字色の切替が必要であることの根拠。
  for (const color of [HRE_LABEL_COLOR, FIEF_LABEL_COLOR]) {
    const ratio = contrastRatio(rgb(color), ACTIVE_BG);
    assert(
      ratio < MIN_ACTIVE_LABEL_CONTRAST,
      `塗り調整のみで基準を満たしてしまっている: ${ratio.toFixed(2)}:1`,
    );
  }
});

Deno.test("強調時の色切替で全ラベル種別が修正前より改善する", () => {
  const pairs: [readonly number[], readonly number[]][] = [
    [BASE_LABEL_COLOR, ACTIVE_BASE_LABEL_COLOR],
    [HRE_LABEL_COLOR, ACTIVE_HRE_LABEL_COLOR],
    [FIEF_LABEL_COLOR, ACTIVE_FIEF_LABEL_COLOR],
  ];
  for (const [before, after] of pairs) {
    const beforeRatio = contrastRatio(rgb(before), LEGACY_ACTIVE_BG);
    const afterRatio = contrastRatio(rgb(after), ACTIVE_BG);
    assert(
      afterRatio > beforeRatio,
      `改善していない: ${beforeRatio.toFixed(2)} -> ${afterRatio.toFixed(2)}`,
    );
  }
});

// ---- 対象外ラベル（都市名・河川名）の扱い ----

Deno.test("都市名ラベルは色を切り替えないが副基準（大きめ文字相当）は満たす", () => {
  const ratio = contrastRatio(rgb(CITY_LABEL_COLOR), ACTIVE_BG);
  assert(
    ratio >= MIN_SECONDARY_LABEL_CONTRAST,
    `都市名のコントラストが副基準未満: ${ratio.toFixed(2)}:1`,
  );
});

Deno.test("河川名ラベルは色を切り替えないが塗り調整で修正前より改善する", () => {
  // 河川名（水色）はアクティブ塗り（緑青）と同じ寒色域のため、塗りの明度を
  // 変えても基準には届かない。判読はクリーム halo が担う（docs 参照）。
  // ここでは「悪化させない」ことだけを固定する。
  const before = contrastRatio(rgb(RIVER_LABEL_COLOR), LEGACY_ACTIVE_BG);
  const after = contrastRatio(rgb(RIVER_LABEL_COLOR), ACTIVE_BG);
  assert(after > before, `河川名が悪化した: ${before} -> ${after}`);
});

// ---- AC #5: 強調そのものの見え方を壊さない ----

Deno.test("アクティブ塗りは羊皮紙の下地と十分な差を保つ（強調が見えること）", () => {
  const ratio = contrastRatio(ACTIVE_BG, EARTH);
  assert(
    ratio >= MIN_HIGHLIGHT_VISIBILITY_CONTRAST,
    `アクティブ塗りが下地に埋もれる: ${ratio.toFixed(2)}:1`,
  );
});

Deno.test("強調時のラベル色はクリーム halo とも十分なコントラストを保つ", () => {
  for (
    const color of [
      ACTIVE_BASE_LABEL_COLOR,
      ACTIVE_HRE_LABEL_COLOR,
      ACTIVE_FIEF_LABEL_COLOR,
    ]
  ) {
    const ratio = contrastRatio(rgb(color), rgb(LABEL_OUTLINE_COLOR));
    assert(
      ratio >= MIN_HALO_LABEL_CONTRAST,
      `halo とのコントラストが不足: ${ratio.toFixed(2)}:1`,
    );
  }
});

Deno.test("強調時のラベル色は通常色より暗く、色相の系統（TASK-30/71）を保つ", () => {
  // 濃さの方向: 強調時はより深いインクにする（明るい文字にすると halo の
  // クリームと近づき、halo による輪郭が効かなくなる）。
  assert(ACTIVE_BASE_LABEL_COLOR[0] < BASE_LABEL_COLOR[0]);
  // HRE は赤が最大チャンネル（臙脂の系統）、諸侯領は青が最大（藍紫の系統）。
  assert(
    ACTIVE_HRE_LABEL_COLOR[0] > ACTIVE_HRE_LABEL_COLOR[1] &&
      ACTIVE_HRE_LABEL_COLOR[0] > ACTIVE_HRE_LABEL_COLOR[2],
  );
  assert(
    ACTIVE_FIEF_LABEL_COLOR[2] > ACTIVE_FIEF_LABEL_COLOR[0] &&
      ACTIVE_FIEF_LABEL_COLOR[2] > ACTIVE_FIEF_LABEL_COLOR[1],
  );
});

// ---- AC #1/#3/#4: 強調状態に応じた色の切替と復帰 ----

Deno.test("labelColorFor: active=true で強調色、false/省略で通常色", () => {
  assertEquals(labelColorFor({ kind: "base" }, true), ACTIVE_BASE_LABEL_COLOR);
  assertEquals(labelColorFor({ kind: "hre" }, true), ACTIVE_HRE_LABEL_COLOR);
  assertEquals(labelColorFor({ kind: "fief" }, true), ACTIVE_FIEF_LABEL_COLOR);
  assertEquals(labelColorFor({ kind: "base" }, false), BASE_LABEL_COLOR);
  assertEquals(labelColorFor({ kind: "hre" }), HRE_LABEL_COLOR);
  assertEquals(labelColorFor({ kind: "fief" }), FIEF_LABEL_COLOR);
});

Deno.test("powerLabelColor: ホバー中の勢力キーを持つラベルだけが強調色になる", () => {
  const france = { kind: "base" as const, key: "France" };
  const normandy = { kind: "fief" as const, key: "Normandy" };
  assertEquals(
    powerLabelColor(france, null, "France"),
    ACTIVE_BASE_LABEL_COLOR,
  );
  assertEquals(powerLabelColor(normandy, null, "France"), FIEF_LABEL_COLOR);
});

Deno.test("powerLabelColor: クリック選択でも同じ強調色になる（AC #3）", () => {
  const bavaria = { kind: "hre" as const, key: "Bavaria|Holy Roman Empire" };
  assertEquals(
    powerLabelColor(bavaria, "Bavaria|Holy Roman Empire", null),
    ACTIVE_HRE_LABEL_COLOR,
  );
});

Deno.test("powerLabelColor: 強調解除で通常のラベル色へ戻る（AC #4）", () => {
  const france = { kind: "base" as const, key: "France" };
  assertEquals(
    powerLabelColor(france, "France", "France"),
    ACTIVE_BASE_LABEL_COLOR,
  );
  assertEquals(powerLabelColor(france, null, null), BASE_LABEL_COLOR);
});

// ---- AC #6: 強調の変化でラベルデータを作り直さない ----

Deno.test("強調キーはラベルデータ生成時に確定し、強調状態でメモ化が壊れない（AC #6）", () => {
  // main.ts の memoizedPowerLabelData と同じ構図: buildLabelData の引数に
  // 強調状態は入らないため、ホバーが動いても同じ参照が返り polylabel は
  // 再実行されない。色の切替は accessor（powerLabelColor）側だけで起きる。
  let builds = 0;
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: { NAME: "France" },
      geometry: {
        type: "Polygon",
        coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
      },
    }],
  };
  const build = memoizeLatest((fc: FeatureCollection) => {
    builds++;
    return buildLabelData(fc, {}, "base");
  });

  const store = createPowerHighlightStore(() => {
    // renderLayers 相当。強調が変わるたびに呼ばれる
    build(fc);
  });
  const first = build(fc);
  assertEquals(builds, 1);

  store.hover("France");
  store.hover("Normandy");
  store.click("Normandy");
  store.clear();
  assertEquals(builds, 1, "強調の変化でラベルデータを作り直してはいけない");
  assertEquals(build(fc), first);
  // 強調状態に依らず色だけが切り替わること
  assertEquals(
    powerLabelColor(first[0], null, "France"),
    ACTIVE_BASE_LABEL_COLOR,
  );
  assertEquals(powerLabelColor(first[0], null, null), BASE_LABEL_COLOR);
});

Deno.test("powerLabelColor: key を持たないラベル（河川・都市）は常に通常色", () => {
  assertEquals(
    powerLabelColor({ kind: "base" }, "France", "France"),
    BASE_LABEL_COLOR,
  );
});
