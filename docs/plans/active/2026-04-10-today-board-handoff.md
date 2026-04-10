# Implementation Handoff

## What Changed

- Added a new `今日收录` reader entry in the feed sidebar below `智能列表`.
- Added a dedicated `view=today-board` reader mode with a desktop-first board layout instead of the standard narrow list pane.
- Updated `today-board` fetches to use the dedicated `/entries/today` endpoint with explicit collection-time bounds rather than relying on the default timeline page.
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
  - single-column list compression at the standard feed-list width when detail is open
  - detail pane expansion across the remaining right-side content area
  - root flex growth so the board/detail layout fills the reader route instead of sizing to content
  - weakened styling for read entries
  - card title/summary translation support using the reader list translation flow
  - collapsible right-side detail panel
  - blank-area click to close detail
- Updated the `today-board` reader branch wrapper to fill the available route width before handing space to the board/detail layout.
- Made the layout content chain explicit with `min-w-0` on the main flex item and `w-full` on the page transition wrapper.
- Added i18n strings for the new sidebar entry and the collection-time header/empty state copy.
- Added focused tests for helper behavior and blank-space close interaction.
- Added a regression test proving mobile `today-board` no longer falls back to the normal entry list.

## Files Touched

- `frontend/apps/web/src/components/Layout.tsx`
- `frontend/apps/web/src/components/sidebar/SidebarFeedsSection.tsx`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/pages/reader/shared/useReaderController.ts`
- `frontend/apps/web/src/pages/reader/shared/todayBoard.ts`
- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.test.ts`
- `frontend/apps/web/src/__tests__/pages/reader/todayBoard.interaction.test.tsx`
- `frontend/apps/web/src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
- `frontend/apps/web/src/__tests__/setup.ts`
- `frontend/apps/web/src/hooks/useEntries.ts`
- `frontend/packages/api-client/src/services/entries.ts`
- `backend/apps/api/glean_api/routers/entries.py`
- `backend/packages/core/glean_core/schemas/entry.py`
- `backend/packages/core/glean_core/services/entry_service.py`
- `backend/tests/integration/test_entries_api.py`
- `frontend/packages/i18n/src/locales/en/feeds.json`
- `frontend/packages/i18n/src/locales/en/reader.json`
- `frontend/packages/i18n/src/locales/zh-CN/feeds.json`
- `frontend/packages/i18n/src/locales/zh-CN/reader.json`

## Verification Run

- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/virtualization.test.ts`
  - passed
- `pnpm --dir frontend/apps/web test src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
  - passed
- `pnpm --filter @glean/web typecheck`
  - passed
- `git diff --check`
  - passed

## Known Gaps

- The mobile branch now keeps the existing single-column reading flow, but uses the same `today-board` data path as desktop.
- Sidebar rendering for the new entry is covered by typecheck and manual code-path review, not by a dedicated component test.
- Feed summaries come from the subscription sync cache, not a board-specific API payload.
- Backend integration test coverage was added but could not be executed locally in this session because the local Python env is missing `sqlalchemy`.

## Reviewer Focus

- Confirm the blank-area click closes detail in the actual board surface, not just the focused test harness.
- Confirm the open detail pane consumes the right-side space in the reader route.
- Confirm leaving `today-board` via feed/folder navigation correctly exits the board view.
- Confirm the board remains performant when the all-feeds query contains many non-today entries.
