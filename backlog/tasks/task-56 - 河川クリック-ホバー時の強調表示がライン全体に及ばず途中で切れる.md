---
id: TASK-56
title: 河川クリック/ホバー時の強調表示がライン全体に及ばず途中で切れる
status: Done
assignee:
  - '@claude'
created_date: '2026-07-24 13:26'
updated_date: '2026-07-24 15:07'
labels:
  - bug
dependencies: []
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー報告: 河川をクリック/ホバーした際の強調表示（色変化、TASK-24/36/42 実装）が、河川ライン全体ではなく途中で切れてしまうケースがある。ライン川・ドナウ川で発生を確認済み。再現手順の詳細（切れる位置・年代・ズーム）は実機で確認し確立すること。調査の手がかり: (1) src/rivers.ts の riverLineColor/riverLineWidth は選択中の河川名（selectedRiverName）と feature の名前が一致する feature 全体を強調する設計だが、rivers.geojson 側で同一河川が複数の LineString feature（支流・本流の区間分割等）に分かれており、一部の feature だけ name の表記が異なる（例: 前後の空白・別名表記・大文字小文字違い）ために選択判定から漏れている可能性 (2) TASK-24 のラベルアンカー算出（最長 LineString の中点）は同一 feature 内の複数 LineString を扱うが、同一河川が複数の別 feature に分かれている場合の扱いは別ロジックであるため、この境界での取りこぼしがないか (3) riverNameFor の name-ja.json 適用前後で比較しているキーの不一致がないか。原因特定後、再現テスト（red）→ 修正（green）で対応する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 ライン川・ドナウ川で強調が途中で切れる再現条件（具体的な位置・区間）が特定されている
- [x] #2 原因（feature 分割時の名前不一致・選択判定ロジックの範囲漏れ等）が特定されている
- [x] #3 再現テスト（red）が追加され、修正により該当河川全体が強調表示されるようになる（green）
- [x] #4 ライン川・ドナウ川以外の主要河川でも同様の途切れがないか横展開で確認する
- [x] #5 実機確認で修正を確認する
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. データ調査（AC#1/#2）: data/rivers.geojson でライン川・ドナウ川（および全 48 河川）の feature 分割と name 表記を機械的に走査 — 同一河川が複数 feature に分かれているか、name の表記ゆれ（空白・別名・大文字小文字、例: Rhine vs Rhin、Danube 支流名）があるかを列挙。riverLineColor の選択判定（name 完全一致）から漏れる feature を特定。
2. TDD（AC#3）: 特定した不一致を再現する red テスト（例: 実データを読み「ライン川としてラベルされる feature 群が同一の選択キーで全て強調対象になる」ことの検証、または name 正規化関数のテスト）→ 修正（表記ゆれの正規化 or build-rivers での name 統一 or 選択キーの正規化比較）で green。データ修正になる場合も build-rivers のパイプラインで再現可能な形にする（手で geojson を直接書き換えない）。
3. 横展開（AC#4）: 全河川で「表示名 → 強調対象 feature 集合」の整合を機械検証するテストを追加。
4. 実機（AC#5）: ヘッドレス CDP でライン川・ドナウ川をクリックし、スクリーンショットで全区間の強調を確認。
5. 並列化判定: 見送り（理由: データ調査 → 修正方式決定 → 実装の逐次構造。単一 subagent 委譲・ヘッドレス確認は mainagent）。
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス（2026-07-25）:
- AC#1/#2: 全 48 feature の走査 + 前後 feature の端点座標一致の検証で原因確定 — NE 50m は国境で呼称が変わる区間を別 name の feature に分割する（ライン川 = Rhein×2→Rhin→Rhine、ドナウ川 = Donau→Danube、ほかティグリス・ユーフラテス・ドニエプルの計 5 河川）。選択強調は name 完全一致のため区間で途切れていた。デルタ分流（Nederrijn/Lek/Waal 等）は実体が別水路で個別和名を持つため対象外と判定。
- AC#3: RIVER_NAME_ALIASES / canonicalRiverName を scripts/build-rivers.ts のパイプラインに追加（生成物の手書き修正なし）し deno task build-rivers で再生成（ユニーク名 37→30）。TDD red（未実装 export）→ green。
- AC#4: 横展開テスト — 全河川名を日本語表示名でグループ化し「異なる canonical 名が同一表示名を共有しない」ことを機械検証（将来の同類バグも検出）。孤児化した name-ja.json の 7 エントリを削除し name-ja_test の実データ突合も再同期。
- AC#5: ヘッドレス CDP で旧 Rhein 区間をクリック → スイス国境からマインツ/トリーア以北までライン川全体が連続強調されることを確認（隣接ドナウ川は非選択のまま）。deno test 548 passed・fmt/lint/build green。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
河川強調がライン全体に及ばず途切れる原因を、NE 50m の「国境で呼称が変わる区間の別 name 分割」（ライン川・ドナウ川ほか 5 河川、端点座標一致で確認）と特定。build-rivers パイプラインに名寄せ（RIVER_NAME_ALIASES/canonicalRiverName）を追加して rivers.geojson を再生成し、全河川横展開の整合テストも追加。デルタ分流は別水路として除外。検証: TDD red→green（548 passed）・CI・ヘッドレス CDP でライン川の連続強調を確認。
<!-- SECTION:FINAL_SUMMARY:END -->
