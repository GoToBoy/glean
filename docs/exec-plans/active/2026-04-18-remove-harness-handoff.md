# Implementation Handoff

## What Changed

- removed the repository-owned `harness` package and its focused tests
- deleted active harness-specific docs that described `python3 -m harness ...` as the supported local workflow
- updated developer entrypoints and docs indexes to point to direct `make` and `docker compose` workflows instead
- cleaned up `Makefile` help text and targets so harness commands are no longer exposed
- fixed docs validation to follow the current `docs/exec-plans/...` layout and to stop requiring harness docs

## Files Touched

- `AGENTS.md`
- `DEVELOPMENT.md`
- `Makefile`
- `README.md`
- `README.zh-CN.md`
- `docs/index.md`
- `docs/operations/index.md`
- `scripts/validate-docs.py`
- `docs/exec-plans/active/2026-04-18-remove-harness-contract.md`

## Files Removed

- `harness/`
- `test/test_harness_instances.py`
- `test/test_harness_observability.py`
- `docs/operations/local-harness.md`
- `docs/operations/harness-intro.md`
- `docs/agent-workflows/agentic-legibility-and-harness-guide.md`

## Verification Run

- `python3 scripts/validate-docs.py`
  - passed
- `make help`
  - passed and no longer lists harness targets
- focused `rg` searches across current entrypoint files
  - no active harness workflow references remain in current docs and tooling entrypoints

## Known Gaps

- historical exec-plan artifacts still mention harness by design; they were left intact as historical records
- no runtime application services were started because this sprint only removed developer tooling and docs

## Reviewer Focus

- confirm the direct local workflow in `DEVELOPMENT.md`, `README.md`, and `AGENTS.md` matches the team's preferred non-harness startup path
- confirm deleting the harness-specific docs does not conflict with any external onboarding material
