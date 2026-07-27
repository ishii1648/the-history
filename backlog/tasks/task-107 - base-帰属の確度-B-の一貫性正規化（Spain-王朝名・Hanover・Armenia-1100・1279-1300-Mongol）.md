---
id: TASK-107
title: base 帰属の確度 B の一貫性正規化（Spain 王朝名・Hanover・Armenia 1100・1279/1300 Mongol）
status: Done
assignee: []
created_date: '2026-07-26 19:26'
updated_date: '2026-07-27 17:52'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies: []
priority: low
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
TASK-103 の監査で確度 B（解釈の余地あり）とされた一貫性の正規化: Spain の宗主が王朝名 Spanish Habsburg になっている件・1800 Hanover の同君連合表現・1100 Armenia の Byzantine 帰属（bbox は大アルメニアでありセルジューク圏が実態）・1279/1300 の Mongol Empire 宗主の後継汗国への正規化。いずれも配色再生成と目視確認をセットで行う。個別の採否と根拠を notes に記録する。

発見契機: TASK-103 の横断監査。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 各件の採否と根拠が記録され、採用分は propertyFixes で実装・回帰テスト green
- [x] #2 配色変化が意図どおりであることを目視確認
- [x] #3 deno test が green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
## 検証エビデンス（finalization）

**AC#1（各件の採否と根拠が記録され採用分は実装・回帰テスト green）**: 4 系統すべて採用。採否の基準を decision-25 として立てた（2 条件の連言: 宗主名がその年代に勢力として存在しない ∧ 上流自身が隣接年代で別の表記を使っている）。個別の年号根拠は `propertyFixes` の 13 エントリの `note`（全て年号付き）と監査 §3.1 に記録。回帰テスト 4 本を先に書いて red → green、巻き込み検出ガードは red 時点から green でベースラインを確立。

**AC#2（配色変化が意図どおり）**: 差分は 1279（37.7%）・1300（20.3%）・1100 Armenia（2.43%）・1650/1700（3.3%）・1800 Hanover（0.7%）。**1600 / 1715 / 1815 は差分 0 px で巻き込みなし**。mainagent も 1279 / 1650 のスクリーンショットを撮って目視確認した。

**AC#3**: `deno task test` = 1266 passed / 0 failed / 3 ignored（着手前 1262）。`deno fmt --check`（149 ファイル）green、`deno lint` は既存 4 件のみ、`deno task build` green。CI（PR #123）`ci: pass`・`mergeable=MERGEABLE state=CLEAN`。

## mainagent が独立に実施した最重要の検証

**宙に浮いた宗主の全年代スキャン**（`SUBJECTO` / `PARTOF` が同年代の NAME に存在しないもの）を origin/main と比較した。

```
before(main): 62 件 → after: 54 件
増えたもの: なし
減ったもの: 1279/1300/1400 の Mongol Empire 計 5 件 + 1650/1700 の Spanish Habsburg 計 3 件
```

**新たな宙に浮いた宗主はゼロ**。TASK-104 が 1700 年の Naples / Sardinia / Sicily の宗主に `Spanish Habsburg` を使うようにしていたため、Spain を独立へ戻す際に「宙に浮いた宗主が増える」リスクがあったが、属領も同時に `Spain` へ寄せたため発生していない。

残る 54 件は `Castilla` / `Scottland` / `Poland-Llituania` / `UK` 等の**表記ゆれ**で `renames` の担当。decision-25 に別タスク送りと明記した。

**1279 年の色キー**（同一色から 4 色へ分離し宗主-封臣の階層も色で読める）:

| 勢力 | 色キー | 色 |
| --- | --- | --- |
| Khanate of the Golden Horde | `Khanate of the Golden Horde` | `#6cb654` |
| Other Rus Principalities | `Other Rus Principalities\|Khanate of the Golden Horde` | `#a3d194` |
| Ilkhanate | `Ilkhanate` | `#d0dfc3` |
| Seljuk Caliphate | `Seljuk Caliphate\|Ilkhanate` | `#a1bf88` |

修正前はこの 4 勢力すべてが `#d194b5` だった。

## 監査ドキュメントとの食い違い（実測で判明）

