# Feed Fetch Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reusable feed-fetch progress visibility with stage timelines, recent history, and historically calibrated ETA for both admin and end-user feed management surfaces.

**Architecture:** Persist each refresh attempt as a `feed_fetch_run` plus ordered `feed_fetch_stage_event` rows, then expose latest/history APIs and a shared frontend progress model consumed by both admin and user UIs. ETA is heuristic and history-backed, with strict separation between direct feed runs and RSSHub-backed runs.

**Tech Stack:** FastAPI, arq worker, SQLAlchemy, Alembic, React, TanStack Query, shared frontend packages (`@glean/types`, `@glean/api-client`, `@glean/ui`)

---

## File Map

### Backend schema and models

- Create: `backend/packages/database/glean_database/models/feed_fetch_run.py`
- Create: `backend/packages/database/glean_database/models/feed_fetch_stage_event.py`
- Modify: `backend/packages/database/glean_database/models/__init__.py`
- Create: `backend/packages/database/glean_database/migrations/versions/91b7c2e4aa11_add_feed_fetch_progress_tables.py`

### Backend services and API contracts

- Create: `backend/apps/api/glean_api/feed_fetch_progress.py`
- Modify: `backend/apps/api/glean_api/feed_refresh.py`
- Modify: `backend/apps/api/glean_api/routers/feeds.py`
- Modify: `backend/apps/api/glean_api/routers/admin.py`

### Worker instrumentation

- Create: `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`

### Frontend shared contracts and API client

- Modify: `frontend/packages/types/src/api.ts`
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/packages/api-client/src/services/feeds.ts`
- Modify: `frontend/packages/api-client/src/index.ts`

### Frontend shared UI and state

- Create: `frontend/packages/ui/src/components/feed-fetch-progress.tsx`
- Modify: `frontend/packages/ui/src/components/index.ts`
- Create: `frontend/apps/web/src/hooks/useFeedFetchProgress.ts`

### Frontend page integration

- Modify: `frontend/apps/admin/src/hooks/useFeeds.ts`
- Modify: `frontend/apps/admin/src/pages/FeedsPage.tsx`
- Modify: `frontend/apps/web/src/hooks/useSubscriptions.ts`
- Modify: `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx`

### Tests

- Create: `backend/apps/worker/tests/test_feed_fetch_progress.py`
- Create: `backend/tests/integration/test_feed_fetch_progress_api.py`
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`
- Modify: `backend/tests/integration/test_feeds_api.py`
- Modify: `backend/tests/integration/test_admin_api.py`
- Modify: `frontend/packages/api-client/src/__tests__/services/feeds.test.ts`

## Task 1: Add Persistent Fetch Progress Schema

**Files:**
- Create: `backend/packages/database/glean_database/models/feed_fetch_run.py`
- Create: `backend/packages/database/glean_database/models/feed_fetch_stage_event.py`
- Modify: `backend/packages/database/glean_database/models/__init__.py`
- Create: `backend/packages/database/glean_database/migrations/versions/91b7c2e4aa11_add_feed_fetch_progress_tables.py`
- Test: `backend/tests/integration/test_feed_fetch_progress_api.py`

- [ ] **Step 1: Write the failing integration test for persisted runs existing after enqueue**

```python
@pytest.mark.asyncio
async def test_refresh_creates_feed_fetch_run(...):
    response = await client.post(f"/api/feeds/{test_subscription.id}/refresh", headers=auth_headers)
    assert response.status_code == 202
    run = await db_session.execute(select(FeedFetchRun).where(FeedFetchRun.feed_id == test_feed.id))
    assert run.scalar_one_or_none() is not None
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest backend/tests/integration/test_feed_fetch_progress_api.py::test_refresh_creates_feed_fetch_run -v`
Expected: FAIL because `FeedFetchRun` model/table or API persistence does not exist yet.

- [ ] **Step 3: Add SQLAlchemy models**

Implement minimal models with:

- `FeedFetchRun`
  - run status
  - trigger type
  - `path_kind`
  - `profile_key`
  - queue/start/finish timestamps
  - predicted start/finish timestamps
  - summary/error fields
- `FeedFetchStageEvent`
  - `run_id`
  - `stage_name`
  - `status`
  - start/finish timestamps
  - summary/metrics fields

- [ ] **Step 4: Add Alembic migration**

Migration should create both tables, indexes for:

- `feed_id, created_at`
- `job_id`
- `status`
- `profile_key`
- `run_id, created_at`

And add any FK constraints required to `feeds`.

- [ ] **Step 5: Run the failing test again**

