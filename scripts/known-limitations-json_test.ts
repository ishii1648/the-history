import { assert, assertEquals } from "@std/assert";
import knownLimitations from "../data/known-limitations.json" with {
  type: "json",
};
import {
  isKnownLimitationActiveForYear,
  parseKnownLimitations,
} from "../src/known_limitations.ts";
import {
  FRANCE_FIEF_OVERLAY_YEARS,
  HRE_FIEF_OVERLAY_YEARS,
  ITALY_FIEF_OVERLAY_YEARS,
  SNAPSHOT_YEARS,
} from "../src/config.ts";

// data/known-limitations.json（TASK-46: データの既知の制限一覧）の静的検証。
// CI の `deno test` は権限なしで実行されるためファイルを実行時に読まず、
// static import（notes-json_test.ts と同方式）で内容を検証する。

Deno.test("known-limitations.json は全エントリがパーサの検証を通る", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  assertEquals(parsed.length, knownLimitations.limitations.length);
  assert(parsed.length > 0);
});

// #175: パネルは既定で要約（summary）だけを表示する。全エントリに要約が
// 執筆済みで、AC #3 の「2 文程度・全角 120 字以内」を満たすことをデータ側で
// 保証する（欠落時は text 冒頭で縮退表示されるが、それはあくまで壊れた
// データへの防御であり、リポジトリ内のデータは常に要約を持つ）。
Deno.test("全エントリが要約（summary）を持ち 2 文以内・全角 120 字以内である（#175 AC #3）", () => {
  for (const entry of knownLimitations.limitations) {
    const { summary } = entry as { id: string; summary?: unknown };
    assert(
      typeof summary === "string" && summary.length > 0,
      `${entry.id} に summary が無い`,
    );
    const chars = [...summary].length;
    assert(
      chars <= 120,
      `${entry.id} の summary が ${chars} 字で 120 字を超えている`,
    );
    const sentences = (summary.match(/。/g) ?? []).length;
    assert(
      sentences >= 1 && sentences <= 2,
      `${entry.id} の summary が 2 文以内でない（句点 ${sentences} 個）`,
    );
  }
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
  // TASK-87 AC#5: 許可リスト拡張後の実態（21 領邦・空白は元データ側の欠落）
  for (const keyword of ["21", "OpenHistoricalMap"]) {
    assert(
      entry.text.includes(keyword),
      `text が拡張後の実態（${keyword}）を反映していない`,
    );
  }
  assert(
    !entry.text.includes("14の"),
    "text が拡張前の 14 領邦のままになっている",
  );
});

// TASK-88 / decision-18: OHM に無い諸侯領（トゥールーズ・王領など）を現代の県
// （département）ポリゴンの union で自作する案を実測のうえ却下した。ユーザから
// 見れば「空白が埋まらない」ことに変わりはないので、なぜ埋めないのか（= 出典を
// たどれない形状は混ぜない）と、その判断の根拠になった実測値を同じエントリに
// 集約して説明する。新規 id を作らないのは、空白の理由と埋めない理由が同じ
// 制限の表裏であり、分けると年代フィルタも同一のまま 2 件が並んで冗長になるため。
Deno.test("県ポリゴン合成による諸侯領の自作を見送った旨と実測値が明記されている（TASK-88 AC #5）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "france-fiefs-missing-territories");
  assert(entry !== undefined, "france-fiefs-missing-territories が無い");
  // 検討して採らなかったこと（= 単なる未実装ではない）が読み取れること
  for (const keyword of ["県", "1790", "合成"]) {
    assert(
      entry.text.includes(keyword),
      `text が県ポリゴン合成の検討（${keyword}）に言及していない`,
    );
  }
  // 却下の根拠になった実測値（TASK-88 フェーズ 1）。
  // 一致度 IoU: 核心 6 県 28.5% 〜 12 県 41.6%
  // 1200 年の空白（208,326 km²）の充填率: 12.7% 〜 27.7%
  for (const keyword of ["28.5", "41.6", "12.7", "27.7"]) {
    assert(
      entry.text.includes(keyword),
      `text が実測値 ${keyword} に言及していない`,
    );
  }
  // 方針（出典をたどれない形状は史実データに混ぜない）に言及していること
  assert(
    /出典/.test(entry.text),
    "text が出典をたどれない形状を混ぜない方針に言及していない",
  );
});

