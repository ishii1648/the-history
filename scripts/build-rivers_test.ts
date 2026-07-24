import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import nameJa from "../data/name-ja.json" with { type: "json" };
import {
  buildRiversSourceUrl,
  canonicalRiverName,
  clipRiversToBbox,
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

// 横展開（AC#4）: 現行の主要河川名（別名込み、48 feature 由来のユニーク名）を
// 正規化した結果、日本語表示名（name-ja.json）が同一になる名前は必ず同一の
// canonical name に集約されることを機械検証する。これにより Rhine/Danube
// 以外の主要河川（Euphrates/Tigris/Dnieper 系）でも同様の途切れが再発しないか
// を一括で検出できる。デルタの分流（Nederrijn/Lek/Waal/Bratul 各分流/Borcea）は
// name-ja.json 側で個別の日本語名を持つため、ここでの衝突検出には現れない。
Deno.test("横展開: name-ja.json で同一表示名になる河川名は同一 canonical name に正規化される", () => {
  // data/rivers.geojson（scripts/build-rivers.ts 生成物）に現れる全ユニーク name。
  // .geojson は静的 import 不可（scripts/name-ja_test.ts と同じ制約）なため、
  // データ変更時は下記コマンドで再生成して手動更新する（scripts/name-ja_test.ts
  // の STATIC_GEOJSON_AND_RIVER_NAMES と同じ運用）:
  //   python3 -c "import json; d=json.load(open('data/rivers.geojson')); print(sorted(set(f['properties'].get('name') for f in d['features'] if f['properties'].get('name'))))"
  const ALL_RIVER_NAMES = [
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
  const ja = nameJa as Record<string, string>;
  const canonicalByJa = new Map<string, string>();
  const violations: string[] = [];
  for (const name of ALL_RIVER_NAMES) {
    const label = ja[name] ?? name;
    const canonical = canonicalRiverName(name);
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
