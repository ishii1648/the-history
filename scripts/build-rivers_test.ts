import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import nameJa from "../data/name-ja.json" with { type: "json" };
import {
  buildRiversSourceUrl,
  canonicalRiverName,
  clipRiversToBbox,
  extractSourceRiverNames,
  filterMajorRivers,
  MAX_SCALERANK,
  pruneRiverProperties,
  RIVER_NAME_ALIASES,
  RIVERS_SIZE_LIMIT_BYTES,
  RIVERS_SOURCE_COMMIT,
  RIVERS_SOURCE_LICENSE,
  RIVERS_SOURCE_REPO,
} from "./build-rivers.ts";

/** テスト用に MultiLineString の Feature を組み立てる */
function multiLineFeature(
  properties: Record<string, unknown>,
  lines: number[][][],
): Feature<MultiLineString> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "MultiLineString", coordinates: lines },
  };
}

Deno.test("buildRiversSourceUrl はピン留めコミットの raw URL を生成する", () => {
  assertEquals(
    buildRiversSourceUrl(),
    `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${RIVERS_SOURCE_COMMIT}/geojson/ne_50m_rivers_lake_centerlines.geojson`,
  );
});

Deno.test("定数は仕様どおりの出典情報とサイズ上限を持つ", () => {
  assertEquals(RIVERS_SOURCE_REPO, "nvkelso/natural-earth-vector");
  assertEquals(RIVERS_SOURCE_COMMIT.length, 40);
  assertEquals(RIVERS_SOURCE_LICENSE, "Public Domain (Natural Earth)");
  assertEquals(RIVERS_SIZE_LIMIT_BYTES, 150 * 1000);
  // Elbe（scalerank 5）が残る閾値であること
  assert(MAX_SCALERANK >= 5);
});

Deno.test("filterMajorRivers は scalerank が閾値以下の feature のみ残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "Danube", scalerank: 2 }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "Elbe", scalerank: 5 }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "Minor", scalerank: 6 }, [[[0, 0], [1, 1]]]),
    ],
  };

  const filtered = filterMajorRivers(fc, 5);

  const names = filtered.features.map((f) => f.properties?.name);
  assertEquals(names, ["Danube", "Elbe"]);
});

Deno.test("filterMajorRivers は scalerank が数値でない feature を除去する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "no-rank" }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "bad-rank", scalerank: "x" }, [[[0, 0], [
        1,
        1,
      ]]]),
      multiLineFeature({ name: "ok", scalerank: 1 }, [[[0, 0], [1, 1]]]),
    ],
  };

  const filtered = filterMajorRivers(fc, 5);

  assertEquals(filtered.features.map((f) => f.properties?.name), ["ok"]);
});

Deno.test("clipRiversToBbox は bbox 外のラインを除去し、空パートを残さない", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      // 完全に内側
      multiLineFeature({ name: "inside" }, [[[2, 2], [8, 8]]]),
      // 完全に外側 → 除去される
      multiLineFeature({ name: "outside" }, [[[20, 20], [30, 30]]]),
      // 一部が内側・一部が外側 → 内側パートのみ残る
      multiLineFeature({ name: "mixed" }, [
        [[2, 2], [8, 8]],
        [[20, 20], [30, 30]],
      ]),
      // bbox をまたぐ → 内側区間に切り詰められる
      multiLineFeature({ name: "crossing" }, [[[5, 5], [15, 5]]]),
    ],
  };

  const clipped = clipRiversToBbox(fc, [0, 0, 10, 10]);

  const names = clipped.features.map((f) => f.properties?.name).sort();
  assertEquals(names, ["crossing", "inside", "mixed"]);

  for (const feature of clipped.features) {
    const geometry = feature.geometry;
    assert(geometry !== null);
    assert(
      geometry.type === "LineString" || geometry.type === "MultiLineString",
    );
    if (geometry.type === "MultiLineString") {
      assert(geometry.coordinates.length > 0);
      for (const line of geometry.coordinates) {
        assert(line.length >= 2, "点数 2 未満のラインが残ってはいけない");
      }
    }
  }

  // crossing は x=10 で切り詰められる
  const crossing = clipped.features.find(
    (f) => f.properties?.name === "crossing",
  );
  assert(crossing !== undefined);
  const coords = crossing.geometry.type === "MultiLineString"
    ? crossing.geometry.coordinates.flat()
    : (crossing.geometry as { coordinates: number[][] }).coordinates;
  for (const [x] of coords) {
    assert(x <= 10, `bbox 外の座標が残っている: x=${x}`);
  }
});

Deno.test("clipRiversToBbox はライン以外のジオメトリをスキップする", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "point" },
        geometry: { type: "Point", coordinates: [5, 5] },
      },
      multiLineFeature({ name: "line" }, [[[2, 2], [8, 8]]]),
    ],
  };

  const clipped = clipRiversToBbox(fc, [0, 0, 10, 10]);

  assertEquals(clipped.features.map((f) => f.properties?.name), ["line"]);
});

