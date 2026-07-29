---
status: accepted
date: '2026-07-26 16:57'
---

# decision-19: 宗主-封臣の外枠は SUBJECTO 由来の宗主キー union とし、宗主補正は歴史的に明白な関係に限る

## Context

勢力圏の一体性を示す外枠強調は HRE 専用実装（TASK-30）しかなく、1200 年のフランス王国をクリックしてもブルターニュ公国（史実ではフランス王の封臣だが base データの SUBJECTO は独立扱い）が含まれなかった。TASK-94 でユーザー判断により範囲仕様を確定し一般化した。

## Decision

外枠強調は「宗主キーごとに、その宗主に属する全 feature（本体 + 従属）の union の外縁」を表示する一般規則とする（HRE も同規則）。宗主キーの解決順は 宗主補正テーブル > SUBJECTO（name-overrides.json renames で正規化）> NAME。base データが欠く封建関係の補正は name-overrides.json の suzerains テーブルで行い、**歴史的に宗主関係が明白でデータが欠いているものに限り最小限に留める**（現状 Britany → France のみ）。補正は取得直後に SUBJECTO を書き換え、外枠・色キー（colorKeyFor）・表示ラベル（displayLabel）が同一の封建関係を反映するようにする。

## Consequences

- 宗主補正の追加は配色（colors.json 再生成・決定的プロービングにより無関係キーの色も移動）と情報パネル表示に波及するため、追加時は目視確認とセットで行う。
- アンジュー帝国のような「base 上独立の複合勢力」は補正せず独立のまま扱う（英本土 + 大陸領は同一勢力キーとして一体の外枠）。
- union は選択時オンデマンド + 宗主キー単位メモ化（createSuzerainExtentCache）。ビルド時派生データ化は年代 × 宗主のファイル増と補正変更時の再生成コストが過大なため不採用。
- 関連タスク: TASK-30, TASK-94 / 関連 decision: decision-15
