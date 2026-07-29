---
id: TASK-106
title: 消滅済み勢力の NAME 上書き可否を判断し必要なら実装する（1400 Seljuk・1279/1300 Ryazan）
status: Done
assignee: []
created_date: '2026-07-26 19:26'
updated_date: '2026-07-27 16:45'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies: []
priority: medium
ordinal: 99000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の監査で確度 A/B とされた「NAME 自体が誤っている」2 系統: (1) 1400 年 Seljuk Caliphate（1308 年に滅亡。オスマン侯国等への上書き可否）、(2) 1279/1300 年 Ryazan（全ルーシ 131 万 km² を覆う過大形状。Golden Horde 圏としての表現可否）。NAME 上書きは前例がなく、色（colors.json 決定的プロービング）と name-ja 追加を伴うため単独タスクとして可否判断から行う。判断根拠は backlog decision または notes に記録する。

発見契機: TASK-103 の横断監査。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 NAME 上書きの可否が根拠付きで判断され記録されている
- [x] #2 採用する場合: 上書きが propertyFixes 系機構で実装され回帰テスト green・name-ja / colors の整合が維持される
- [ ] #3 見送る場合: known-limitations に記載されている
- [x] #4 deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 監査 §4 と現行データを実測し、NAME 上書きの可否を判断する（波及の実測を含む）。
2. 判断: 2 件とも採用（案 a）+ known-limitations の本文更新（案 b）を併用する。
   - 1400 Seljuk Caliphate → Anatolian beyliks（ルーム・セルジューク朝は 1308 年に滅亡。同年の上流データ自身が Beylik of Aydin を独立勢力として持ち、Cuman Khanates / Celtic kingdoms / Other Rus Principalities のような総称 NAME も上流の語彙）
   - 1279 / 1300 Ryazan → Other Rus Principalities（1200 年に上流自身が使う NAME。1492 / 1500 には実体どおりの Ryazan（15.0 万 / 2.0 万 km²）が別に存在し、131 万 km² の同名ポリゴンと同色になるのを断ち切れる）
3. TDD: scripts/base-properties_test.ts に NAME 上書きの期待値テスト、name-ja_test.ts に静的リスト + 訳の期待値、known-limitations-json_test.ts に本文キーワードを先に追加して red を確認する。
4. data/name-overrides.json の propertyFixes に 2 エントリ（years で 1279/1300 をまとめる）を年号付き note とともに追加し、NAME と併せて自己参照だった SUBJECTO / PARTOF も同時に書き換える（NAME だけ変えると宙に浮いた宗主・色キー分裂になる）。
5. パイプライン再生成: deno task build-data → build-fief-dedupe → build-colors。
6. data/name-ja.json に Anatolian beyliks の訳を追加、data/known-limitations.json の base-extinct-or-overbroad-powers 本文を「是正済み + 形状は上流のまま」へ更新。
7. docs/data-inventory/base-attribution-audit.md §4 / §6 / §7 に採否と結果を反映。
8. deno task test / deno fmt / deno lint / deno task build を green にする。
9. 判断の記録先を development-style 2.1 章で判定（前例のない機構の使い方 = タスク横断の制約になるため backlog decision を作る想定）。

## 並列化判定（タスク内）

見送り。判断 → 上書き宣言 → パイプライン再生成 → 生成物に依存するテスト/文書更新が一直線の依存で、独立にテストできるサブ作業に割れないため。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 判断（AC #1）

**2 件とも (a) NAME 上書き + (b) known-limitations 明記を採用**（監査 §4 の推奨どおり）。判断の本体と適用条件は **decision-23** に記録した。根拠は次の実測:

- **表示層では直せない**。日本語表記は英語 NAME をキーにする（decision-6）ため、NAME を残す限り「セルジューク朝」「リャザン」が出続ける。
- **1400 Seljuk Caliphate**: ルーム・セルジューク朝は 1308 年に滅亡。約 23.8 万 km²・bbox (32.20, 35.97)-(41.48, 42.04)。上流自身が同じ 1400 年に `Beylik of Aydin` を独立勢力として収録しており、総称 NAME（`Cuman Khanates` / `Celtic kingdoms` / `Other Rus Principalities` / `Baltic Tribes`）も上流の語彙にある。よって `Anatolian beyliks` は上流の語彙の内側に収まる。
- **1279/1300 Ryazan**: 約 131 万 km²。決め手は **1492（約 15.0 万 km²）・1500（約 2.0 万 km²）に実体どおりの `Ryazan` が別に存在する**こと。放置すると 131 万 km² と 15 万 km² が同一勢力・同色として繋がり、「縮小した公国」という実在しない歴史を描く。上書き先 `Other Rus Principalities` は上流自身が 1200 年に使う NAME。
- **形状は触らない**ので decision-14 / decision-18 に抵触しない。年号付きの根拠は propertyFixes の `note` に記録した。

## 波及の実測（AC #2）

- **colors.json**: 差分は +3 キー / -2 キー / **15 色入れ替え**（35 行）。内訳: `Ryazan` の上書きは**色を 1 つも動かさない**（複合キーの色は宗主名から導かれ、ベース名の集合が変わらないため `Other Rus Principalities|Mongol Empire` = #d194b5 / `|Khanate of the Golden Horde` = #a3d194 と旧キーの色が一致）。15 色の入れ替えは `Anatolian beyliks` がベース名を 1 つ増やしたことによる決定的プロービング（decision-5）の玉突きのみ（Norway / Novgorod / Netherlands / Kalmar Union 等）。TASK-71 / 86 / 96 と同じ既知の性質。
- **name-ja.json**: 追加は `Anatolian beyliks` の 1 件（「アナトリア諸侯国（ベイリク）」）。`Other Rus Principalities`（「その他のルーシ諸公国」）は 1200 年の分で既出。旧名 `Ryazan` / `Seljuk Caliphate` の訳は他年代でなお使われるので残す（テストで固定）。
- **renames との適用順**: build-data.ts は applyNameOverrides（renames）→ applyPropertyFixes → 封土切り出し → normalizeSubjectProps の順。propertyFixes の `name` はリネーム後の名前で指定でき、上書き後の NAME は renames を通らないので順序の問題は起きない。ただし **NAME だけ変えると自己参照だった SUBJECTO / PARTOF が旧名を指したまま残り、宙に浮いた宗主と分裂した色キー（`Anatolian beyliks|Seljuk Caliphate`）を作る**ため、自己参照側も同時に書き換えた。1279/1300 の SUBJECTO は他勢力（Mongol Empire / Khanate of the Golden Horde）を指すので触らない（正規化は TASK-107）。
- **ABBREVN**（`Seljuk Turks` / `Riazan` / `Ryazan`）は上流の記録として残した。表示・色・外枠のどれも参照せず（NAME 空のときだけ効くフォールバック）、上流が何と呼んでいたかを追える方が有用なため。

## TDD

red → green を確認:

1. `scripts/base-properties_test.ts`: `EXPECTED_NAME_OVERRIDES` の上書き期待値（旧名が NAME / SUBJECTO / PARTOF のどこにも残らない・上書き後の帰属）で 10 件の差分を出して red。巻き込み検出テスト（1492/1500 Ryazan・1279/1300 Seljuk Caliphate が残る）は当初から green のガード。
2. `scripts/name-ja_test.ts`: 静的リストへ `Anatolian beyliks` を追加してカバレッジテストが red、訳の期待値テストも red。
3. `scripts/known-limitations-json_test.ts`: 本文キーワード（アナトリア諸侯国 / その他のルーシ諸公国 / TASK-106）で red。
4. propertyFixes 2 エントリ追加 → `deno task build-data` → `build-fief-dedupe` → `build-colors` → name-ja / known-limitations 更新で全て green。

## 検証（AC #4）

