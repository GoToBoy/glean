# Implementation Handoff

## What Changed

- Added a new `今日看板` reader entry in the feed sidebar below `智能列表`.
- Added a dedicated `view=today-board` reader mode with a desktop-first board layout instead of the standard narrow list pane.
- Implemented explicit today-board data shaping in a helper that:
  - prefers `ingested_at`
  - falls back to `created_at`
  - then falls back to `published_at`
  - filters to the current local day
  - sorts unread entries ahead of read entries
  - hydrates feed summaries from the cached subscription list
- Added a `TodayBoard` component with:
  - dense card-list presentation
  - full-width multi-column overview when detail is closed
  - single-column list compression when detail is open
  - weakened styling for read entries
  - collapsible right-side detail panel
  - blank-area click to close detail
- Added i18n strings for the new sidebar entry and today-board header/empty state.
- Added focused tests for helper behavior and blank-space close interaction.

## Files Touched

- `frontend/apps/web/src/components/Layout.tsx`
- `frontend/apps/web/src/components/sidebar/SidebarFeedsSection.tsx`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/pages/reader/shared/useReaderController.ts`
- `frontend/apps/web/src/pages/reader/shared/todayBoard.ts`
- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.test.ts`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`
- `frontend/apps/web/src/__tests__/setup.ts`
- `frontend/packages/i18n/src/locales/en/feeds.json`
- `frontend/packages/i18n/src/locales/en/reader.json`
- `frontend/packages/i18n/src/locales/zh-CN/feeds.json`
- `frontend/packages/i18n/src/locales/zh-CN/reader.json`

## Verification Run

- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/virtualization.test.ts`
  - passed
- `pnpm --filter @glean/web typecheck`
  - passed
- `git diff --check`
  - passed

## Known Gaps

- The mobile branch intentionally keeps the existing single-column reading flow rather than implementing a split-pane board.
- Sidebar rendering for the new entry is covered by typecheck and manual code-path review, not by a dedicated component test.
- Feed summaries come from the subscription sync cache, not a board-specific API payload.

## Reviewer Focus

- Confirm the blank-area click closes detail in the actual board surface, not just the focused test harness.
- Confirm leaving `today-board` via feed/folder navigation correctly exits the board view.
- Confirm the board remains performant when the all-feeds query contains many non-today entries.
