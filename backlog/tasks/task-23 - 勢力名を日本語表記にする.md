---
id: TASK-23
title: 勢力名を日本語表記にする
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 13:17'
updated_date: '2026-07-21 13:52'
labels: []
dependencies: []
ordinal: 23000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー要望（agent-loop 実行中の報告）: 地図上の勢力名ラベル・ツールチップ・クリックパネルが英語表記（France, Holy Roman Empire 等）なので日本語表記（フランス、神聖ローマ帝国 等）にしたい。

実装の手がかり: データの NAME は英語のまま維持し（colors.json のキー・SUBJECTO 参照・上流データとの整合を壊さないため）、表示層で NAME→日本語名のマッピング（例: data/name-ja.json を新設）を適用する方式を想定。対象は TASK-20 の常時ラベル（src/labels.ts / main.ts）、ツールチップ/パネル（src/info.ts displayLabel）、HRE 領邦名（Austria→オーストリア等）。マッピングに無い名前は英語のままフォールバックする。TextLayer の characterSet が日本語グリフを含む必要がある点に注意（characterSetFrom は実装済みでラベル文字から自動導出される）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 地図上の常時ラベルが日本語表記で表示される（例: フランス、神聖ローマ帝国、オーストリア）
- [x] #2 ホバーツールチップとクリックパネルも同じ日本語表記を使い、属領表記（「NAME — 宗主国 領」形式）も日本語になる
- [x] #3 全年代・全勢力の主要どころを網羅する NAME→日本語のマッピングがデータとして管理され、未登録名は英語のままフォールバックする
- [x] #4 追加・変更したロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: データの NAME/SUBJECTO は英語のまま維持し（colors.json キー・上流データとの整合を保つ）、表示層で NAME→日本語のマッピング data/name-ja.json（フラットな Record<string,string>、URL /data/name-ja.json）を適用する。未登録名は英語のままフォールバック。
2. マッピング: data/europe_*.geojson（全 20 年代）と data/hre_*.geojson（4 年代）の全ユニーク NAME + SUBJECTO を抽出し、世界史の標準的な日本語表記（神聖ローマ帝国・カスティーリャ・ドイツ騎士団領 等）で全件カバーする。カバレッジと主要国の訳をテストで担保（scripts/name-ja_test.ts）。
3. 表示適用: info.ts displayLabel と labels.ts labelTextFor/buildLabelData に ja マップ引数を追加し、地図ラベル・ツールチップ・クリックパネル・属領表記（「NAME — 宗主国 領」）を日本語化。TextLayer の characterSet は既存の自動導出で日本語グリフに対応。main.ts で /data/name-ja.json をロード（失敗時は空で英語継続）。build.ts のコピー対象に追加。
4. 並列化判定: 並列可（独立サブ作業 2 件、worktree isolation で並列起動）
   - subagent A（マッピングデータ）: data/name-ja.json 新規（全ユニーク名の日本語訳）+ scripts/name-ja_test.ts（カバレッジ・主要国訳のテスト）。担当: data/name-ja.json / scripts/name-ja_test.ts
   - subagent B（表示適用）: src/info.ts / info_test.ts / labels.ts / labels_test.ts / main.ts / scripts/build.ts / build_test.ts。スタブのマップでテストし、実ファイルの中身に依存しない
   - 契約: /data/name-ja.json はフラットな Record<英語名, 日本語名>。担当ファイルは互いに素
5. TDD: 両 subagent がテスト先行（red→green）→ mainagent 統合レビュー → fmt/lint/test/build 全 green → 目視確認（日本語ラベル・ツールチップ・属領表記）→ PR → CI → finalization → マージ → マージ後動作確認
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: Chrome で 1500 年を目視確認。地図ラベルが日本語表示（スコットランド王国・イングランド王国・フランス・ブランデンブルク・ザクセン選帝侯領・ザクセン公領・ボヘミア・バイエルン・オーストリア・スイス盟約者団・ポーランド・リトアニア・ドイツ騎士団領・キプチャク・ハン国 等）。
- AC#2: ホバーツールチップが「ボヘミア — 神聖ローマ帝国 領」と日本語の属領表記になることを確認。クリックパネルは同一の displayLabel を使用。
- AC#3: data/name-ja.json は全ユニーク名 298 件を 100% カバー（europe×20 + hre×4 + name-overrides renames 値側）。カバレッジ・主要国訳・孤立キーなしを scripts/name-ja_test.ts で担保。未登録名は ja[名前] ?? 名前 で英語フォールバック（info_test/labels_test で検証）。
- AC#4: deno fmt --check / lint / test（281 passed / 0 failed）/ build 全 green。PR #32 CI pass。
- 実装: subagent 2 並列（マッピング 29960fc / 表示適用 3428adf）+ TDD。CI が権限なし deno test のため name-ja_test は static import 方式（subagent の意図的判断・妥当と評価）。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
英語 NAME→日本語名のマッピング data/name-ja.json（298 件・カバレッジ 100%）を新設し、displayLabel / labelTextFor / buildLabelData に ja マップ引数を追加して地図ラベル・ツールチップ・属領表記を日本語化。データと colors.json のキーは英語のまま表示層のみ変更、未登録名は英語フォールバック。検証は deno test 281 passed・CI pass・Chrome での 1500 年の目視確認（ラベル日本語化・「ボヘミア — 神聖ローマ帝国 領」表記）。
<!-- SECTION:FINAL_SUMMARY:END -->
