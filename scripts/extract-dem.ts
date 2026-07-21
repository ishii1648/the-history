/**
 * 地形表現用 europe-dem.pmtiles 生成スクリプト（TASK-34）
 *
 * AWS Terrain Tiles（Mapzen Terrain Tiles, AWS Open Data）の terrarium PNG から
 * ヨーロッパ bbox（EUROPE_BBOX）× zoom 0〜8 の DEM タイルを取得し、
 * PMTiles v3 アーカイブ data/europe-dem.pmtiles を生成する。
 *
 * - bbox はデータパイプライン（scripts/build-data.ts の EUROPE_BBOX）と共有
 * - maxzoom はアプリのズーム上限（src/config.ts の MAX_ZOOM = 8）に合わせる
 * - 生成物はサイズが大きいためコミットしない（.gitignore の *.pmtiles で除外）
 * - MapLibre はソース境界外を描画しないため、全 zoom で bbox クリップする
 *
 * PMTiles v3 ライタは spec に従い最小実装する:
 * https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
 * - ヘッダ 127 bytes + ルートディレクトリ（gzip）+ メタデータ（gzip）+ タイルデータ
 * - PNG は非圧縮格納（tile_type=png, tile_compression=none, internal_compression=gzip）
 * - タイルは tileId（Hilbert 曲線）昇順に格納（clustered=1）、runLength は常に 1
 * - エントリ数は z0〜8 全体でも ~4224 なので leaf directories は使わずルートのみ
 *
 * 使い方: deno task extract-dem [出力パス]
 */

import { MAX_ZOOM } from "../src/config.ts";
import { EUROPE_BBOX } from "./build-data.ts";

/** AWS Terrain Tiles（terrarium エンコーディング PNG）のベース URL */
export const DEM_TILE_BASE_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";

/**
 * DEM タイルの出典（Mapzen Terrain Tiles の attribution 義務）。
 * https://github.com/tilezen/joerd/blob/master/docs/attribution.md
 */
export const DEM_SOURCE_ATTRIBUTION =
  "Terrain Tiles by Mapzen (AWS Open Data). DEM sources: SRTM (NASA/USGS), " +
  "GMTED2010 (USGS), ETOPO1 (NOAA), EU-DEM (EEA), and others";

/** 取得する最小ズーム（世界全体をカバーする z0 から） */
export const DEM_MIN_ZOOM = 0;

/** 取得する最大ズーム。アプリのズーム上限（MAX_ZOOM = 8）に合わせる */
export const DEM_MAX_ZOOM = MAX_ZOOM;

/** 既定の出力パス（europe.pmtiles と同様にコミットしない） */
export const DEFAULT_OUTPUT = "data/europe-dem.pmtiles";

/**
 * ダウンロード済みタイルのキャッシュディレクトリ（.gitignore 対象・コミットしない）。
 * 中断後の再実行時は存在するタイルの取得をスキップする（冪等）。
 */
export const DEFAULT_CACHE_DIR = "data/dem-tiles";

/** PMTiles v3 ヘッダのサイズ（bytes） */
export const HEADER_SIZE = 127;

/** タイル取得の並行数 */
const FETCH_CONCURRENCY = 8;

/** タイル取得のリトライ回数（初回を除く） */
const FETCH_RETRIES = 3;

/**
 * 1 リクエストのタイムアウト（ms）。S3 への接続がストールすると fetch は
 * 永久に返らず並行プール全体が停止するため、必ず打ち切ってリトライに回す。
 */
const FETCH_TIMEOUT_MS = 30_000;

/** bbox タプル [西, 南, 東, 北]（度） */
export type Bbox = readonly [number, number, number, number];

/** タイル座標 */
export interface Tile {
  z: number;
  x: number;
  y: number;
}

/** terrarium PNG タイルの URL を組み立てる（純粋関数） */
export function demTileUrl(z: number, x: number, y: number): string {
  return `${DEM_TILE_BASE_URL}/${z}/${x}/${y}.png`;
}