`deno task test` = **1239 passed / 0 failed / 3 ignored**、`deno fmt` 適用後 `deno fmt --check` green（143 files）、`deno lint` green（106 files）、`deno task build` green。`deno task audit-attribution` 再実行で A=25 / B=108 / C=22 / D=19 / E=16 / F=25（TASK-104 の是正分を含む値）。

## 生成物

再生成したのは data/europe_{1279,1300,1400}.geojson・data/europe_flat_{同}.geojson・data/base_outline_{同}.geojson・data/colors.json。手編集は入力側（name-overrides.json / name-ja.json / known-limitations.json）とテスト・ドキュメントのみ。

## known-limitations（AC #3 相当の後始末）

`base-extinct-or-overbroad-powers` は TASK-105 の finalization が「TASK-106 側の責務」としていたとおり本文を更新した。「誤った名前が残っている」→「元データの名前は何で、何を表示していて、形状は元データのまま」に書き換え、1492/1500 に実体どおりの Ryazan があること・1400 年に上流自身がアイドゥン侯国を収録していることを追記。years（1279-1400）は変更なし。

## 未処理（別タスク向け）

- `docs/app-spec.md` §4.5 が「エントリは計 18（TASK-102 の 3 + TASK-104 の 15）」「A-5 は TASK-106 で別途扱う」のまま陳腐化した（実際は 20 エントリで NAME 上書きの行が要る）。本タスクは area:docs を並行タスクへ譲るため触っていない。
- 1400 年 `Poland-Lithuania` の PARTOF が `Riazan` のまま（上流の形状使い回しの痕跡）。表示・色・外枠のいずれも参照しないため放置した。

## 検証エビデンス（finalization）

**AC#1（可否が根拠付きで判断され記録されている）**: 2 件とも **(a) NAME 上書き + (b) known-limitations 明記の併用**を採用。判断は decision-23 に記録し、適用条件 5 項目（年号付き根拠 / 上書き先は上流の語彙に限る / 対象年代のみ / 自己参照側も同時書換 / name-ja と known-limitations の更新）を後続に課す形にした。

**AC#2（採用時の実装）**: `data/name-overrides.json` の propertyFixes に 2 エントリを追加（計 20）。`deno task build-data` → `build-fief-dedupe` → `build-colors` のパイプライン経由で再生成し、生成物の手編集はゼロ。1279 / 1300 / 1400 の 3 年代のみ更新され無関係な年代に churn なし。

**AC#3 は該当なし**（見送りではなく採用したため）。ただし TASK-105 が「TASK-106 側の責務」としていた `base-extinct-or-overbroad-powers` の本文更新は実施済み（「誤った名前が残っている」→「元データの名前は何で・何を表示していて・形状は元データのまま」に書き換え、1492 / 1500 に実体どおりの Ryazan があること、上流が同じ 1400 年にアイドゥン侯国を収録していることを追記）。

**AC#4（deno test green）**: `deno task test` = 1255 passed / 0 failed / 3 ignored（着手前 1236）。`deno fmt --check`（149 ファイル）green、`deno lint` は `.outputs/claude/` 配下の既存 4 件のみ、`deno task build` green。CI（PR #120）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

## mainagent が独立に検証した決め手

subagent の判断根拠のうち最も重い「1492 / 1500 に実体どおりの Ryazan が別に存在する」を、生成物から面積を実測して確認した。

| 年代 | NAME | 面積 |
| --- | --- | --- |
| 1200 | `Other Rus Principalities` | 539,454 km²（上流自身の前例） |
| 1279 | `Other Rus Principalities`（上書き後） | 1,311,928 km² |
| 1300 | `Other Rus Principalities`（上書き後） | 1,306,535 km² |
| 1492 | `Ryazan` | 150,314 km²（実体どおり・**未変更**） |
| 1500 | `Ryazan` | 19,677 km²（実体どおり・**未変更**） |
| 1400 | `Beylik of Aydin` | 71,947 km²（上流が同年に収録・**未変更**） |
| 1400 | `Anatolian beyliks`（上書き後） | 238,073 km² |
| 1279 / 1300 | `Seljuk Caliphate` | 335,710 / 338,773 km²（滅亡 1308 年より前・**未変更**） |