Deno.test("県ポリゴン合成の見送りは新規 id を作らず既存 1 件に集約されている（TASK-88 AC #5）", () => {
  const ids = knownLimitations.limitations.map((entry) => entry.id);
  const added = ids.filter((id) =>
    /synth|departement|department|fief-synthesis/i.test(id)
  );
  assertEquals(
    added,
    [],
    `合成見送り用の新規 id が追加されている: ${added.join(", ")}`,
  );
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

Deno.test("900 年専用だった HRE 領邦の制限は削除されている（TASK-119）", () => {
  // TASK-86 で years が {from: 900, to: 900} に縮小されていた
  // hre-territories-pre-1500 は、900 年のスナップショット廃止（TASK-119）で
  // 対象年が存在しなくなったため項目ごと削除した。
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "hre-territories-pre-1500");
  assertEquals(entry, undefined);
});

Deno.test("中世 HRE 領邦の表示対象年は全て SNAPSHOT_YEARS に含まれる（制限注記と実装の整合）", () => {
  for (const year of HRE_FIEF_OVERLAY_YEARS) {
    assert(
      SNAPSHOT_YEARS.includes(year),
      `${year} は SNAPSHOT_YEARS に含まれない`,
    );
  }
});

Deno.test("中世イタリア諸侯領の欠落が明記されている（TASK-96 AC #7）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "italy-fiefs-missing-territories");
  assert(entry !== undefined, "italy-fiefs-missing-territories が無い");
  // 収録できなかった主要勢力と、その理由（OHM 側の欠落）に言及していること
  for (
    const keyword of [
      "ミラノ",
      "ヴェネツィア",
      "ボローニャ",
      "ウルビーノ",
      "OpenHistoricalMap",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  // 収録件数が薄い年代（1000 年は 3 件）を明示していること
  assert(
    entry.text.includes("1000年"),
    "text が 1000 年の収録状況に触れていない",
  );
});

Deno.test("イタリア諸侯領の制限注記はオーバーレイの対象年でのみ active（TASK-96 AC #7）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "italy-fiefs-missing-territories");
  assert(entry !== undefined);
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      ITALY_FIEF_OVERLAY_YEARS.includes(year),
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});

// TASK-103 の横断監査（docs/data-inventory/base-attribution-audit.md §6）で
// 「上流データの粒度・構造に由来し propertyFixes では直しきれない」と整理された
// 4 項目。propertyFixes（TASK-104 / TASK-106 / TASK-107）で是正できるのは
// properties の値だけで、年代ごとに独立した地図として作られていることに由来する
// 表記・形状のずれは残るため、ユーザに読める形で明示する（TASK-105）。
Deno.test("年代ごとの名称・宗主表記のぶれが明記されている（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-attribution-snapshot-drift");
  assert(entry !== undefined, "base-attribution-snapshot-drift が無い");
  // 原因（上流が年代ごとに独立した地図）と、ユーザが突き合わせられる実例
  for (
    const keyword of [
      "historical-basemaps",
      "Kingdom of France",
      "Kingdom of Hungary",
      "Raška",
      "Sámi",
      "TASK-103",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  // 表示名は対訳表が吸収するが配色は年代で変わる、という帰結に触れていること
  assert(/色/.test(entry.text), "text が配色への影響に言及していない");
});

Deno.test("名称・宗主表記のぶれは全年代に該当し常時 active（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-attribution-snapshot-drift");
  assert(entry !== undefined);
  // 年代ごとに独立した地図という上流の作りは全年代に共通なので years は付けない
  assertEquals(entry.years, undefined);
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      true,
      `${year} 年で active になっていない`,
    );
  }
});

Deno.test("名目上の宗主権の扱いが年代で揺れることが明記されている（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-nominal-suzerainty");
  assert(entry !== undefined, "base-nominal-suzerainty が無い");
  // 揺れの実例（アルジェ・チュニス摂政領: 1800 のみオスマン従属）と、
  // 明白な誤りだけを是正する方針に触れていること
  for (
    const keyword of [
      "アルジェ",
      "チュニス",
      "オスマン",
      "1800",
      "1815",
      "同君連合",
      "TASK-103",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  assert(/名目/.test(entry.text), "text が名目上の宗主権に言及していない");
});

Deno.test("名目上の宗主権の制限は全年代に該当し常時 active（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-nominal-suzerainty");
  assert(entry !== undefined);
  // 名目的な従属関係の描き分けは特定年代に限らないため years は付けない
  assertEquals(entry.years, undefined);
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      true,
      `${year} 年で active になっていない`,
    );
  }
});

Deno.test("消滅済み勢力名・過大な範囲の勢力名が明記されている（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-extinct-or-overbroad-powers");
  assert(entry !== undefined, "base-extinct-or-overbroad-powers が無い");
  // 1400 Seljuk Caliphate（1308 年滅亡）・1279/1300 Ryazan（約 131 万 km²）
  for (
    const keyword of [
      "セルジューク",
      "1308",
      "リャザン",
      "131万",
      "TASK-103",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  // 形状を分割・削除できない（= 名称や宗主の是正までしかできない）こと
  assert(
    /分割/.test(entry.text) && /出典/.test(entry.text),
    "text が形状を触らない方針に言及していない",
  );
  // TASK-106: 名称は上書き済みで、残る限界は「形状が実体と一致しない」ことだと
  // 読めること。上書き先の表示名（画面に出る日本語）を挙げて突き合わせられる
  // ようにする。
  for (
    const keyword of [
      "アナトリア諸侯国",
      "その他のルーシ諸公国",
      "TASK-106",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
});

Deno.test("消滅済み・過大な勢力名の制限は 1279〜1400 でのみ active（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-extinct-or-overbroad-powers");
  assert(entry !== undefined);
  assertEquals(entry.years, { from: 1279, to: 1400 });
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      year >= 1279 && year <= 1400,
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});

