import { assertEquals } from "@std/assert";
import { displayLabel } from "./info.ts";

Deno.test("displayLabel は SUBJECTO が NAME と異なれば「NAME — SUBJECTO 領」を返す", () => {
  assertEquals(
    displayLabel({ NAME: "Naples", SUBJECTO: "Aragon" }),
    "Naples — Aragon 領",
  );
});

Deno.test("displayLabel は SUBJECTO が NAME と同じなら NAME のみを返す", () => {
  assertEquals(displayLabel({ NAME: "Cyprus", SUBJECTO: "Cyprus" }), "Cyprus");
});

Deno.test("displayLabel は SUBJECTO が null なら NAME のみを返す", () => {
  assertEquals(displayLabel({ NAME: "France", SUBJECTO: null }), "France");
});

Deno.test("displayLabel は SUBJECTO が空文字なら NAME のみを返す", () => {
  assertEquals(displayLabel({ NAME: "France", SUBJECTO: "" }), "France");
});

Deno.test("displayLabel は NAME が null なら null を返す（ツールチップを出さない）", () => {
  assertEquals(displayLabel({ NAME: null, SUBJECTO: "France" }), null);
});

Deno.test("displayLabel は NAME が空文字なら null を返す", () => {
  assertEquals(displayLabel({ NAME: "", SUBJECTO: "France" }), null);
});

Deno.test("displayLabel は properties が null なら null を返す", () => {
  assertEquals(displayLabel(null), null);
});

Deno.test("displayLabel は NAME が非文字列なら null を返す", () => {
  assertEquals(displayLabel({ NAME: 123, SUBJECTO: "France" }), null);
});

Deno.test("displayLabel は SUBJECTO が非文字列なら NAME のみを返す", () => {
  assertEquals(displayLabel({ NAME: "France", SUBJECTO: 42 }), "France");
});

Deno.test("displayLabel は renames で正規化後 NAME と同じ SUBJECTO を自己参照として NAME のみにする", () => {
  // NAME は補正済み、SUBJECTO は生値（綴り違い）: Scotland|Scottland
  assertEquals(
    displayLabel({ NAME: "Scotland", SUBJECTO: "Scottland" }, {
      Scottland: "Scotland",
    }),
    "Scotland",
  );
});

Deno.test("displayLabel は宗主国名を renames で正規化して表示する", () => {
  // Granada の宗主国 SUBJECTO=Castille（生値）→ Castile に正規化して表示
  assertEquals(
    displayLabel({ NAME: "Granada", SUBJECTO: "Castille" }, {
      Castille: "Castile",
    }),
    "Granada — Castile 領",
  );
});

Deno.test("displayLabel は renames に無い SUBJECTO は生値のまま表示する", () => {
  assertEquals(
    displayLabel({ NAME: "Naples", SUBJECTO: "Aragon" }, {
      Castille: "Castile",
    }),
    "Naples — Aragon 領",
  );
});

Deno.test("displayLabel は overrides を省略しても従来どおり生値で整形する", () => {
  assertEquals(
    displayLabel({ NAME: "Naples", SUBJECTO: "Aragon" }),
    "Naples — Aragon 領",
  );
});

// ---- TASK-23: 日本語表記マップ（ja）の適用 ----

Deno.test("displayLabel は ja マップで NAME と宗主国名の双方を日本語化する", () => {
  assertEquals(
    displayLabel({ NAME: "Naples", SUBJECTO: "Aragon" }, {}, {
      Naples: "ナポリ王国",
      Aragon: "アラゴン王国",
    }),
    "ナポリ王国 — アラゴン王国 領",
  );
});

Deno.test("displayLabel は renames で正規化した宗主国名に ja を適用する", () => {
  // SUBJECTO 生値 Castille → renames → Castile → ja → カスティーリャ王国
  assertEquals(
    displayLabel(
      { NAME: "Granada", SUBJECTO: "Castille" },
      { Castille: "Castile" },
      { Granada: "グラナダ", Castile: "カスティーリャ王国" },
    ),
    "グラナダ — カスティーリャ王国 領",
  );
});

Deno.test("displayLabel は ja に無い名前を英語のままフォールバックする", () => {
  assertEquals(
    displayLabel({ NAME: "Naples", SUBJECTO: "Aragon" }, {}, {
      Aragon: "アラゴン王国",
    }),
    "Naples — アラゴン王国 領",
  );
});

Deno.test("displayLabel は renames による自己参照排除後の NAME にも ja を適用する", () => {
  // Scotland|Scottland は正規化で自己参照 → NAME のみを日本語化して返す
  assertEquals(
    displayLabel(
      { NAME: "Scotland", SUBJECTO: "Scottland" },
      { Scottland: "Scotland" },
      { Scotland: "スコットランド王国" },
    ),
    "スコットランド王国",
  );
});

Deno.test("displayLabel は ja を省略すると従来どおり英語で整形する", () => {
  assertEquals(
    displayLabel({ NAME: "Granada", SUBJECTO: "Castille" }, {
      Castille: "Castile",
    }),
    "Granada — Castile 領",
  );
});
