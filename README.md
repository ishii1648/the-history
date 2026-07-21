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

## npm install script（lifecycle script）の無効化について

Deno はデフォルトで npm パッケージの install lifecycle script（`preinstall` /
`install` / `postinstall`）を実行しません。加えて本リポジトリの `deno.json` では
`nodeModulesDir: "none"` を明示しており、`node_modules` を生成しない運用（npm
依存は Deno のグローバルキャッシュから直接解決）とすることで、lifecycle script
が実行される経路自体を持たないようにしています。