/** キャッシュディレクトリ内のタイル PNG パスを組み立てる（純粋関数） */
export function tileCachePath(cacheDir: string, tile: Tile): string {
  return `${cacheDir}/${tile.z}/${tile.x}/${tile.y}.png`;
}

// ---------------------------------------------------------------------------
// 経度緯度 → タイル座標（Web メルカトル）
// ---------------------------------------------------------------------------

/**
 * 経度緯度を zoom z のタイル座標に変換する（純粋関数）。
 * 標準の slippy map 変換式。範囲外の座標は [0, 2^z - 1] にクランプする。
 */
export function lonLatToTile(
  lon: number,
  lat: number,
  z: number,
): { x: number; y: number } {
  const n = 2 ** z;
  const clamp = (v: number) => Math.min(n - 1, Math.max(0, Math.floor(v)));
  const latRad = (lat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) /
    2) * n;
  return { x: clamp(x), y: clamp(Number.isFinite(y) ? y : y > 0 ? n : -1) };
}

/** bbox を覆う zoom z のタイル範囲を返す（純粋関数） */
export function tileRangeForBbox(
  bbox: Bbox | readonly number[],
  z: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const [west, south, east, north] = bbox;
  const nw = lonLatToTile(west, north, z);
  const se = lonLatToTile(east, south, z);
  return { minX: nw.x, maxX: se.x, minY: nw.y, maxY: se.y };
}

/** bbox × zoom 範囲のタイルを zoom 昇順（同一 zoom 内は y → x 順）で列挙する（純粋関数） */
export function enumerateTiles(
  bbox: Bbox | readonly number[],
  minZoom: number,
  maxZoom: number,
): Tile[] {
  const tiles: Tile[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const { minX, maxX, minY, maxY } = tileRangeForBbox(bbox, z);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

/** bbox × zoom 範囲のタイル件数を列挙せずに見積もる（純粋関数） */
export function countTiles(
  bbox: Bbox | readonly number[],
  minZoom: number,
  maxZoom: number,
): number {
  let count = 0;
  for (let z = minZoom; z <= maxZoom; z++) {
    const { minX, maxX, minY, maxY } = tileRangeForBbox(bbox, z);
    count += (maxX - minX + 1) * (maxY - minY + 1);
  }
  return count;
}

// ---------------------------------------------------------------------------
// PMTiles tileId（z/x/y → Hilbert 曲線 ID）
// ---------------------------------------------------------------------------

/**
 * z/x/y を PMTiles の tileId に変換する（純粋関数）。
 * spec v3: zoom 0〜z-1 の全タイル数（(4^z - 1) / 3）を底として、
 * zoom z 内は 2^z × 2^z グリッドの Hilbert 曲線距離を加える。
 */
export function zxyToTileId(z: number, x: number, y: number): number {
  const n = 2 ** z;
  if (
    !Number.isInteger(x) || !Number.isInteger(y) ||
    x < 0 || y < 0 || x >= n || y >= n
  ) {
    throw new Error(`zoom ${z} のタイル座標が範囲外です: (${x}, ${y})`);
  }
  // zoom 0〜z-1 の累積タイル数 = (4^z - 1) / 3
  const base = (4 ** z - 1) / 3;
  // Hilbert xy → d（standard iterative algorithm）
  let d = 0;
  let cx = x;
  let cy = y;
  for (let s = n / 2; s >= 1; s = Math.floor(s / 2)) {
    const rx = (cx & s) > 0 ? 1 : 0;
    const ry = (cy & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    // 象限に応じて回転・反転
    if (ry === 0) {
      if (rx === 1) {
        cx = s - 1 - cx;
        cy = s - 1 - cy;
      }
      [cx, cy] = [cy, cx];
    }
  }
  return base + d;
}

// ---------------------------------------------------------------------------
// varint / ディレクトリ符号化（PMTiles spec v3）
// ---------------------------------------------------------------------------

/** 非負整数を LEB128 varint（下位 7bit ずつ・継続ビット付き）に符号化する（純粋関数） */
export function encodeVarint(value: number): number[] {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`varint は非負整数のみ符号化できます: ${value}`);
  }
  const bytes: number[] = [];
  let v = value;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v = Math.floor(v / 128);
  }
  bytes.push(v);
  return bytes;
}