放置した場合、1279 / 1300 の 131 万 km² と 1492 の 15 万 km² が同一勢力・同色として繋がり「縮小した公国」という実在しない歴史を描く。巻き込み（1492 / 1500 の Ryazan、1279 / 1300 の Seljuk Caliphate を誤って書き換える）が起きていないことも同じ実測で確認した。

## mainagent が加えた変更

`docs/app-spec.md` §4.5 の陳腐化を修正した。「エントリは計 18（TASK-102 の 3 + TASK-104 の 15）」→「計 20（+ TASK-106 の 2）」、確度 A の行から「A-5 は TASK-106 で別途扱う」の注記を外し、NAME 上書きの行を新設した。並行タスク TASK-112 が area:docs を持っていたため subagent には触らせず、TASK-112 のマージ後に mainagent が反映した。

## 申し送り（subagent からの報告を記録）

- **ABBREVN は上流の値のまま**（`Seljuk Turks` / `Riazan` / `Ryazan`）。表示・色・外枠のいずれも参照せず NAME 空時のフォールバックのみなので、上流が何と呼んでいたかの追跡性を優先した。
- **1400 年 `Poland-Lithuania` の PARTOF が `Riazan` のまま**（上流の形状使い回しの痕跡）。表示・色・外枠のいずれも参照しないため放置。監査の追補候補。
- **ブラウザ実機確認は未実施**。AC は目視を要求していない。マージ後の動作確認フェーズで 1279 / 1300 / 1400 のラベルが「その他のルーシ諸公国」「アナトリア諸侯国（ベイリク）」になっていることを mainagent が確認する。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
TASK-103 の監査 §4 が「単独で判断が要る」としていた 2 件について、NAME 上書きの採否を決めるのが本体のタスク。両件とも (a) NAME 上書き + (b) known-limitations 明記の併用を採用した（1400 Seljuk Caliphate → Anatolian beyliks、1279/1300 Ryazan → Other Rus Principalities）。採用の理由は表示層では直せないこと: 日本語表記は英語 NAME をキーにする（decision-6）ため NAME を残す限り地図に「セルジューク朝」「リャザン」が出続け、known-limitations に書いても誤った名前そのものは消えない。Ryazan の決め手は 1492 年（150,314 km²）・1500 年（19,677 km²）に実体どおりの Ryazan が別に存在することで、放置すると 1279/1300 の約 131 万 km² と同一勢力・同色として繋がり「縮小した公国」という実在しない歴史を描く。Seljuk の決め手は上流自身が同じ 1400 年に Beylik of Aydin（71,947 km²）を独立勢力として収録していることと、総称 NAME が上流の語彙にあること。上書き先を上流自身が別年代で使っている NAME に限ることで造語を持ち込まない方針とし、前例のない機構を解禁するため適用条件 5 項目を decision-23 に定めた。NAME だけ変えると自己参照だった SUBJECTO/PARTOF が旧名を指し続け宙に浮いた宗主と分裂した色キーを作るため、自己参照側も同時に書き換えている。1400 年のアナトリア中央部を Ottoman Empire へ寄せる案は、上流が同年のオスマンを西部までしか描かず寄せると形状の帰属まで書き換える編集になるため見送り、限界を note と known-limitations に明記した。検証: 期待値の回帰テストと巻き込み検出ガード（1492/1500 の Ryazan・1279/1300 の Seljuk Caliphate が残ること）を先に追加して red → green、deno test 1255 passed / 0 failed（着手前 1236）、fmt --check / lint / build green、生成物の手編集ゼロ（パイプライン経由・3 年代のみ更新）、色の波及は Anatolian beyliks のベース名 +1 による決定的プロービングの玉突き 15 色のみで Ryazan の上書きは色を 1 つも動かさないことを事前シミュレーションと実結果の一致で確認、mainagent が生成物から面積を実測して決め手と巻き込みの無さを独立に検証、CI（PR #120）green。
<!-- SECTION:FINAL_SUMMARY:END -->