Deno.test("pruneRiverProperties は name と scalerank のみ残す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature(
        {
          name: "Rhine",
          scalerank: 4,
          featurecla: "River",
          min_zoom: 3.0,
          note: "x",
        },
        [[[0, 0], [1, 1]]],
      ),
      multiLineFeature({ scalerank: 3 }, [[[0, 0], [1, 1]]]),
    ],
  };

  const pruned = pruneRiverProperties(fc);

  assertEquals(pruned.features[0].properties, { name: "Rhine", scalerank: 4 });
  // name が無い feature は name: null で正規化する
  assertEquals(pruned.features[1].properties, { name: null, scalerank: 3 });
});

// TASK-56: NE 50m データは河川が国境をまたぐ区間で呼称のみ変わる（実体は同一の
// 川の続き）。src/rivers.ts の選択強調（riverLineColor 等）は feature の name
// 完全一致で判定するため、正規化しないと該当区間だけ強調から漏れ、
// 「途中で切れる」不具合になる。実データ（data/rivers.geojson の生成前）で
// 確認した継続区間の例: Rhein(独)→Rhein(独, 別 feature)→Rhin(仏)→Rhine(英名。
// 独仏国境をまたぐ本流)、Donau(独墺)→Danube(バルカン以東)、
// Dicle(トルコ)→Tigris(イラク)、Firat/Al Furat(トルコ・シリア)→
// Euphrates(イラク)、Dnepre→Dnipro(白・宇)。各区間の端点座標が隣接区間の
// 端点と一致することを目視で確認済み（デルタの分流 Nederrijn/Lek/Waal や
// Bratul Chillia 等は実体が異なる水路のため対象外、data/name-ja.json でも
// 個別の日本語名を持つ）。
Deno.test("canonicalRiverName は国境で呼称のみ変わる別名を代表名へ正規化する", () => {
  assertEquals(canonicalRiverName("Rhein"), "Rhine");
  assertEquals(canonicalRiverName("Rhin"), "Rhine");
  assertEquals(canonicalRiverName("Rhine"), "Rhine");
  assertEquals(canonicalRiverName("Donau"), "Danube");
  assertEquals(canonicalRiverName("Danube"), "Danube");
  assertEquals(canonicalRiverName("Dicle"), "Tigris");
  assertEquals(canonicalRiverName("Tigris"), "Tigris");
  assertEquals(canonicalRiverName("Firat"), "Euphrates");
  assertEquals(canonicalRiverName("Al Furat"), "Euphrates");
  assertEquals(canonicalRiverName("Euphrates"), "Euphrates");
  assertEquals(canonicalRiverName("Dnepre"), "Dnipro");
  assertEquals(canonicalRiverName("Dnipro"), "Dnipro");
  // デルタの分流は実体が異なる水路のため正規化対象外（別名のまま）
  assertEquals(canonicalRiverName("Nederrijn"), "Nederrijn");
  assertEquals(canonicalRiverName("Waal"), "Waal");
  assertEquals(canonicalRiverName("Bratul Chillia"), "Bratul Chillia");
  // 未知の名前はそのまま返す
  assertEquals(canonicalRiverName("Seine"), "Seine");
});

Deno.test("pruneRiverProperties は name を canonicalRiverName で正規化する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "Rhein", scalerank: 4 }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "Donau", scalerank: 2 }, [[[0, 0], [1, 1]]]),
    ],
  };

  const pruned = pruneRiverProperties(fc);

  assertEquals(pruned.features[0].properties?.name, "Rhine");
  assertEquals(pruned.features[1].properties?.name, "Danube");
});

// 横展開（AC#4）: RIVER_NAME_ALIASES の正規化先（canonical name）自体が
// data/name-ja.json に登録されていることを保証する。正規化先が未登録だと
// riverLabelAnchors（src/rivers.ts）のラベルが英語のまま表示され、選択強調は
// 直っても表示名が壊れる回帰を防ぐ。
Deno.test("RIVER_NAME_ALIASES の正規化先は全て name-ja.json に登録済み", () => {
  const ja: Record<string, string> = nameJa;
  for (const canonical of Object.values(RIVER_NAME_ALIASES)) {
    assert(
      canonical in ja,
      `正規化先 "${canonical}" が data/name-ja.json に無い`,
    );
  }
});

Deno.test("extractSourceRiverNames は名寄せ前のユニーク name をソートして返す", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "Rhein", scalerank: 4 }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "Rhein", scalerank: 4 }, [[[1, 1], [2, 2]]]),
      multiLineFeature({ name: "Donau", scalerank: 2 }, [[[0, 0], [1, 1]]]),
      // name 欠損・非文字列は除外する
      multiLineFeature({ scalerank: 3 }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: 42, scalerank: 3 }, [[[0, 0], [1, 1]]]),
    ],
  };

  // 正規化（canonicalRiverName）を通す前の生ソース名がそのまま返ること
  assertEquals(extractSourceRiverNames(fc), ["Donau", "Rhein"]);
});

