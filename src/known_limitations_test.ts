import { assertEquals } from "@std/assert";
import {
  isKnownLimitationActiveForYear,
  type KnownLimitation,
  parseKnownLimitations,
} from "./known_limitations.ts";

// ---- parseKnownLimitations: fetch した JSON の受け入れ・バリデーション ----

Deno.test("parseKnownLimitations は limitations 配列の有効なエントリを返す", () => {
  const json: unknown = {
    limitations: [
      { id: "a", years: { from: 900, to: 1492 }, text: "text-a" },
      { id: "b", text: "text-b" },
    ],
  };
  const result = parseKnownLimitations(json);
  assertEquals(result.length, 2);
  assertEquals(result[0], {
    id: "a",
    years: { from: 900, to: 1492 },
    text: "text-a",
  });
  assertEquals(result[1], { id: "b", text: "text-b" });
});

Deno.test("parseKnownLimitations はオブジェクト以外（null / 配列 / 文字列）を空配列にする", () => {
  const warn = suppressWarn();
  try {
    assertEquals(parseKnownLimitations(null), []);
    assertEquals(parseKnownLimitations([]), []);
    assertEquals(parseKnownLimitations("{}"), []);
  } finally {
    warn.restore();
  }
});

Deno.test("parseKnownLimitations は limitations が無い/非配列の JSON を空配列にする", () => {
  const warn = suppressWarn();
  try {
    assertEquals(parseKnownLimitations({}), []);
    assertEquals(parseKnownLimitations({ limitations: "broken" }), []);
    assertEquals(parseKnownLimitations({ limitations: {} }), []);
  } finally {
    warn.restore();
  }
});

Deno.test("parseKnownLimitations は id/text を欠くエントリを 1 件単位で除外する", () => {
  const warn = suppressWarn();
  try {
    const json: unknown = {
      limitations: [
        { id: "ok", text: "valid" },
        { id: "no-text" },
        { text: "no-id" },
        "broken-entry",
        null,
      ],
    };
    const result = parseKnownLimitations(json);
    assertEquals(result, [{ id: "ok", text: "valid" }]);
  } finally {
    warn.restore();
  }
});

Deno.test("parseKnownLimitations は id/text が空文字のエントリを除外する", () => {
  const warn = suppressWarn();
  try {
    const json: unknown = {
      limitations: [
        { id: "", text: "valid" },
        { id: "ok", text: "" },
      ],
    };
    assertEquals(parseKnownLimitations(json), []);
  } finally {
    warn.restore();
  }
});

Deno.test("parseKnownLimitations は years が不正形（from>to・非数値・欠落フィールド）のエントリを除外する", () => {
  const warn = suppressWarn();
  try {
    const json: unknown = {
      limitations: [
        { id: "a", years: { from: 1500, to: 1400 }, text: "t" },
        { id: "b", years: { from: "1500", to: 1600 }, text: "t" },
        { id: "c", years: { from: 1500 }, text: "t" },
        { id: "d", years: null, text: "t" },
      ],
    };
    assertEquals(parseKnownLimitations(json), []);
  } finally {
    warn.restore();
  }
});

Deno.test("parseKnownLimitations は years が同一年（from===to）のエントリを受け入れる", () => {
  const json: unknown = {
    limitations: [{ id: "a", years: { from: 900, to: 900 }, text: "t" }],
  };
  assertEquals(parseKnownLimitations(json), [
    { id: "a", years: { from: 900, to: 900 }, text: "t" },
  ]);
});

// ---- isKnownLimitationActiveForYear: 年代該当判定 ----

Deno.test("isKnownLimitationActiveForYear は years 省略時は常に true", () => {
  const limitation: KnownLimitation = { id: "a", text: "t" };
  assertEquals(isKnownLimitationActiveForYear(limitation, 900), true);
  assertEquals(isKnownLimitationActiveForYear(limitation, 1914), true);
});

Deno.test("isKnownLimitationActiveForYear は years 範囲内（境界含む）で true", () => {
  const limitation: KnownLimitation = {
    id: "a",
    years: { from: 900, to: 1492 },
    text: "t",
  };
  assertEquals(isKnownLimitationActiveForYear(limitation, 900), true);
  assertEquals(isKnownLimitationActiveForYear(limitation, 1492), true);
  assertEquals(isKnownLimitationActiveForYear(limitation, 1200), true);
});

Deno.test("isKnownLimitationActiveForYear は years 範囲外で false", () => {
  const limitation: KnownLimitation = {
    id: "a",
    years: { from: 1530, to: 1700 },
    text: "t",
  };
  assertEquals(isKnownLimitationActiveForYear(limitation, 1500), false);
  assertEquals(isKnownLimitationActiveForYear(limitation, 1715), false);
});

/**
 * console.warn を一時的に無効化し、意図的な不正データ入力テストの出力ノイズを
 * 抑える（notes.ts 系テストと異なり known_limitations は警告を出す設計のため）。
 */
function suppressWarn(): { restore: () => void } {
  const original = console.warn;
  console.warn = () => {};
  return {
    restore: () => {
      console.warn = original;
    },
  };
}
