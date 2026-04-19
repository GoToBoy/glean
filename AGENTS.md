# AGENTS.md

This repository treats `docs/` as the system of record. Read this file as a map, not as the full manual.

## Start Here

- Repository docs index: `docs/index.md`
- Architecture map: `docs/architecture/index.md`
- Operations and deployment: `docs/operations/index.md`
- Agent workflow rules: `docs/agent-workflows/index.md`
- Reference material: `docs/references/index.md`

## Default Workflow

For any task that writes to the repository, use the default multi-agent workflow unless the task qualifies as a low-risk direct edit:

1. Planner
   - clarify scope
   - write or update the relevant contract/plan/spec artifact
   - define completion criteria
2. Generator
   - implement the change
   - record handoff details for review
3. Evaluator
   - independently verify behavior, quality, and contract compliance
   - reject incomplete or weak work with concrete feedback

Read:

- `docs/agent-workflows/default-loop.md`
- `docs/agent-workflows/evaluator-rubric.md`
- `docs/agent-workflows/handoff-template.md`

## Low-Risk Direct Edit Exception

Direct edits are allowed only for low-risk repository changes such as:

- copy, labels, comments, or explanatory text
- purely visual value tweaks like colors, spacing, font sizes, or shadows
- static configuration changes that do not alter control flow, persistence, queueing, deployment, or runtime behavior

If the change touches logic, APIs, workers, feeds, scheduling, queues, database behavior, CI, Docker, or environment semantics, it is not low-risk.

Read:

- `docs/agent-workflows/low-risk-direct-edits.md`

## Required Domain Reads

Before changing feed fetch, queue, scheduler, or worker progress behavior, read:

- `docs/architecture/feed-fetch-flow.md`
- `docs/operations/feed-fetch-guardrails.md`

Before changing deployment or local runtime workflows, read:

- `docs/operations/local-runtime-modes.md`
- `docs/operations/personal-deployment-guide.md`
- `DEVELOPMENT.md`

## Local Runtime Workflow

Default to Mode A from `docs/operations/local-runtime-modes.md`: Docker for infra, host processes for app code.

Use Mode B only when you explicitly want a clean full-stack Docker verification run.
Use Mode C only when you want deployment-like packaged-image behavior.

Primary commands:

- `make up`
- `make db-upgrade`
- `make down`
- `make logs`
- `make api`
- `make worker`
- `make web`
- `make admin`
- `make dev-all`
- `make test`
- `make lint`

## Repository Conventions

- Keep knowledge in-repo, not in chat-only context.
- Add or update docs when behavior, workflow, or architecture changes.
- Preserve progressive disclosure: short entry docs, deeper targeted docs underneath.
- Prefer boring, inspectable, repo-local mechanisms over opaque workflow magic.

## Human-Facing Supplements

- General repo guidance: `CLAUDE.md`
- Backend guidance: `backend/CLAUDE.md`
- Frontend guidance: `frontend/CLAUDE.md`
