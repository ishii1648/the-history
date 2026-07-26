import { assert, assertEquals } from "@std/assert";
import knownLimitations from "../data/known-limitations.json" with {
  type: "json",
};
import {
  isKnownLimitationActiveForYear,
  parseKnownLimitations,
} from "../src/known_limitations.ts";
import { FRANCE_FIEF_OVERLAY_YEARS, SNAPSHOT_YEARS } from "../src/config.ts";

// data/known-limitations.json（TASK-46: データの既知の制限一覧）の静的検証。
// CI の `deno test` は権限なしで実行されるためファイルを実行時に読まず、
// static import（notes-json_test.ts と同方式）で内容を検証する。

Deno.test("known-limitations.json は全エントリがパーサの検証を通る", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  assertEquals(parsed.length, knownLimitations.limitations.length);
  assert(parsed.length > 0);
});

Deno.test("id は一覧内で一意である", () => {
  const ids = knownLimitations.limitations.map((entry) => entry.id);
  assertEquals(new Set(ids).size, ids.length);
});

Deno.test("1700 年の HRE 領邦境界外挿の制限注記が存在する（TASK-68）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "hre-boundaries-1700-extrapolated");
  assert(entry !== undefined, "hre-boundaries-1700-extrapolated が無い");
  // 1650 年時点の境界の外挿である旨をユーザに説明していること
  assert(
    entry.text.includes("1650"),
    "text が 1650 年時点の近似に言及していない",
  );
  assert(entry.text.includes("1700"), "text が 1700 年に言及していない");
});

Deno.test("中世フランス諸侯領の欠落が明記されている（TASK-71 AC #3）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "france-fiefs-missing-territories");
  assert(entry !== undefined, "france-fiefs-missing-territories が無い");
  // AC #3: Comté de Toulouse・王領（domaine royal）・Provence（1487 年以降のみ）
  for (const keyword of ["Toulouse", "domaine royal", "Provence", "1487"]) {
    assert(
      entry.text.includes(keyword),
      `text が ${keyword} に言及していない`,
    );
  }
});

Deno.test("フランス諸侯領の制限注記は諸侯領オーバーレイの対象年でのみ active（TASK-71 AC #3）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "france-fiefs-missing-territories");
  assert(entry !== undefined);
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      FRANCE_FIEF_OVERLAY_YEARS.includes(year),
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});

Deno.test("Flanders の 1237 年以前の欠落が 1237 年より前の対象年でのみ active（TASK-71 AC #3）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "france-fiefs-flanders-pre-1237");
  assert(entry !== undefined, "france-fiefs-flanders-pre-1237 が無い");
  assert(entry.text.includes("1237"), "text が 1237 年に言及していない");
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      FRANCE_FIEF_OVERLAY_YEARS.includes(year) && year < 1237,
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});

Deno.test("Aquitaine / Gascony の 1214 年以降の欠落が 1214 年以降の対象年でのみ active（TASK-71 AC #3）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) =>
    l.id === "france-fiefs-aquitaine-gascony-post-1214"
  );
  assert(
    entry !== undefined,
    "france-fiefs-aquitaine-gascony-post-1214 が無い",
  );
  assert(entry.text.includes("1214"), "text が 1214 年に言及していない");
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      FRANCE_FIEF_OVERLAY_YEARS.includes(year) && year > 1214,
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});