- **監査表に無い 1 件**: 1400 `Moldova.PARTOF = "Mongol Empire"`（SUBJECTO は自己参照なのに PARTOF だけ宙に浮いていた）
- **B-3 は監査が挙げた属領より 1 件多い**: 1650 は `Spain` 自身の PARTOF も `Spanish Habsburg`
- **B-1 の対象は監査当時と入れ替わっている**: Novgorod は TASK-104 で、Ryazan は TASK-106 で処理済み

## B-4 と B-5 を分けた根拠

構造（1800 年だけ従属）が同じなので一貫性だけを根拠にすると両方直すか両方残すかになる。**同君連合＝そもそも宗主-従属関係が存在しない**（decision-19 の「複合勢力は補正しない」の射程）、**名目的宗主権＝関係は存在するが実質が伴わない**（解釈の問題）という質的差で切り分けた。B-5 は現状維持を回帰テストで固定した。

## フォローアップ候補（本タスクでは触れず文書化した）

- 1800 / 1783 の `SUBJECTO="UK"` のうち `United Kingdom` 自身に付いているもの。NAME が `United Kingdom` なので実質は自己参照の表記ゆれで、宗主関係の誤りではなく `renames` の担当。
- `Franche-Comté` 1700 は 1678 年ナイメーヘン条約でフランス領なのに上流はスペイン帰属。監査 §2 が挙げていない確度 A 相当の年代ずれ。放置すると宙に浮いた宗主が残るため表記の正規化は行い、年代ずれ自体は別件として文書化に留めた。
- `name-ja.json` の `Spanish Habsburg` / `Mongol Empire` はデータから消えたが残置（TASK-104 が `Suom` を残した先例に倣う。上流の語彙の記録として有用）。`scripts/name-ja_test.ts` の孤立キー検査は静的スナップショット基準なので落ちない。静的リストの陳腐化は既存の運用課題。

## 実装上の学び

`applyPropertyFixes` は対象を**上書き前**の `NAME` で選ぶ（`props.NAME !== fix.name`）ため、TASK-106 で改名した `Other Rus Principalities` を名指しするエントリでは 1279 に当たらない。TASK-106 の `Ryazan` エントリに宗主是正を同居させ、理由を `note` に明記した。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
監査 §3 の確度 B のうち B-1（モンゴル系の宗主）・B-2（1100 Armenia）・B-3（Spanish Habsburg）・B-4（1800 Hanover）の 4 系統を採用して propertyFixes で正規化した。確度 B は史実の当否だけでは決まらないため、採否の基準そのものを立てるのが本体で、decision-25 として「宗主名がその年代に勢力として存在しない（宙に浮いた宗主）∧ 上流自身が隣接年代で別の表記を使っている」の 2 条件の連言を置いた。前者は解釈ではなくデータ不整合なので decision-20 の「上流の値の誤りの訂正」に当たり、後者は寄せ先を史実判断ではなく上流の多数派表記で決められる。この基準により B-5（Algiers / Tunis のオスマン宗主権）は条件 1 を満たさない（Ottoman Empire は同年に実在）ため見送りを維持し、現状維持を回帰テストで固定した。B-4 と B-5 は「1800 年だけ従属」という構造が同じなので、同君連合＝そもそも関係が存在しない / 名目的宗主権＝関係は存在するが実質が伴わない、という質的差で切り分けた。実測で監査ドキュメントとの食い違いも判明した（監査表に無い 1400 Moldova.PARTOF = Mongol Empire、B-3 は監査が挙げた属領より 1 件多く 1650 は Spain 自身の PARTOF も王朝名）。検証: 回帰テスト 4 本を先に書いて red → green、deno test 1266 passed / 0 failed（着手前 1262）、fmt --check / lint / build green、再生成はパイプライン経由で手編集なし・ジオメトリ差分 0 feature・properties 差分は意図した 27 件のみ、配色は 1279（37.7%）等で変化し 1600 / 1715 / 1815 は差分 0 px で巻き込みなし、mainagent が宙に浮いた宗主を全年代でスキャンして main と比較し 62 → 54 件・新規増加ゼロ（減ったのは Mongol Empire 5 件と Spanish Habsburg 3 件のみ）であることと 1279 の 4 勢力が同一色から 4 色へ分離して宗主-封臣の階層まで色で読めることを独立に確認、CI（PR #123）green。
<!-- SECTION:FINAL_SUMMARY:END -->
