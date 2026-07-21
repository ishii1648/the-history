import { assert, assertEquals, assertThrows } from "@std/assert";
import { MAX_ZOOM } from "../src/config.ts";
import { EUROPE_BBOX } from "./build-data.ts";
import {
  buildHeaderBytes,
  countTiles,
  DEM_MAX_ZOOM,
  DEM_MIN_ZOOM,
  DEM_SOURCE_ATTRIBUTION,
  DEM_TILE_BASE_URL,
  demTileUrl,
  encodeVarint,
  enumerateTiles,
  HEADER_SIZE,
  lonLatToTile,
  serializeDirectory,
  tileCachePath,
  tileRangeForBbox,
  zxyToTileId,
} from "./extract-dem.ts";

// ---------------------------------------------------------------------------
// 定数（A/B 間の契約）
// ---------------------------------------------------------------------------

Deno.test("DEM のズーム範囲はアプリのベースマップ（z0〜MAX_ZOOM=8）に合わせる", () => {
  assertEquals(DEM_MIN_ZOOM, 0);
  assertEquals(DEM_MAX_ZOOM, MAX_ZOOM);
  assertEquals(DEM_MAX_ZOOM, 8);
});

Deno.test("DEM_SOURCE_ATTRIBUTION は Mapzen / AWS Open Data の出典を含む", () => {
  assert(DEM_SOURCE_ATTRIBUTION.includes("Mapzen"));
  assert(DEM_SOURCE_ATTRIBUTION.includes("AWS"));
});

Deno.test("demTileUrl は AWS Terrain Tiles の terrarium PNG URL を組み立てる", () => {
  assertEquals(
    demTileUrl(4, 8, 5),
    "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/4/8/5.png",
  );
  assert(demTileUrl(0, 0, 0).startsWith(DEM_TILE_BASE_URL));
});

Deno.test("tileCachePath はキャッシュディレクトリ内の z/x/y.png パスを組み立てる", () => {
  assertEquals(
    tileCachePath("data/dem-tiles", { z: 4, x: 8, y: 5 }),
    "data/dem-tiles/4/8/5.png",
  );
});

// ---------------------------------------------------------------------------
// 経度緯度 → タイル座標（Web メルカトル）
// ---------------------------------------------------------------------------

Deno.test("lonLatToTile は z0 で常に (0,0) を返す", () => {
  assertEquals(lonLatToTile(0, 0, 0), { x: 0, y: 0 });
  assertEquals(lonLatToTile(-179.9, 71, 0), { x: 0, y: 0 });
});

Deno.test("lonLatToTile は赤道・本初子午線の境界を z1 で正しく扱う", () => {
  // lon=0 は東半球側のタイル、lat=0 は南半球側のタイル（境界は次のタイルに属す）
  assertEquals(lonLatToTile(0, 0, 1), { x: 1, y: 1 });
  assertEquals(lonLatToTile(-0.001, 0.001, 1), { x: 0, y: 0 });
});

Deno.test("lonLatToTile は端の座標をタイル範囲内にクランプする", () => {
  assertEquals(lonLatToTile(-180, 0, 3).x, 0);
  // lon=180 は式の上では 2^z になるが、最大タイル 2^z - 1 に丸める
  assertEquals(lonLatToTile(180, 0, 3).x, 7);
  // Web メルカトルの上限緯度（±85.0511...°）の外はクランプする
  assertEquals(lonLatToTile(0, 89, 3).y, 0);
  assertEquals(lonLatToTile(0, -89, 3).y, 7);
});

// ---------------------------------------------------------------------------
// bbox × zoom のタイル範囲・列挙・件数
// ---------------------------------------------------------------------------

Deno.test("tileRangeForBbox はヨーロッパ bbox の z8 範囲を返す", () => {
  assertEquals(tileRangeForBbox(EUROPE_BBOX, 8), {
    minX: 110,
    maxX: 170,
    minY: 52,
    maxY: 102,
  });
});

Deno.test("tileRangeForBbox は z0 で全世界タイル 1 枚に収まる", () => {
  assertEquals(tileRangeForBbox(EUROPE_BBOX, 0), {
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  });
});

