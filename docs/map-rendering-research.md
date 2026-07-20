# 戦史マップサービス構築のための地図レンダリング調査

> worldmonitor プロジェクトの実装を参考に、戦史マップサービスで活用できる MAP 生成関連の知見をまとめる。

## 1. 推奨技術スタック

### レンダリングエンジン

| ライブラリ | 役割 | 備考 |
|---|---|---|
| **MapLibre GL JS** | ベースマップの描画 | Mapbox GL のオープンソースフォーク。無料、API課金なし |
| **deck.gl** | データレイヤーの描画 | WebGL ベース。大量マーカー・ポリゴン・パスの高速描画に強い |
| **PMTiles** (npm: `pmtiles`) | タイル配信プロトコル | MapLibre にカスタムプロトコルとして登録 |
| **@protomaps/basemaps** | ベースマップのスタイル定義 | PMTiles 用のレイヤースタイルを提供 |

### 最小構成の依存関係

```json
{
  "dependencies": {
    "maplibre-gl": "^4.x",
    "pmtiles": "^3.x",
    "@protomaps/basemaps": "^4.x",
    "deck.gl": "^9.x"
  }
}
```

## 2. ベースマップ（タイル）の構成

### タイルプロバイダーの選択肢

| プロバイダー | コスト | 特徴 |
|---|---|---|
| **PMTiles + Cloudflare R2** | 無料〜月数百円 | 自前ホスト。全タイルを1ファイルに格納し、HTTP Range Request で取得。タイルサーバー不要 |
| **OpenFreeMap** | 無料 | APIキー不要。フォールバック先として最適 |
| **CARTO** | 無料枠あり | Dark Matter / Voyager / Positron テーマ |

### PMTiles の仕組み

従来のタイル配信は `/{z}/{x}/{y}.png` のように1枚ずつHTTPリクエストが必要だった。PMTiles は全タイルを1ファイルにまとめ、HTTP Range Request で必要部分だけ取得する。

```
従来:  数百万枚の個別ファイル → 専用タイルサーバーが必要
PMTiles: 1ファイル → S3/R2 等の静的ストレージに置くだけ
```

### PMTiles の導入手順

```
① PMTiles ファイルを入手
   - 既成品: https://maps.protomaps.com/builds/ からダウンロード
   - 自前生成: pmtiles convert input.mbtiles output.pmtiles

② Cloudflare R2 にアップロード（CORS + Range Request を許可）

③ フロントエンドで読み込み（後述のコード例参照）
```

### フォールバック戦略（worldmonitor の実装パターン）

```
PMTiles（自前R2） → 10秒間に2回以上エラー → OpenFreeMap → CARTO
```

サービスの安定性を高めるために、複数プロバイダーへの自動フォールバックを実装すると良い。

## 3. コード例（worldmonitor の実装から抽出）

### PMTiles + MapLibre の初期化

```typescript
import { Protocol } from 'pmtiles';
import maplibregl from 'maplibre-gl';
import { layers, namedFlavor } from '@protomaps/basemaps';

// PMTiles プロトコルを MapLibre に登録（1回だけ）
const protocol = new Protocol();
maplibregl.addProtocol('pmtiles', protocol.tile);

// マップ作成
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/dark',
    sources: {
      basemap: {
        type: 'vector',
        url: 'pmtiles://https://your-r2-bucket.example.com/planet.pmtiles',
        attribution: '<a href="https://protomaps.com">Protomaps</a> | <a href="https://openstreetmap.org/copyright">OSM</a>',
      },
    },
    // Protomaps のスタイル定義でレイヤー描画
    layers: layers('basemap', namedFlavor('dark'), { lang: 'en' }),
  },
  center: [139.7, 35.7],
  zoom: 5,
});
```

### deck.gl でデータレイヤーをオーバーレイ

