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
