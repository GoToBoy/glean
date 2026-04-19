# Implementation Handoff

## What Changed

- Removed content backfill badges from reader list surfaces so article lists no longer show fill state inline.
- Added per-entry content backfill status and failed-job error log display to the user settings "Manage Feeds" recent article preview.
- Kept the admin entry management page as the management-side surface for per-entry status, but localized the labels and made failed error logs explicit.
- Replaced the coarse `empty_extraction` backfill failure with more specific extractor failure reasons such as HTTP readability failure, challenge pages, shell pages, browser fetch failure, and browser client-error pages.
- Normalized relative feed entry URLs to absolute URLs during RSS parsing so downstream backfill tasks do not store or retry broken relative article links.
- Repaired the 15 historical Stanford AI Lab Blog failures by converting their stored URLs to absolute URLs and rerunning backfill in the worker container.
- Added explicit feed source typing with `feeds.source_type` (`feed` or `rsshub`) and persisted RSSHub type during RSSHub subscription creation/update.
- Changed RSSHub-backed feed fetches so only feeds with `source_type = 'rsshub'` store summary-only entries with `skipped` backfill state and skip full-text extraction.
- Kept normal `source_type = 'feed'` subscriptions on regular backfill behavior, even if a URL path looks like an RSSHub route or an infrastructure fallback uses RSSHub.
- Added a database migration that backfills legacy RSSHub rows once from existing local URL patterns because old rows had no persisted source type.
- Added deployment data migrations that normalize existing RSSHub feed entries from stale `pending`, `processing`, or `failed` backfill states to `skipped`.
- Added worker-side guards so RSSHub feeds do not enqueue article backfill jobs and stale single-entry RSSHub backfill jobs exit as `skipped` without extraction.
- Reclassified historical RSSHub-type entries in the local Docker database from failed/pending backfill to skipped and cleared their old error logs.

## Files Touched