```typescript
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer, ArcLayer, ScatterplotLayer, PathLayer } from '@deck.gl/layers';

const overlay = new MapboxOverlay({
  interleaved: true,
  layers: [
    // 戦場マーカー
    new ScatterplotLayer({
      id: 'battles',
      data: battleData,
      getPosition: d => [d.longitude, d.latitude],
      getRadius: d => d.scale * 1000,
      getFillColor: d => d.result === 'victory' ? [0, 128, 255] : [255, 64, 64],
    }),
    // 進軍ルート
    new PathLayer({
      id: 'march-routes',
      data: routeData,
      getPath: d => d.coordinates,
      getColor: d => d.faction === 'allies' ? [0, 128, 255] : [255, 64, 64],
      getWidth: 3,
    }),
    // 勢力圏
    new GeoJsonLayer({
      id: 'territories',
      data: territoryGeoJson,
      getFillColor: d => factionColor(d.properties.faction),
      getLineColor: [255, 255, 255, 80],
      opacity: 0.3,
    }),
    // 補給線・兵站
    new ArcLayer({
      id: 'supply-lines',
      data: supplyData,
      getSourcePosition: d => d.from,
      getTargetPosition: d => d.to,
      getSourceColor: [128, 128, 255],
      getTargetColor: [255, 128, 128],
    }),
  ],
});

map.addControl(overlay);
```

## 4. 戦史マップ向けの設計指針

### ベースマップとデータレイヤーの分離

```
ベースマップ（タイル） → 地形・国境・河川・都市名（めったに変わらない）
データレイヤー（overlay）→ 戦場・進軍ルート・部隊配置（頻繁に追加/編集）
```

戦場データはタイルに焼き込まず、GeoJSON 等でオーバーレイする。理由:
- 戦場の追加/修正ごとにタイルの再生成が不要
- フィルタリング・検索・クリックなどのインタラクションが可能
- 時代別の表示切替が容易

### 独自タイル生成が有効なケース

| 要件 | 理由 |
|---|---|
| 歴史的国境線 | 現代の OSM タイルにはナポレオン時代やWWII時の国境がない |
| 地形強調 | 戦術的に重要な高地・渡河点を目立たせたい |
| 不要情報の除去 | 現代のコンビニや鉄道路線は不要 |
| 古地図風スタイル | 羊皮紙風・軍用地図風の見た目にしたい |
| ファイルサイズ削減 | 特定地域のみ抽出してストレージコスト削減 |

### 推奨アーキテクチャ

```
① ベースマップ
   ├─ 現代戦 → 既成PMTilesで十分（Protomaps配布品）
   └─ 古代〜近世 → 独自生成（歴史的国境線を含める）

② データレイヤー（GeoJSON / DB）
   ├─ 戦場マーカー（位置・年代・規模・結果）    ← ScatterplotLayer
   ├─ 進軍ルート                                  ← PathLayer
   ├─ 部隊配置                                    ← GeoJsonLayer (Polygon)
   ├─ 勢力圏（コロプレス / 時系列アニメーション） ← GeoJsonLayer
   └─ 補給線・兵站                                ← ArcLayer

③ 時間軸スライダー
   └─ 年代でフィルタ → データレイヤーだけ切り替え
      ベースマップの再生成は不要
```

## 5. worldmonitor から参考にできるパターン

| パターン | worldmonitor での実装 | 戦史マップへの応用 |
|---|---|---|
| ズーム適応表示 | レイヤーごとに `minZoom` 閾値を設定 | 広域では主要会戦のみ、ズームインで小規模戦闘を表示 |
| クラスタリング | Supercluster で低ズーム時にマーカー集約 | 戦場マーカーの密集地帯を集約表示 |
| URL状態共有 | `?view=mena&zoom=4&layers=conflicts` | `?era=ww2&theater=pacific&zoom=5` で特定の戦域を共有 |
| タイルフォールバック | PMTiles → OpenFreeMap → CARTO | 同様の構成で耐障害性を確保 |
| レイヤー切替UI | 45レイヤーをカテゴリ別に ON/OFF | 戦線・補給線・海戦・空戦などカテゴリ別切替 |
| 昼夜表示 | UTC から terminator を計算 | 夜襲や時間帯が重要な戦闘の可視化に応用可能 |

## 6. 参考リンク

- [MapLibre GL JS](https://maplibre.org/)
- [deck.gl](https://deck.gl/)
- [PMTiles 仕様](https://github.com/protomaps/PMTiles)
- [Protomaps Basemaps](https://github.com/protomaps/basemaps)
- [Cloudflare R2](https://developers.cloudflare.com/r2/)
- [OpenFreeMap](https://openfreemap.org/)
- [Supercluster](https://github.com/mapbox/supercluster)
