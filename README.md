# ヨーロッパ国境変遷マップ

中世（西暦900年頃）〜近代（1914年）のヨーロッパにおける国境・勢力圏の変遷を、タイムラインスライダーでグラフィカルに追える
Web アプリです。フレームワークは使わず、Deno + 素の TypeScript + DOM
で実装しています。詳細な仕様は [`docs/app-spec.md`](docs/app-spec.md)
を参照してください。

地図の実描画（MapLibre / deck.gl / PMTiles
との接続）は本タスク（TASK-1）のスコープ外で、後続タスクで実装します。本タスクではビルド基盤・開発基盤のみを整備しています。

## 必要ツール

- [Deno](https://deno.com/) 2.x

## 使い方

```bash
# テストを実行する
deno task test

# テストをウォッチモードで実行する
deno task test:watch

# 本番用に dist/ をビルドする（index.html / app.css / app.js を生成）
deno task build

# dist/ をローカル配信する
deno task serve
```

## データパイプライン

歴史的国境ポリゴンは `scripts/build-data.ts` で生成し、成果物を `data/`
にコミットしています（配信時に元リポジトリへアクセスしません）。

```bash
# data/europe_<year>.geojson × 20 と data/index.json を生成する
deno task build-data
```

- ヨーロッパ bbox（西経25°〜東経60°・北緯34°〜72°）でクリップし、
  `@turf/simplify` で 1 ファイル 300 KB 以下に簡略化します。
- `data/name-overrides.json` で NAME の表記ゆれ・null を補正します。
- 取得元コミットは `scripts/build-data.ts` の `SOURCE_COMMIT`
  でピン留めしています。

勢力ごとの塗り色は `scripts/build-colors.ts` で `data/colors.json`
に静的生成します（クライアントは参照のみ・実行時ハッシュ計算なし）。

```bash
# data/colors.json（勢力名 → 色）を生成する
deno task build-colors
```

- 形式は「キー → `#rrggbb`」のフラットマップです。キーは独立勢力が `NAME`、
  属領（`SUBJECTO` を持ち `NAME` と異なる feature）が `NAME|SUBJECTO`。
  クライアントは feature の生プロパティから同じキーを組み立てて O(1)
  で引きます。
- `NAME` をキーに決定的ハッシュ（FNV-1a）でパレット色を割り当て、同一勢力は
  全年代で同色になります。属領は宗主国の色相を保ち明度をずらした色にします
  （`SUBJECTO` は `name-overrides.json` の renames で正規化してから引きます）。
- `NAME` が null の feature は載せません（クライアント側でデフォルト色）。

## ベースマップ（europe.pmtiles）

ベースマップは Protomaps の daily
build（[maps.protomaps.com/builds](https://maps.protomaps.com/builds)）から
ヨーロッパ域（西経25°〜東経60°・北緯34°〜72°）を `pmtiles extract`
で切り出して使います（`docs/app-spec.md` §2.2）。

```bash
# pmtiles CLI（go-pmtiles）を導入する（macOS の例）
brew install pmtiles

# 最新の daily build から data/europe.pmtiles を切り出す
deno task extract-pmtiles
```

- `scripts/extract-pmtiles.ts` が最新ビルドを自動選択し、
  `pmtiles extract <URL> data/europe.pmtiles --bbox=-25,34,60,72 --maxzoom=8`
  相当を実行します（構文は
  [PMTiles CLI ドキュメント](https://docs.protomaps.com/pmtiles/cli)参照）。
- bbox はデータパイプラインと同一（`scripts/build-data.ts` の
  `EUROPE_BBOX`）、`--maxzoom=8` はアプリのズーム上限（`src/config.ts` の
  `MAX_ZOOM`）に合わせています。全球 130 GB 超のビルドから必要な範囲だけを HTTP
  Range Request で取得するため、ダウンロードは 200 MB 程度で済みます。
- 生成物 `*.pmtiles` はサイズが大きいためコミットしません（.gitignore
  で除外済み）。配信時は Cloudflare R2 に配置します。

## 出典・ライセンス

歴史的国境・勢力圏のポリゴンデータは
[aourednik/historical-basemaps](https://github.com/aourednik/historical-basemaps)（**GPL-3.0**）に由来します。

- 元データのライセンスはコピーレフトであり、切り出し・簡略化した
  `data/europe_<year>.geojson` などの**派生データも GPL-3.0 で公開します**。
- 取得元コミットハッシュ・リポジトリ・ライセンスは `data/index.json` の `source`
  フィールドに記録しています。
- 本リポジトリのライセンス全文は [`LICENSE`](LICENSE)（GNU General Public
  License v3.0）を参照してください。
- 元データは "work in progress"
  であり、歴史的境界は概略です。学術的な厳密さは保証されません。

## npm install script（lifecycle script）の無効化について

Deno はデフォルトで npm パッケージの install lifecycle script（`preinstall` /
`install` / `postinstall`）を実行しません。加えて本リポジトリの `deno.json` では
`nodeModulesDir: "none"` を明示しており、`node_modules` を生成しない運用（npm
依存は Deno のグローバルキャッシュから直接解決）とすることで、lifecycle script
が実行される経路自体を持たないようにしています。
