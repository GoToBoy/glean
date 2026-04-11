# Agent-First Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the repo into an agent-first layout with a short `AGENTS.md`, structured docs system-of-record, a default multi-agent workflow, and a local harness CLI that grows into worktree-aware and observability-aware modes.

**Architecture:** Add a small root navigation file, reorganize `docs/` around indexed domains, codify planner/generator/evaluator artifacts in repo-local docs, then introduce a Python harness package that wraps the existing local development commands behind stable `up/down/status/health/logs` entrypoints. Extend the harness with per-worktree instances plus `doctor` and `snapshot` diagnostics. Add lightweight validation so the new knowledge structure remains mechanically enforceable.

**Tech Stack:** Markdown, Python 3.11+, argparse, subprocess, JSON runtime state, GitHub Actions

---

### Task 1: Add Repository Entry Documents

**Files:**
- Create: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `backend/CLAUDE.md`
- Test: manual path and content review

- [ ] **Step 1: Write the root `AGENTS.md` as a short navigation document**
- [ ] **Step 2: Update `CLAUDE.md` to point to the new agent-first docs layout**
- [ ] **Step 3: Update `backend/CLAUDE.md` to point to the new workflow docs and harness docs**
- [ ] **Step 4: Run `git diff --check`**

### Task 2: Reorganize `docs/` Into Indexed Domains

**Files:**
- Create: `docs/index.md`
- Create: `docs/architecture/index.md`
- Create: `docs/operations/index.md`
- Create: `docs/agent-workflows/index.md`
- Create: `docs/product/index.md`
- Create: `docs/references/index.md`
- Create: `docs/generated/index.md`
- Create: `docs/plans/active/index.md`
- Create: `docs/plans/completed/index.md`
- Move or copy: selected existing docs into the new directories
- Test: `scripts/validate-docs.py`

- [ ] **Step 1: Create the target directory structure**
- [ ] **Step 2: Add index documents that explain what belongs in each section**
- [ ] **Step 3: Move existing high-signal docs into the new directories**
- [ ] **Step 4: Update internal cross-links to the moved docs**
- [ ] **Step 5: Run docs validation and fix broken references**

### Task 3: Add Multi-Agent Workflow Docs And Templates

**Files:**
- Create: `docs/agent-workflows/default-loop.md`
- Create: `docs/agent-workflows/low-risk-direct-edits.md`
- Create: `docs/agent-workflows/sprint-contract-template.md`
- Create: `docs/agent-workflows/handoff-template.md`
- Create: `docs/agent-workflows/evaluator-rubric.md`
- Test: manual content review, docs validation

- [ ] **Step 1: Document the default `planner -> generator -> evaluator` loop**
- [ ] **Step 2: Document what qualifies as a low-risk direct edit**
- [ ] **Step 3: Add sprint contract, handoff, and evaluator templates**
- [ ] **Step 4: Link these docs from `AGENTS.md`, `docs/index.md`, and `backend/CLAUDE.md`**
- [ ] **Step 5: Re-run docs validation**

### Task 4: Build The Local Harness CLI

**Files:**
- Create: `harness/__init__.py`
- Create: `harness/__main__.py`
- Create: `harness/cli.py`
- Create: `harness/config.py`
- Create: `harness/processes.py`
- Create: `harness/health.py`
- Create: `harness/logs.py`
- Modify: `.gitignore`
- Modify: `Makefile`
- Create: `docs/operations/local-harness.md`
- Test: local `python -m harness ...` commands

- [ ] **Step 1: Create the harness package and argparse entrypoint**
- [ ] **Step 2: Add runtime-state management for local process metadata**
- [ ] **Step 3: Implement `up` and `down` using existing repo commands**
- [ ] **Step 4: Implement `status`, `health`, and `logs`**
- [ ] **Step 5: Add Makefile wrappers and local harness documentation**
- [ ] **Step 6: Run the harness commands locally and verify expected behavior**

### Task 5: Add Baseline Docs Validation

**Files:**
- Create: `scripts/validate-docs.py`
- Modify: `Makefile`
- Modify: `.github/workflows/ci-backend.yml`
- Test: run validator locally

- [ ] **Step 1: Implement validation for required docs files and indexes**
- [ ] **Step 2: Validate that `AGENTS.md` references existing paths**
- [ ] **Step 3: Add `make docs-validate`**
- [ ] **Step 4: Add docs validation to CI**
- [ ] **Step 5: Run the validator locally**

### Task 6: Update Developer Entry Docs

**Files:**
- Modify: `README.md`
- Modify: `README.zh-CN.md`
- Modify: `docs/operations/index.md`
- Test: manual review

- [ ] **Step 1: Add links to the new docs index and local harness docs**
- [ ] **Step 2: Update quick-start language to mention the harness as the preferred orchestration entrypoint**
- [ ] **Step 3: Verify the updated docs do not contradict existing Makefile and Docker workflows**

### Task 7: Add Worktree-Aware Harness Instances

**Files:**
- Create: `harness/instances.py`
- Modify: `harness/config.py`
- Modify: `harness/cli.py`
- Modify: `harness/processes.py`
- Modify: `harness/health.py`
- Modify: `docker-compose.dev.yml`
- Modify: `frontend/apps/admin/vite.config.ts`
- Create: `test/test_harness_instances.py`
- Test: local `python3 -m harness instances` and instance-specific `status`

- [ ] **Step 1: Add shared instance slot allocation tied to tracked git worktrees**
- [ ] **Step 2: Parameterize service ports and Compose project naming per instance**
- [ ] **Step 3: Isolate harness runtime state and logs per instance**
- [ ] **Step 4: Add CLI support for `--instance` and `instances`**
- [ ] **Step 5: Add tests for instance naming, slot allocation, and port offsets**

### Task 8: Add Observability-Aware Harness Commands

**Files:**
- Create: `harness/observability.py`
- Modify: `harness/logs.py`
- Modify: `harness/cli.py`
- Modify: `Makefile`
- Modify: `AGENTS.md`
- Modify: `DEVELOPMENT.md`
- Modify: `docs/operations/local-harness.md`
- Test: `python3 -m harness doctor`, `python3 -m harness snapshot`

- [ ] **Step 1: Add error-focused log helpers for recent failure excerpts**
- [ ] **Step 2: Build a machine-readable runtime snapshot that combines instance info, health, and logs**
- [ ] **Step 3: Add a human-readable `doctor` report and expose it through the CLI**
- [ ] **Step 4: Add Make wrappers and docs for the new observability commands**
- [ ] **Step 5: Add focused tests for snapshot and doctor behavior**

### Task 9: Verify The Full Refactor

**Files:**
- Verify: docs, harness, Makefile, CI changes

- [ ] **Step 1: Run `git diff --check`**
- [ ] **Step 2: Run `python3 scripts/validate-docs.py`**
- [ ] **Step 3: Run `python3 -m harness status` and `python3 -m harness health`**
- [ ] **Step 4: Run `python3 -m harness doctor` and `python3 -m harness snapshot`**
- [ ] **Step 5: Run a focused lint pass on any Python files added**
- [ ] **Step 6: Run focused harness tests**
- [ ] **Step 7: Summarize follow-up work for future deeper observability expansion**
