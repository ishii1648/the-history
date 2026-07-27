import { assert, assertEquals } from "@std/assert";
import type { Feature, FeatureCollection, Point } from "geojson";
import { MAX_ZOOM, MIN_ZOOM } from "./config.ts";
import {
  buildPeakLabelData,
  buildPeakMarkerData,
  filterVisiblePeaks,
  isPeakActive,
  PEAK_ELEVATION_LABEL_MIN_ZOOM,
  PEAK_HIT_FILL_COLOR,
  PEAK_HIT_LAYER_ID,
  PEAK_HIT_RADIUS_PX,
  PEAK_LABEL_PRIORITY_MAX,
  PEAK_LABEL_PRIORITY_MIN,
  PEAK_MARKER_COLOR,
  PEAK_MARKER_GLYPH,
  PEAK_MARKER_SIZE_PX,
  peakDisplayName,
  peakEntries,
  peakLabelPriority,
  peakLabelText,
  peakMarkerColor,
  peakMarkerSize,
  peakMinZoom,
  peakPickLabel,
  PEAKS_DATA_URL,
  togglePeakSelection,
} from "./peaks.ts";
import {
  CITY_HIT_RADIUS_PX,
  CITY_LABEL_PRIORITY_MIN,
  CITY_MARKER_RADIUS_PX,
} from "./cities.ts";
import {
  MOUNTAIN_HIGHLIGHT_COLOR,
  MOUNTAIN_LABEL_PRIORITY_MAX,
  MOUNTAIN_LABEL_PRIORITY_MIN,
} from "./mountains.ts";

/** テスト用に山峰の Point Feature を組み立てる */
function peakFeature(
  properties: Record<string, unknown>,
  [lon, lat]: [number, number],
): Feature<Point> {
  return {
    type: "Feature",
    properties,
    geometry: { type: "Point", coordinates: [lon, lat] },
  };
}

function collection(features: Feature[]): FeatureCollection {
  return { type: "FeatureCollection", features };
}

/**
 * TASK-99 のデータ契約（scripts/build-peaks.ts の出力）に沿った最小フィクスチャ。
 * AC #1 の主要 3 山峰と、ズーム出し分けの下側を確認するための副次的な山峰。
 */
const contractFixture = collection([
  peakFeature({ name: "Mont Blanc", elevation: 4807, scalerank: 3 }, [
    6.86,
    45.83,
  ]),
  peakFeature({ name: "Matterhorn", elevation: 4478, scalerank: 6 }, [
    7.66,
    45.98,
  ]),
  peakFeature({ name: "Grossglockner", elevation: 3798, scalerank: 6 }, [
    12.69,
    47.07,
  ]),
  peakFeature({ name: "Monte Rosa", elevation: 4634, scalerank: 9 }, [
    7.87,
    45.94,
  ]),
]);

Deno.test("PEAKS_DATA_URL は build.ts のコピー先と一致する", () => {
  assertEquals(PEAKS_DATA_URL, "/data/peaks.geojson");
});

Deno.test("peakEntries はデータ契約の 3 プロパティを検証して正規化する", () => {
  const entries = peakEntries(contractFixture);

  assertEquals(entries.length, 4);
  assertEquals(entries[0], {
    name: "Mont Blanc",
    lon: 6.86,
    lat: 45.83,
    elevation: 4807,
    scalerank: 3,
  });
});

Deno.test("peakEntries は不正な feature を 1 件単位で除外する", () => {
  const fc = collection([
    // name 欠落
    peakFeature({ elevation: 4000, scalerank: 3 }, [6, 45]),
    // name が空文字
    peakFeature({ name: "", elevation: 4000, scalerank: 3 }, [6, 45]),
    // Point ではない
    {
      type: "Feature",
      properties: { name: "line", elevation: 4000, scalerank: 3 },
      geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
    },
    // 座標が非有限
    peakFeature({ name: "NaN peak", elevation: 4000, scalerank: 3 }, [
      Number.NaN,
      45,
    ]),
    peakFeature({ name: "ok", elevation: 4000, scalerank: 3 }, [6, 45]),
  ]);

  assertEquals(peakEntries(fc).map((e) => e.name), ["ok"]);
});

Deno.test("peakEntries は elevation / scalerank の欠損・非数値を null へ正規化する", () => {
  const fc = collection([
    peakFeature({ name: "no props" }, [6, 45]),
    peakFeature({ name: "string props", elevation: "4807", scalerank: "3" }, [
      7,
      46,
    ]),
  ]);

  for (const entry of peakEntries(fc)) {
    assertEquals(entry.elevation, null);
    assertEquals(entry.scalerank, null);
  }
});

