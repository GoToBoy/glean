# Feed Refresh Dedup And Interval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent duplicate active feed refresh jobs from piling up, and make the scheduled refresh interval configurable with a default of 60 minutes.

**Architecture:** Reuse one shared active-run lookup in the persisted feed-fetch progress layer so API-triggered refreshes and worker scheduling enforce the same dedupe rule. Introduce one worker setting for the refresh interval and use it for both cron scheduling and `next_fetch_at` updates.

**Tech Stack:** Python, FastAPI, ARQ, SQLAlchemy, pytest, uv

---

### Task 1: Add Failing Tests For Dedupe

**Files:**
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`
- Create: `backend/tests/integration/test_feed_refresh_dedup.py`

- [ ] **Step 1: Write the failing worker test**

Add a unit test proving `fetch_all_feeds()` skips a due feed when an active queued/in-progress run already exists for that `feed_id`.

- [ ] **Step 2: Run worker test to verify it fails**

Run: `uv run pytest apps/worker/tests/test_feed_fetcher.py -k 'skips_feed_with_active_run'`

- [ ] **Step 3: Write the failing API test**

Add an integration test proving manual refresh returns the existing `run_id`/`job_id` and does not enqueue a second job when an active run already exists.

- [ ] **Step 4: Run API test to verify it fails**

Run: `uv run pytest tests/integration/test_feed_refresh_dedup.py -k 'reuses_existing_active_run'`

### Task 2: Implement Active-Run Reuse

**Files:**
- Modify: `backend/apps/api/glean_api/feed_fetch_progress.py`
- Modify: `backend/apps/api/glean_api/feed_refresh.py`
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`

- [ ] **Step 1: Add shared active-run lookup helper**

Implement a helper that returns the newest `FeedFetchRun` for one `feed_id` where `status in ('queued', 'in_progress')`.

- [ ] **Step 2: Reuse active run in API-triggered refresh**

Update `enqueue_feed_refresh_job()` to return the existing active run payload instead of creating a new run and enqueueing another job.

- [ ] **Step 3: Skip duplicate scheduled enqueue**

Update `fetch_all_feeds()` to skip any due feed that already has an active run.

- [ ] **Step 4: Run targeted tests to verify they pass**

Run:
- `uv run pytest apps/worker/tests/test_feed_fetcher.py -k 'skips_feed_with_active_run'`
- `uv run pytest tests/integration/test_feed_refresh_dedup.py -k 'reuses_existing_active_run'`

### Task 3: Make Refresh Interval Configurable

**Files:**
- Modify: `backend/apps/worker/glean_worker/config.py`
- Modify: `backend/apps/worker/glean_worker/main.py`
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`

- [ ] **Step 1: Add worker setting for refresh interval**

Add `feed_refresh_interval_minutes` with a default of `60`.

- [ ] **Step 2: Use the setting in cron scheduling**

Replace the hard-coded 15-minute cron set with a helper that derives supported minute slots from the configured interval.

- [ ] **Step 3: Use the setting for `next_fetch_at`**

Replace hard-coded `timedelta(minutes=15)` success/not-modified scheduling paths with `timedelta(minutes=settings.feed_refresh_interval_minutes)`.

- [ ] **Step 4: Add/update focused tests if needed**

Extend worker tests only as needed to prove the interval is consumed by scheduling logic.

### Task 4: Verify End-To-End Changes

**Files:**
- Verify only

- [ ] **Step 1: Run focused test suite**

Run:
- `uv run pytest apps/worker/tests/test_feed_fetcher.py`
- `uv run pytest tests/integration/test_feed_refresh_dedup.py`

- [ ] **Step 2: Run at least one broader regression target if environment allows**

Run:
- `uv run pytest tests/integration/test_feed_fetch_progress_api.py`

- [ ] **Step 3: Review git diff**

Run:
- `git diff -- backend/apps/api/glean_api/feed_fetch_progress.py`
- `git diff -- backend/apps/api/glean_api/feed_refresh.py`
- `git diff -- backend/apps/worker/glean_worker/config.py`
- `git diff -- backend/apps/worker/glean_worker/main.py`
- `git diff -- backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- `git diff -- backend/apps/worker/tests/test_feed_fetcher.py`
- `git diff -- backend/tests/integration/test_feed_refresh_dedup.py`

### Task 5: Ship It

**Files:**
- Verify only

- [ ] **Step 1: Commit**

Run:
- `git add <changed files>`
- `git commit -m "fix: dedupe feed refresh jobs"`

- [ ] **Step 2: Push branch**

Run:
- `git push`

- [ ] **Step 3: Create and push tag**

Choose a new tag after checking existing tags, then run:
- `git tag <new-tag>`
- `git push origin <new-tag>`
