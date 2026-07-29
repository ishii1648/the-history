---
id: TASK-35
title: データファイル更新時にブラウザキャッシュで旧データが配信され続ける問題への対処
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 16:27'
updated_date: '2026-07-21 18:02'
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
- [x] #1 dev サーバ（deno task serve）でデータ再生成 + build 後の通常リロードで最新データが表示される
- [x] #2 本番配信を想定したキャッシュ制御方針（ヘッダ設計 or ファイル名バージョニング）が docs に記録され、必要な実装がされている
- [x] #3 app.js と data/ の整合が崩れる部分キャッシュ状態が発生しない（または検知して全再取得する）仕組みの検討結果が記録されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. dev サーバ（AC#1）: deno.json の serve タスク（std/http file-server）に Cache-Control: no-cache ヘッダを付与する（file-server の -H/--header オプション対応を確認して適用。未対応バージョンなら薄い自前サーブスクリプト scripts/serve.ts で Cache-Control を付けて配信）。no-cache は「使用前に必ず再検証」の意味で、ETag/Last-Modified による 304 運用になり、再生成後の通常リロードで常に最新が返る。
2. 本番方針の文書化（AC#2）: docs/ に配信キャッシュ設計を追記 — 推奨: 全アセット Cache-Control: no-cache（ETag 再検証・CDN エッジで 304 吸収）を基本とし、将来最適化としてファイル名ハッシュ化 + immutable の選択肢を記録。Cloudflare R2/Pages での設定方法の目安も記す。
3. 整合性の検討結果記録（AC#3）: app.js と data/ の部分キャッシュ不整合について、no-cache 再検証方式なら「デプロイ後の初回リロードで全ファイルが同時に再検証される」ため実質解消されることと、残余リスク（リロードを跨ぐ長期セッション）への言及を docs に記録。
4. 並列化判定（タスク内）: 見送り（理由: serve 設定 1 箇所 + ドキュメントの小規模作業で分割単位がない。単一 subagent に委譲）。TDD: 純ロジックが生じる場合（自前サーブスクリプト等）はテスト先行。設定のみの場合はその旨を記録し、検証は curl -I によるヘッダ実測と再現手順（データ再生成→build→リロード）の実測で行う。
5. 実測検証 → PR → CI → finalization → マージ → 全タスク完了の最終レポート
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: serve タスクに --header "Cache-Control: no-cache" を追加。:8000 の実 dev サーバで curl -sI により cache-control: no-cache + ETag を確認。If-None-Match 再送 → 304、ファイル更新（touch）後の旧 ETag → 200 で新版返却（= 再生成 + build 後の通常リロードで最新データが表示される）。
- AC#2: docs/app-spec.md §3.4 に配信キャッシュ設計を記録（no-cache + ETag 再検証の基本方針、Cloudflare Pages の _headers / R2 の設定目安、将来最適化のファイル名ハッシュ + immutable のトレードオフ）。dev 実装は serve タスクで完了。
- AC#3: 部分キャッシュ不整合の検討結果を §3.4 に記録（no-cache 再検証でリロード時に app.js と data/* が同時再検証され実質解消。残余リスク = リロードを跨ぐ長期セッション中のデプロイ、対策案 = index.json へのビルド ID 埋め込み + 不一致検知で全再取得）。
- deno fmt --check / lint / test（464 passed / 0 failed）/ build 全 green。PR #44 CI pass。並列化見送り（単一 subagent ecb3188、TDD 対象コードなしのため実測検証で代替）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
dev サーバ（std/http file-server）に Cache-Control: no-cache を付与し、ETag/Last-Modified 再検証で再生成後の旧データ配信を解消。本番（Cloudflare Pages/R2）の設定方針・部分キャッシュ不整合の解消根拠と残余リスク・将来最適化を docs/app-spec.md §3.4 に文書化。検証は curl 実測（no-cache/304/200 挙動）と deno test 464 passed・CI pass。
<!-- SECTION:FINAL_SUMMARY:END -->
