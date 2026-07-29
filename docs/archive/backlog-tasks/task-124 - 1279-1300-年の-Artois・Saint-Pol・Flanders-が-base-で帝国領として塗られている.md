---
id: TASK-124
title: 1279/1300 年の Artois・Saint-Pol・Flanders とロマーニャが base で帝国領として塗られている
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 15:58'
updated_date: '2026-07-28 17:21'
labels:
  - bug
  - 'area:data-base'
  - 'area:scripts-base'
  - 'area:docs'
dependencies: []
priority: medium
type: bug
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## 症状（bug）

**再現手順**: 1279 年または 1300 年で、アルトワ伯領・サンポル伯領・フランドル伯領のいずれかをホバー/クリックする。加えて 1300 年でリミニ領主領（`Lordship of Rimini`）をホバー/クリックする。

**期待挙動**: 前者はフランス王国の外枠（臙脂）、後者は教皇領の外枠が表示される。

**実際の挙動**: いずれも神聖ローマ帝国の外枠が表示される。

## 原因

外枠機構の問題ではない。**base（`europe_1279` / `europe_1300`）がこれらの領域を `Holy Roman Empire` として塗っている**ため、TASK-120 で入れた `containingSuzerainKey`（包含する base 勢力から宗主キーを決める）が正しく帝国を返している。

つまり外枠は base の帰属をそのまま映しているだけで、直すべきは base 側である。

## 史実

- **アルトワ伯領**: 1180 年にフィリップ 2 世の妃イザベル・ド・エノーの持参領としてフランス王領に入り、1237 年にロベール 1 世へ与えられたフランス王家の所領。帝国領ではない。
- **サンポル伯領**: アルトワ・ピカルディ地方のフランス王の封土。
- **フランドル伯領**: 帝国側にも領地（帝国フランドル）を持つが、**伯領本体（王領フランドル）はフランス王の封土**。スヘルデ川以西がフランス王領、以東が帝国領という区分。
- **ロマーニャ（リミニ含む）**: 1278 年、ルドルフ 1 世がロマーニャの帝国権を教皇ニコラウス 3 世へ正式に譲渡した。したがって 1279 年時点で既に教皇領であり、1300 年に帝国領として塗るのは誤り。

## 是正方針

decision-20 に従い `data/name-overrides.json` の `propertyFixes` で `SUBJECTO` / `PARTOF` を是正する（上流が持っている値の誤りの訂正にあたる）。TASK-104 で確度 A の 14 件を、TASK-107 で確度 B の 4 系統を同じ機構で処理した実績がある。

**フランドルは判断が要る。**帝国フランドルと王領フランドルの区分をポリゴン 1 枚では表現できないため、(a) 王領側に寄せる (b) 帝国のまま残して known-limitations に明記する (c) 対応しない、のいずれかを選ぶ必要がある。TASK-103 の監査（`docs/data-inventory/base-attribution-audit.md`）の確度判定に照らして決めること。

**ロマーニャも同種の判断が要る。**リミニ単体ではなく `europe_1279` / `europe_1300` のロマーニャ一帯（Rimini・Faenza・Forlì 等）の帰属が同じ原因を共有するため、feature 単位で潰すのか一帯をまとめて教皇領へ寄せるのかを先に決めること。

**発見契機**: アルトワ・サンポル・フランドルは TASK-120（諸侯領の宗主外枠）の実装中に、実装 subagent が 7 年代 × 全 128 feature の解決結果を走査して検出。ロマーニャ／リミニは TASK-121（伊諸侯領の宗主外枠）のマージ後動作確認で mainagent が検出。いずれもイテレーション末にバッチ起票した。原因・是正機構・触るファイルが完全に同一のため 1 タスクに統合している（別タスクにすると `propertyFixes` の同一ブロックで必ず conflict する）。

## 関連