Deno.test("peakEntries は未生成・不正形の入力でも空配列で縮退する（fetch 失敗と同じ扱い）", () => {
  assertEquals(peakEntries(collection([])), []);
  assertEquals(
    peakEntries({ type: "FeatureCollection" } as unknown as FeatureCollection),
    [],
  );
  assertEquals(peakEntries(null as unknown as FeatureCollection), []);
});

Deno.test("peakMinZoom は SCALERANK をアプリのズーム段へ写す（AC #4）", () => {
  // 最主要（モンブラン）は初期表示から出す
  assertEquals(peakMinZoom(3), MIN_ZOOM);
  assertEquals(peakMinZoom(1), MIN_ZOOM);
  // 副次的なものほど遅く出す（単調非減少）
  assertEquals(peakMinZoom(5), 5);
  assertEquals(peakMinZoom(6), 6);
  assertEquals(peakMinZoom(7), 7);
  assertEquals(peakMinZoom(9), MAX_ZOOM);
  // 欠損・非数値は最も保守的（最大ズームでのみ表示）に倒す
  assertEquals(peakMinZoom(null), MAX_ZOOM);
  assertEquals(peakMinZoom("3"), MAX_ZOOM);
  // 出力は必ずアプリのズーム範囲に収まる
  for (const scalerank of [-5, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 20]) {
    const z = peakMinZoom(scalerank);
    assert(z >= MIN_ZOOM && z <= MAX_ZOOM);
  }
});

Deno.test("peakLabelPriority は SCALERANK が小さい（主要な）山峰ほど高い", () => {
  assertEquals(peakLabelPriority(3), PEAK_LABEL_PRIORITY_MAX);
  assertEquals(peakLabelPriority(1), PEAK_LABEL_PRIORITY_MAX);
  assert(peakLabelPriority(3) > peakLabelPriority(6));
  assert(peakLabelPriority(6) > peakLabelPriority(7));
  assertEquals(peakLabelPriority(99), PEAK_LABEL_PRIORITY_MIN);
  assertEquals(peakLabelPriority(null), PEAK_LABEL_PRIORITY_MIN);
});

Deno.test("山峰ラベルの優先度帯は山脈帯の下半分に収まる（AC #3）", () => {
  // 都市名・大国名には譲る（地形の注記は主題に譲る = TASK-97 の方針を継ぐ）
  assert(PEAK_LABEL_PRIORITY_MAX < CITY_LABEL_PRIORITY_MIN);
  // 主要山脈（SCALERANK 1 = アルプス等）の名前には譲る。同じ場所に山脈名と
  // 山峰名が並んだとき、広域の手掛かりになる山脈名を残す
  assert(PEAK_LABEL_PRIORITY_MAX < MOUNTAIN_LABEL_PRIORITY_MAX);
  // ただし山脈帯の下限（TASK-97 が実機で「これ未満だと 1 つも残らない」と
  // 確認した水準）は割らない
  assert(PEAK_LABEL_PRIORITY_MIN >= MOUNTAIN_LABEL_PRIORITY_MIN);
  // 公領・伯領規模（面積 6 deg² = 100*log10(6) ≒ 78）の勢力名には勝つ
  assert(PEAK_LABEL_PRIORITY_MIN > 100 * Math.log10(6));
});

Deno.test("filterVisiblePeaks はズーム段が minZoom 以上の山峰だけ返す（AC #4）", () => {
  const entries = peakEntries(contractFixture);

  assertEquals(filterVisiblePeaks(entries, 4).map((e) => e.name), [
    "Mont Blanc",
  ]);
  assertEquals(filterVisiblePeaks(entries, 5.9).map((e) => e.name), [
    "Mont Blanc",
  ]);
  // AC #1 の主要 3 山峰は z6 で揃う
  assertEquals(filterVisiblePeaks(entries, 6).map((e) => e.name), [
    "Mont Blanc",
    "Matterhorn",
    "Grossglockner",
  ]);
  assertEquals(filterVisiblePeaks(entries, MAX_ZOOM).length, 4);
  // 非有限ズーム（防御）は最遠段として扱う
  assertEquals(filterVisiblePeaks(entries, Number.NaN).map((e) => e.name), [
    "Mont Blanc",
  ]);
});