Run: `uv run pytest backend/tests/integration/test_feed_fetch_progress_api.py::test_refresh_creates_feed_fetch_run -v`
Expected: Still FAIL, but now because enqueue path does not create run rows yet.

## Task 2: Add Backend Run Lifecycle Helpers

**Files:**
- Create: `backend/apps/api/glean_api/feed_fetch_progress.py`
- Modify: `backend/apps/api/glean_api/feed_refresh.py`
- Test: `backend/tests/integration/test_feed_fetch_progress_api.py`

- [ ] **Step 1: Write the failing API test for refresh response carrying run metadata**

```python
@pytest.mark.asyncio
async def test_refresh_response_returns_run_id(...):
    response = await client.post(f"/api/feeds/{test_subscription.id}/refresh", headers=auth_headers)
    data = response.json()
    assert "run_id" in data
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest backend/tests/integration/test_feed_fetch_progress_api.py::test_refresh_response_returns_run_id -v`
Expected: FAIL because refresh responses currently only include `job_id` and `feed_id`.

- [ ] **Step 3: Implement progress lifecycle helpers**

Create helper functions for:

- create queued run
- compute initial ETA fields
- create queue stage event
- mark run started
- open/close stage events
- finalize run with summary

- [ ] **Step 4: Update enqueue helpers**

Modify enqueue flow so both user and admin refresh endpoints create a run before queueing the arq job, then return:

- `run_id`
- `job_id`
- `feed_id`
- `feed_title`

- [ ] **Step 5: Run the API tests**

Run: `uv run pytest backend/tests/integration/test_feed_fetch_progress_api.py -v`
Expected: API-side enqueue/run creation assertions PASS or narrow to the next missing behavior.

## Task 3: Instrument Worker Stages and Finalization

**Files:**
- Create: `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`
- Create: `backend/apps/worker/tests/test_feed_fetch_progress.py`

- [ ] **Step 1: Write the failing worker test for stage transitions**

```python
@pytest.mark.asyncio
async def test_fetch_feed_task_records_stage_transitions(...):
    await fetch_feed_task({"redis": mock_redis}, feed_id="feed-1", run_id="run-1")
    assert stage_names == [
        "queue_wait",
        "resolve_attempt_urls",
        "fetch_xml",
        "parse_feed",
        "process_entries",
        "store_results",
        "complete",
    ]
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest backend/apps/worker/tests/test_feed_fetch_progress.py::test_fetch_feed_task_records_stage_transitions -v`
Expected: FAIL because `run_id` and stage instrumentation are not implemented.

- [ ] **Step 3: Extend `fetch_feed_task` signature and job invocation**

Add optional `run_id` and `trigger_type` propagation so worker can update persisted run state.

- [ ] **Step 4: Record real worker stages**

Instrument stage boundaries around:

- queue completion / start
- attempt URL resolution
- feed fetch
- feed parse
- entry processing
- optional content backfill summary
- final store and completion

Each stage should update both:

- current run
- stage event rows

- [ ] **Step 5: Implement path classification and summary finalization**

Finalize:

- `path_kind`
  - `direct_feed`
  - `rsshub_primary`
  - `rsshub_fallback`
- `profile_key`
- summary aggregates such as:
  - `new_entries`
  - `total_entries`
  - `summary_only_count`
  - `backfill_success_http_count`
  - `backfill_success_browser_count`
  - `backfill_failed_count`

- [ ] **Step 6: Run worker tests**

Run: `uv run pytest backend/apps/worker/tests/test_feed_fetcher.py backend/apps/worker/tests/test_feed_fetch_progress.py -v`
Expected: PASS with updated instrumentation behavior.

## Task 4: Expose Latest and History Progress APIs

**Files:**
- Modify: `backend/apps/api/glean_api/routers/feeds.py`
- Modify: `backend/apps/api/glean_api/routers/admin.py`
- Create: `backend/tests/integration/test_feed_fetch_progress_api.py`
- Modify: `backend/tests/integration/test_feeds_api.py`
- Modify: `backend/tests/integration/test_admin_api.py`

- [ ] **Step 1: Write the failing user API test for latest run endpoint**

```python
@pytest.mark.asyncio
async def test_user_can_get_latest_feed_fetch_run(...):
    response = await client.get(f"/api/feeds/{test_feed.id}/fetch-runs/latest", headers=auth_headers)
    assert response.status_code == 200
    assert response.json()["feed_id"] == test_feed.id
```

- [ ] **Step 2: Write the failing admin API test for history endpoint**

