
<!-- BACKLOG.MD GUIDELINES START -->
<!-- backlog.md-instructions-version: 1.48.0 -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Before task lifecycle actions, read the matching detailed guide:
- `backlog instructions task-creation` before creating or splitting tasks
- `backlog instructions task-execution` before planning, changing status or assignee, adding a plan or implementation notes, or implementing task work
- `backlog instructions task-finalization` before checking acceptance criteria, writing final summaries, or moving tasks to terminal statuses

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

## Task-Driven Development (Backlog.md)

- Branch names must carry the TASK ID: `task-N-slug` (e.g. `task-1-deno-setup`), so a branch is always traceable back to its backlog task.
- Work tasks strictly in dependency order from `backlog/tasks/*.md`; don't start a task until every task in its `dependencies` has reached the terminal status, and don't run tasks in parallel, to keep task status transitions unambiguous.
- PR title/description must reference the TASK ID so review history stays linked to the backlog task.
- TDD is mandatory: write the test before the implementation and confirm it fails (red) before making it pass (green). See `docs/development-style.md` for details.
- Standard task flow: backlog task -> branch -> test first -> implement -> `deno test` green -> converge via `/review-loop` -> PR (with TASK ID) -> CI green -> merge -> backlog finalization.
- A task is Done only when all Acceptance Criteria are checked and CI is green.
