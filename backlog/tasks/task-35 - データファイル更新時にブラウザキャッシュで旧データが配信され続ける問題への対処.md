---
id: TASK-35
title: データファイル更新時にブラウザキャッシュで旧データが配信され続ける問題への対処
status: To Do
assignee: []
created_date: '2026-07-21 16:27'
labels:
  - 'area:scripts'
  - 'area:docs'
dependencies: []
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-32 のマージ後動作確認で発見: dev サーバ（deno std file-server）は Cache-Control ヘッダを返さないため、ブラウザがヒューリスティックキャッシュ（Last-Modified からの経過時間の 10% 程度）で data/*.geojson 等を保持し、データ再生成後も旧データが配信され続ける。今回は hre_<year>.geojson が旧 NAME のまま残り、新しい colors.json / name-ja.json と不整合になって領邦がグレー表示・英語ラベルになった（cache: reload での強制再取得で解消を確認）。app.js と data/ ファイル群は整合が前提のため、片方だけ更新される部分キャッシュは表示破壊につながる。本番配信（Cloudflare R2 想定, config.ts の BASEMAP_PMTILES_URL コメント参照）でも同様の問題が起きうるため、対処方針（例: dev サーバに no-cache 相当のヘッダ付与、本番はファイル名ハッシュ付与 or Cache-Control 設計、データとコードの整合バージョニング）を検討・実装する。発見契機: TASK-32 目視確認（再現手順: データ再生成 → deno task build → ブラウザ再読込で旧 geojson が残る）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 dev サーバ（deno task serve）でデータ再生成 + build 後の通常リロードで最新データが表示される
- [ ] #2 本番配信を想定したキャッシュ制御方針（ヘッダ設計 or ファイル名バージョニング）が docs に記録され、必要な実装がされている
- [ ] #3 app.js と data/ の整合が崩れる部分キャッシュ状態が発生しない（または検知して全再取得する）仕組みの検討結果が記録されている
<!-- AC:END -->
