import { assertEquals } from "@std/assert";
import {
  displayLabel,
  SHORT_COMMIT_LENGTH,
  SOURCE_LINE_LABELS,
  sourceLines,
  TOOLTIP_OFFSET_X,
  TOOLTIP_OFFSET_Y,
  tooltipPlacement,
} from "./info.ts";

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

// --- tooltipPlacement（TASK-111） ---

Deno.test("tooltipPlacement は余白が足りていればカーソルの右下へ +12/+12 で置く", () => {
  assertEquals(
    tooltipPlacement(
      { x: 100, y: 100 },
      { width: 200, height: 40 },
      { width: 1000, height: 800 },
    ),
    { left: 100 + TOOLTIP_OFFSET_X, top: 100 + TOOLTIP_OFFSET_Y },
  );
});

Deno.test("tooltipPlacement は右端にちょうど収まる場合はフリップしない", () => {
  // left(=788) + width(200) == viewport.width(1000) → はみ出していないので右下のまま
  assertEquals(
    tooltipPlacement(
      { x: 776, y: 100 },
      { width: 200, height: 40 },
      { width: 1000, height: 800 },
    ),
    { left: 788, top: 112 },
  );
});

Deno.test("tooltipPlacement は右端でカーソルの左側へフリップする", () => {
  // 900 + 12 + 200 = 1112 > 1000 → left = 900 - 12 - 200
  assertEquals(
    tooltipPlacement(
      { x: 900, y: 100 },
      { width: 200, height: 40 },
      { width: 1000, height: 800 },
    ),
    { left: 688, top: 112 },
  );
});

Deno.test("tooltipPlacement は下端でカーソルの上側へフリップする", () => {
  // 780 + 12 + 40 = 832 > 800 → top = 780 - 12 - 40
  assertEquals(
    tooltipPlacement(
      { x: 100, y: 780 },
      { width: 200, height: 40 },
      { width: 1000, height: 800 },
    ),
    { left: 112, top: 728 },
  );
});

Deno.test("tooltipPlacement は右下の角で水平・垂直の両方をフリップする", () => {
  assertEquals(
    tooltipPlacement(
      { x: 900, y: 780 },
      { width: 200, height: 40 },
      { width: 1000, height: 800 },
    ),
    { left: 688, top: 728 },
  );
});

Deno.test("tooltipPlacement はフリップしても収まらない狭い viewport では 0 へクランプする", () => {
  // 幅・高さとも viewport より大きい → 右下も左上も収まらないので原点へ寄せる
  assertEquals(
    tooltipPlacement(
      { x: 10, y: 10 },
      { width: 300, height: 200 },
      { width: 250, height: 150 },
    ),
    { left: 0, top: 0 },
  );
});

Deno.test("tooltipPlacement はフリップ後に左（上）へはみ出す場合も viewport 内へクランプする", () => {
  // 右へ置けず（190+12+180 > 200）フリップすると 190-12-180 = -2 で左へ出る
  // → 0 へクランプ。縦は右端フリップの影響を受けず通常配置のまま
  assertEquals(
    tooltipPlacement(
      { x: 190, y: 10 },
      { width: 180, height: 40 },
      { width: 200, height: 800 },
    ),
    { left: 0, top: 22 },
  );
});

// --- sourceLines（TASK-109: FeatureCollection の metadata → パネルの出典行） ---

/** 契約どおり全キーが揃った metadata（諸侯領 3 系統の形） */
const FULL_METADATA = {
  source: "OpenHistoricalMap",
  sourceUrl: "https://www.openhistoricalmap.org/",
  license: "CC0-1.0",
  commit: "0123456789abcdef0123456789abcdef01234567",
  borderPrecision: "出典データそのまま",
  // 契約外の生成メタ（パネルには出さない）
  year: 1200,
  featureCount: 19,
};

Deno.test("sourceLines は metadata から出典・ライセンス・境界・コミットの行を決まった順で返す", () => {
  assertEquals(sourceLines(FULL_METADATA), [
    {
      key: "source",
      label: SOURCE_LINE_LABELS.source,
      value: "OpenHistoricalMap",
      href: "https://www.openhistoricalmap.org/",
    },
    { key: "license", label: SOURCE_LINE_LABELS.license, value: "CC0-1.0" },
    {
      key: "borderPrecision",
      label: SOURCE_LINE_LABELS.borderPrecision,
      value: "出典データそのまま",
    },
    { key: "commit", label: SOURCE_LINE_LABELS.commit, value: "0123456" },
  ]);
});