// 回帰テストの土台（TASK-63）: 名寄せ「前」の生ソース名スナップショット。
//
// TASK-56 以前は data/rivers.geojson から名前一覧を再生成していたが、TASK-56 で
// rivers.geojson は正準名のみ・name-ja.json もエイリアスキー剪定済みとなった。
// その結果、生成物由来のリストでは『同一の川が国境で別名に分割されていないか』
// のクロスチェックが対象河川に対して二度と発火しない（空振り）。そこで検証対象
// をパイプラインの名寄せ前段（フィルタ + クリップ後、canonicalRiverName 適用前）
// のソース名に変更する。
//
// Natural Earth ソースは RIVERS_SOURCE_COMMIT にピン留めされているため、この
// スナップショットはコミットを更新しない限り安定する。CI（オフライン）では
// ネットワークに触れず、この静的リストだけで検証する。
//
// 再生成コマンド（RIVERS_SOURCE_COMMIT 更新時に実行して手動更新する）:
//   deno task build-rivers --print-source-names
const SOURCE_RIVER_NAMES = [
  "Al Furat",
  "Amu  Darya",
  "Borcea",
  "Bratul Chillia",
  "Bratul Sfintu Gheorghe",
  "Bratul Sulina",
  "Danube",
  "Daugava",
  "Dicle",
  "Dnepre",
  "Dnipro",
  "Donau",
  "Ebro",
  "Elbe",
  "Euphrates",
  "Firat",
  "Lek",
  "Loire",
  "Nederrijn",
  "Neva",
  "Oder",
  "Pechora",
  "Rhein",
  "Rhin",
  "Rhine",
  "Seine",
  "Severnaya Dvina",
  "Sukhona",
  "Svir’",
  "Tajo",
  "Tejo",
  "Tigris",
  "Ural",
  "Vistula",
  "Volga",
  "Vychegda",
  "Waal",
];

// 回帰テスト (i)（TASK-63）: 全ソース名が canonicalRiverName を通して「既知の
// 正準名」（= data/name-ja.json に日本語名を持つ名前）に写ることを固定する。
// ソース更新で新たな国境またぎ名前分割（例: Elbe/Labe）が入ると、未登録の
// 分割名は canonicalRiverName でそのまま素通りし name-ja.json に無い名前に
// なるため、ここで fail して RIVER_NAME_ALIASES への登録漏れを検出できる
// （TASK-56 の「クリック/ホバー強調が川の途中で切れる」回帰の再発防止）。
Deno.test("回帰: 全ソース名は canonicalRiverName 経由で name-ja.json 登録済みの正準名に写る", () => {
  const ja = nameJa as Record<string, string>;
  const unknown = SOURCE_RIVER_NAMES.filter(
    (name) => !(canonicalRiverName(name) in ja),
  );
  assertEquals(
    unknown,
    [],
    "正準名が name-ja.json に無いソース名がある。国境またぎの名前分割なら " +
      "RIVER_NAME_ALIASES へ登録、独立した河川なら name-ja.json へ日本語名を追加する",
  );
});

// 回帰テスト (ii)（TASK-63）: 同一の日本語表示名に対応するソース名群が単一の
// 正準名へ収束することを固定する。ラベルはソース名自身のエントリを優先し、
// 無ければ正準名で name-ja.json を引く（エイリアスキーは剪定済みのため）。
// 新分割名に個別の name-ja.json エントリを（既存河川と同じ表示名で）追加して
// テスト (i) をすり抜けた場合でも、表示名の衝突としてここで検出する。
// デルタの分流（Nederrijn/Lek/Waal/Bratul 各分流/Borcea）は個別の日本語名を
// 持つ別水路のため、ここでの衝突検出には現れない。
Deno.test("回帰: 同一の日本語表示名になるソース名は単一の正準名に収束する", () => {
  const ja = nameJa as Record<string, string>;
  const canonicalByJa = new Map<string, string>();
  const violations: string[] = [];
  for (const name of SOURCE_RIVER_NAMES) {
    const canonical = canonicalRiverName(name);
    const label = ja[name] ?? ja[canonical] ?? name;
    const existing = canonicalByJa.get(label);
    if (existing === undefined) {
      canonicalByJa.set(label, canonical);
    } else if (existing !== canonical) {
      violations.push(
        `表示名 "${label}" が canonical "${existing}" と "${canonical}" に分裂している（name: ${name}）`,
      );
    }
  }
  assertEquals(violations, []);
});

// スナップショットとエイリアス表の整合（TASK-63）: RIVER_NAME_ALIASES の全キー
// はソース名スナップショットに実在すること。ソース更新でエイリアス元の名前が
// 消えた場合、スナップショット再生成時にここで fail し、死んだエイリアスの
// 放置（および再生成漏れによる齟齬）を検出する。
Deno.test("RIVER_NAME_ALIASES の全キーはソース名スナップショットに存在する", () => {
  const sourceNames = new Set(SOURCE_RIVER_NAMES);
  const dead = Object.keys(RIVER_NAME_ALIASES).filter(
    (alias) => !sourceNames.has(alias),
  );
  assertEquals(
    dead,
    [],
    "ソースに存在しないエイリアスキーがある（スナップショット再生成漏れ、" +
      "またはソース更新で消えた名前）",
  );
});