/** ディレクトリの 1 エントリ */
export interface DirEntry {
  tileId: number;
  offset: number;
  length: number;
  runLength: number;
}

/**
 * ディレクトリエントリ列を spec v3 の列指向フォーマットに符号化する（純粋関数）。
 * エントリ数 → tileId（delta）→ runLength → length → offset の順に varint を並べる。
 * offset は直前エントリの offset + length と一致すれば 0、それ以外は offset + 1。
 * tileId は昇順（clustered）であることを前提とし、違反があれば例外を投げる。
 */
export function serializeDirectory(entries: readonly DirEntry[]): Uint8Array {
  const bytes: number[] = [];
  bytes.push(...encodeVarint(entries.length));
  let lastId = 0;
  entries.forEach((e, i) => {
    if (i > 0 && e.tileId <= lastId) {
      throw new Error(
        `ディレクトリエントリは tileId 昇順である必要があります: ` +
          `${lastId} の次に ${e.tileId}`,
      );
    }
    bytes.push(...encodeVarint(e.tileId - (i > 0 ? lastId : 0)));
    lastId = e.tileId;
  });
  for (const e of entries) bytes.push(...encodeVarint(e.runLength));
  for (const e of entries) bytes.push(...encodeVarint(e.length));
  entries.forEach((e, i) => {
    const prev = entries[i - 1];
    if (i > 0 && e.offset === prev.offset + prev.length) {
      bytes.push(...encodeVarint(0));
    } else {
      bytes.push(...encodeVarint(e.offset + 1));
    }
  });
  return new Uint8Array(bytes);
}

// ---------------------------------------------------------------------------
// PMTiles v3 ヘッダ（127 bytes）
// ---------------------------------------------------------------------------

/** PMTiles v3 ヘッダの内容 */
export interface PmtilesHeader {
  rootDirOffset: number;
  rootDirLength: number;
  metadataOffset: number;
  metadataLength: number;
  leafDirsOffset: number;
  leafDirsLength: number;
  tileDataOffset: number;
  tileDataLength: number;
  numAddressedTiles: number;
  numTileEntries: number;
  numTileContents: number;
  clustered: boolean;
  /** 1=none, 2=gzip */
  internalCompression: number;
  /** 1=none, 2=gzip */
  tileCompression: number;
  /** 1=mvt, 2=png, 3=jpeg, 4=webp, 5=avif */
  tileType: number;
  minZoom: number;
  maxZoom: number;
  /** [西, 南, 東, 北]（度） */
  bounds: Bbox;
  centerZoom: number;
  centerLon: number;
  centerLat: number;
}

/** 度を spec の E7 表現（1e7 倍の整数）にする */
function toE7(deg: number): number {
  return Math.round(deg * 1e7);
}

/** PMTiles v3 ヘッダ 127 bytes を組み立てる（純粋関数） */
export function buildHeaderBytes(header: PmtilesHeader): Uint8Array {
  const bytes = new Uint8Array(HEADER_SIZE);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode("PMTiles"), 0);
  bytes[7] = 3; // spec version
  view.setBigUint64(8, BigInt(header.rootDirOffset), true);
  view.setBigUint64(16, BigInt(header.rootDirLength), true);
  view.setBigUint64(24, BigInt(header.metadataOffset), true);
  view.setBigUint64(32, BigInt(header.metadataLength), true);
  view.setBigUint64(40, BigInt(header.leafDirsOffset), true);
  view.setBigUint64(48, BigInt(header.leafDirsLength), true);
  view.setBigUint64(56, BigInt(header.tileDataOffset), true);
  view.setBigUint64(64, BigInt(header.tileDataLength), true);
  view.setBigUint64(72, BigInt(header.numAddressedTiles), true);
  view.setBigUint64(80, BigInt(header.numTileEntries), true);
  view.setBigUint64(88, BigInt(header.numTileContents), true);
  bytes[96] = header.clustered ? 1 : 0;
  bytes[97] = header.internalCompression;
  bytes[98] = header.tileCompression;
  bytes[99] = header.tileType;
  bytes[100] = header.minZoom;
  bytes[101] = header.maxZoom;
  const [west, south, east, north] = header.bounds;
  view.setInt32(102, toE7(west), true);
  view.setInt32(106, toE7(south), true);
  view.setInt32(110, toE7(east), true);
  view.setInt32(114, toE7(north), true);
  bytes[118] = header.centerZoom;
  view.setInt32(119, toE7(header.centerLon), true);
  view.setInt32(123, toE7(header.centerLat), true);
  return bytes;
}

