# Implementation Handoff

## What Changed

- Kept the Today Board mounted behind mobile article detail so returning from detail preserves the card board scroll position.
- Disabled mobile pull-down close gestures for Today Board article detail to avoid accidental returns while scrolling.
- Removed duplicate Today Board list controls from the app-level mobile header; Today Board keeps its own date and translation controls.
- Added card-mode feed header title clicks that navigate to the corresponding feed list.

## Files Touched

- `docs/plans/active/2026-04-12-today-board-mobile-sprint-contract.md`
- `frontend/apps/web/src/components/ArticleReader.tsx`
- `frontend/apps/web/src/components/Layout.tsx`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/__tests__/components/Layout.todayBoardMobile.test.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`

## Verification Run

- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx src/__tests__/components/Layout.todayBoardMobile.test.tsx`
  - Pass: 4 files, 31 tests.
- `pnpm --filter @glean/web typecheck`
  - Pass.
- `pnpm --filter @glean/web lint`
  - Pass with the existing Fast Refresh warning in `ReaderCore.tsx`.

## Known Gaps

- No browser/manual mobile visual verification was run.
- The existing Fast Refresh warning remains outside this scoped change.

## Reviewer Focus

- Confirm the hidden mounted Today Board preserves scroll without intercepting touches while article detail is open.
- Confirm app-level mobile header controls are not duplicated for Today Board.
- Confirm feed header title clicks navigate to `/reader?feed=<feedId>`.
