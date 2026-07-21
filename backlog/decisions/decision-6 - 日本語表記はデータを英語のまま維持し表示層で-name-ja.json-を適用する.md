---
id: decision-6
title: 日本語表記はデータを英語のまま維持し表示層で name-ja.json を適用する
date: '2026-07-21 15:52'
status: accepted
---
## Context

地図ラベル・ツールチップ・情報パネルを日本語表記にしたい。一方、データの NAME/SUBJECTO を日本語に書き換えると、colors.json のキー・SUBJECTO 参照・上流データとの突合が全て壊れる（TASK-23）。

## Decision

データ（GeoJSON・colors.json・cities.json 等）の名前は英語のまま維持し、表示層でのみ NAME→日本語のフラットマップ data/name-ja.json（Record<英語名, 日本語名>）を適用する。未登録名は英語のままフォールバックする。勢力名と都市名で訳が衝突するキー（Venice 等）は、マップを分けず用途別オーバーライド（都市専用の表示名解決）で吸収する。

## Consequences

- 上流データとの diff 追跡・colors.json キーの安定性を保ったまま全面日本語表示ができる。
- 新データソース追加時は name-ja.json への訳追加とカバレッジテスト（scripts/name-ja_test.ts）の拡張が必要。
- フラットマップ 1 枚に集約したため、同名異訳が必要な場合は表示側オーバーライドで対応する（先例: 都市名）。
- 関連タスク: TASK-23, TASK-27