// ---------------------------------------------------------------------------
// タイル取得（並行数制限 + タイムアウト + リトライ + 404 スキップ + キャッシュ）
// ---------------------------------------------------------------------------

/**
 * 1 タイルを取得する。404（タイルが無い場合）は null を返す。
 * fetch は AbortSignal.timeout で必ず打ち切る（S3 への接続がストールすると
 * fetch が永久に返らず並行プール全体が停止し、プロセスがハングするため）。
 * タイムアウト・一時的エラーは指数バックオフ付きでリトライする。
 */
async function fetchTile(tile: Tile): Promise<Uint8Array | null> {
  const url = demTileUrl(tile.z, tile.x, tile.y);
  let lastError: unknown;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
    }
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status === 404) {
        await res.body?.cancel();
        return null;
      }
      if (!res.ok) {
        await res.body?.cancel();
        throw new Error(`HTTP ${res.status}`);
      }
      // body の読み取りも同じ signal で打ち切られる（レスポンス途中のストール対策）
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(
    `タイル取得に失敗しました（${
      FETCH_RETRIES + 1
    } 回試行）: ${url}: ${lastError}`,
  );
}

/**
 * タイル一覧を並行数制限付きでキャッシュディレクトリへダウンロードする。
 * 既にキャッシュ済みのタイルはスキップするため、中断後の再実行は冪等。
 * 404 はファイルを作らずスキップする（terrarium は海洋も含むため通常発生しない）。
 */
async function downloadTiles(
  tiles: readonly Tile[],
  cacheDir: string,
): Promise<void> {
  let next = 0;
  let done = 0;
  let cached = 0;
  let skipped404 = 0;
  const worker = async () => {
    while (true) {
      const index = next++;
      if (index >= tiles.length) return;
      const tile = tiles[index];
      const path = tileCachePath(cacheDir, tile);
      const exists = await Deno.stat(path).then(() => true, () => false);
      if (exists) {
        cached++;
      } else {
        const data = await fetchTile(tile);
        if (data === null) {
          skipped404++;
        } else {
          await Deno.mkdir(path.slice(0, path.lastIndexOf("/")), {
            recursive: true,
          });
          await Deno.writeFile(path, data);
        }
      }
      done++;
      if (done % 500 === 0 || done === tiles.length) {
        console.log(
          `取得 ${done}/${tiles.length}` +
            `（キャッシュ済 ${cached}・404 スキップ ${skipped404}）`,
        );
      }
    }
  };
  await Promise.all(
    Array.from({ length: FETCH_CONCURRENCY }, () => worker()),
  );
}

// ---------------------------------------------------------------------------
// PMTiles v3 アーカイブ組み立て
// ---------------------------------------------------------------------------

/** gzip 圧縮する（internal_compression=gzip 用） */
async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * キャッシュ済みタイルから PMTiles v3 アーカイブを出力パスへ書き出す。
 * タイル全体をメモリに載せず、tileId 昇順（clustered）に 1 枚ずつ追記する。
 * キャッシュに無いタイル（404 スキップ分）はディレクトリにも含めない。
 * 戻り値は格納タイル数とアーカイブ全体のバイト数。
 */
