# Feed Fetch Root-Cause Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make feed fetch runs always converge to a correct terminal state even when upstream fetches fail, retries happen, or SQLAlchemy sessions commit/rollback mid-run.

**Architecture:** Refactor worker progress handling from long-lived ORM object mutation to `run_id`-driven explicit state transitions. Separate upstream execution from outcome classification and finalization, then make finalization idempotent so retries, rollbacks, and stale references cannot strand runs in `in_progress`.

**Tech Stack:** Python 3.14, arq worker, async SQLAlchemy, PostgreSQL, pytest, ruff

---

### Task 1: Freeze The Failure Contract

**Files:**
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`
- Test: `backend/apps/worker/tests/test_feed_fetcher.py`

- [ ] **Step 1: Write the failing tests for rollback-expired run metadata**

```python
@pytest.mark.asyncio
async def test_rsshub_infrastructure_error_does_not_read_stale_run_path_kind_after_rollback():
    ...


@pytest.mark.asyncio
async def test_generic_fetch_error_does_not_leave_run_stuck_in_progress():
    ...
```

- [ ] **Step 2: Run the new worker fetcher tests and verify they fail for the current bug**

Run: `uv run pytest apps/worker/tests/test_feed_fetcher.py -k 'stale_run_path_kind_after_rollback or run_stuck_in_progress'`
Expected: FAIL with stale ORM access or stuck `in_progress` assertions.

- [ ] **Step 3: Introduce a helper that writes fetch path metadata without reading stale ORM attributes**

```python
def _persist_run_path_metadata(
    run: FeedFetchRun | None,
    *,
    feed_url: str,
    used_url: str,
    fallback_urls: list[str],
) -> None:
    ...
```

- [ ] **Step 4: Replace rollback-sensitive `persisted_run.path_kind or ...` reads with explicit recomputation**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
Expected: no exception path should read a rollback-expired ORM attribute before finalization.

- [ ] **Step 5: Re-run the targeted fetcher tests**

Run: `uv run pytest apps/worker/tests/test_feed_fetcher.py -k 'stale_run_path_kind_after_rollback or run_stuck_in_progress'`
Expected: PASS


### Task 2: Make Worker Finalization Ignore Stale Stage Objects

**Files:**
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
- Modify: `backend/apps/worker/tests/test_feed_fetch_progress.py`
- Test: `backend/apps/worker/tests/test_feed_fetch_progress.py`

- [ ] **Step 1: Write the failing test for stale `active_stage` after rollback**

```python
@pytest.mark.asyncio
async def test_finalize_feed_fetch_run_uses_live_open_stage_without_touching_stale_stage_name():
    ...
```

- [ ] **Step 2: Run the targeted finalize test and verify it fails correctly**

Run: `uv run pytest apps/worker/tests/test_feed_fetch_progress.py -k 'live_open_stage_without_touching_stale_stage_name'`
Expected: FAIL because finalize still touches stale stage attributes.

- [ ] **Step 3: Refactor `_resolve_active_stage_for_finalize()` to prefer the live open stage loaded from the session**

```python
def _resolve_active_stage_for_finalize(...):
    live_open_stage = ...
    ...
```

- [ ] **Step 4: Ensure finalize never needs stale caller objects once session-backed stage events are loaded**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
Expected: only session-loaded stage events drive completion/skipped-stage writes.

- [ ] **Step 5: Re-run targeted finalize tests**

Run: `uv run pytest apps/worker/tests/test_feed_fetch_progress.py -k 'stale_active_stage or live_open_stage_without_touching_stale_stage_name'`
Expected: PASS


### Task 3: Move Progress Writes To A `run_id`-Driven Store

**Files:**
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Modify: `backend/apps/worker/tests/test_feed_fetch_progress.py`
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`

- [ ] **Step 1: Add explicit load helpers that always reacquire the current run and stage events by `run_id`**

```python
async def reload_run_for_progress(session: AsyncSession, run_id: str) -> FeedFetchRun | None:
    ...
```

- [ ] **Step 2: Refactor `start_feed_fetch_run()`, `advance_feed_fetch_stage()`, and `finalize_feed_fetch_run()` to treat `run_id` as the source of truth**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
Expected: helper internals reload fresh session-backed rows before mutating state.

- [ ] **Step 3: Remove assumptions that `run.stage_events` or stale `FeedFetchStageEvent` references stay usable across transaction boundaries**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
Expected: no progress mutation path should depend on relationship lazy-loading.

- [ ] **Step 4: Update worker task call sites to pass identifiers or freshly rebound objects only**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
Expected: fetcher orchestration no longer relies on stale ORM identity across commits/rollbacks.

- [ ] **Step 5: Run the focused worker progress and fetcher suites**

Run: `uv run pytest apps/worker/tests/test_feed_fetch_progress.py apps/worker/tests/test_feed_fetcher.py -k 'run_id or stale or rsshub or lifecycle'`
Expected: PASS


### Task 4: Introduce Explicit Outcome Classification

**Files:**
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`

- [ ] **Step 1: Add an internal outcome normalizer for upstream fetch failures**

```python
@dataclass(slots=True)
class FetchFailureOutcome:
    code: str
    public_message: str
    retry_minutes: int | None
    disable_feed: bool
