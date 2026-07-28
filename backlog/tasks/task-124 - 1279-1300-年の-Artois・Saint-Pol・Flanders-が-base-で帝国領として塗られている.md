---
id: TASK-124
title: 1279/1300 年の Artois・Saint-Pol・Flanders が base で帝国領として塗られている
status: To Do
assignee: []
created_date: '2026-07-28 15:58'
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

**再現手順**: 1279 年または 1300 年で、アルトワ伯領・サンポル伯領・フランドル伯領のいずれかをホバー/クリックする。

**期待挙動**: フランス王国の外枠（臙脂）が表示される。これらはいずれもフランス王の封土である。

**実際の挙動**: 神聖ローマ帝国の外枠が表示される。

## 原因

外枠機構の問題ではない。**base（`europe_1279` / `europe_1300`）がこれらの領域を `Holy Roman Empire` として塗っている**ため、TASK-120 で入れた `containingSuzerainKey`（包含する base 勢力から宗主キーを決める）が正しく帝国を返している。

つまり外枠は base の帰属をそのまま映しているだけで、直すべきは base 側である。

## 史実

- **アルトワ伯領**: 1180 年にフィリップ 2 世の妃イザベル・ド・エノーの持参領としてフランス王領に入り、1237 年にロベール 1 世へ与えられたフランス王家の所領。帝国領ではない。
- **サンポル伯領**: アルトワ・ピカルディ地方のフランス王の封土。
- **フランドル伯領**: 帝国側にも領地（帝国フランドル）を持つが、**伯領本体（王領フランドル）はフランス王の封土**。スヘルデ川以西がフランス王領、以東が帝国領という区分。

## 是正方針

decision-20 に従い `data/name-overrides.json` の `propertyFixes` で `SUBJECTO` / `PARTOF` を是正する（上流が持っている値の誤りの訂正にあたる）。TASK-104 で確度 A の 14 件を、TASK-107 で確度 B の 4 系統を同じ機構で処理した実績がある。

**フランドルは判断が要る。**帝国フランドルと王領フランドルの区分をポリゴン 1 枚では表現できないため、(a) 王領側に寄せる (b) 帝国のまま残して known-limitations に明記する (c) 対応しない、のいずれかを選ぶ必要がある。TASK-103 の監査（`docs/data-inventory/base-attribution-audit.md`）の確度判定に照らして決めること。

**発見契機**: TASK-120（諸侯領の宗主外枠）の実装中に、実装 subagent が 7 年代 × 全 128 feature の解決結果を走査して検出。mainagent がイテレーション末にバッチ起票した。

## 関連

- TASK-120 / decision-27（外枠は base の帰属に従属する）
- TASK-103 の横断監査（この 3 件は §2 の確度 A 一覧に含まれていない = 監査の取りこぼし）
- decision-19 / decision-20
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 1279/1300 年の Artois・Saint-Pol の SUBJECTO/PARTOF が期待値になる回帰テストが追加され、修正前 red → 修正後 green
- [ ] #2 各 fix に年号付き根拠 note が propertyFixes エントリに付いている
- [ ] #3 フランドルの扱い（是正/現状維持+明記/対応しない）が根拠付きで判断され記録されている
- [ ] #4 再生成後も修正が保たれ、下流派生（colors / europe_flat / base_outline）の整合が維持される
- [ ] #5 目視確認: 1279/1300 年で Artois・Saint-Pol をホバーするとフランス王国の外枠が表示される
- [ ] #6 deno test が green
<!-- AC:END -->
