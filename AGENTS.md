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

- `docs/operations/personal-deployment-guide.md`
- `docs/operations/local-harness.md`

## Local Runtime Harness

Prefer the local harness over ad hoc command sequences when booting and inspecting the app locally.

Primary commands:

- `python3 -m harness up`
- `python3 -m harness down`
- `python3 -m harness status`
- `python3 -m harness health`
- `python3 -m harness logs <service>`
- `python3 -m harness logs <service> --errors`
- `python3 -m harness doctor`
- `python3 -m harness snapshot`
- `python3 -m harness instances`

Thin Make wrappers are documented in `docs/operations/local-harness.md`.

## Repository Conventions

- Keep knowledge in-repo, not in chat-only context.
- Add or update docs when behavior, workflow, or architecture changes.
- Preserve progressive disclosure: short entry docs, deeper targeted docs underneath.
- Prefer boring, inspectable, repo-local mechanisms over opaque workflow magic.

## Human-Facing Supplements

- General repo guidance: `CLAUDE.md`
- Backend guidance: `backend/CLAUDE.md`
- Frontend guidance: `frontend/CLAUDE.md`