```

- [ ] **Step 2: Cover RSSHub timeout, RSSHub 503, duplicate-guid race, and generic retry cases with tests**

Run: extend `backend/apps/worker/tests/test_feed_fetcher.py`
Expected: each class of failure has one assertion-focused test.

- [ ] **Step 3: Replace ad-hoc exception branching in `fetch_feed_task()` with normalized outcomes**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
Expected: fetch execution returns one clear outcome that finalization consumes.

- [ ] **Step 4: Keep user-visible feed errors separate from internal diagnostics**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
Expected: `feed.fetch_error_message` is stable UI text while `run.error_message` stores normalized run failure code.

- [ ] **Step 5: Run focused outcome tests**

Run: `uv run pytest apps/worker/tests/test_feed_fetcher.py -k 'rsshub or duplicate_guid or index_corruption or retry'`
Expected: PASS


### Task 5: Make Finalization Idempotent

**Files:**
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
- Modify: `backend/apps/worker/tests/test_feed_fetch_progress.py`
- Modify: `backend/tests/integration/test_feed_fetch_progress_api.py`

- [ ] **Step 1: Write a failing unit test proving repeated finalize calls do not append duplicate `complete` stages**

```python
@pytest.mark.asyncio
async def test_finalize_feed_fetch_run_is_idempotent_for_repeated_error_reconciliation():
    ...
```

- [ ] **Step 2: Run the targeted finalize-idempotency test and verify failure**

Run: `uv run pytest apps/worker/tests/test_feed_fetch_progress.py -k 'idempotent'`
Expected: FAIL because repeated finalize still duplicates or misorders stages.

- [ ] **Step 3: Refactor finalize to locate-or-create `complete` deterministically and update in place**

Run: edit `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
Expected: no duplicate `complete` stage for the same terminal run.

- [ ] **Step 4: Add an integration-level regression for a run that fails upstream and is finalized more than once**

Run: edit `backend/tests/integration/test_feed_fetch_progress_api.py`
Expected: persisted run ends in one terminal state with one `complete` stage.

- [ ] **Step 5: Re-run unit and integration coverage for finalization**

Run: `uv run pytest apps/worker/tests/test_feed_fetch_progress.py apps/api/tests/test_feed_fetch_progress.py`
Expected: PASS


### Task 6: Add Active-Run Reconciliation Outside Read Paths

**Files:**
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Modify: `backend/apps/api/glean_api/feed_refresh.py`
- Modify: `backend/apps/api/glean_api/feed_fetch_progress.py`
- Modify: `backend/apps/worker/tests/test_feed_refresh_scheduler.py`
- Modify: `backend/apps/api/tests/test_feed_refresh.py`

- [ ] **Step 1: Define one explicit reconciler entrypoint for stale queued/running runs**

```python
async def reconcile_orphaned_run(session: AsyncSession, run_id: str, reason: str) -> None:
    ...
```

- [ ] **Step 2: Use that reconciler only from write paths and scheduler paths**

Run: edit worker scheduler and refresh enqueue flow
Expected: GET endpoints remain read-only, background/write paths own state repair.

- [ ] **Step 3: Add tests showing stale active runs are closed before new work starts**

Run: extend `backend/apps/api/tests/test_feed_refresh.py` and `backend/apps/worker/tests/test_feed_refresh_scheduler.py`
Expected: stale runs stop blocking new work.

- [ ] **Step 4: Remove any remaining query-time reconciliation assumptions from worker/API shared helpers**

Run: edit `backend/apps/api/glean_api/feed_fetch_progress.py` and related helpers
Expected: no read path performs repair side effects.

- [ ] **Step 5: Re-run scheduler and refresh tests**

Run: `uv run pytest apps/api/tests/test_feed_refresh.py apps/worker/tests/test_feed_refresh_scheduler.py`
Expected: PASS


### Task 7: Verification And Release Gate

**Files:**
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py`
- Modify: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- Modify: `backend/apps/worker/tests/test_feed_fetch_progress.py`
- Modify: `backend/apps/worker/tests/test_feed_fetcher.py`
- Modify: `backend/apps/api/tests/test_feed_fetch_progress.py`
- Modify: `backend/tests/integration/test_feed_fetch_progress_api.py`

- [ ] **Step 1: Run worker lint for all touched files**

Run: `uv run ruff check apps/worker/glean_worker/tasks/feed_fetch_progress.py apps/worker/glean_worker/tasks/feed_fetcher.py apps/worker/tests/test_feed_fetch_progress.py apps/worker/tests/test_feed_fetcher.py apps/api/tests/test_feed_fetch_progress.py tests/integration/test_feed_fetch_progress_api.py`
Expected: PASS

- [ ] **Step 2: Run focused unit suites**

Run: `uv run pytest apps/worker/tests/test_feed_fetch_progress.py apps/worker/tests/test_feed_fetcher.py apps/api/tests/test_feed_refresh.py apps/api/tests/test_feed_fetch_progress.py`
Expected: PASS

- [ ] **Step 3: Run the relevant integration suite if the local test database is available**

Run: `uv run pytest tests/integration/test_feed_fetch_progress_api.py -k 'fetch_run or latest_feed_fetch_run or active_feed_fetch_runs'`
Expected: PASS

- [ ] **Step 4: Record any environment blockers explicitly if integration DB is unavailable**

Run: capture the exact failing infra precondition
Expected: one concrete note, no hand-waving.

- [ ] **Step 5: Commit the refactor in small, reviewable commits**

```bash
git add backend/apps/worker/glean_worker/tasks/feed_fetch_progress.py backend/apps/worker/tests/test_feed_fetch_progress.py
git commit -m "refactor: make worker feed finalization resilient to stale stage objects"

git add backend/apps/worker/glean_worker/tasks/feed_fetcher.py backend/apps/worker/tests/test_feed_fetcher.py
git commit -m "refactor: remove rollback-sensitive worker fetch run state reads"
```