// TASK-75 / TASK-76 / TASK-83: 河川ラインが実際の河口まで描かれない。原因は
// 採用ソース（Natural Earth 50m rivers_lake_centerlines @ RIVERS_SOURCE_COMMIT）
// が幅の広い河口部・潟・入り江を河川センターラインではなく海として扱っており、
// その区間のラインが元データに存在しないこと。TASK-76 の横断検査
// （docs/data-inventory/rivers-continuity-audit.md §3.2）で、これはエルベ固有の
// 欠落ではなく Natural Earth 全体の一貫した仕様であり、ロワール・オーデル・
// テージョ・ドニプロ等にも同様に当てはまることが判明した。より詳細な 10m 版・
// ne_10m_rivers_europe でも同区間は収録されていないため補完可能な代替ソースが
// 無い。ユーザには描画不具合ではなくソース仕様の制約として明示する。
Deno.test("河口手前で河川が途切れる制約が NE 全体の仕様として明記されている（TASK-83）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "rivers-elbe-estuary-missing");
  assert(entry !== undefined, "rivers-elbe-estuary-missing が無い");
  // 途切れる位置を、ユーザが自分で地図と突き合わせられる形で説明していること。
  // 代表例は 3 河川（エルベ 9.78E / ロワール 1.74W / オーデル 14.58E）。
  for (
    const keyword of [
      "エルベ",
      "9.78",
      "ロワール",
      "1.74",
      "オーデル",
      "14.58",
      "Natural Earth",
    ]
  ) {
    assert(
      entry.text.includes(keyword),
      `text が ${keyword} に言及していない`,
    );
  }
  // エルベ限定ではなくソース全体の仕様であることが読み取れること
  assert(
    /河口部|潟/.test(entry.text) && entry.text.includes("海"),
    "text が「河口部・潟を海として扱う」仕様に言及していない",
  );
  assert(
    !/エルベ川?(の(ライン|線))?は北海の河口/.test(entry.text),
    "text がエルベ限定の記述のままになっている",
  );
  // 10m 版でも補完できないこと（代替ソース調査済みであること）に言及していること
  assert(
    entry.text.includes("10m"),
    "text が 10m 版の検証結果に言及していない",
  );
});

Deno.test("河口未到達の制約は河川オーバーレイと同じく年代非依存で常時 active（TASK-75）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "rivers-elbe-estuary-missing");
  assert(entry !== undefined);
  // 河川オーバーレイ（data/rivers.geojson）は年代非依存で全年代に同じラインを
  // 描くため、years は付けず常時該当とする
  assertEquals(entry.years, undefined);
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      true,
      `${year} 年で active になっていない`,
    );
  }
});

// TASK-80: 元データ（aourednik/historical-basemaps）は全 feature の
// BORDERPRECISION が 1 = approximate（2 = moderately precise / 3 = 国際法で確定）
// で、提供者自身が「この年代の全境界は概略」と宣言している。アプリ側は描画で
// にじみ・低 alpha にして精密線に見せない対策を入れたが、「どこまで信じて
// よいデータなのか」はテキストでも明示する必要がある。
Deno.test("全境界が概略（BORDERPRECISION=1）である旨が明記されている（TASK-80 AC #7）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "borders-are-approximate");
  assert(entry !== undefined, "borders-are-approximate が無い");
  // 序数の意味（1 = 概略）と、数百 km の直線で近似される実例に言及していること
  for (
    const keyword of [
      "BORDERPRECISION",
      "概略",
      "277",
      "206",
      "1200",
      "historical-basemaps",
    ]
  ) {
    assert(
      entry.text.includes(keyword),
      `text が ${keyword} に言及していない`,
    );
  }
  assert(
    /直線/.test(entry.text),
    "text が直線での近似に言及していない",
  );
});

Deno.test("全境界が概略である制約は年代非依存で常時 active（TASK-80 AC #7）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "borders-are-approximate");
  assert(entry !== undefined);
  // BORDERPRECISION=1 は全年代・全 feature に付いているため years は付けない
  assertEquals(entry.years, undefined);
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      true,
      `${year} 年で active になっていない`,
    );
  }
});

Deno.test("1700 年の制限注記は年代連動で 1700 のみ active になる（TASK-68）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "hre-boundaries-1700-extrapolated");
  assert(entry !== undefined);
  assertEquals(entry.years, { from: 1700, to: 1700 });
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      year === 1700,
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});
