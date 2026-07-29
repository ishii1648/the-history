---
id: TASK-104
title: base 勢力の確度 A の宗主誤り（14 件）を propertyFixes で一括是正する
status: Done
assignee:
  - '@claude'
created_date: '2026-07-26 19:25'
updated_date: '2026-07-27 13:12'
labels:
  - bug
  - 'area:scripts'
  - 'area:data'
dependencies: []
priority: high
ordinal: 97000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の横断監査（docs/data-inventory/base-attribution-audit.md）で確度 A（明確な誤り）と判定された宗主・帰属の誤りを、TASK-102 で導入した name-overrides.json の propertyFixes で一括是正する。対象は監査ドキュメントの確度 A 一覧のうち propertyFixes 方針の 14 件（例: Burgandy 1100/1200 = 1032 年に帝国編入済み・Bulgar Khanate 1100 = 1018 年ビザンツ併合・1700 年スナップショットへのユトレヒト条約後帰属の混入 3 件・1400 年の消滅済み Mongol Empire 宗主 3 件・1000 Suomi の切り詰め異常値 等。年号付き根拠は監査ドキュメント参照）。

発見契機: TASK-103 の横断監査。是正方針は同監査で確定済み（suzerains ではなく propertyFixes = 上流の誤りの是正、decision-19 との棲み分け）。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 監査ドキュメントの確度 A・propertyFixes 方針の 14 件について SUBJECTO/PARTOF が期待値になる回帰テストが追加され、修正前 red → 修正後 green
- [x] #2 各 fix に年号付き根拠 note が propertyFixes エントリに付いている
- [x] #3 再生成（deno task build 系）後も修正が保たれ、下流派生（colors / europe_flat 等）の整合が維持される
- [x] #4 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TASK-103 の監査ドキュメント（docs/data-inventory/base-attribution-audit.md）の確度 A・propertyFixes 方針 14 件を name-overrides.json の propertyFixes に年号付き note とともに追加する（TASK-102 の既存機構。新機構は作らない）。
2. TDD: 14 件の SUBJECTO/PARTOF 期待値の回帰テストを先に追加し、現行データで red を確認 → fixes 適用 + 再生成で green。
3. 下流派生（colors / europe_flat / base_outline / fief-dedupe）の再生成と整合維持。配色変化（決定的プロービング）は既知の性質として許容し、主要年代の見た目を CDP で確認。
4. 全チェック green → PR → CI → finalization → マージ。

並列化判定（タスク内）: 見送り（理由: 単一テーブルへの追加と再生成の直列フロー。単一 subagent に委譲）。
タスク間並列: なし（next-tasks 単独集合）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（回帰テスト red → green）**: `scripts/base-properties_test.ts` に「確度 A と判定した宗主の誤りが是正されている（TASK-104）」「是正した宗主が同年代に勢力として実在する（TASK-104）」の 2 件を先に追加。是正前は前者が 27 件の不一致（1100/1200 Burgandy・1100 Bulgar Khanate・1279/1400 Novgorod・1400 Blue/White Horde・1900/1914 Iceland・1900 Greenland・1900 Algeria・1700 Naples/Sardinia/Sicily・1800 Mecklenburg-Strelitz・1000 Suomi・1530/1600 Sardinia）で FAILED、是正後は green。

**AC#2（年号付き根拠 note）**: propertyFixes は計 18 エントリ（TASK-102 の 3 + TASK-104 の 15）。追加した 15 エントリの note を機械的に走査し、15 件中 14 件に年号を確認した。**唯一 Suomi（1000）だけ年号を持たない**が、これは監査 A-14 が「上流の値が切り詰められた異常値。史実判断を伴わない」と分類したデータ不整合の是正（`SUBJECTO="Suom"` → `Suomi`）であり、対応する史実の年号が存在しないため。他 14 件は 1018 / 1032 / 1259 / 1260 / 1294 / 1380 / 1420 / 1478 / 1479 / 1701 / 1707 / 1708 / 1713 / 1720 / 1721 / 1761 / 1814 / 1830 / 1848 / 1904 / 1918 等の年号を根拠として含む。