Deno.test("enumerateTiles は bbox を覆うタイルを zoom 昇順で列挙する", () => {
  const tiles = enumerateTiles([-25, 34, 60, 72], 0, 1);
  assertEquals(tiles, [
    { z: 0, x: 0, y: 0 },
    { z: 1, x: 0, y: 0 },
    { z: 1, x: 1, y: 0 },
  ]);
});

Deno.test("countTiles は enumerateTiles の件数と一致する", () => {
  for (const maxZoom of [0, 2, 4]) {
    assertEquals(
      countTiles(EUROPE_BBOX, 0, maxZoom),
      enumerateTiles(EUROPE_BBOX, 0, maxZoom).length,
    );
  }
});

Deno.test("countTiles はヨーロッパ bbox z0〜8 で 4224 枚（root ディレクトリのみで十分）", () => {
  assertEquals(countTiles(EUROPE_BBOX, 0, 8), 4224);
});

// ---------------------------------------------------------------------------
// PMTiles tileId（z/x/y → Hilbert 曲線 ID）
// ---------------------------------------------------------------------------

Deno.test("zxyToTileId は PMTiles spec の既知値と一致する", () => {
  // https://github.com/protomaps/PMTiles spec v3: z ごとの累積 + Hilbert 距離
  assertEquals(zxyToTileId(0, 0, 0), 0);
  assertEquals(zxyToTileId(1, 0, 0), 1);
  assertEquals(zxyToTileId(1, 0, 1), 2);
  assertEquals(zxyToTileId(1, 1, 1), 3);
  assertEquals(zxyToTileId(1, 1, 0), 4);
  assertEquals(zxyToTileId(2, 0, 0), 5);
});

Deno.test("zxyToTileId は同一 zoom 内で単射（z2 の 16 タイルが 5〜20 を埋める）", () => {
  const ids = new Set<number>();
  for (let x = 0; x < 4; x++) {
    for (let y = 0; y < 4; y++) {
      ids.add(zxyToTileId(2, x, y));
    }
  }
  assertEquals(ids.size, 16);
  assertEquals(Math.min(...ids), 5);
  assertEquals(Math.max(...ids), 20);
});

Deno.test("zxyToTileId は範囲外の座標を拒否する", () => {
  assertThrows(() => zxyToTileId(1, 2, 0), Error);
  assertThrows(() => zxyToTileId(1, 0, -1), Error);
});

// ---------------------------------------------------------------------------
// varint / ディレクトリ符号化（PMTiles spec v3）
// ---------------------------------------------------------------------------

Deno.test("encodeVarint は LEB128（下位 7bit ずつ・継続ビット付き）で符号化する", () => {
  assertEquals(encodeVarint(0), [0]);
  assertEquals(encodeVarint(1), [1]);
  assertEquals(encodeVarint(127), [127]);
  assertEquals(encodeVarint(128), [0x80, 0x01]);
  assertEquals(encodeVarint(300), [0xac, 0x02]);
});

Deno.test("encodeVarint は負数を拒否する", () => {
  assertThrows(() => encodeVarint(-1), Error);
});

Deno.test("serializeDirectory は spec v3 の列指向（delta tileId → runLength → length → offset）で符号化する", () => {
  const bytes = serializeDirectory([
    { tileId: 1, offset: 0, length: 10, runLength: 1 },
    { tileId: 5, offset: 10, length: 20, runLength: 1 },
  ]);
  assertEquals(
    [...bytes],
    [
      2, // エントリ数
      1,
      4, // tileId（delta: 1, 5-1=4）
      1,
      1, // runLength
      10,
      20, // length
      1,
      0, // offset（先頭は offset+1、直前の offset+length と連続なら 0）
    ],
  );
});

Deno.test("serializeDirectory は非連続 offset を offset+1 で符号化する", () => {
  const bytes = serializeDirectory([
    { tileId: 0, offset: 0, length: 5, runLength: 1 },
    { tileId: 3, offset: 100, length: 7, runLength: 1 },
  ]);
  assertEquals([...bytes], [2, 0, 3, 1, 1, 5, 7, 1, 101]);
});

