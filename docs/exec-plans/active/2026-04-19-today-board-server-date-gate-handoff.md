# Implementation Handoff

## What Changed

- Added an optional `enabled` gate to the web infinite entries query helper and hook.
- Changed ReaderCore so Today Board entries wait for a truthy server-derived `todayBoardDate` before querying.
- Added focused hook coverage proving a disabled Today Board query does not call either entries API.

## Files Touched

- `frontend/apps/web/src/hooks/useEntries.ts`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/__tests__/hooks/useEntries.test.ts`
- `docs/exec-plans/active/2026-04-19-today-board-server-date-gate-contract.md`
- `docs/exec-plans/active/2026-04-19-today-board-server-date-gate-handoff.md`
- `docs/exec-plans/active/2026-04-19-today-board-server-date-gate-evaluation.md`
- `docs/exec-plans/active/index.md`

## Verification Run

- `pnpm --filter=@glean/web exec vitest run src/__tests__/hooks/useEntries.test.ts`
  - Passed: 14 tests.
- `pnpm --filter=@glean/web typecheck`
  - Passed.

## Known Gaps

- Browser Network-panel verification was not run in this pass.
- A mistaken package-script invocation ran the broader web suite and exposed unrelated existing failures; the focused hook suite passed.

## Reviewer Focus

- Confirm the default `enabled: true` behavior preserves timeline and prefetch callers.
- Confirm ReaderCore only gates Today Board queries while server time is unresolved.
