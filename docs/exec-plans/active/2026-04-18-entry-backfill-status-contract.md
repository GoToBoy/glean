# Sprint Contract

## Goal

Move article content backfill status out of reader list surfaces and expose per-entry backfill status plus failure logs in management surfaces.

## Scope

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
- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- `backend/apps/worker/glean_worker/tasks/content_extraction.py`
- `backend/apps/worker/glean_worker/tasks/content_backfill.py`
- `backend/packages/rss/tests/test_extractor.py`
- `backend/packages/rss/tests/test_parser.py`
- `backend/apps/worker/tests/test_feed_fetcher.py`
- `backend/apps/worker/tests/test_content_backfill.py`
- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- `frontend/apps/web/src/pages/reader/shared/components/ReaderCoreParts.tsx`
- `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx`
- `frontend/apps/admin/src/pages/EntriesPage.tsx`
- `frontend/packages/types/src/models.ts`
- `frontend/apps/admin/src/hooks/useFeeds.ts`
- `frontend/apps/web/src/__tests__/helpers/mockData.ts`
- `frontend/packages/i18n/src/locales/zh-CN/settings.json`
- `frontend/packages/i18n/src/locales/en/settings.json`
- `frontend/packages/i18n/src/locales/zh-CN/admin.json`
- `frontend/packages/i18n/src/locales/en/admin.json`

## Done Means

- Reader entry lists no longer show content backfill badges inline with article summaries.
- User settings feed-management recent article previews show each entry's content backfill status.
- Failed backfill entries in management surfaces show the stored error log/message.
- Backfill extraction failures no longer collapse unrelated fetch/extraction cases into the single `empty_extraction` error.
- Relative feed entry URLs are normalized to absolute URLs before entry storage or backfill selection.
- RSSHub-backed feed entries are identified by persisted `feeds.source_type = 'rsshub'`, treated as already source-complete for backfill purposes, and do not enqueue article full-text extraction.
- Normal feeds, including feeds that only temporarily fall back through RSSHub infrastructure, still use normal article content backfill unless their persisted source type is `rsshub`.
- Existing rows are classified by Alembic data migrations during deployment startup, and RSSHub feed entries with stale `pending`, `processing`, or `failed` backfill states are normalized to `skipped`.
- Stale queued backfill jobs for RSSHub entries are safely skipped at execution time.
- Worker and extractor tests cover the new failure-reason mapping.
- Existing entry preview/detail behavior still works without new API changes.

## Risks

- Web and admin surfaces use different translation namespaces and may drift if labels are not aligned.
- Recent article preview uses shared entry models, so the UI must tolerate missing backfill fields.
- The RSS extractor has several fallback branches, so failure-reason reporting can regress if tests do not lock each branch down.
- Feed-specific relative URLs can look like extraction failures later, so parser normalization must happen before rows are inserted.
- Existing local data had no persisted feed source type, so the migration must infer legacy RSSHub rows once. Runtime behavior must not keep using URL-route guessing for new decisions.
- Redis may still contain old queued backfill jobs after migration, so the worker must guard execution, not just enqueue.

## Evaluator Focus

- Confirm the reader list no longer shows fill badges in both today board and unified reader list entries.
- Confirm per-entry backfill status appears in settings manage-feeds recent article preview.
- Confirm failed entries surface the stored error message instead of hiding it behind a tooltip only.
- Confirm known extractor failure paths now surface specific reasons such as challenge/client-error/shell/readability/browser-fetch failure instead of `empty_extraction`.
- Confirm relative feed entry URLs are resolved against feed/site base URLs before persistence.
- Confirm only feeds with persisted `source_type = 'rsshub'` skip content backfill queueing.
- Confirm RSSHub-looking route URLs on normal `source_type = 'feed'` subscriptions still enqueue content backfill.
- Confirm deployment startup applies the data migrations and leaves no RSSHub entries in `pending`, `processing`, or `failed` backfill states.
- Confirm stale single-entry backfill jobs for RSSHub entries return `skipped` without extraction.