Deno.test("serializeDirectory は tileId が昇順でないと拒否する（clustered 保証）", () => {
  assertThrows(() =>
    serializeDirectory([
      { tileId: 5, offset: 0, length: 1, runLength: 1 },
      { tileId: 1, offset: 1, length: 1, runLength: 1 },
    ]), Error);
});

// ---------------------------------------------------------------------------
// PMTiles v3 ヘッダ（127 bytes）
// ---------------------------------------------------------------------------

function sampleHeader() {
  return {
    rootDirOffset: 127,
    rootDirLength: 1000,
    metadataOffset: 1127,
    metadataLength: 50,
    leafDirsOffset: 1177,
    leafDirsLength: 0,
    tileDataOffset: 1177,
    tileDataLength: 123456,
    numAddressedTiles: 4224,
    numTileEntries: 4224,
    numTileContents: 4224,
    clustered: true,
    internalCompression: 2, // gzip
    tileCompression: 1, // none（PNG は非圧縮格納）
    tileType: 2, // png
    minZoom: 0,
    maxZoom: 8,
    bounds: [-25, 34, 60, 72] as const,
    centerZoom: 4,
    centerLon: 17.5,
    centerLat: 53,
  };
}

Deno.test("buildHeaderBytes は 127 バイトで magic 'PMTiles' と version 3 を持つ", () => {
  const bytes = buildHeaderBytes(sampleHeader());
  assertEquals(bytes.length, HEADER_SIZE);
  assertEquals(HEADER_SIZE, 127);
  assertEquals(
    new TextDecoder().decode(bytes.slice(0, 7)),
    "PMTiles",
  );
  assertEquals(bytes[7], 3);
});

Deno.test("buildHeaderBytes はオフセット・件数を uint64 LE で書き込む", () => {
  const bytes = buildHeaderBytes(sampleHeader());
  const view = new DataView(bytes.buffer);
  assertEquals(view.getBigUint64(8, true), 127n); // root dir offset
  assertEquals(view.getBigUint64(16, true), 1000n); // root dir length
  assertEquals(view.getBigUint64(24, true), 1127n); // metadata offset
  assertEquals(view.getBigUint64(32, true), 50n); // metadata length
  assertEquals(view.getBigUint64(40, true), 1177n); // leaf dirs offset
  assertEquals(view.getBigUint64(48, true), 0n); // leaf dirs length
  assertEquals(view.getBigUint64(56, true), 1177n); // tile data offset
  assertEquals(view.getBigUint64(64, true), 123456n); // tile data length
  assertEquals(view.getBigUint64(72, true), 4224n); // addressed tiles
  assertEquals(view.getBigUint64(80, true), 4224n); // tile entries
  assertEquals(view.getBigUint64(88, true), 4224n); // tile contents
});

Deno.test("buildHeaderBytes は圧縮方式・タイル種別・zoom 範囲を 1 バイトずつ書き込む", () => {
  const bytes = buildHeaderBytes(sampleHeader());
  assertEquals(bytes[96], 1); // clustered
  assertEquals(bytes[97], 2); // internal compression = gzip
  assertEquals(bytes[98], 1); // tile compression = none
  assertEquals(bytes[99], 2); // tile type = png
  assertEquals(bytes[100], 0); // min zoom
  assertEquals(bytes[101], 8); // max zoom
});

Deno.test("buildHeaderBytes は bbox / center を E7 の int32 LE で書き込む", () => {
  const bytes = buildHeaderBytes(sampleHeader());
  const view = new DataView(bytes.buffer);
  assertEquals(view.getInt32(102, true), -250000000); // min lon
  assertEquals(view.getInt32(106, true), 340000000); // min lat
  assertEquals(view.getInt32(110, true), 600000000); // max lon
  assertEquals(view.getInt32(114, true), 720000000); // max lat
  assertEquals(bytes[118], 4); // center zoom
  assertEquals(view.getInt32(119, true), 175000000); // center lon
  assertEquals(view.getInt32(123, true), 530000000); // center lat
});
