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

/**
 * 確度 A（明確な誤り）と判定した宗主の期待値（TASK-104）。
 *
 * 根拠は docs/data-inventory/base-attribution-audit.md §2（TASK-103 の監査）。
 * `partof` は上流が誤った宗主名を PARTOF にも入れていた場合、または隣接年代の
 * 同一勢力が SUBJECTO / PARTOF を揃えて持つ場合のみ指定する（1700 年の
 * イタリア諸邦は同年の Milan / Franche-Comté に合わせて PARTOF は自己参照の
 * まま残す）。
 */
const EXPECTED_ATTRIBUTIONS: ReadonlyArray<{
  year: number;
  name: string;
  subjecto: string;
  partof?: string;
  reason: string;
}> = [
  // A-1: 1032 年にブルグント（アルル）王国は皇帝コンラート 2 世が継承
  {
    year: 1100,
    name: "Burgandy",
    subjecto: "Holy Roman Empire",
    partof: "Holy Roman Empire",
    reason: "1032 年に帝国の構成王国",
  },
  {
    year: 1200,
    name: "Burgandy",
    subjecto: "Holy Roman Empire",
    partof: "Holy Roman Empire",
    reason: "1032 年に帝国の構成王国",
  },
  // A-2: 1018 年にバシレイオス 2 世が第一次ブルガリア帝国を併合
  {
    year: 1100,
    name: "Bulgar Khanate",
    subjecto: "Byzantine Empire",
    reason: "1018〜1185 年は東ローマ領",
  },
  // A-3: ノヴゴロド共和国はジョチ・ウルスの直接支配を受けていない
  {
    year: 1279,
    name: "Novgorod",
    subjecto: "Novgorod",
    partof: "Novgorod",
    reason: "貢納のみで直接支配は受けない",
  },
  {
    year: 1400,
    name: "Novgorod",
    subjecto: "Novgorod",
    partof: "Novgorod",
    reason: "1478 年のモスクワ併合まで存続",
  },
  // A-4: モンゴル帝国は 1260〜64 年に分裂し 1400 年に宗主として存在しない
  {
    year: 1400,
    name: "Blue Horde",
    subjecto: "Blue Horde",
    partof: "Blue Horde",
    reason: "1400 年にモンゴル帝国は存在しない",
  },
  {
    year: 1400,
    name: "White Horde",
    subjecto: "White Horde",
    partof: "White Horde",
    reason: "1400 年にモンゴル帝国は存在しない",
  },
  // A-6 / A-7: アイスランドの主権回復は 1918 年
  {
    year: 1900,
    name: "Iceland",
    subjecto: "Denmark",
    partof: "Denmark",
    reason: "1380 年以降デンマーク王の統治下",
  },
  {
    year: 1914,
    name: "Iceland",
    subjecto: "Denmark",
    partof: "Denmark",
    reason: "主権回復は 1918 年",
  },
  // A-8: 1814 年キール条約以降グリーンランドはデンマーク領
  {
    year: 1900,
    name: "Greenland",
    subjecto: "Denmark",
    partof: "Denmark",
    reason: "1814 年キール条約でデンマーク領",
  },
  // A-9: 1848 年にアルジェリアはフランス本国の県へ編入
  {
    year: 1900,
    name: "Algeria",
    subjecto: "France",
    partof: "France",
    reason: "1830 年侵攻・1848 年に本国の県へ編入",
  },
  // A-10〜A-12: ユトレヒト条約（1713 年）後の配置が 1700 年に入り込んでいる
  {
    year: 1700,
    name: "Naples",
    subjecto: "Spanish Habsburg",
    reason: "オーストリア占領は 1707 年",
  },
  {
    year: 1700,
    name: "Sardinia",
    subjecto: "Spanish Habsburg",
    reason: "オーストリア占領は 1708 年",
  },
  {
    year: 1700,
    name: "Sicily",
    subjecto: "Spanish Habsburg",
    reason: "サヴォイア領は 1713〜1720 年",
  },
  // A-13: メクレンブルク＝シュトレーリッツは 1701 年以来の主権公国
  {
    year: 1800,
    name: "Mecklenburg-Strelitz",
    subjecto: "Mecklenburg-Strelitz",
    reason: "英国との関係は同君連合ですらない",
  },
  // A-14: 上流の値が切り詰められた異常値
  {
    year: 1000,
    name: "Suomi",
    subjecto: "Suomi",
    reason: 'SUBJECTO="Suom" は切り詰め',
  },
  // A-15: 1479 年のカスティーリャ＝アラゴン合同以降スペイン王の領
  {
    year: 1530,
    name: "Sardinia",
    subjecto: "Spain",
    reason: "1420 年にアラゴンが征服を完了",
  },
  {
    year: 1600,
    name: "Sardinia",
    subjecto: "Spain",
    reason: "1420 年にアラゴンが征服を完了",
  },
];

Deno.test("確度 A と判定した宗主の誤りが是正されている（TASK-104）", () => {
  const wrong: string[] = [];
  for (const expected of EXPECTED_ATTRIBUTIONS) {
    const features = readBase(expected.year).features.filter(
      (feature) => feature.properties?.NAME === expected.name,
    );
    if (features.length === 0) {
      wrong.push(`${expected.year} ${expected.name}: feature が無い`);
      continue;
    }
    for (const feature of features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const checks: Array<[string, string]> = [
        ["SUBJECTO", expected.subjecto],
      ];
      if (expected.partof !== undefined) {
        checks.push(["PARTOF", expected.partof]);
      }
      for (const [key, want] of checks) {
        if (props[key] !== want) {
          wrong.push(
            `${expected.year} ${expected.name}.${key}=${
              JSON.stringify(props[key])
            } (期待 ${JSON.stringify(want)} / ${expected.reason})`,
          );
        }
      }
    }
  }
  assertEquals(wrong, [], `是正されていない帰属: ${wrong.join(", ")}`);
});

