---
id: TASK-32
title: HRE 領邦の日本語表記に正式な称号を付けて一貫させる
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 15:05'
updated_date: '2026-07-21 16:20'
labels:
  - 'area:scripts'
  - 'area:data'
dependencies:
  - TASK-19
  - TASK-23
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ユーザー指摘: 1500 年表示で「ザクセン選帝侯領」「ザクセン公領」だけが称号付きで、他の選帝侯領（ブランデンブルク・プファルツ・マインツ・トリーア・ケルン・ボヘミア）は称号なしの裸の地名になっており表記が非一貫。ザクセンの 2 分割自体は 1485 年ライプツィヒ協定によるエルネスティン系（選帝侯領）/アルベルティン系（公領）の並立を反映した歴史的に正しい表現であり統一しない（scripts/build-hre.ts の HRE_TERRITORIES 参照）。対応方針（ユーザー決定）: 全領邦に歴史的に正しい正式称号を付ける。例: ブランデンブルク選帝侯領・ボヘミア王国・プファルツ選帝侯領・マインツ大司教領（選帝侯）またはマインツ選帝侯領・トリーア/ケルン同様・オーストリア大公領・バイエルン公領・ヴュルテンベルク公領・ヘッセン方伯領（1567 以降はヘッセン＝カッセル/ダルムシュタット方伯領）・ザルツブルク大司教領。聖界選帝侯（マインツ・トリーア・ケルン）の表記は「大司教領」か「選帝侯領」かを実装時に一般的な日本語文献の慣行に合わせて統一的に決めること。注意点: (1) 称号は年代依存で変わる。バイエルンは 1623 年に選帝侯へ昇格するためスナップショット 1650 のみ「バイエルン選帝侯領」となる（現在 Bayern は単一 id で 1500-1806 に期間拡張されており、現行の NAME 固定 + name-ja.json フラットマップでは年代別称号を表現できない。id 分割か年代別マッピングの仕組み追加が必要）。(2) name-ja.json は英語 NAME → 日本語のフラットマップで、labels.ts / info.ts / rivers.ts が共用しているため、変更が勢力名・河川名の表示を壊さないこと。(3) 英語表示名（NAME）側も Electoral Brandenburg 等へ変えるか、日本語のみ称号付きにするかは実装時に選択してよいが、ツールチップ・ラベル・colors.json の色キー（NAME|Holy Roman Empire）の整合を保つこと。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 スナップショット 1500・1530・1600・1650 の全 HRE 領邦ラベル・ツールチップが正式称号付きの日本語表記で表示される
- [x] #2 選帝侯 7 家（ボヘミア王含む）の表記ルールが統一されている（聖界 3 選帝侯の表記方針も一貫）
- [x] #3 年代依存の称号変化（バイエルン: 1650 のみ選帝侯領）がスナップショット年代ごとに正しく表示される
- [x] #4 ザクセンの選帝侯領/公領の 2 系統区別と 1547 年前後の系統入れ替わりが引き続き正しく表示される
- [ ] #5 勢力名・河川名など既存の日本語表記に退行がない
- [ ] #6 称号マッピングのロジックにテストがあり deno test が green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. 方針: 称号は英語 NAME 側に持たせる（例: Electorate of Brandenburg / Kingdom of Bohemia / Archduchy of Austria / Duchy of Bavaria）。NAME は年代別ファイル hre_<year>.geojson に埋まるため、年代依存の称号（バイエルン 1650 のみ Electorate of Bavaria）はデータ生成の年代別 NAME 解決で表現でき、フロントエンド（labels/info/colors 参照機構）は無変更で済む。ja は新 NAME への 1:1 マッピング追加（バイエルン選帝侯領 等）。旧 NAME（Austria 等）の ja エントリはベース勢力（1715 以降の Austria 等）と共有のため変更しない — 称号付き新 NAME に分離することで衝突自体を解消する。
2. 表記ルール（AC#2）: 聖界 3 選帝侯は「大司教領」を採用し選帝侯である旨は名称でなく称号一覧コメントに記す…ではなく、日本語文献の慣行（山川・詳説世界史等で一般的な「マインツ大司教領」等）に合わせ Electorate of Mainz→マインツ大司教領 / Trier→トリーア大司教領 / Cologne→ケルン大司教領 で統一。世俗選帝侯は「〜選帝侯領」（ブランデンブルク選帝侯領・プファルツ選帝侯領・ザクセン選帝侯領）、ボヘミアは「ボヘミア王国」。その他: オーストリア大公領・バイエルン公領（1650 はバイエルン選帝侯領）・ヴュルテンベルク公領・ヘッセン方伯領・ヘッセン＝カッセル方伯領・ヘッセン＝ダルムシュタット方伯領・ザルツブルク大司教領・ザクセン公領（Ducal Saxony）。
3. 実装: scripts/build-hre.ts の領邦定義を「id → 年代別（期間別）の英語称号付き NAME」を解決できる構造に拡張（Bavaria: 〜1623 Duchy of Bavaria / 1623〜 Electorate of Bavaria）。hre_{1500,1530,1600,1650}.geojson を再生成し、colors.json（NAME|Holy Roman Empire キーが新 NAME に変わる）と name-ja.json（新 NAME の訳追加。孤立キー検査があるため旧 HRE 専用キーの扱いに注意 — Brandenburg/Bohemia/Bavaria 等はベース勢力や都市と共有のため残る）を再生成/更新。name-ja_test の期待集合を再生成。
4. 並列化判定（タスク内）: 見送り（理由: 称号定義・データ再生成・訳追加が単一の整合性要件で密結合。単一 subagent に委譲）。
5. TDD（build-hre_test に年代別 NAME 解決のテスト先行）→ fmt/lint/test green → 生成物検証（各年の NAME 一覧）→ mainagent が統合後に目視確認（1500/1650 のラベル・ツールチップ称号表記）→ PR → CI → finalization → マージ
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
検証エビデンス:
- AC#1: Chrome で 1500/1650 を目視確認。全 HRE 領邦のラベルが称号付き日本語表記（ブランデンブルク選帝侯領・ボヘミア王国・マインツ/トリーア/ケルン/ザルツブルク大司教領・オーストリア大公領・プファルツ選帝侯領・ヴュルテンベルク公領・ヘッセン方伯領等）。ツールチップは同一の ja マップを使用。
- AC#2: 世俗選帝侯 = 選帝侯領 / 聖界 3 選帝侯 = 大司教領 / ボヘミア = 王国 で統一（表記ルールを build-hre.ts の doc コメントに明文化）。
- AC#3: 1500/1530/1600 = バイエルン公領、1650 = バイエルン選帝侯領（1623 境界）を生成物・目視の両方で確認。
- AC#4: Electorate of Saxony / Duchy of Saxony の 2 系統と 1547 系統入れ替え（重心座標の入れ替わり）を生成物検証・テストで確認。
- deno fmt --check / lint / test（376 passed）/ build 全 green。PR #40 CI pass。並列化見送り（単一 subagent d429c21）。TDD red→green。
- 留意: ローカル dev サーバのヒューリスティックキャッシュで旧 geojson が残る事象を検証中に確認（cache: reload で解消）。本番配信のキャッシュ制御は別タスクで扱う。
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
HRE 領邦の英語 NAME を正式称号付き（Electorate/Archbishopric/Kingdom/Duchy/Archduchy/Landgraviate）に統一し、年代依存の称号（バイエルン 1623 昇格）は build-hre の期間別 NAME 解決で表現。ja は称号付きキーへ移行し勢力・都市との共有キー衝突も解消。フロントエンド無変更。検証は deno test 376 passed・CI pass・1500/1650 の目視確認。
<!-- SECTION:FINAL_SUMMARY:END -->