async function writeArchive(
  tiles: readonly Tile[],
  cacheDir: string,
  bbox: Bbox,
  output: string,
): Promise<{ tileCount: number; byteLength: number }> {
  // tileId 昇順に並べ、キャッシュのファイルサイズからオフセットを割り当てる
  const withIds = tiles
    .map((tile) => ({ tile, tileId: zxyToTileId(tile.z, tile.x, tile.y) }))
    .sort((a, b) => a.tileId - b.tileId);
  const entries: DirEntry[] = [];
  const paths: string[] = [];
  let offset = 0;
  for (const { tile, tileId } of withIds) {
    const path = tileCachePath(cacheDir, tile);
    const stat = await Deno.stat(path).catch(() => null);
    if (stat === null) continue; // 404 スキップ分
    entries.push({ tileId, offset, length: stat.size, runLength: 1 });
    paths.push(path);
    offset += stat.size;
  }
  const tileDataLength = offset;

  const rootDir = await gzip(serializeDirectory(entries));
  const metadata = await gzip(
    new TextEncoder().encode(JSON.stringify({
      name: "Europe DEM (terrarium)",
      description: `AWS Terrain Tiles から抽出したヨーロッパ域 DEM` +
        `（terrarium PNG, z${DEM_MIN_ZOOM}-${DEM_MAX_ZOOM}）`,
      attribution: DEM_SOURCE_ATTRIBUTION,
      encoding: "terrarium",
    })),
  );

  const rootDirOffset = HEADER_SIZE;
  const metadataOffset = rootDirOffset + rootDir.length;
  const leafDirsOffset = metadataOffset + metadata.length;
  const tileDataOffset = leafDirsOffset; // leaf directories は使わない
  const header = buildHeaderBytes({
    rootDirOffset,
    rootDirLength: rootDir.length,
    metadataOffset,
    metadataLength: metadata.length,
    leafDirsOffset,
    leafDirsLength: 0,
    tileDataOffset,
    tileDataLength,
    numAddressedTiles: entries.length,
    numTileEntries: entries.length,
    numTileContents: entries.length,
    clustered: true,
    internalCompression: 2, // gzip
    tileCompression: 1, // none（PNG は非圧縮格納）
    tileType: 2, // png
    minZoom: DEM_MIN_ZOOM,
    maxZoom: DEM_MAX_ZOOM,
    bounds: bbox,
    centerZoom: 4,
    centerLon: (bbox[0] + bbox[2]) / 2,
    centerLat: (bbox[1] + bbox[3]) / 2,
  });

  const file = await Deno.open(output, {
    write: true,
    create: true,
    truncate: true,
  });
  const writer = file.writable.getWriter();
  await writer.write(header);
  await writer.write(rootDir);
  await writer.write(metadata);
  for (const path of paths) {
    await writer.write(await Deno.readFile(path));
  }
  await writer.close();
  return {
    tileCount: entries.length,
    byteLength: tileDataOffset + tileDataLength,
  };
}

async function main(): Promise<number> {
  const output = Deno.args[0] ?? DEFAULT_OUTPUT;
  const cacheDir = DEFAULT_CACHE_DIR;
  const bbox = EUROPE_BBOX as unknown as Bbox;
  const tiles = enumerateTiles(bbox, DEM_MIN_ZOOM, DEM_MAX_ZOOM);
  console.log(
    `ヨーロッパ bbox [${
      bbox.join(", ")
    }] × z${DEM_MIN_ZOOM}〜${DEM_MAX_ZOOM}: ` +
      `${tiles.length} タイルを取得します（キャッシュ: ${cacheDir}）`,
  );

  const started = Date.now();
  await downloadTiles(tiles, cacheDir);
  const { tileCount, byteLength } = await writeArchive(
    tiles,
    cacheDir,
    bbox,
    output,
  );

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `生成完了: ${output}（${(byteLength / 1024 / 1024).toFixed(1)} MB, ` +
      `${tileCount} タイル, ${elapsed} 秒）`,
  );
  console.log(`出典: ${DEM_SOURCE_ATTRIBUTION}`);
  return 0;
}

if (import.meta.main) {
  Deno.exit(await main());
}