```python
@pytest.mark.asyncio
async def test_admin_can_get_feed_fetch_run_history(...):
    response = await client.get(f"/api/admin/feeds/{test_feed.id}/fetch-runs/history", headers=admin_headers)
    assert response.status_code == 200
    assert isinstance(response.json()["items"], list)
```

- [ ] **Step 3: Run the tests to verify failure**

Run: `uv run pytest backend/tests/integration/test_feed_fetch_progress_api.py backend/tests/integration/test_feeds_api.py backend/tests/integration/test_admin_api.py -k "fetch_run or fetch_runs" -v`
Expected: FAIL because endpoints do not exist yet.

- [ ] **Step 4: Add latest/history endpoints**

User endpoints should enforce feed ownership.
Admin endpoints should allow any feed.

Return shape should include:

- latest run metadata
- timeline stages
- recent history list
- current ETA fields
- next scheduled fetch time from `feeds.next_fetch_at`

- [ ] **Step 5: Keep existing refresh-status working**

Do not delete current `/refresh-status` routes yet. If helpful, augment them to surface `run_id` and latest ETA fields for backwards compatibility during rollout.

- [ ] **Step 6: Run integration tests**

Run: `uv run pytest backend/tests/integration/test_feed_fetch_progress_api.py backend/tests/integration/test_feeds_api.py backend/tests/integration/test_admin_api.py -v`
Expected: PASS for latest/history access and existing refresh behavior.

## Task 5: Add ETA Calibration and Retention Logic

**Files:**
- Create: `backend/apps/api/glean_api/feed_fetch_progress.py`
- Create: `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
- Test: `backend/apps/worker/tests/test_feed_fetch_progress.py`
- Test: `backend/tests/integration/test_feed_fetch_progress_api.py`

- [ ] **Step 1: Write the failing test for path-aware ETA bucketing**

```python
def test_eta_prefers_feed_history_then_profile_history_then_global_defaults():
    eta = estimate_run_duration(...)
    assert eta.source == "profile"
    assert eta.path_kind == "rsshub_primary"
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `uv run pytest backend/apps/worker/tests/test_feed_fetch_progress.py::test_eta_prefers_feed_history_then_profile_history_then_global_defaults -v`
Expected: FAIL because ETA logic is missing.

- [ ] **Step 3: Implement ETA helpers**

Implement:

- feed-specific history lookup
- profile-key history lookup
- global default fallback
- predicted start time based on queue depth and active run estimates
- predicted finish time based on estimated remaining duration

- [ ] **Step 4: Implement retention trimming**

During run finalization, trim history to the newest 10 runs per feed.

- [ ] **Step 5: Run ETA tests**

Run: `uv run pytest backend/apps/worker/tests/test_feed_fetch_progress.py backend/tests/integration/test_feed_fetch_progress_api.py -k "eta or retention or history" -v`
Expected: PASS with stable, path-aware ETA behavior.

## Task 6: Extend Shared Frontend Types and API Client

**Files:**
- Modify: `frontend/packages/types/src/api.ts`
- Modify: `frontend/packages/types/src/index.ts`
- Modify: `frontend/packages/api-client/src/services/feeds.ts`
- Modify: `frontend/packages/api-client/src/index.ts`
- Modify: `frontend/packages/api-client/src/__tests__/services/feeds.test.ts`

- [ ] **Step 1: Write the failing API client test for latest/history progress methods**

```ts
it('fetches latest feed fetch run', async () => {
  await service.getLatestFeedFetchRun('feed-1')
  expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/fetch-runs/latest'), expect.anything())
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- feeds.test.ts --runInBand`
Expected: FAIL because the client methods and response types do not exist yet.

- [ ] **Step 3: Add shared response types**

Define types for:

- fetch run summary
- stage event
- history list
- batch latest-run request/response

- [ ] **Step 4: Add API client methods**

Add methods for:

- user latest/history fetch run queries
- admin latest/history queries if admin client layer needs them directly

- [ ] **Step 5: Run client tests**

Run: `npm test -- feeds.test.ts --runInBand`
Expected: PASS for new client methods and existing feed service behavior.

## Task 7: Build Shared Progress Hook and Shared UI Component

**Files:**
- Create: `frontend/apps/web/src/hooks/useFeedFetchProgress.ts`
- Create: `frontend/packages/ui/src/components/feed-fetch-progress.tsx`
- Modify: `frontend/packages/ui/src/components/index.ts`

- [ ] **Step 1: Write the failing component-level test or hook-level test**

If there is no current component test harness for `@glean/ui`, write a hook-level test first around view-model mapping.

```ts
it('maps queued run into inline progress model with estimated start', () => {
  const vm = mapFeedFetchRunToViewModel(mockRun)
  expect(vm.statusLabel).toContain('Estimated start')
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- useFeedFetchProgress --runInBand`
Expected: FAIL because shared hook or mapper does not exist.