Deno.test("是正した宗主が同年代に勢力として実在する（TASK-104）", () => {
  // 宗主キー（suzerain_extent.ts resolveSuzerainKey）の union で外枠を描くため、
  // 宗主名が同年代の NAME に無いと「宙に浮いた宗主」になり、その勢力を選んでも
  // 外枠が出ない。1700 年の Spanish Habsburg だけは上流が同年の Milan /
  // Franche-Comté / Spain にも使っている表記で、正規化は B-3 の別タスク扱い。
  const dangling: string[] = [];
  for (const expected of EXPECTED_ATTRIBUTIONS) {
    if (expected.subjecto === expected.name) continue; // 独立（自己参照）
    if (expected.subjecto === "Spanish Habsburg") continue;
    const exists = readBase(expected.year).features.some(
      (feature) => feature.properties?.NAME === expected.subjecto,
    );
    if (!exists) {
      dangling.push(`${expected.year} ${expected.name} → ${expected.subjecto}`);
    }
  }
  assertEquals(dangling, [], `同年代に存在しない宗主: ${dangling.join(", ")}`);
});

/**
 * 名称の上書き（TASK-106 / 監査 §4）。
 *
 * propertyFixes は形状を触れないため、「その年代には存在しない勢力の名で
 * 塗られている」「一公国の名で広域が塗られている」は NAME の上書きでしか
 * 是正できない（decision-14 / decision-18 により分割・削除は不可）。
 * 上書き先は上流（historical-basemaps）自身が使う語彙に限る。
 */
const EXPECTED_NAME_OVERRIDES: ReadonlyArray<{
  year: number;
  from: string;
  to: string;
  subjecto: string;
  partof: string;
  reason: string;
}> = [
  // A-5: ルーム・セルジューク朝は 1308 年に滅亡。1400 年のアナトリア中央部は
  // カラマンほかのベイリク群（同年の上流に Beylik of Aydin が独立勢力として実在）
  {
    year: 1400,
    from: "Seljuk Caliphate",
    to: "Anatolian beyliks",
    subjecto: "Anatolian beyliks",
    partof: "Anatolian beyliks",
    reason: "1308 年に滅亡した勢力名が 1400 年に残っている",
  },
  // B-7: 131 万 km² をオカ川中流域の一公国の名で塗っている。1200 年に上流自身が
  // 使う総称 NAME へ寄せる。SUBJECTO は上流の値のまま（正規化は TASK-107）
  {
    year: 1279,
    from: "Ryazan",
    to: "Other Rus Principalities",
    subjecto: "Mongol Empire",
    partof: "Other Rus Principalities",
    reason: "リャザンの規模ではない広域を代表名で塗っている",
  },
  {
    year: 1300,
    from: "Ryazan",
    to: "Other Rus Principalities",
    subjecto: "Khanate of the Golden Horde",
    partof: "Other Rus Principalities",
    reason: "リャザンの規模ではない広域を代表名で塗っている",
  },
];

Deno.test("消滅済み・過大な勢力の NAME が上書きされている（TASK-106）", () => {
  const wrong: string[] = [];
  for (const expected of EXPECTED_NAME_OVERRIDES) {
    const features = readBase(expected.year).features;
    // 上書き前の名前は NAME / SUBJECTO / PARTOF のどこにも残らない
    // （NAME だけ変えると宙に浮いた宗主・分裂した色キーになる）
    for (const feature of features) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      for (const key of ["NAME", "SUBJECTO", "PARTOF"] as const) {
        if (props[key] === expected.from) {
          wrong.push(
            `${expected.year} ${key}=${expected.from} が残っている（${expected.reason}）`,
          );
        }
      }
    }
    const renamed = features.filter(
      (feature) => feature.properties?.NAME === expected.to,
    );
    if (renamed.length === 0) {
      wrong.push(`${expected.year} ${expected.to}: 上書き後の feature が無い`);
      continue;
    }
    for (const feature of renamed) {
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      for (
        const [key, want] of [
          ["SUBJECTO", expected.subjecto],
          ["PARTOF", expected.partof],
        ] as const
      ) {
        if (props[key] !== want) {
          wrong.push(
            `${expected.year} ${expected.to}.${key}=${
              JSON.stringify(props[key])
            } (期待 ${JSON.stringify(want)})`,
          );
        }
      }
    }
  }
  assertEquals(wrong, [], `NAME の上書きが効いていない: ${wrong.join(", ")}`);
});

Deno.test("NAME の上書きが対象年代の外へ波及していない（TASK-106）", () => {
  // 上書き前の名前が正しく使われている年代（1492 / 1500 の Ryazan は実体どおりの
  // 15.0 万 / 2.0 万 km²、1279 / 1300 の Seljuk Caliphate は 1308 年の滅亡より前）
  // まで巻き込むと、上流が持つ正しい帰属を失う。
  const survivors: ReadonlyArray<{ year: number; name: string }> = [
    { year: 1492, name: "Ryazan" },
    { year: 1500, name: "Ryazan" },
    { year: 1279, name: "Seljuk Caliphate" },
    { year: 1300, name: "Seljuk Caliphate" },
  ];
  const lost: string[] = [];
  for (const { year, name } of survivors) {
    const exists = readBase(year).features.some(
      (feature) => feature.properties?.NAME === name,
    );
    if (!exists) lost.push(`${year} ${name}`);
  }
  assertEquals(lost, [], `巻き込みで消えた勢力: ${lost.join(", ")}`);
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
