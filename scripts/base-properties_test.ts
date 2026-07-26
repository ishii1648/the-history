/**
 * base 勢力データ（data/europe_<year>.geojson）のプロパティ健全性を全年代で
 * 走査する回帰テスト（TASK-102）。
 *
 * 上流（aourednik/historical-basemaps）は表示に使う properties の品質が一様では
 * なく、文字化け・空値・列ずれと思われる異常値が混ざる。これらは
 * 色キー（src/powers.ts colorKeyFor）・ラベル（src/labels.ts）・勢力圏の外枠
 * （src/suzerain_extent.ts）の入力になるため、生成物を直接直さず
 * data/name-overrides.json の propertyFixes と build-data.ts の正規化で潰す。
 * ここではその結果を生成物側で検証し、再生成で戻ったら落ちるようにする。
 */

import { assert, assertEquals } from "@std/assert";
import type { FeatureCollection } from "geojson";
import { SNAPSHOT_YEARS } from "../src/config.ts";
import { colorKeyFor } from "../src/powers.ts";

/** 上流データの帰属プロパティ（NAME を解決するときの候補と同じ並び） */
const ATTRIBUTION_KEYS = ["NAME", "ABBREVN", "SUBJECTO", "PARTOF"] as const;

/** UTF-8 の復号に失敗した箇所に残る置換文字 */
const REPLACEMENT_CHAR = "�";

function readBase(year: number): FeatureCollection {
  return JSON.parse(
    Deno.readTextFileSync(`data/europe_${year}.geojson`),
  ) as FeatureCollection;
}

/** 全年代の (year, properties) を列挙する */
function* allProperties(): Generator<
  [number, Record<string, unknown>]
> {
  for (const year of SNAPSHOT_YEARS) {
    for (const feature of readBase(year).features) {
      yield [year, (feature.properties ?? {}) as Record<string, unknown>];
    }
  }
}

/** 表示に使える文字列（非空）か */
function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim() !== "";
}

Deno.test("base のプロパティに文字化け（U+FFFD）が残っていない", () => {
  const broken: string[] = [];
  for (const [year, props] of allProperties()) {
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === "string" && value.includes(REPLACEMENT_CHAR)) {
        broken.push(`${year} ${String(props.NAME)}.${key}=${value}`);
      }
    }
  }
  assertEquals(broken, [], `文字化けしたプロパティ: ${broken.join(", ")}`);
});

Deno.test("NAME を持つ feature の SUBJECTO / PARTOF が空でない", () => {
  // 空は「宗主が不明」ではなく「独立勢力」を意味するので、build-data.ts の
  // normalizeSubjectProps が NAME で埋める（＝自己参照 = 独立）。
  const empties: string[] = [];
  for (const [year, props] of allProperties()) {
    if (!isFilled(props.NAME)) continue;
    for (const key of ["SUBJECTO", "PARTOF"] as const) {
      if (!isFilled(props[key])) {
        empties.push(`${year} ${String(props.NAME)}.${key}`);
      }
    }
  }
  assertEquals(empties, [], `空の帰属プロパティ: ${empties.join(", ")}`);
});

Deno.test("SUBJECTO / PARTOF に勢力名でない値が入っていない", () => {
  // 1783 年 Lombardy の SUBJECTO="3"（BORDERPRECISION の値が 1 列ずれ込んだもの）
  // のような、名前として読めない値を弾く。
  const invalid: string[] = [];
  for (const [year, props] of allProperties()) {
    for (const key of ["NAME", "SUBJECTO", "PARTOF"] as const) {
      const value = props[key];
      if (typeof value !== "string" || value === "") continue;
      if (!/\p{Letter}/u.test(value)) {
        invalid.push(`${year} ${String(props.NAME)}.${key}=${value}`);
      }
    }
  }
  assertEquals(invalid, [], `勢力名でない値: ${invalid.join(", ")}`);
});

Deno.test("BORDERPRECISION が上流の定義域（1..3）に収まっている", () => {
  // 1=概略 / 2=中程度 / 3=確定。src/approximate_borders.ts が 1 を「概略」の
  // 描き分けに使う。TASK-101 で切り出した封土 feature は上流の値を持たない
  // （undefined）ため対象外とし、0 のような定義域外の値だけを弾く。
  const invalid: string[] = [];
  for (const [year, props] of allProperties()) {
    const value = props.BORDERPRECISION;
    if (value === undefined || value === null) continue;
    if (value !== 1 && value !== 2 && value !== 3) {
      invalid.push(`${year} ${String(props.NAME)}=${JSON.stringify(value)}`);
    }
  }
  assertEquals(
    invalid,
    [],
    `定義域外の BORDERPRECISION: ${invalid.join(", ")}`,
  );
});

Deno.test("English territory の色キーが年代間で一貫する（TASK-102）", () => {
  // colorKeyFor は NAME|SUBJECTO をキーにするため、SUBJECTO が年代で揺れると
  // 同じ勢力の色が年代切替で変わる。English territory は上流で 1279 が
  // England、1300 / 1400 が自己参照になっていた。
  //
  // 全 NAME に対する一般テストにはしない。Lombardy（1815 に Austrian Empire
  // 配下へ）のように、宗主が実際に変わる勢力が正しく存在するため。
  const keys = new Map<number, string>();
  for (const [year, props] of allProperties()) {
    if (props.NAME !== "English territory") continue;
    const key = colorKeyFor(props);
    assert(key !== null, `${year}: English territory の色キーが引けない`);
    keys.set(year, key);
  }
  assert(keys.size >= 2, "English territory が複数年代に存在しない");
  assertEquals(
    [...new Set(keys.values())],
    ["English territory|England"],
    `年代ごとの色キー: ${JSON.stringify([...keys])}`,
  );
});

Deno.test("NAME が無い feature は帰属プロパティを 1 つも持たない（TASK-102）", () => {
  // NAME 欠落 feature の扱い（AC#1）: 上流が NAME / ABBREVN / SUBJECTO / PARTOF
  // を全て空にしている＝どの勢力にも帰属させていない土地なので、名称を与えず
  // 中立色（powers.ts DEFAULT_FILL_COLOR）で無名のまま描く。
  // このテストは「帰属情報があるのに NAME を落とした」退行だけを検出する。
  const lost: string[] = [];
  for (const [year, props] of allProperties()) {
    if (isFilled(props.NAME)) continue;
    for (const key of ATTRIBUTION_KEYS) {
      if (isFilled(props[key])) {
        lost.push(`${year} ${key}=${String(props[key])}`);
      }
    }
  }
  assertEquals(lost, [], `NAME を解決できたはずの feature: ${lost.join(", ")}`);
});
