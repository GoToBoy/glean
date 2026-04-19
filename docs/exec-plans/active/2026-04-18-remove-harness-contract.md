# Sprint Contract

## Scope

Remove the current repository-owned local harness feature and all active references that present it as part of the supported development workflow.

## In Scope

- delete the `harness/` package
- delete focused harness tests under `test/`
- remove Makefile harness targets and help text
- remove active docs and README guidance that direct users to `python3 -m harness ...`
- update validation rules and entry indexes so deleted harness docs are no longer required
- replace harness-first local workflow guidance with direct local development commands that still match the repository layout

## Out Of Scope

- rewriting historical legacy exec-plan artifacts that describe past harness work
- changing runtime application logic unrelated to local startup guidance
- installing or validating Docker, Python, or Node dependencies on this machine

## Completion Criteria

- no active documentation entrypoint recommends the harness workflow
- no repository code or tests import from `harness`
- Makefile no longer exposes harness commands
- docs validation logic no longer requires harness files
- current docs indexes and developer entrypoints remain internally consistent after the removal

## Verification Plan

- search for active `harness` references in current code/docs entrypoints
- run docs validation
- run a focused repository search to confirm no remaining active imports or command references outside historical artifacts and runtime logs