Deno.test("sourceLines は metadata が無い（undefined / null）データでも空配列を返す", () => {
  assertEquals(sourceLines(undefined), []);
  assertEquals(sourceLines(null), []);
});

Deno.test("sourceLines は metadata がオブジェクトでなければ空配列を返す", () => {
  assertEquals(sourceLines("OpenHistoricalMap"), []);
  assertEquals(sourceLines(42), []);
  assertEquals(sourceLines([{ source: "OpenHistoricalMap" }]), []);
});

Deno.test("sourceLines は契約キーを 1 つも持たない metadata で空配列を返す", () => {
  // 生成メタだけを持つ現行の *_flat_* 相当（出典欄をまるごと出さない）
  assertEquals(
    sourceLines({ generatedBy: "scripts/build-fief-flat.ts", year: 1200 }),
    [],
  );
});

Deno.test("sourceLines は source だけの metadata で出典 1 行（リンクなし）を返す", () => {
  assertEquals(sourceLines({ source: "Natural Earth" }), [
    { key: "source", label: SOURCE_LINE_LABELS.source, value: "Natural Earth" },
  ]);
});

Deno.test("sourceLines は sourceUrl だけなら URL そのものを出典行の表示テキストにする", () => {
  assertEquals(sourceLines({ sourceUrl: "https://example.org/data" }), [
    {
      key: "source",
      label: SOURCE_LINE_LABELS.source,
      value: "https://example.org/data",
      href: "https://example.org/data",
    },
  ]);
});

Deno.test("sourceLines は license だけの metadata でライセンス 1 行を返す", () => {
  assertEquals(sourceLines({ license: "GPL-3.0" }), [
    { key: "license", label: SOURCE_LINE_LABELS.license, value: "GPL-3.0" },
  ]);
});

Deno.test("sourceLines は borderPrecision の語彙を解釈せずそのまま表示する", () => {
  // データ側が語彙を変えても表示側は壊れない（表示層に語彙を持たない）
  assertEquals(sourceLines({ borderPrecision: "tier-3 / 未知の区分" }), [
    {
      key: "borderPrecision",
      label: SOURCE_LINE_LABELS.borderPrecision,
      value: "tier-3 / 未知の区分",
    },
  ]);
});

Deno.test("sourceLines はコミットハッシュを先頭 7 桁に短縮する", () => {
  assertEquals(
    sourceLines({ commit: "abcdef0123456789abcdef0123456789abcdef01" }),
    [{
      key: "commit",
      label: SOURCE_LINE_LABELS.commit,
      value: "abcdef0".slice(0, SHORT_COMMIT_LENGTH),
    }],
  );
});

Deno.test("sourceLines は 16 進数でない commit（DOI 等）を短縮せずそのまま出す", () => {
  assertEquals(sourceLines({ commit: "10.7927/H4ZG6QBX" }), [
    {
      key: "commit",
      label: SOURCE_LINE_LABELS.commit,
      value: "10.7927/H4ZG6QBX",
    },
  ]);
});

Deno.test("sourceLines は空文字・非文字列の値を欠落として扱い行を出さない", () => {
  assertEquals(
    sourceLines({
      source: "",
      sourceUrl: "",
      license: null,
      commit: 12345,
      borderPrecision: { tier: 1 },
    }),
    [],
  );
});

Deno.test("sourceLines は一部だけ欠けた metadata でも残りの行を順序どおり返す", () => {
  // license と sourceUrl だけがある（source なし = 出典行は URL 表示）
  assertEquals(
    sourceLines({ license: "CC-BY-4.0", sourceUrl: "https://example.org/" }),
    [
      {
        key: "source",
        label: SOURCE_LINE_LABELS.source,
        value: "https://example.org/",
        href: "https://example.org/",
      },
      { key: "license", label: SOURCE_LINE_LABELS.license, value: "CC-BY-4.0" },
    ],
  );
});