Deno.test("filterVisiblePeaks は入力配列を破壊せず、entry の参照をそのまま返す（メモ化の契約）", () => {
  const entries = peakEntries(contractFixture);

  const visible = filterVisiblePeaks(entries, MAX_ZOOM);

  assertEquals(entries.length, 4);
  assert(visible[0] === entries[0]);
});

Deno.test("peakDisplayName は name-ja.json を引き、未登録は英語のまま返す", () => {
  assertEquals(
    peakDisplayName("Mont Blanc", { "Mont Blanc": "モンブラン" }),
    "モンブラン",
  );
  assertEquals(peakDisplayName("Mont Blanc"), "Mont Blanc");
});

Deno.test("buildPeakMarkerData は座標と英語名（突合キー）を保持する（AC #1）", () => {
  const data = buildPeakMarkerData(peakEntries(contractFixture));

  assertEquals(data.length, 4);
  assertEquals(data[0].name, "Mont Blanc");
  assertEquals(data[0].position, [6.86, 45.83]);
});

Deno.test("buildPeakLabelData は日本語名・優先度・標高併記テキストを組み立てる（AC #1）", () => {
  const [datum] = buildPeakLabelData(
    peakEntries(contractFixture),
    { "Mont Blanc": "モンブラン" },
  );

  assertEquals(datum.name, "Mont Blanc");
  assertEquals(datum.text, "モンブラン");
  assertEquals(datum.detailedText, "モンブラン 4807m");
  assertEquals(datum.position, [6.86, 45.83]);
  assertEquals(datum.priority, PEAK_LABEL_PRIORITY_MAX);
  assertEquals(datum.elevation, 4807);
});

Deno.test("buildPeakLabelData は標高不明なら併記テキストも名称のみにする", () => {
  const fc = collection([peakFeature({ name: "Unknown", scalerank: 3 }, [
    6,
    45,
  ])]);

  const [datum] = buildPeakLabelData(peakEntries(fc));

  assertEquals(datum.text, "Unknown");
  assertEquals(datum.detailedText, "Unknown");
});

Deno.test("peakLabelText は高ズームでだけ標高を併記する（衝突を増やさないため）", () => {
  const [datum] = buildPeakLabelData(
    peakEntries(contractFixture),
    { "Mont Blanc": "モンブラン" },
  );

  assertEquals(
    peakLabelText(datum, PEAK_ELEVATION_LABEL_MIN_ZOOM - 1),
    "モンブラン",
  );
  assertEquals(
    peakLabelText(datum, PEAK_ELEVATION_LABEL_MIN_ZOOM),
    "モンブラン 4807m",
  );
  assertEquals(peakLabelText(datum, MAX_ZOOM), "モンブラン 4807m");
  // 非有限ズーム（防御）は名称のみ（最も面積の小さい側）へ倒す
  assertEquals(peakLabelText(datum, Number.NaN), "モンブラン");
  // 標高併記は最大ズーム側に寄せる（初期表示 z4 では出さない）
  assert(PEAK_ELEVATION_LABEL_MIN_ZOOM > MIN_ZOOM);
  assert(PEAK_ELEVATION_LABEL_MIN_ZOOM <= MAX_ZOOM);
});

Deno.test("山峰マーカーは都市マーカー（丸ドット）と別の記号・別の色で描く（AC #2）", () => {
  // 都市は半径 3px の丸ドット。山峰は三角の字形（TextLayer のグリフ）で、
  // 形そのものが違う（色だけの区別に頼らない）
  assertEquals(PEAK_MARKER_GLYPH, "▲");
  // 都市ドットの直径（6px）と同程度以上の大きさで、点として認識できる
  assert(PEAK_MARKER_SIZE_PX >= CITY_MARKER_RADIUS_PX * 2);
  // 色相も都市（濃茶 [90,46,16]）と離す（緑系 = 地形の注記）
  assert(PEAK_MARKER_COLOR[1] > PEAK_MARKER_COLOR[0]);
  assert(PEAK_MARKER_COLOR[3] === 255);
});

// ---- ホバー/クリック対象化（TASK-100）----

Deno.test("PEAK_HIT_LAYER_ID / PEAK_HIT_RADIUS_PX: 都市と同型の透明ヒット層（TASK-100 AC #2）", () => {
  assertEquals(PEAK_HIT_LAYER_ID, "peaks-hit");
  // 判定専用層なので見た目には出さない（完全透明）
  assertEquals([...PEAK_HIT_FILL_COLOR], [0, 0, 0, 0]);
  // 可視記号（▲ の一辺 ≒ PEAK_MARKER_SIZE_PX * 0.8）の外接円を覆う
  assert(PEAK_HIT_RADIUS_PX >= PEAK_MARKER_SIZE_PX / 2);
  // 都市（可視ドット 3px / 判定円 9px）と同程度の「見えない余白」に収める
  assert(PEAK_HIT_RADIUS_PX >= CITY_HIT_RADIUS_PX);
  assert(PEAK_HIT_RADIUS_PX <= CITY_HIT_RADIUS_PX * 1.5);
});

