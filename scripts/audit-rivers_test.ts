import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, MultiLineString } from "geojson";
import {
  bboxEdgesTouched,
  bboxOfPositions,
  connectParts,
  explodeParts,
  findBboxClippedRivers,
  findContinuityIssues,
  freeEndpoints,
  groupByCanonicalName,
  haversineKm,
  joinDistancesKm,
  PART_JOIN_TOLERANCE_KM,
  partDistanceKm,
  partsOf,
  pointLineKm,
  pointSegmentKm,
  sweepJoinTolerance,
  toSegments,
} from "./audit-rivers.ts";

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

/**
 * 生成物 data/rivers.geojson。拡張子が .geojson で JSON モジュールとして
 * import できないため、テストファイルからの相対 URL で読む（実行時の cwd に
 * 依存しない）。
 */
const riversFc = JSON.parse(
  Deno.readTextFileSync(new URL("../data/rivers.geojson", import.meta.url)),
) as FeatureCollection;

Deno.test("haversineKm は既知の距離を再現する", () => {
  // 緯度 1 度 ≒ 111.19 km
  assertAlmostEquals(haversineKm([0, 0], [0, 1]), 111.19, 0.05);
  assertEquals(haversineKm([10, 50], [10, 50]), 0);
  // 経度 1 度は緯度 60 度で半分になる
  assertAlmostEquals(
    haversineKm([0, 60], [1, 60]) / haversineKm([0, 0], [1, 0]),
    0.5,
    0.01,
  );
});

Deno.test("pointSegmentKm は線分の内側・端点の両方で正しい距離を返す", () => {
  // 線分の真横（垂線が内側に落ちる）
  assertAlmostEquals(pointSegmentKm([1, 0.1], [0, 0], [2, 0]), 11.06, 0.2);
  // 線分の外側（端点までの距離になる）
  assertAlmostEquals(pointSegmentKm([3, 0], [0, 0], [2, 0]), 111.3, 1);
  // 線分上
  assertAlmostEquals(pointSegmentKm([1, 0], [0, 0], [2, 0]), 0, 1e-9);
});

Deno.test("pointLineKm はポリライン全体への最短距離を返す", () => {
  const line = [[0, 0], [1, 0], [1, 1]];
  assertAlmostEquals(pointLineKm([1, 0.5], line), 0, 1e-9);
  assertAlmostEquals(pointLineKm([0.5, 0.1], line), 11.06, 0.2);
});

Deno.test("explodeParts は LineString / MultiLineString を展開し他は無視する", () => {
  assertEquals(
    explodeParts({ type: "LineString", coordinates: [[0, 0], [1, 1]] }),
    [[[0, 0], [1, 1]]],
  );
  assertEquals(
    explodeParts({ type: "MultiLineString", coordinates: [[[0, 0], [1, 1]]] }),
    [[[0, 0], [1, 1]]],
  );
  assertEquals(explodeParts({ type: "Point", coordinates: [0, 0] }), []);
  assertEquals(explodeParts(null), []);
});

Deno.test("bboxOfPositions は座標列の外接矩形を返す", () => {
  assertEquals(bboxOfPositions([[1, 2], [-3, 4], [5, -6]]), [-3, -6, 5, 4]);
  assertEquals(bboxOfPositions([]), null);
});

Deno.test("bboxEdgesTouched は接触した辺を全て返す", () => {
  const bbox = [-25, 34, 60, 72] as const;
  assertEquals(bboxEdgesTouched([-25, 50], [...bbox]), ["west"]);
  assertEquals(bboxEdgesTouched([60, 34], [...bbox]), ["east", "south"]);
  assertEquals(bboxEdgesTouched([0, 50], [...bbox]), []);
  // 許容差（既定 2e-3 度 = COORD_PRECISION 3 桁の丸め誤差の 2 倍）の内側は接触扱い
  assertEquals(bboxEdgesTouched([-25.001, 50], [...bbox]), ["west"]);
  assertEquals(bboxEdgesTouched([-25.01, 50], [...bbox]), []);
});

Deno.test("partDistanceKm は端点↔ライン距離で測る（分流の分岐点を接続と見なす）", () => {
  const main = [[0, 0], [0, 1], [0, 2]];
  // 本流の途中（0, 1）から分岐する分流。端点同士は遠いがラインには接している
  const branch = [[0, 1], [1, 1.5]];
  assertAlmostEquals(partDistanceKm(main, branch), 0, 1e-9);
  // 完全に離れたパート
  assert(partDistanceKm(main, [[5, 5], [6, 6]]) > 100);
});

Deno.test("connectParts は接続距離が閾値以下のパートを 1 成分にまとめる", () => {
  const parts = [
    [[0, 0], [0, 1]],
    [[0, 1], [0, 2]], // 端点一致 → 連結
    [[10, 10], [10, 11]], // 遠い → 別成分
  ];
  const { components, gapsKm } = connectParts(parts, PART_JOIN_TOLERANCE_KM);
  assertEquals(components.length, 2);
  assertEquals(components.map((c) => c.length).sort(), [1, 2]);
  assertEquals(gapsKm.length, 2);
  assert(gapsKm[0] > 100, "成分間ギャップは実距離を返す");
});

Deno.test("connectParts は許容差を超えるギャップを連結しない", () => {
  const parts = [
    [[0, 0], [0, 1]],
    // 約 5.5 km 離れた続き
    [[0, 1.05], [0, 2]],
  ];
  assertEquals(connectParts(parts, 1).components.length, 2);
  assertEquals(connectParts(parts, 10).components.length, 1);
});

Deno.test("freeEndpoints は他パートに接続しない端点だけを返す", () => {
  const parts = [
    [[0, 0], [0, 1]],
    [[0, 1], [0, 2]],
  ];
  assertEquals(freeEndpoints(parts), [[0, 0], [0, 2]]);
});

