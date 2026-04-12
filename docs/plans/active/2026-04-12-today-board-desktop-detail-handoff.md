# Today Board Desktop Detail Handoff

## Summary

- Added a desktop Today Board regression test for restoring card-board scroll after closing detail.
- Added ReaderCore regression tests for preserving the delayed-read rule while refreshing Today Board card state when delayed auto-read starts.
- Added regression coverage for parent rerenders during the read delay so translation/loading/content updates cannot restart the 2-second read timer.
- Added regression coverage for selected-entry data refreshes so the Today Board detail list does not repeatedly call `scrollIntoView`.
- Preserved the card-board scroll position before opening desktop detail and restored it when returning to cards.
- Reused the delayed auto-read mutation path with an optimistic Today Board overlay so the card state updates immediately after the read threshold is reached.
- Stabilized Today Board full-list translation scheduling by keying it to the date and entry id set.

## Changed Files

- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`

## Verification

- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx src/__tests__/components/Layout.todayBoardMobile.test.tsx`
- `pnpm --filter @glean/web typecheck`
- `pnpm --filter @glean/web lint`

## Notes

- `lint` passes with the existing Fast Refresh warning in `ReaderCore.tsx`.
- No backend, API, worker, queue, scheduler, Docker, or deployment files were changed.