Deno.test("buildPeakMarkerData は標高も保持する（ホバー/クリック時に標高を出すため）（TASK-100 AC #2）", () => {
  const data = buildPeakMarkerData(peakEntries(contractFixture));

  assertEquals(data[0].elevation, 4807);
});

Deno.test("peakPickLabel: 名称 + 標高を整形する（地図ラベルと違いズームに依存しない）（TASK-100 AC #2/#6）", () => {
  const ja = { "Mont Blanc": "モンブラン" };
  assertEquals(
    peakPickLabel({ name: "Mont Blanc", elevation: 4807 }, ja),
    "モンブラン 4807m",
  );
  // 未登録の山峰は英語名のまま
  assertEquals(
    peakPickLabel({ name: "Matterhorn", elevation: 4478 }, {}),
    "Matterhorn 4478m",
  );
  // 標高不明は「名称 nullm」のような表記を作らず名称のみ
  assertEquals(
    peakPickLabel({ name: "Mont Blanc", elevation: null }, ja),
    "モンブラン",
  );
  // 小数は四捨五入して整数メートルで出す（formatPeakElevation と同じ規則）
  assertEquals(
    peakPickLabel({ name: "Mont Blanc", elevation: 4806.6 }, ja),
    "モンブラン 4807m",
  );
});

Deno.test("peakPickLabel: 年代に依存しない（年代引数を取らず、同じ入力なら常に同じ表示）（TASK-100 AC #5）", () => {
  const ja = { "Mont Blanc": "モンブラン" };
  // 山峰は年代非依存の地形。整形は (datum, ja) だけの純粋関数で、
  // 引数に年が無いこと自体が「年代切替で内容が変わらない」ことの担保になる
  assertEquals(peakPickLabel.length, 2);
  const datum = { name: "Mont Blanc", elevation: 4807 };
  assertEquals(peakPickLabel(datum, ja), peakPickLabel(datum, ja));
});

Deno.test("togglePeakSelection: 同一で解除・別で移動・対象外クリックで解除（河川/勢力と同一規則）（TASK-100 AC #4）", () => {
  assertEquals(togglePeakSelection(null, "Mont Blanc"), "Mont Blanc");
  assertEquals(togglePeakSelection("Mont Blanc", "Mont Blanc"), null);
  assertEquals(togglePeakSelection("Mont Blanc", "Matterhorn"), "Matterhorn");
  assertEquals(togglePeakSelection("Mont Blanc", null), null);
});

Deno.test("isPeakActive: 選択中またはホバー中で true（TASK-100 AC #4）", () => {
  assert(isPeakActive("Mont Blanc", "Mont Blanc", null));
  assert(isPeakActive("Mont Blanc", null, "Mont Blanc"));
  assert(!isPeakActive("Mont Blanc", "Matterhorn", "Etna"));
  assert(!isPeakActive(null, null, null));
});

Deno.test("peakMarkerColor / peakMarkerSize: 強調時は山岳共通のオリーブ・一回り大きい記号（TASK-100 AC #4）", () => {
  const d = { name: "Mont Blanc" };
  // 通常時は従来どおり（TASK-99 の記号色・サイズを変えない）
  assertEquals([...peakMarkerColor(d, null, null)], [...PEAK_MARKER_COLOR]);
  assertEquals(peakMarkerSize(d, null, null), PEAK_MARKER_SIZE_PX);
  // 強調時は山脈の輪郭と同じ色（「オリーブ = いま指している山岳」で統一する）
  assertEquals(
    [...peakMarkerColor(d, null, "Mont Blanc")],
    [...MOUNTAIN_HIGHLIGHT_COLOR],
  );
  assertEquals(
    [...peakMarkerColor(d, "Mont Blanc", null)],
    [...MOUNTAIN_HIGHLIGHT_COLOR],
  );
  // 色だけに頼らず大きさでも変える（陰影の上で色相の判別が弱まるため）
  assert(peakMarkerSize(d, "Mont Blanc", null) > PEAK_MARKER_SIZE_PX);
});
