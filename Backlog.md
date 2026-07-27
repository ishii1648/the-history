# Kanban Board Export (powered by Backlog.md)

Generated on: 2026-07-23 14:39:14 Project: the-history

| To Do                                                                              | In Progress | Done                                                                                                                                 |
| ---------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **TASK-47** - 地図上のラベルに日本語・英語が混在する問題を調査・修正する<br>_#bug_ |             | **TASK-45** - agent-loop に実装難航時の強制エスカレーション基準を追加する [@claude]                                                  |
| **TASK-46** - データの既知の制限（表示できない情報）をUIに明記する                 |             | **TASK-40** - 情報パネル・タイムラインを羊皮紙/古地図風デザインに作り込む [@claude]                                                  |
| **TASK-43** - 河川のクリック・ホバー判定範囲を広げる                               |             | **TASK-39** - イングランド王国がスコットランド・ウェールズ・アイルランドと一括り表示になっている件を調査する [@claude]               |
| **TASK-10** - Cloudflare デプロイと CSP・CI 整備                                   |             | **TASK-38** - 国名・都市名・河川名ラベルの視認性を改善する（フォント・サイズ・縁取り） [@claude]                                     |
|                                                                                    |             | **TASK-37** - 1500年以前の年代でも神聖ローマ帝国内部の領邦表示を検討する [@claude]                                                   |
|                                                                                    |             | **TASK-44** - 河川のベースマップ描画と picking 対象ジオメトリの乖離でクリック位置がずれる [@claude]<br>_#bug_                        |
|                                                                                    |             | **TASK-36** - 河川ホバー/クリック時の強調スタイルが反映されない [@claude]<br>_#bug_                                                  |
|                                                                                    |             | **TASK-41** - Cloudflare インフラのプロビジョニング方式（wrangler CLI 採用・Terraform 見送り）の設計判断を記録する                   |
|                                                                                    |             | **TASK-35** - データファイル更新時にブラウザキャッシュで旧データが配信され続ける問題への対処 [@claude]<br>_#area:scripts #area:docs_ |
|                                                                                    |             | **TASK-33** - 年代ごとの歴史解説パネルを表示する [@claude]<br>_#area:src-main #area:data #area:scripts_                              |
|                                                                                    |             | **TASK-34** - ベースマップに地形（起伏・陰影）表現を追加する [@claude]<br>_#area:scripts #area:data #area:src-basemap_               |
|                                                                                    |             | **TASK-30** - 神聖ローマ帝国の域内範囲を視覚的に分かりやすくする [@claude]<br>_#area:src-main_                                       |
|                                                                                    |             | **TASK-32** - HRE 領邦の日本語表記に正式な称号を付けて一貫させる [@claude]<br>_#area:scripts #area:data_                             |
|                                                                                    |             | **TASK-28** - 設計判断を backlog decisions に記録する運用を仕組み化する [@claude]<br>_#area:docs #area:workflow_                     |
|                                                                                    |             | **TASK-29** - 河川ホバー/クリック時に河川名を国名・都市より優先して表示する [@claude]<br>_#area:src-main_                            |
|                                                                                    |             | **TASK-31** - agent-loop をタスク間並列実行に対応させる（残タスク全体の並列可能性判定） [@claude]                                    |
|                                                                                    |             | **TASK-27** - 各年代の主要都市をマーカー表示する [@claude]                                                                           |
|                                                                                    |             | **TASK-26** - attribution フッターを折りたたみ式にする [@claude]                                                                     |
|                                                                                    |             | **TASK-25** - タイムラインスライダーを縦向きにして画面左端に配置する [@claude]                                                       |
|                                                                                    |             | **TASK-24** - 主要河川のラベル表示とクリックによるライン強調 [@claude]                                                               |
|                                                                                    |             | **TASK-23** - 勢力名を日本語表記にする [@claude]                                                                                     |
|                                                                                    |             | **TASK-22** - ヨーロッパ圏外までズームアウト・パンできないようにする [@claude]                                                       |
|                                                                                    |             | **TASK-20** - 勢力名ラベルを地図上に常時表示する [@claude]                                                                           |
|                                                                                    |             | **TASK-19** - 神聖ローマ帝国内の主要領邦を地図上で表現する [@claude]                                                                 |
|                                                                                    |             | **TASK-21** - 主要河川がどのズームでも描画されない（仕様違反）を修正する [@claude]<br>_#bug_                                         |
|                                                                                    |             | **TASK-18** - GitHub Actions ワークフローの外部 action をコミット SHA 固定にする [@claude]                                           |
|                                                                                    |             | **TASK-16** - agent-loop 完了時に /code-review 実行を促す最終レポートへ変更 [@claude]                                                |
|                                                                                    |             | **TASK-14** - agent-loop skill に PR conflict 対応とマージブロック分析を追記 [@claude]                                               |
|                                                                                    |             | **TASK-9** - フッター・ローディング/エラー UI [@claude]                                                                              |
|                                                                                    |             | **TASK-8** - URL 状態共有 [@claude]                                                                                                  |
|                                                                                    |             | **TASK-7** - ホバー/クリック情報表示と地図挙動 [@claude]                                                                             |
|                                                                                    |             | **TASK-6** - タイムラインスライダー [@claude]                                                                                        |
|                                                                                    |             | **TASK-17** - 初期ロードで地図表示まで 20〜30 秒かかる（ローカル dev 環境） [@claude]<br>_#bug_                                      |
|                                                                                    |             | **TASK-5** - 勢力圏ポリゴンレイヤー表示 [@claude]                                                                                    |
|                                                                                    |             | **TASK-4** - ベースマップ表示（MapLibre + PMTiles） [@claude]                                                                        |
|                                                                                    |             | **TASK-3** - 色割当の静的生成（data/colors.json） [@claude]                                                                          |
|                                                                                    |             | **TASK-15** - 動作確認で見つけた問題の bug タスク化とループでの最優先修正 [@claude]                                                  |
|                                                                                    |             | **TASK-2** - データパイプライン構築（scripts/build-data.ts） [@claude]                                                               |
|                                                                                    |             | **TASK-13** - エージェントループのローカル実行化（GitHub Actions 起動の廃止） [@claude]                                              |
|                                                                                    |             | **TASK-12** - 自律タスク選択とエージェントループの外側化 [@claude]                                                                   |
|                                                                                    |             | **TASK-1** - プロジェクト基盤セットアップ（Deno + TypeScript） [@claude]                                                             |
|                                                                                    |             | **TASK-11** - 開発プロセス基盤整備（TDD 規約・CI・エージェントループ） [@claude]                                                     |
