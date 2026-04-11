# Agent-First Harness Refactor Design

## Summary

Refactor the repository toward an agent-first shape inspired by recent OpenAI and Anthropic harness-engineering guidance, while preserving current developer workflows.

The key shifts are:

- treat `AGENTS.md` as a short table of contents rather than a monolithic manual
- make `docs/` the repository knowledge system of record
- define a default multi-agent workflow for most write tasks
- add a local development harness that agents can start, inspect, and validate through one stable CLI
- extend that harness into worktree-aware and observability-aware modes without introducing a separate orchestration stack

This design intentionally stops short of full worktree orchestration or local observability stacks. The new structure must leave clean extension points for both.

## Goals

1. Add a short root `AGENTS.md` that points to repository-local sources of truth.
2. Reorganize `docs/` into clearer top-level domains with index pages.
3. Encode a default `planner -> generator -> evaluator` workflow for most write tasks.
4. Preserve a narrow exception path for low-risk direct edits such as copy and purely visual value tweaks.
5. Add a local Python harness CLI for service startup, shutdown, health checks, logs, and diagnostics.
6. Make the harness worktree-aware so multiple local branches can coexist with isolated ports and runtime state.
7. Add lightweight observability primitives for agents, including diagnostic summaries and machine-readable runtime snapshots.
8. Add baseline validation so the new docs structure and required indexes do not silently rot.

## Non-Goals

1. Building a full autonomous orchestrator that runs planner, generator, and evaluator automatically.
2. Moving every historical document into a perfect taxonomy in one pass.
3. Adding a fully automated planner/generator/evaluator orchestrator.
4. Adding a full logs/metrics/traces observability stack in this change.

## Design Principles

### 1. Repository knowledge must be progressively disclosed

The root entrypoint should be small enough to fit into context reliably. Detailed guidance belongs in targeted documents that can be loaded on demand.

### 2. Multi-agent workflow should be the default, not an optional convention

For most tasks that mutate the repository, the system should tell agents to:

- plan the change
- implement the change
- evaluate the change using an independent rubric

This must be documented in-repo, not implied by tribal knowledge.

### 3. Runtime legibility matters as much as code legibility

Agents should not need bespoke shell incantations to boot the application. They need one stable interface for:

- starting local services
- checking service state
- checking health
- getting logs

### 4. The first version should optimize for extension, not completeness

The local harness must be structured so later additions such as per-worktree instances and observability providers fit naturally without a rewrite.

## Proposed Repository Changes

### Root entrypoints

- Add `AGENTS.md` at the repo root as the short navigation file for agents.
- Keep `CLAUDE.md` and `backend/CLAUDE.md` as human- and tool-facing supplements, but update them to point to the new docs layout where appropriate.

### Docs reorganization

Move `docs/` toward these categories:

- `docs/index.md`
- `docs/architecture/`
- `docs/operations/`
- `docs/agent-workflows/`
- `docs/product/`
- `docs/references/`
- `docs/generated/`
- `docs/plans/active/`
- `docs/plans/completed/`

Not every category needs many files immediately, but each category should exist with an index or README so agents can navigate intentionally.

### Agent workflow docs

Add explicit workflow documents:

- `docs/agent-workflows/index.md`
- `docs/agent-workflows/default-loop.md`
- `docs/agent-workflows/low-risk-direct-edits.md`
- `docs/agent-workflows/sprint-contract-template.md`
- `docs/agent-workflows/handoff-template.md`
- `docs/agent-workflows/evaluator-rubric.md`

These docs define:

- when multi-agent flow is required
- what qualifies as a low-risk direct edit
- what artifacts planner/generator/evaluator exchange
- what evaluator must check before declaring a task done

### Local harness

Add a Python package at repo root:

- `harness/__init__.py`
- `harness/__main__.py`
- `harness/cli.py`
- `harness/config.py`
- `harness/processes.py`
- `harness/health.py`
- `harness/logs.py`
- `harness/observability.py`
- `harness/runtime/` ignored from git

Initial commands:

- `python -m harness up`
- `python -m harness up --services api,worker`
- `python -m harness down`
- `python -m harness status`
- `python -m harness health`
- `python -m harness logs <service>`
- `python -m harness doctor`
- `python -m harness snapshot`

The harness should evolve in two extensions:

1. Worktree-aware instances
   - derive or override an instance name
   - allocate per-instance port blocks
   - isolate runtime state and logs per worktree/instance
2. Lightweight observability
   - summarize health plus recent error excerpts for humans
   - emit one JSON snapshot for agents and scripts
   - avoid taking a dependency on a separate local metrics or tracing stack

The harness will initially manage local dev processes using existing commands:

- infra: `docker compose -f docker-compose.dev.yml up -d`
- api: `cd backend && uv run uvicorn ...`
- worker: `cd backend && uv run python scripts/run-arq-worker.py ...`
- web/admin: existing frontend dev commands

The harness will store process metadata in a local runtime directory so status/health/log commands can work across invocations.

### Baseline validation

Add a validation script that checks:

- required docs files exist
- required index files exist
- `AGENTS.md` references valid paths
- selected high-signal docs paths exist after the restructure

This validation should have a Make target and a lightweight CI job or CI step.

## Migration Strategy

1. Add `AGENTS.md` and new docs indexes first.
2. Move or copy existing docs into the new structure with redirects or updated links.
3. Add local harness CLI while preserving existing `make api`, `make worker`, `make web`, and `make admin` commands.
4. Add docs validation after the new structure exists.
5. Update README and developer docs to point to the new harness and docs index.

## Risks

### 1. Link churn and broken references

Mitigation:

- update known references in README, CLAUDE docs, and new indexes
- add validation for required doc paths

### 2. Harness duplicates existing Makefile logic

Mitigation:

- use the harness as the new stable orchestration layer
- keep Makefile wrappers thin and route them into the harness where appropriate

### 3. Multi-agent workflow becomes performative

Mitigation:

- define concrete artifact templates and evaluator checks
- keep the planner spec high-level and the sprint contract executable

## Success Criteria

1. A new agent can read `AGENTS.md` and find architecture, ops, workflow, and harness docs quickly.
2. A contributor can run one harness CLI to start local services and inspect their state.
3. The repository documents a default multi-agent workflow for most write tasks.
4. CI or local validation catches missing required docs/index paths.
5. Existing core dev workflows remain usable during and after the transition.
6. Multiple worktrees can run concurrently without port collisions.
7. Agents have one JSON diagnostic snapshot and one human-readable doctor report for local runtime inspection.