- [ ] **Step 3: Create shared progress hook**

Responsibilities:

- batch latest-run polling
- pending/running/completed detection
- history loading on demand
- view-model mapping

- [ ] **Step 4: Create shared UI component**

Implement reusable pieces:

- `FeedFetchProgressInline`
- `FeedFetchProgressDrawer`
- `FeedFetchStageTimeline`

- [ ] **Step 5: Export component from UI package**

Update package exports so admin and web apps can consume the component cleanly.

- [ ] **Step 6: Run the relevant frontend tests**

Run: `npm test -- useFeedFetchProgress feeds.test.ts --runInBand`
Expected: PASS for new shared state/view-model behavior.

## Task 8: Integrate Into Admin Feeds Page

**Files:**
- Modify: `frontend/apps/admin/src/hooks/useFeeds.ts`
- Modify: `frontend/apps/admin/src/pages/FeedsPage.tsx`

- [ ] **Step 1: Write the failing admin page behavior test or, if none exists, add a focused hook/unit test**

At minimum verify:

- admin page can render latest stage
- queue ETA renders when queued
- drawer history renders recent runs

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- admin --runInBand`
Expected: FAIL or no coverage, proving the feature is not present yet.

- [ ] **Step 3: Replace local duplicated refresh-state logic**

Stop hand-rolling row state in `FeedsPage.tsx`.
Use the shared progress hook + shared progress components instead.

- [ ] **Step 4: Preserve current actions**

Keep existing:

- refresh now
- refresh all
- retry errored
- reset error
- batch actions

Only swap the display and polling model.

- [ ] **Step 5: Run admin-facing tests**

Run: `npm test -- admin --runInBand`
Expected: PASS with admin page rendering feed progress through shared components.

## Task 9: Integrate Into User Subscriptions Tab

**Files:**
- Modify: `frontend/apps/web/src/hooks/useSubscriptions.ts`
- Modify: `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx`
- Modify: `frontend/apps/web/src/__tests__/hooks/useSubscriptions.test.ts`

- [ ] **Step 1: Write the failing user-side test for shared progress rendering**

Verify:

- queued runs show estimated start
- running runs show stage timeline/summary
- completed runs show last success and next fetch

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- useSubscriptions SubscriptionsTab --runInBand`
Expected: FAIL because user UI still uses the old ad-hoc refresh-state model.

- [ ] **Step 3: Replace local subscription refresh-state logic**

Adopt the same shared progress hook/components used by admin.

- [ ] **Step 4: Keep existing subscription behavior intact**

Preserve:

- single refresh
- refresh all
- import/export
- batch delete
- unread count and row controls

- [ ] **Step 5: Run web tests**

Run: `npm test -- useSubscriptions SubscriptionsTab --runInBand`
Expected: PASS with shared progress UI integrated.

## Task 10: Full Verification Pass

**Files:**
- Verify all files touched above

- [ ] **Step 1: Run backend worker tests**

Run: `uv run pytest backend/apps/worker/tests/test_feed_fetcher.py backend/apps/worker/tests/test_feed_fetch_progress.py -v`
Expected: PASS

- [ ] **Step 2: Run backend integration tests**

Run: `uv run pytest backend/tests/integration/test_feed_fetch_progress_api.py backend/tests/integration/test_feeds_api.py backend/tests/integration/test_admin_api.py -v`
Expected: PASS

- [ ] **Step 3: Run frontend API client tests**

Run: `npm test -- feeds.test.ts --runInBand`
Expected: PASS

- [ ] **Step 4: Run relevant web/admin tests**

Run: `npm test -- useSubscriptions SubscriptionsTab admin --runInBand`
Expected: PASS

- [ ] **Step 5: Manual verification checklist**

Verify in browser/manual app flow:

- queued run shows estimated start
- running run shows current stage
- direct feed and RSSHub feed show distinct path labels
- expanded details show recent 10 runs
- admin and user pages render the same progress model

- [ ] **Step 6: Commit**

```bash
git add backend/packages/database/glean_database/models backend/packages/database/glean_database/migrations/versions backend/apps/api/glean_api backend/apps/worker/glean_worker frontend/packages/types frontend/packages/api-client frontend/packages/ui frontend/apps/admin/src frontend/apps/web/src docs/superpowers/specs/2026-04-03-feed-fetch-progress-design.md docs/superpowers/plans/2026-04-03-feed-fetch-progress-implementation.md
git commit -m "feat: add reusable feed fetch progress tracking"
```
