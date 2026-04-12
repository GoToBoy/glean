# Implementation Handoff

## What Changed

- Added a Today Board-local read-state overlay after delayed auto-read succeeds, so card/list rendering can reflect the read state before any server refetch.
- Changed completed feed headers to show only `Read` / `已阅` instead of a completed count.
- Added regression coverage for Today Board read-state propagation and completed-feed status text.

## Files Touched

- `docs/plans/active/2026-04-12-today-board-read-state-sprint-contract.md`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`
- `frontend/packages/i18n/src/locales/zh-CN/reader.json`

## Verification Run

- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
  - Pass: 3 files, 26 tests.
- `pnpm --filter @glean/web typecheck`
  - Pass.
- `pnpm --filter @glean/web lint`
  - Pass with the existing Fast Refresh warning in `ReaderCore.tsx`.

## Known Gaps

- No browser/manual visual verification was run.
- The existing Fast Refresh warning remains outside this scoped change.

## Reviewer Focus

- Confirm the local read-state overlay cannot outlive the canonical list cache once the list cache reports the entry as read.
- Confirm completed-feed headers no longer expose a redundant numeric count.
