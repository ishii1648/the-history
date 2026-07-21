---
id: TASK-18
title: GitHub Actions ワークフローの外部 action をコミット SHA 固定にする
status: To Do
assignee: []
created_date: '2026-07-21 11:32'
updated_date: '2026-07-21 11:33'
labels: []
dependencies: []
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
現在 .github/workflows/ci.yml では actions/checkout@v4 と denoland/setup-deno@v2 のように外部 action がタグ（可変参照）で指定されている。タグは書き換え可能なため、サプライチェーン攻撃（action のタグ乗っ取り等）のリスクがある。GitHub のセキュリティ推奨に従い、外部 action の参照をフルコミット SHA に固定し、可読性のためバージョンをコメントで併記する。加えて、以後この項目に外部 action を追加・更新する際に SHA 固定を徹底させるため、プロジェクトの CLAUDE.md（または該当する開発ルールドキュメント）にそのルールを明文化する。
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ci.yml の actions/checkout がフルコミット SHA 指定になっている（例: uses: actions/checkout@<sha> # v4.x.x）
- [ ] #2 ci.yml の denoland/setup-deno がフルコミット SHA 指定になっている（例: uses: denoland/setup-deno@<sha> # v2.x.x）
- [ ] #3 SHA 固定後も CI（fmt/lint/test/build の各ステップ）が green で通ることを確認している
- [ ] #4 .github/workflows/ 配下の他ワークフローファイルにも同様の未固定 action がないか確認し、あれば同様に修正している
- [ ] #5 GitHub Actions ワークフローに外部 action を追加・更新する際はコミット SHA で固定する旨のルールが CLAUDE.md（または docs/development-style.md 等の該当ドキュメント）に明文化されている
<!-- AC:END -->