Deno.test("年代をまたぐポリゴンの使い回しが明記されている（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-shape-reuse");
  assert(entry !== undefined, "base-shape-reuse が無い");
  // 1279 Serbia / 1300 Raška / 1400 Bosnia は座標が完全一致（実測）。
  // 位置ずれの例として 1783・1800 の Mecklenburg-Strelitz も挙げる。
  for (
    const keyword of [
      "セルビア",
      "ラシュカ",
      "ボスニア",
      "1400",
      "メクレンブルク",
      "1783",
      "TASK-103",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  assert(
    /同じ形|完全に一致/.test(entry.text),
    "text が形状の使い回しに言及していない",
  );
});

Deno.test("ポリゴン使い回しの制限は 1300〜1400 でのみ active（TASK-105 AC #1）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "base-shape-reuse");
  assert(entry !== undefined);
  // 同一形状が別勢力名で描かれる実害が出るのは Raška(1300) → Bosnia(1400)。
  // 1783・1800 のメクレンブルクも同種だが、years は連続範囲 1 つしか表せず
  // 1492〜1715 に誤った該当バッジが出るため、本文で補って years は広げない。
  assertEquals(entry.years, { from: 1300, to: 1400 });
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      year >= 1300 && year <= 1400,
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});

Deno.test("コルシカ島の帰属が諸侯領オーバーレイ側へ移ることが明記されている（TASK-96）", () => {
  // base の「コルシカ」は 1100 年以降ピサ／ジェノヴァ共和国のポリゴンに
  // 99.8% 覆われ、fief-dedupe の被覆率でラベルが抑制される。島名のラベルが
  // 消えることは表示側の不具合ではないので、その旨を残す。
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "italy-fiefs-missing-territories");
  assert(entry !== undefined);
  assert(entry.text.includes("コルシカ"), "text がコルシカ島に触れていない");
});

// ---- ブリテン諸島の政体オーバーレイ（#172）----

Deno.test("イングランド・アイルランド一括り収録の制限がオーバーレイの実態に合わせて更新されている（#172 AC #6）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "england-ireland-wales-1530-1700");
  assert(entry !== undefined, "england-ireland-wales-1530-1700 が無い");
  // base の一括り収録は変わらないが、OHM 由来のオーバーレイがアイルランドの
  // 政体を識別可能に描くようになったことを反映する
  for (
    const keyword of [
      "OpenHistoricalMap",
      "アイルランド王国",
      "アイルランド・カトリック同盟",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  // TASK-39 時点の「分離して表示できません」という断定は実態に合わなくなった
  assert(
    !entry.text.includes("分離して表示できません"),
    "text がオーバーレイ追加前の記述のまま",
  );
  assertEquals(entry.years, { from: 1530, to: 1700 });
});

Deno.test("1283〜1707 のウェールズの欠落が年代連動で明示されている（#172 AC #6）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "britain-fiefs-wales-missing");
  assert(entry !== undefined, "britain-fiefs-wales-missing が無い");
  // 欠落が上流（OHM / Cliopatria）由来であることと、1284 年ルデュラン法令・
  // 1536 年併合法により史実とおおむね整合することの両方を明示する
  for (
    const keyword of ["OpenHistoricalMap", "Cliopatria", "1284", "1536"]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  // ウェールズ諸王国が表示されるのは 1279 まで。欠落が生じるのは 1300 以降
  assertEquals(entry.years, { from: 1300, to: 1700 });
  for (const year of SNAPSHOT_YEARS) {
    assertEquals(
      isKnownLimitationActiveForYear(entry, year),
      year >= 1300 && year <= 1700,
      `${year} 年の active 判定が期待と異なる`,
    );
  }
});

Deno.test("アイルランドの Munster / Connacht / Ulster 欠落が年代連動で明示されている（#172 AC #6）", () => {
  const parsed = parseKnownLimitations(knownLimitations);
  const entry = parsed.find((l) => l.id === "britain-fiefs-ireland-partial");
  assert(entry !== undefined, "britain-fiefs-ireland-partial が無い");
  for (
    const keyword of [
      "マンスター",
      "コナハト",
      "アルスター",
      "OpenHistoricalMap",
    ]
  ) {
    assert(entry.text.includes(keyword), `text が ${keyword} に言及していない`);
  }
  // 部分的な描画になるのは中世（1000〜1300）。1600 以降はアイルランド王国の
  // 単一政体が島全体を覆うため部分欠落ではなくなる
  assertEquals(entry.years, { from: 1000, to: 1300 });
});
