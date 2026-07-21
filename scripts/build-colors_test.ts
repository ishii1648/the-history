import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import type { FeatureCollection } from "geojson";
import {
  assignColor,
  assignColorHsl,
  buildColorMap,
  compositeKey,
  deriveSubjectColor,
  deriveSubjectColorHsl,
  fnv1a,
  hslToHex,
  LIGHTNESSES,
  PALETTE_SIZE,
  paletteHslForIndex,
  probeAssignSlots,
  SATURATIONS,
  shiftLightnessForSubject,
  SUBJECT_LIGHTNESS_SHIFT,
} from "./build-colors.ts";

/** テスト用に単一 feature（ジオメトリは最小の正方形）を組み立てる */
function feature(properties: Record<string, unknown>) {
  return {
    type: "Feature" as const,
    properties,
    geometry: {
      type: "Polygon" as const,
      coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]],
    },
  };
}

function collection(
  features: Array<ReturnType<typeof feature>>,
): FeatureCollection {
  return { type: "FeatureCollection", features };
}

/** 2 つの hex 色の単純な RGB ユークリッド距離（0〜441.67） */
function rgbDistance(a: string, b: string): number {
  const parse = (hex: string) => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** hex → HSL（h: 0..360, s/l: 0..1）。色相・明度の比較用 */
function hslFromHex(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

Deno.test("fnv1a は決定的で、同一文字列に同一ハッシュを返す", () => {
  assertEquals(fnv1a("France"), fnv1a("France"));
  assertEquals(fnv1a("Holy Roman Empire"), fnv1a("Holy Roman Empire"));
  // 異なる文字列は（実質的に）異なるハッシュ
  assert(fnv1a("France") !== fnv1a("England"));
  // 既知のアンカー値（FNV-1a 32bit offset basis, 空文字列）
  assertEquals(fnv1a(""), 2166136261);
  // 非負整数を返す
  assert(Number.isInteger(fnv1a("x")) && fnv1a("x") >= 0);
});

Deno.test("hslToHex は代表的な HSL を正しい HEX に変換する", () => {
  assertEquals(hslToHex(0, 1, 0.5), "#ff0000");
  assertEquals(hslToHex(120, 1, 0.5), "#00ff00");
  assertEquals(hslToHex(240, 1, 0.5), "#0000ff");
  assertEquals(hslToHex(0, 0, 0), "#000000");
  assertEquals(hslToHex(0, 0, 1), "#ffffff");
  assertEquals(hslToHex(0, 0, 0.5), "#808080");
  // 常に #rrggbb 形式
  assert(/^#[0-9a-f]{6}$/.test(hslToHex(200, 0.6, 0.5)));
});

Deno.test("パレットは 288 色（>= 想定ユニーク NAME 数 272）を持ち、各エントリが一意", () => {
  assertEquals(PALETTE_SIZE, 24 * SATURATIONS.length * LIGHTNESSES.length);
  assert(
    PALETTE_SIZE >= 272,
    `パレット色数 ${PALETTE_SIZE} は 272 以上であること`,
  );

  const seen = new Set<string>();
  for (let i = 0; i < PALETTE_SIZE; i++) {
    const { h, s, l } = paletteHslForIndex(i);
    seen.add(`${h.toFixed(3)}|${s}|${l}`);
  }
  assertEquals(
    seen.size,
    PALETTE_SIZE,
    "パレットの (h,s,l) は全て一意であること",
  );
});

Deno.test("連続インデックスは色相が大きく離れる（隣接色衝突の緩和）", () => {
  // 黄金角配置により、隣接インデックスの色相差は最低でも 60 度以上離れる
  for (let i = 0; i < 24 - 1; i++) {
    const a = paletteHslForIndex(i).h;
    const b = paletteHslForIndex(i + 1).h;
    const diff = Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
    assert(diff >= 60, `index ${i}->${i + 1} の色相差 ${diff} が小さすぎる`);
  }
});

Deno.test("assignColor は決定的（同一 NAME は常に同色）", () => {
  assertEquals(assignColor("France"), assignColor("France"));
  assertEquals(assignColor("Byzantium"), assignColor("Byzantium"));
  assert(/^#[0-9a-f]{6}$/.test(assignColor("France")));
});

Deno.test("probeAssignSlots は決定的で、名前数 <= パレット数なら全スロット相異なる", () => {
  const names: string[] = [];
  for (let i = 0; i < 200; i++) names.push(`n-${i}`);
  const a = probeAssignSlots(names);
  const b = probeAssignSlots([...names].reverse());
  // 入力順に依存しない（決定的）
  for (const n of names) assertEquals(a.get(n), b.get(n));
  // 全スロットが相異なる（衝突は線形プロービングで解消）
  assertEquals(new Set([...a.values()]).size, names.length);
  // スロットは範囲内
  for (const s of a.values()) assert(s >= 0 && s < PALETTE_SIZE);
  // 起点は fnv1a のスロット（衝突が無ければそのまま）
  assert([...a.values()].some((s, i) => s === fnv1a(`n-${i}`) % PALETTE_SIZE));
});

Deno.test("shiftLightnessForSubject は色相・彩度を保ち明度だけをずらす", () => {
  const base = { h: 137.5, s: 0.6, l: 0.4 };
  const sub = shiftLightnessForSubject(base);
  assertEquals(sub.h, base.h);
  assertEquals(sub.s, base.s);
  assertAlmostEquals(sub.l, base.l + SUBJECT_LIGHTNESS_SHIFT, 1e-9);
  // 明るめのベースは暗くなる（[0,1] に収める）
  const bright = shiftLightnessForSubject({ h: 0, s: 0.5, l: 0.76 });
  assertAlmostEquals(bright.l, 0.76 - SUBJECT_LIGHTNESS_SHIFT, 1e-9);
  assert(bright.l >= 0 && bright.l <= 1);
});

Deno.test("deriveSubjectColorHsl は宗主国と同色相・別明度（式の単体確認）", () => {
  const suzerain = assignColorHsl("Castile");
  const derived = deriveSubjectColorHsl("Castile");
  assertAlmostEquals(derived.h, suzerain.h, 1e-9);
  assert(
    Math.abs(derived.l - suzerain.l) >= 0.1,
    `明度差 ${Math.abs(derived.l - suzerain.l)} が小さすぎる`,
  );
  assert(derived.l >= 0 && derived.l <= 1);
  assert(deriveSubjectColor("Castile") !== assignColor("Castile"));
});

Deno.test("compositeKey は属領のみ NAME|SUBJECTO、それ以外は NAME を返す", () => {
  assertEquals(compositeKey("France", null), "France");
  assertEquals(compositeKey("Cyprus", "Cyprus"), "Cyprus");
  assertEquals(compositeKey("France", ""), "France");
  assertEquals(compositeKey("Naples", "Aragon"), "Naples|Aragon");
});

Deno.test("buildColorMap: 独立勢力は NAME キーのみで、互いに相異なる色になる", () => {
  const fc = collection([
    feature({ NAME: "France", SUBJECTO: null }),
    feature({ NAME: "Cyprus", SUBJECTO: "Cyprus" }), // SUBJECTO==NAME は属領扱いしない
  ]);
  const map = buildColorMap([fc], { renames: {} });
  assert(/^#[0-9a-f]{6}$/.test(map["France"]));
  assert("Cyprus" in map && !("Cyprus|Cyprus" in map));
  // 独立勢力同士はプロービングで相異なる色になる
  assert(map["France"] !== map["Cyprus"]);
});

Deno.test("buildColorMap: 属領は複合キーで、宗主国色相から派生する", () => {
  const fc = collection([
    feature({ NAME: "Naples", SUBJECTO: "Aragon" }),
  ]);
  const map = buildColorMap([fc], { renames: {} });
  assertEquals(map["Naples|Aragon"], deriveSubjectColor("Aragon"));
  // 独立勢力としての Naples キーは（この年代のこの feature では）作られない
  assert(!("Naples" in map));
});

Deno.test("buildColorMap: 属領はプロービング後の宗主国と同色相・別明度になる", () => {
  // 独立勢力 Aragon が存在するとき、属領 Naples|Aragon は Aragon の
  // 「実表示色（プロービング後）」の色相を保ち、明度だけずれる。
  const fc = collection([
    feature({ NAME: "Aragon", SUBJECTO: null }),
    feature({ NAME: "Naples", SUBJECTO: "Aragon" }),
  ]);
  const map = buildColorMap([fc], { renames: {} });
  const su = hslFromHex(map["Aragon"]);
  const sub = hslFromHex(map["Naples|Aragon"]);
  // 同色相（hex 量子化の丸め誤差のみ許容）
  const hueDiff = Math.min(
    Math.abs(su.h - sub.h),
    360 - Math.abs(su.h - sub.h),
  );
  assert(hueDiff <= 3, `色相差 ${hueDiff.toFixed(2)} が大きすぎる`);
  // 明度は明確に異なる
  assert(
    Math.abs(su.l - sub.l) >= 0.1,
    `明度差 ${Math.abs(su.l - sub.l).toFixed(3)} が小さすぎる`,
  );
  assert(map["Naples|Aragon"] !== map["Aragon"]);
});

Deno.test("buildColorMap: SUBJECTO は renames で正規化してから宗主国色を引く", () => {
  // 生 SUBJECTO は "Castille"、renames で "Castile" に正規化して色相を引く
  const fc = collection([
    feature({ NAME: "Granada", SUBJECTO: "Castille" }),
  ]);
  const map = buildColorMap([fc], { renames: { "Castille": "Castile" } });
  // キーは生の SUBJECTO（クライアントが持つ値）で作られる
  assertEquals(map["Granada|Castille"], deriveSubjectColor("Castile"));
  // 正規化後の "Castile" の色相に寄っていること
  const suzerain = assignColorHsl("Castile");
  const hex = map["Granada|Castille"];
  // deriveSubjectColor("Castile") と一致 = 同色相
  assertEquals(hex, deriveSubjectColor("Castile"));
  assertAlmostEquals(deriveSubjectColorHsl("Castile").h, suzerain.h, 1e-9);
});

Deno.test("buildColorMap: 正規化後に SUBJECTO==NAME となる自己参照は属領扱いしない", () => {
  // NAME="Castile"（補正済み）に対し生 SUBJECTO は補正前綴り "Castille"。
  // renames で正規化すると宗主国==自分自身 → 明度をずらさずベース色にする。
  // ただしクライアントは生 SUBJECTO から複合キーを引くため、キー自体は残す。
  const fc = collection([
    feature({ NAME: "Castile", SUBJECTO: "Castille" }),
  ]);
  const map = buildColorMap([fc], { renames: { "Castille": "Castile" } });
  assertEquals(map["Castile|Castille"], assignColor("Castile"));
  // 派生（明度違い）ではないこと
  assert(map["Castile|Castille"] !== deriveSubjectColor("Castile"));
});

Deno.test("buildColorMap: NAME が null の feature は載せない", () => {
  const fc = collection([
    feature({ NAME: null, SUBJECTO: "France" }),
    feature({ NAME: "France", SUBJECTO: null }),
  ]);
  const map = buildColorMap([fc], { renames: {} });
  assertEquals(Object.keys(map).length, 1);
  assert("France" in map);
});

Deno.test("buildColorMap: 全年代で同一勢力が同色（複数コレクションで安定）", () => {
  const fc1 = collection([feature({ NAME: "France", SUBJECTO: null })]);
  const fc2 = collection([feature({ NAME: "France", SUBJECTO: null })]);
  const map = buildColorMap([fc1, fc2], { renames: {} });
  assertEquals(map["France"], assignColor("France"));
});

Deno.test("buildColorMap: 上位勢力群の色は十分に分散する（AC#3 パレット緩和）", () => {
  const majors = [
    "France",
    "Holy Roman Empire",
    "Ottoman Empire",
    "England",
    "Castile",
    "Aragon",
    "Poland-Lithuania",
    "Kingdom of Hungary",
    "Papal States",
    "Venice",
  ];
  const fc = collection(
    majors.map((n) => feature({ NAME: n, SUBJECTO: null })),
  );
  const map = buildColorMap([fc], { renames: {} });
  const colors = majors.map((n) => map[n]);
  // 全て相異なる色（プロービングで衝突解消済み）
  assertEquals(new Set(colors).size, majors.length);
  // 隣接し得る主要勢力ペアの平均色差が閾値以上（十分な彩度差）
  let total = 0;
  let count = 0;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      total += rgbDistance(colors[i], colors[j]);
      count++;
    }
  }
  const avg = total / count;
  assert(avg >= 80, `主要勢力ペアの平均色差 ${avg.toFixed(1)} が小さすぎる`);
});

Deno.test("buildColorMap: 独立勢力は互いに完全に相異なる色になる（名前数 <= パレット数）", () => {
  const names: string[] = [];
  for (let i = 0; i < 272; i++) names.push(`faction-${i}`);
  const fc = collection(names.map((n) => feature({ NAME: n, SUBJECTO: null })));
  const map = buildColorMap([fc], { renames: {} });
  const colors = names.map((n) => map[n]);
  // distinct 比率 100%（ハッシュ衝突による同色が起きない）
  assertEquals(new Set(colors).size, names.length);
});

Deno.test("buildColorMap: feature の順序に依存せず同一結果を返す（決定性）", () => {
  const names: string[] = [];
  for (let i = 0; i < 60; i++) names.push(`p-${i}`);
  const fc1 = collection(
    names.map((n) => feature({ NAME: n, SUBJECTO: null })),
  );
  const fc2 = collection(
    [...names].reverse().map((n) => feature({ NAME: n, SUBJECTO: null })),
  );
  assertEquals(
    buildColorMap([fc1], { renames: {} }),
    buildColorMap([fc2], {
      renames: {},
    }),
  );
});
