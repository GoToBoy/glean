# Handoff: Remove Smart / Discover / Tags

Date: 2026-04-19

## Scope completed

- Removed Smart reader mode wiring from frontend route/query/state handling and backend `/api/entries` view validation.
- Removed standalone Discover module wiring:
  - deleted web Discover page and sidebar entry
  - deleted backend discover router/service/schema/model wiring
  - preserved feed subscription discovery via `POST /api/feeds/discover`
- Removed Tags module wiring:
  - deleted backend tags router/service/schema/model wiring
  - removed bookmark tag APIs and tag-aware bookmark filters
  - deleted tag dialogs, tag store, tag hooks, and tag-related API client/services
- Added forward migration to drop:
  - `tags`
  - `bookmark_tags`
  - `user_entry_tags`
  - `discovery_candidates`
  - `discovery_feedback`
- Cleaned current docs, mock server fixtures, and affected tests/type references.

## Key files changed

- Backend API/core/db:
  - `backend/apps/api/glean_api/main.py`
  - `backend/apps/api/glean_api/routers/bookmarks.py`
  - `backend/apps/api/glean_api/routers/entries.py`
  - `backend/packages/core/glean_core/services/bookmark_service.py`
  - `backend/packages/core/glean_core/services/entry_service.py`
  - `backend/packages/database/glean_database/models/__init__.py`
  - `backend/packages/database/glean_database/models/junction.py`
  - `backend/packages/database/glean_database/models/user.py`
  - `backend/packages/database/glean_database/migrations/versions/9f1b2c3d4e5f_remove_smart_discover_tags.py`
- Frontend runtime:
  - `frontend/apps/web/src/App.tsx`
  - `frontend/apps/web/src/components/Layout.tsx`
  - `frontend/apps/web/src/components/sidebar/SidebarUserSection.tsx`
  - `frontend/apps/web/src/pages/BookmarksPage.tsx`
  - `frontend/apps/web/src/pages/SettingsPage.tsx`
  - `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
  - `frontend/apps/web/src/pages/reader/shared/components/ReaderCoreParts.tsx`
  - `frontend/apps/web/src/hooks/useBookmarks.ts`
  - `frontend/apps/web/src/components/bookmarks/BookmarkSearchResults.tsx`
- Deleted frontend files:
  - `frontend/apps/web/src/pages/DiscoverPage.tsx`
  - `frontend/apps/web/src/stores/tagStore.ts`
  - `frontend/apps/web/src/hooks/useTags.ts`
  - `frontend/apps/web/src/components/dialogs/CreateTagDialog.tsx`
  - `frontend/apps/web/src/components/dialogs/EditTagDialog.tsx`
  - `frontend/apps/web/src/components/dialogs/DeleteTagDialog.tsx`
  - `frontend/apps/web/src/components/sidebar/SidebarTagsSection.tsx`
  - `frontend/apps/web/src/stores/uiStore.ts`
  - `frontend/packages/api-client/src/services/discover.ts`
  - `frontend/packages/api-client/src/services/tags.ts`

## Verification run

- Passed:
  - `pnpm --dir frontend/apps/web typecheck`
  - `pnpm --dir frontend/packages/api-client test`
- Not fully green:
  - `pnpm --dir frontend/apps/web test -- --runInBand ...` executed the full web suite and still reported unrelated pre-existing failures in today-board/auth/subscription tests. The failures were not caused by remaining Smart/Discover/Tags references after the cleanup pass.
- Could not run backend pytest in this shell because `pytest` is not installed in the available `python3` environment.

## Suggested next verification

- Run the project’s normal backend test environment and execute:
  - `cd backend && python3 -m pytest tests/integration/test_m2_api.py`
- Run the migration against a local DB:
  - `make db-upgrade`
- If desired, run broader frontend regression verification:
  - `pnpm --dir frontend/apps/web test`