**AC#3（再生成後も保たれ下流派生が整合）**: 生成物は手編集せず `deno task build-data` → `deno task build-fief-dedupe` → `deno task build-colors` の順で再生成した。更新されたのは europe_*.geojson 12 年代・europe_flat_*/base_outline_* 5 年代・colors.json。色キーは想定どおり `Suomi|Suom` / `Novgorod|Mongol Empire` / `Blue Horde|Mongol Empire` / `White Horde|Mongol Empire` / `Mecklenburg-Strelitz|UK` / `Algeria` / `Iceland` が消え、`Burgandy|Holy Roman Empire` / `Bulgar Khanate|Byzantine Empire` / `Sardinia|Spain` / `Blue Horde` / `Suomi` が生成。Algeria / Iceland / Greenland は従属側キーが既に他年代（1880 / 1914）に存在したため新規キーは増えない。さらに `deno task build` 後の dist を dev サーバで配信し、ヘッドレス CDP（scripts/verify/cdp.ts）で配信物 `dist/data/europe_<year>.geojson` の 14 ケース全件の SUBJECTO が期待値であること・対象 8 年代（1000/1100/1400/1600/1700/1800/1900/1914）の切替でエラートーストが出ないことを確認した（wrong: [] / overallOk: true）。標準スモーク `deno task verify:smoke` も PASS。

**AC#4（deno test green）**: `deno test --allow-read=data` = 1137 passed / 0 failed / 3 ignored。あわせて `deno fmt --check` green、`deno task build` green。`deno lint` は 4 件の指摘が出るが全て `.outputs/claude/` 配下（global gitignore で除外・CI 対象外）の調査用スクリプトで、本変更とは無関係。CI（PR #112）は `ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

## レビュー指摘と対応

mainagent レビューで `docs/app-spec.md` §4.5 が本変更と矛盾していることを検出した。旧記述は「上書きは『上流の入力ミスを直す』範囲に留め、史実に基づく宗主の付け替えはここでは行わない。それは suzerains の担当」で、TASK-104 がまさに史実に基づく宗主是正を propertyFixes で行うため嘘になっていた。TASK-103 の監査 §7 が確定させた棲み分け（propertyFixes = 上流が持つ値の誤りの訂正 / suzerains = 上流に無い関係の追加）で書き直し、表に TASK-104 分と TASK-106 送りの A-5 を明記した。この棲み分けは TASK-106 / TASK-107 の機構選択を制約するタスク横断の判断のため decision-20 として記録した。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-103 の横断監査で確度 A（明確な誤り）と判定した宗主・帰属の誤り 14 件を、data/name-overrides.json の propertyFixes に 15 エントリとして年号付き根拠 note 付きで宣言し、build-data → build-fief-dedupe → build-colors のパイプライン経由で是正した（生成物の手編集なし）。対象は Burgandy 1100/1200（1032 年に帝国の構成王国）・Bulgar Khanate 1100（1018 年に東ローマ併合）・Novgorod 1279/1400 と Blue/White Horde 1400（1260〜64 年に分裂した Mongol Empire が宗主として残存）・Iceland 1900/1914 と Greenland 1900（デンマーク領）・Algeria 1900（1848 年にフランス本国へ編入）・Naples/Sardinia/Sicily 1700（1713 年ユトレヒト条約後の帰属が混入）・Mecklenburg-Strelitz 1800（英国への従属は無い）・Suomi 1000（SUBJECTO の切り詰め）・Sardinia 1530/1600（1479 年以降スペイン王領）。A-5（1400 Seljuk Caliphate）は NAME 上書きの採否判断が要るため TASK-106、B-3（Spanish Habsburg の正規化）は TASK-107 へ送った。あわせて docs/app-spec.md §4.5 が本変更と矛盾していた（史実に基づく付け替えは suzerains の担当と記述）ため、監査 §7 の棲み分け（propertyFixes = 上流が持つ値の誤りの訂正 / suzerains = 上流に無い関係の追加）で書き直し、decision-20 として記録した。検証: 回帰テスト 2 件を先行追加して red（27 件の不一致）を確認 → 是正で green、deno test 1137 passed / 0 failed、fmt --check / build green、ヘッドレス CDP で配信物 dist/data の 14 ケース全件の SUBJECTO が期待値・対象 8 年代の切替でエラーなし、標準スモーク PASS、CI（PR #112）green。
<!-- SECTION:FINAL_SUMMARY:END -->
