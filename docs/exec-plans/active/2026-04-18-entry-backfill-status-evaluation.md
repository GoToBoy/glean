# Evaluation

## Verdict

Accepted.

## Contract Compliance

- Reader list surfaces no longer render content backfill badges in `TodayBoard` and `ReaderCoreParts`.
- Settings feed-management recent article preview now renders per-entry backfill state, attempts, and failed error logs.
- Admin entry management still exposes per-entry backfill state and now labels failed messages explicitly as error logs.
- Extractor and worker code now preserve specific backfill failure reasons instead of flattening them all into `empty_extraction`.
- RSS parsing now resolves relative entry URLs to absolute URLs before storage.
- RSSHub-backed feed entries now skip article content backfill when their persisted feed `source_type` is `rsshub` instead of enqueueing full-text extraction.
- Normal `source_type = 'feed'` subscriptions continue to enqueue article content backfill, even if their URL path resembles an RSSHub route.
- Deployment data migrations classify existing rows and normalize stale RSSHub entry backfill states to `skipped`.
- Worker execution now guards stale queued RSSHub backfill jobs, so old Redis jobs cannot reintroduce `processing` or `failed` states.

## Behavioral Correctness

- `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx` now flows directly from summary text to timestamp with no backfill badge block.
- `frontend/apps/web/src/pages/reader/shared/components/ReaderCoreParts.tsx` now flows from summary to metadata without a fill-state chip, matching the intended removal from article lists.
- `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx` uses the existing entry payload fields (`content_backfill_status`, `content_backfill_attempts`, `content_backfill_error`) to show per-entry state in the management preview without backend contract changes.
- `frontend/apps/admin/src/pages/EntriesPage.tsx` maps all known backfill states, including `done` and `skipped`, and prints failed error logs inline.
- `backend/packages/rss/glean_rss/extractor.py` now returns structured failure reasons for HTTP/browser fetch and extraction branches, and `backend/apps/worker/glean_worker/tasks/content_extraction.py` preserves those reasons when writing `content_backfill_error`.
- `backend/packages/rss/glean_rss/parser.py` now resolves relative links against the feed/site base URL, which fixes feeds like Stanford AI Lab Blog that emitted `/blog/...` article links.
- Historical Stanford AI Lab failures were repaired in-place and reprocessed successfully.
- `backend/packages/database/glean_database/models/feed.py` now stores `source_type`, and the migration `c6d7e8f9a0b1` adds/backfills that source type for existing rows.
- Data migrations `d7e8f9a0b1c2` and `e8f9a0b1c2d3` classify existing RSSHub rows and normalize their stale backfill states.
- `backend/packages/core/glean_core/services/feed_service.py` and the feed API creation path now persist `source_type = 'rsshub'` for RSSHub subscriptions and `source_type = 'feed'` for normal feed subscriptions.
- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py` now uses the persisted feed source type for RSSHub backfill skipping instead of route-path guessing.
- `backend/apps/worker/glean_worker/tasks/content_backfill.py` now skips RSSHub feed-level enqueue and stale single-entry jobs.
- Tests cover the important negative case: an RSSHub-looking route URL on `source_type = 'feed'` still enqueues content backfill.
- Tests cover stale RSSHub single-entry backfill jobs returning `skipped` without extraction.
- Historical RSSHub-type failed/pending rows in local Docker were reclassified to `skipped`, leaving failed/pending rows only on normal `feed` source type rows at verification time.

## Regression Risk

- Low to moderate: most UI changes reuse existing entry data fields, while the feed source-type addition changes persistence and worker behavior.
- Main residual risk is that other feeds may use unusual relative link formats or missing feed/site base URLs, but the parser now uses standard `urljoin` semantics which reduces that risk materially.
- Existing rows had no explicit source type, so migration inference from legacy URLs is necessarily best-effort. Runtime decisions after migration rely on persisted `feeds.source_type` rather than URL-route guessing.
- Residual Redis jobs are handled by the worker guard; without that guard, old jobs could briefly set RSSHub entries back to `processing`.

## Repository Fit

- The task followed the documented planner/generator/evaluator workflow with repository artifacts added under `docs/exec-plans/active/`.
- Backend feed parsing behavior changed intentionally and was documented alongside targeted remediation.

## Verification Quality

- Strong enough for this scope: web/admin typecheck passed, and lint reported only a pre-existing unrelated warning in `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`.
- Stronger after backend follow-up: targeted extractor and worker tests passed (`48 passed`) and syntax compilation succeeded with sandbox-safe cache settings.
- Stronger after parser follow-up: parser/extractor/worker suite passed (`62 passed`), Stanford historical failures were repaired (`15/15 success`), and Docker images were rebuilt with the parser fix.
- Stronger after RSSHub source-type follow-up: content_backfill/feed_fetcher/feed_refresh_scheduler/parser slice passed (`56 passed`), syntax compilation passed, and local Docker RSSHub-type rows were verified as `done` or `skipped`.
- Docker verification after rebuild confirmed migration version `e8f9a0b1c2d3`, feed counts `feed = 161` and `rsshub = 27`, RSSHub-type rows `239 done` and `95 skipped`, and `0` RSSHub-type rows in `pending`, `processing`, or `failed`.
- Docker backend logs confirm migrations run at startup from the backend container, while worker logs confirm worker does not run migrations.
- The feed API integration test was attempted but blocked during fixture setup because local test Postgres on `localhost:5433` was not running.
- Missing: interactive browser verification of the two affected UI surfaces.