- TASK-120 / TASK-121 / decision-27（外枠は base の帰属に従属する）
- TASK-103 の横断監査（この 4 件は §2 の確度 A 一覧に含まれていない = 監査の取りこぼし）
- decision-19 / decision-20
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 1279/1300 年の Artois・Saint-Pol の SUBJECTO/PARTOF が期待値になる回帰テストが追加され、修正前 red → 修正後 green
- [x] #2 各 fix に年号付き根拠 note が propertyFixes エントリに付いている
- [x] #3 フランドルの扱い（是正/現状維持+明記/対応しない）が根拠付きで判断され記録されている
- [x] #4 再生成後も修正が保たれ、下流派生（colors / europe_flat / base_outline）の整合が維持される
- [x] #5 目視確認: 1279/1300 年で Artois・Saint-Pol をホバーするとフランス王国の外枠が表示される
- [x] #6 deno test が green
- [x] #7 1300 年のロマーニャ（Rimini 含む）の SUBJECTO/PARTOF が教皇領になる回帰テストが追加され、修正前 red → 修正後 green
- [x] #8 ロマーニャの是正範囲（feature 単位かロマーニャ一帯か）が根拠付きで判断され記録されている
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. TDD red: scripts/base-properties_test.ts に 1279/1300 の Artois・Saint-Pol、1300（必要なら 1279 も）のロマーニャ（Rimini 等）の SUBJECTO/PARTOF 期待値テストを追加し red を確認
2. TASK-103 監査（docs/data-inventory/base-attribution-audit.md）と europe_1279/europe_1300 の実データを読み、対象 feature 名・是正範囲（ロマーニャは feature 単位か一帯か）を確定
3. data/name-overrides.json の propertyFixes に年号付き根拠 note 付きで fix を追加（decision-20 準拠、suzerains は触らない）→ green
4. Flanders は (a)王領側へ寄せる (b)帝国のまま known-limitations 明記 (c)対応しない を監査の確度判定に照らして判断・記録
5. 再生成（deno task build 系）で colors / europe_flat / base_outline の下流整合を確認（colors.json の差分は意図分だけか検証）
6. CDP で 1279/1300 の Artois・Saint-Pol・Rimini ホバー時の外枠を確認（AC#5・#7）

並列化判定: 見送り（理由: 全変更が data/name-overrides.json の propertyFixes 同一ブロックと scripts/base-properties_test.ts に集中し、ファイル競合なしの独立サブ作業に分割できない）
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 実装記録（mainagent レビュー済み）

- 重要な発見: 対象地域は base に独立 feature が無く（全域が Holy Roman Empire の単一 MultiPolygon）、propertyFixes 単独では是正不可能だった。BASE_FIEF_SPLITS（TASK-101 機構）で OHM 区画 ∩ 帝国ポリゴンを切り出して feature を立て、applyPropertyFixes を切り出しの後段へ移動（decision-28 に記録）
- propertyFixes 4 エントリ追加（Artois/Saint-Pol/Flanders 1279+1300、Rimini 1300。各年号付き根拠 note）。suzerains は無変更
- AC#3 Flanders: (a) 王領側（France）へ寄せる。伯領本体（スヘルデ川以西）が面積の大半で、帝国のまま残すより誤りが小さい。二重構造は known-limitations（base-imperial-paint-flanders-romagna）に明記
- AC#8 ロマーニャ: feature 単位（1300 リミニのみ）。他（ファエンツァ・フォルリ等）は出典付き区画が無く decision-14/18 により切り出せないため known-limitations に記録。1279 のリミニは OHM 開始年より前で feature 自体が無い
- AC#1/#7 red 証跡: 新テスト 2 件が「feature が無い」「County of Artois -> Holy Roman Empire（期待 France）」で fail（14 passed | 2 failed）→ 修正後 1385 passed（mainagent が worktree で独立再実行して確認）
- AC#4: europe_* は 1279/1300 のみ変化（他 18 年代バイト同一）。colors.json は追加 4 キーのみで既存キーの色変化ゼロ。fief-dedupe は被覆率 0.9995〜1 で切り出し封土のラベル抑制が自動発生（TASK-101 Normandy と同挙動）
- AC#5 CDP 目視（mainagent 実施）: 1279/1300 の Artois（アラス近郊）・Saint-Pol・Flanders ホバー → extentKey=France + フランス外枠描画をスクリーンショット確認。Rimini 1300 → extentKey=Papal States（教皇領と一体の外枠を確認）。帝国本体（9.5E,50N）は Holy Roman Empire のまま非退行
- AC#6: deno fmt --check / deno lint / deno task test（1385 passed）/ deno task build 全 green
- 既存 fixture 更新 1 件: suzerain_extent_test の 1300 年伊諸侯領内訳（HRE 12→11・Papal States 1→2）。リミニの是正による意図した変化
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
1279/1300 年の帝国塗り仏封土（Artois・Saint-Pol・Flanders）と 1300 年リミニの base 帰属を是正。対象地域に独立 feature が無かったため BASE_FIEF_SPLITS で切り出して propertyFixes で宗主を確定する併用方式を採り、decision-28 に記録。red → green（1385 passed）、colors.json は追加 4 キーのみ、CDP 目視で仏外枠・教皇領外枠と帝国本体の非退行を確認。フランドルの二重構造とリミニ以外のロマーニャは known-limitations に明記。
<!-- SECTION:FINAL_SUMMARY:END -->