Deno.test("joinDistancesKm は全パート対の接続距離を返す", () => {
  const parts = [
    [[0, 0], [0, 1]],
    [[0, 1], [0, 2]],
  ];
  const distances = joinDistancesKm(parts);
  assertEquals(distances.length, 1);
  assertAlmostEquals(distances[0], 0, 1e-9);
});

Deno.test("sweepJoinTolerance は許容差ごとの成分数合計を返す", () => {
  const partsByRiver = [[
    [[0, 0], [0, 1]],
    [[0, 1.05], [0, 2]],
  ]];
  const sweep = sweepJoinTolerance(partsByRiver, [1, 10]);
  assertEquals(sweep, [
    { toleranceKm: 1, totalComponents: 2 },
    { toleranceKm: 10, totalComponents: 1 },
  ]);
});

Deno.test("groupByCanonicalName は別名を正準名でまとめる", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "Rhein" }, [[[0, 0], [1, 1]]]),
      multiLineFeature({ name: "Rhin" }, [[[1, 1], [2, 2]]]),
      multiLineFeature({ name: "Seine" }, [[[3, 3], [4, 4]]]),
      multiLineFeature({}, [[[5, 5], [6, 6]]]),
    ],
  };
  const groups = groupByCanonicalName(fc);
  assertEquals(groups.get("Rhine")?.length, 2);
  assertEquals(groups.get("Seine")?.length, 1);
  assertEquals(groups.get("(no name)")?.length, 1);
});

Deno.test("partsOf は点数 2 未満のパートを落とす", () => {
  const features = [
    multiLineFeature({}, [[[0, 0], [1, 1]], [[2, 2]]]),
  ];
  assertEquals(partsOf(features), [[[0, 0], [1, 1]]]);
});

Deno.test("toSegments はライン・ポリゴンを線分列に展開する", () => {
  const fc: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({}, [[[0, 0], [1, 1], [2, 2]]]),
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
      },
    ],
  };
  assertEquals(toSegments(fc).length, 2 + 3);
});

// ---------------------------------------------------------------------------
// 回帰テスト（TASK-76 AC#5）
//
// data/rivers.geojson を対象に、ネットワーク不要で判定できる連続性の不変条件を
// 固定する。ソース（Natural Earth のピン留めコミット）更新や build-rivers の
// 変更で新たな途切れが混入した場合、ここで fail する。
//
// 水域（海岸線・湖岸）までの距離を使う「出口」判定と補助指標（開放海域距離）は
// 外部データセットの取得が必要なため、CI（オフライン）では検証せず
// `deno task audit-rivers` の手動実行で確認する。判断の根拠は
// docs/data-inventory/rivers-continuity-audit.md を参照。
// ---------------------------------------------------------------------------

/**
 * 連結成分が 2 個以上になることを許容する河川（既知の途切れ）。
 * 2026-07-26 時点の実測では 0 件（全 30 河川が単一成分）。新たな途切れが
 * 混入したらこのリストへの追加是非を必ず検討し、理由を監査ドキュメントに残す。
 */
const KNOWN_DISCONNECTED_RIVERS: string[] = [];

/**
 * EUROPE_BBOX の辺で切断される河川と切断辺（意図的なクリップ）。
 * MAP_MAX_BOUNDS（src/config.ts）が EUROPE_BBOX と同値のため、切断位置は
 * 地図の可動域の外縁と一致し、ユーザには途切れとして見えない。
 */
const KNOWN_BBOX_CLIPPED: Record<string, string[]> = {
  "Amu  Darya": ["east"],
  "Euphrates": ["south"],
  "Tigris": ["south"],
};

Deno.test("回帰: data/rivers.geojson の全河川が単一の連結成分である", () => {
  const issues = findContinuityIssues(riversFc);
  const unexpected = issues.filter(
    (i) => !KNOWN_DISCONNECTED_RIVERS.includes(i.name),
  );
  assertEquals(
    unexpected.map((i) =>
      `${i.name}: ${i.componentCount} 成分（ギャップ ${
        i.gapsKm.map((g) => g.toFixed(1)).join("/")
      } km）`
    ),
    [],
    "新たに途切れた河川がある。deno task audit-rivers で原因を分類し、" +
      "ソース由来なら known-limitations、パイプライン起因なら修正すること",
  );
});

Deno.test("回帰: EUROPE_BBOX 辺で切断される河川は既知の 3 件のみ", () => {
  const clipped = findBboxClippedRivers(riversFc);
  const actual: Record<string, string[]> = {};
  for (const { name, edges } of clipped) actual[name] = edges;
  assertEquals(
    actual,
    KNOWN_BBOX_CLIPPED,
    "bbox クリップで切断される河川が変化した。EUROPE_BBOX と MAP_MAX_BOUNDS の" +
      "同値性（src/config_test.ts）と併せて意図した変更か確認すること",
  );
});

Deno.test("回帰: 検査ロジックは意図的に切断したデータを途切れとして検出する", () => {
  // 検査そのものが空振りしていないことの確認（許容リストが空でも
  // findContinuityIssues が常に [] を返すだけ、という状態を防ぐ）
  const broken: FeatureCollection = {
    type: "FeatureCollection",
    features: [
      multiLineFeature({ name: "Elbe" }, [
        [[9.78, 53.55], [10.0, 53.4]],
        // 100 km 以上離れた別区間
        [[13.18, 51.47], [15.58, 50.69]],
      ]),
    ],
  };
  const issues = findContinuityIssues(broken);
  assertEquals(issues.length, 1);
  assertEquals(issues[0].name, "Elbe");
  assertEquals(issues[0].componentCount, 2);
  assert(issues[0].gapsKm[0] > 100);
});