- `docs/exec-plans/active/2026-04-18-entry-backfill-status-contract.md`
- `backend/packages/rss/glean_rss/extractor.py`
- `backend/packages/rss/glean_rss/parser.py`
- `backend/packages/database/glean_database/models/feed.py`
- `backend/packages/database/glean_database/models/__init__.py`
- `backend/packages/database/glean_database/migrations/versions/c6d7e8f9a0b1_add_feed_source_type.py`
- `backend/packages/database/glean_database/migrations/versions/d7e8f9a0b1c2_classify_existing_rsshub_backfill_data.py`
- `backend/packages/database/glean_database/migrations/versions/e8f9a0b1c2d3_finalize_rsshub_backfill_states.py`
- `backend/packages/core/glean_core/services/feed_service.py`
- `backend/packages/core/glean_core/schemas/feed.py`
- `backend/packages/core/glean_core/schemas/admin.py`
- `backend/packages/core/glean_core/services/admin_service.py`
- `backend/packages/rss/tests/test_extractor.py`
- `backend/packages/rss/tests/test_parser.py`
- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- `backend/apps/worker/glean_worker/tasks/content_extraction.py`
- `backend/apps/worker/glean_worker/tasks/content_backfill.py`
- `backend/apps/worker/tests/test_feed_fetcher.py`
- `backend/apps/worker/tests/test_content_extraction.py`
- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/pages/reader/shared/components/ReaderCoreParts.tsx`
- `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx`
- `frontend/apps/admin/src/pages/EntriesPage.tsx`
- `frontend/packages/types/src/models.ts`
- `frontend/apps/admin/src/hooks/useFeeds.ts`
- `frontend/apps/web/src/__tests__/helpers/mockData.ts`
- `frontend/packages/i18n/src/locales/en/settings.json`
- `frontend/packages/i18n/src/locales/zh-CN/settings.json`
- `frontend/packages/i18n/src/locales/en/admin.json`
- `frontend/packages/i18n/src/locales/zh-CN/admin.json`

## Verification Run

- `pnpm --dir frontend --filter @glean/web typecheck`
- `pnpm --dir frontend --filter @glean/admin typecheck`
- `pnpm --dir frontend --filter @glean/web lint`
- `pnpm --dir frontend --filter @glean/admin lint`
- `UV_CACHE_DIR=/Users/ming/Sites/github/glean/.uv-cache uv run pytest packages/rss/tests/test_extractor.py apps/worker/tests/test_content_extraction.py apps/worker/tests/test_content_backfill.py`
- `UV_CACHE_DIR=/Users/ming/Sites/github/glean/.uv-cache uv run pytest packages/rss/tests/test_parser.py packages/rss/tests/test_extractor.py apps/worker/tests/test_content_extraction.py apps/worker/tests/test_content_backfill.py`
- `UV_CACHE_DIR=/Users/ming/Sites/github/glean/.uv-cache uv run pytest apps/worker/tests/test_feed_fetcher.py packages/rss/tests/test_parser.py`
- `UV_CACHE_DIR=/Users/ming/Sites/github/glean/.uv-cache uv run pytest apps/worker/tests/test_feed_fetcher.py apps/worker/tests/test_feed_refresh_scheduler.py packages/rss/tests/test_parser.py -q`
- `UV_CACHE_DIR=/Users/ming/Sites/github/glean/.uv-cache uv run pytest apps/worker/tests/test_content_backfill.py apps/worker/tests/test_feed_fetcher.py apps/worker/tests/test_feed_refresh_scheduler.py packages/rss/tests/test_parser.py -q`
- `UV_CACHE_DIR=/Users/ming/Sites/github/glean/.uv-cache uv run pytest tests/integration/test_feeds_api.py -q`
- `PYTHONPYCACHEPREFIX=/tmp/python-pycache python3 -m py_compile backend/packages/rss/glean_rss/extractor.py backend/apps/worker/glean_worker/tasks/content_extraction.py backend/apps/worker/tests/test_content_extraction.py`
- `PYTHONPYCACHEPREFIX=/tmp/python-pycache python3 -m py_compile backend/packages/rss/glean_rss/parser.py backend/packages/rss/tests/test_parser.py`
- `PYTHONPYCACHEPREFIX=/tmp/python-pycache python3 -m py_compile backend/apps/worker/glean_worker/tasks/feed_fetcher.py backend/apps/worker/tests/test_feed_fetcher.py`
- `PYTHONPYCACHEPREFIX=/tmp/python-pycache python3 -m py_compile backend/packages/database/glean_database/models/feed.py backend/packages/core/glean_core/services/feed_service.py backend/packages/core/glean_core/schemas/feed.py backend/packages/core/glean_core/schemas/admin.py backend/packages/core/glean_core/services/admin_service.py backend/apps/api/glean_api/routers/feeds.py backend/apps/worker/glean_worker/tasks/content_backfill.py backend/packages/database/glean_database/migrations/versions/c6d7e8f9a0b1_add_feed_source_type.py backend/packages/database/glean_database/migrations/versions/d7e8f9a0b1c2_classify_existing_rsshub_backfill_data.py backend/packages/database/glean_database/migrations/versions/e8f9a0b1c2d3_finalize_rsshub_backfill_states.py`
- `docker compose -f docker-compose.yml -f docker-compose.override.yml exec -T postgres psql ...` to convert Stanford relative URLs to absolute URLs in-place
- `docker compose -f docker-compose.yml -f docker-compose.override.yml exec -T worker uv run python ...` to rerun Stanford backfill jobs directly inside the worker container
- `docker compose -f docker-compose.yml -f docker-compose.override.yml exec -T postgres psql ...` to verify migration version, feed `source_type` counts, and RSSHub-type backfill states
- `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --build`
- Result: typecheck passed for both apps.
- Result: lint passed for touched surfaces; the web lint run still reports the pre-existing `react-refresh/only-export-components` warning in `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`.
- Result: targeted backend RSS/worker tests passed (`62 passed`).
- Result: Stanford AI Lab historical failures recovered successfully (`15/15 success`, all now `done`).
- Result: RSSHub source-type backfill skip tests passed, including guards that RSSHub-looking routes on `source_type = 'feed'` still enqueue backfill and stale RSSHub backfill jobs are skipped (`56 passed` for content_backfill/feed_fetcher/feed_refresh_scheduler/parser slice).
- Result: local Docker database is migrated to `e8f9a0b1c2d3`; feed counts are `feed = 161`, `rsshub = 27`.
- Result: local Docker RSSHub-type entries are only in `done` or `skipped` states (`239 done`, `95 skipped`); RSSHub-type `pending`/`processing`/`failed` count is `0`.
- Result: backend Docker startup logs show deployment migrations run from the backend container with `RUN_MIGRATIONS=true`; worker startup logs show migrations are skipped there to avoid races.
- Result: the integration feed API test was attempted but blocked at fixture setup because local test Postgres on `localhost:5433` was not running.

## Known Gaps

- No browser runtime screenshot verification was performed in this turn.
- The current workspace is not an active git worktree, so `git diff`/`git status` could not be used for review artifacts.

## Reviewer Focus

- Confirm users now see backfill state on per-entry rows inside settings feed-management preview rather than in reader lists.
- Confirm failed entries surface the stored `content_backfill_error` text clearly in both settings and admin entry management.
- Confirm removing the reader badges does not leave awkward spacing in compact and standard list item layouts.
- Confirm new backfill failures persist specific reason strings instead of collapsing to `empty_extraction` for unrelated failure paths.
- Confirm new feed ingests cannot persist relative article URLs like `/blog/iccv-2021/`.
- Confirm RSSHub-backed feed entries no longer enqueue content backfill based on persisted `feeds.source_type = 'rsshub'`, not URL-route guessing.
- Confirm normal `source_type = 'feed'` subscriptions still enqueue content backfill even when their URL path resembles an RSSHub route.
- Confirm deployment data migrations classify existing rows and normalize stale RSSHub entry backfill states.
- Confirm stale Redis queued backfill jobs for RSSHub entries skip without extraction.
