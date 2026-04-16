# Feed Fetch Queue Backlog Analysis

Last updated: 2026-04-03

## Goal

Record the confirmed root cause behind feed refresh runs getting stuck in `queue_wait`, and define the preferred technical fix before changing production code.

This document is a reference for the later code change, not the code change itself.

## Incident Summary

Observed on 2026-04-03:

- feed fetch progress UI showed runs stuck at `queue_wait`
- one example run had been waiting for far longer than the 3 minute slow-stage threshold
- the affected feed was an RSSHub-backed feed, but the issue was not isolated to RSSHub

Confirmed runtime evidence from the NAS deployment:

- `glean-worker`, `glean-backend`, and `rsshub` containers were all running
- `feed_fetch_runs` had multiple recent rows in `status='queued'` and `current_stage='queue_wait'`
- those rows had `started_at IS NULL`, which means the worker never started them
- Redis `arq:queue` contained `15207` queued jobs
- Redis had exactly 4 `arq:in-progress:*` keys
- worker env reported `WORKER_MAX_JOBS=4`
- worker logs showed the process was alive and still completing some jobs, but also showed long-running and timeout-prone fetches

## What The System Is Doing Today

### Scheduling path

The recurring scheduler in [feed_fetcher.py](/Users/taro/Sites/github/glean/backend/apps/worker/glean_worker/tasks/feed_fetcher.py#L636) does this every 15 minutes:

1. query all `feeds` where `status = active` and `next_fetch_at <= now`
2. create a new `feed_fetch_run`
3. enqueue a new `fetch_feed_task`
4. set `feed.last_fetch_attempt_at = now`

### Queue ETA path

ETA prediction in [feed_fetch_progress.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/feed_fetch_progress.py#L179) assumes the active queue is a real representation of current work and uses `worker_max_jobs` to estimate wait time.

### Worker concurrency

Worker concurrency is fixed by [config.py](/Users/taro/Sites/github/glean/backend/apps/worker/glean_worker/config.py#L29) and currently defaults to:

- `WORKER_MAX_JOBS = 4`
- `WORKER_JOB_TIMEOUT_SECONDS = 1800`

## Confirmed Root Cause

The bug is not "one RSSHub feed is slow".

The actual bug is:

1. scheduled refresh creates new jobs for every due feed
2. it does not check whether the same feed already has an active queued or running refresh
3. `next_fetch_at` is not advanced when a job is merely enqueued
4. if the worker is already behind, the same due feeds remain eligible on the next 15 minute scheduler tick
5. the scheduler enqueues the same feeds again
6. queue size grows faster than worker capacity can drain it
7. newly created runs remain stuck in `queue_wait`

This is a queue amplification bug caused by missing feed-level deduplication at enqueue time.

## Why It Becomes Catastrophic

On its own, a slow feed is survivable.

It becomes catastrophic because slow jobs and repeated scheduling interact:

- some feed fetches are long-running
- some fetches time out after 1800 seconds
- worker capacity is only 4 concurrent jobs
- scheduler keeps adding duplicate fetch jobs every 15 minutes

Once the queue falls behind, the system starts compounding backlog instead of recovering from it.

## Why RSSHub Is Not The Root Cause

The example feed used an RSSHub path, but runtime evidence did not show RSSHub container failure.

What matters here is:

- the run never left `queue_wait`
- the worker never began this run

That means the bug occurs before the system reaches the actual RSSHub fetch step.

RSSHub latency may worsen worker occupancy, but it is not the underlying cause of indefinite queue growth.

## Primary Fix

### Requirement

At most one active feed-refresh run should exist per `feed_id`.

Here, "active" means:

- `status = queued`
- `status = in_progress`

### Preferred behavior

Before creating a new run or enqueuing a new `fetch_feed_task`, check whether the feed already has an active run.

If yes:

- do not enqueue another job
- do not create another `feed_fetch_run`
- reuse the existing run metadata instead

This rule should apply to:

- scheduled refresh
- manual user refresh
- manual admin refresh
- any bulk refresh entry point that eventually calls shared enqueue helpers

## Proposed Technical Design

### 1. Add a shared active-run lookup helper

Add one shared helper that returns the current active run for a feed:

- query `feed_fetch_runs`
- filter by `feed_id`
- filter by `status in ('queued', 'in_progress')`
- order by newest active run
- return one row or `None`

This helper should live in the feed refresh/progress area so both API and worker paths can use the same definition.

### 2. Change scheduled refresh to skip duplicate enqueue

In [feed_fetcher.py](/Users/taro/Sites/github/glean/backend/apps/worker/glean_worker/tasks/feed_fetcher.py#L636):

- before `create_estimated_queued_feed_fetch_run(...)`
- call the active-run helper
- if an active run exists for that `feed_id`, skip enqueue for this scheduler tick

This prevents queue growth from recurring cron ticks.

### 3. Change manual refresh to reuse the existing active run

In [feed_refresh.py](/Users/taro/Sites/github/glean/backend/apps/api/glean_api/feed_refresh.py#L12):

- check for an existing active run before creating a new run
- if found, return its `run_id` and `job_id`
- do not call `redis.enqueue_job(...)`

This keeps the UI behavior sane and avoids duplicate manual retries while one run is already waiting or running.

### 4. Keep response semantics explicit

The enqueue response should ideally indicate whether it created or reused a run.

Recommended extra response field:

- `reused_existing_run: true | false`

This is optional for the first patch, but useful for debugging and UI messaging.

## Secondary Safeguards

These are valuable but not required for the first fix.

### Safeguard A: backlog-aware scheduler cap

Even with dedupe, one scheduler tick may enqueue a very large number of distinct feeds.

Optional improvement:

- cap the number of feeds enqueued per scheduler tick
- defer the rest to the next tick

This reduces sudden queue spikes.

### Safeguard B: queue health short-circuit

If queue depth is already beyond a configured threshold:

- skip the scheduler tick entirely
- log a warning

This prevents background refresh from burying the system when it is already degraded.

### Safeguard C: stronger database guarantee

Application-level checks are usually enough, but a stronger long-term option is a database-level guarantee that blocks multiple active runs for the same feed.

Possible approaches:

- partial unique index for active statuses
- dedicated `active_feed_fetch_run` marker

This is more invasive and not required for the first fix.

## Operational Cleanup Needed After The Code Fix

Fixing the code stops future queue amplification, but it does not clean the existing backlog.

After deployment, operations will still need to decide how to recover the queue:

### Option A: let the queue drain naturally

Pros:

- lowest risk

Cons:

- current backlog may take a very long time to drain
- duplicate stale jobs still waste worker time

### Option B: purge duplicate queued jobs and stale queued runs

Pros:

- fastest recovery

Cons:

- requires operational care to avoid deleting currently running jobs
- needs a one-off script or Redis-aware cleanup procedure

Recommended approach after the code fix:

1. identify active in-progress job IDs
2. identify queued duplicate jobs for feeds that already have an active run
3. remove duplicate queued jobs from Redis
4. mark matching duplicate `feed_fetch_runs` as cancelled or otherwise excluded from UI

The exact cleanup implementation can be separate from the application fix.

## Test Plan For The Later Code Change

### Worker-side tests

Add a unit test for scheduled refresh:

- when a feed already has an active run
- `fetch_all_feeds()` must skip creating another run
- `redis.enqueue_job()` must not be called for that feed

### API-side tests

Add tests for manual refresh endpoints:

- when a feed already has an active queued run
- API returns the existing `run_id` and `job_id`
- API does not create a second run
- API does not enqueue a second job

### Regression tests

Add a bulk refresh test proving:

- repeated scheduler/manual entry points do not multiply active runs for the same feed

## UI Follow-Up Requirements

These are interaction updates for the feed fetch progress sheet in the settings subscriptions UI. They are not part of the queue-dedup backend fix, but they should guide the later frontend change.

Current relevant UI surfaces:

- [feed-fetch-progress.tsx](/Users/taro/Sites/github/glean/frontend/packages/ui/src/components/feed-fetch-progress.tsx)
- [SubscriptionsTab.tsx](/Users/taro/Sites/github/glean/frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx)

### 1. Rework the "Recent runs queue" presentation

Current problems:

- the queue list can become visually too tall
- the list is dominated by repeated `queued` items
- timestamps are taking too much visual space relative to the actual queue state

Required interaction changes:

- keep the queue area at a fixed height and make the inner list scroll
- classify queue items by state instead of rendering one flat mixed list
- show `running` and `queued` as separate groups, with `running` first
- make timestamp information visually secondary and compact instead of giving each item a large repeated time line

Preferred rendering direction:

- group header example: `Running (4)` and `Queued (128)`
- each item should prioritize feed title, state, stage, and short summary
- ETA/timestamp text should stay as a small secondary line or compact metadata row

The goal is to reduce visual noise when the queue is large and prevent dozens of near-identical queued rows from overwhelming the panel.

### 2. Move "Ahead in queue" out of each feed panel

Current problem:

- `Ahead in queue` is shown inside each feed's queue detail context, which makes the metric feel local even though it is really describing shared global worker pressure

Required interaction change:

- move the `Ahead in queue` indicator to the subscriptions search/filter bar row
- treat it as one shared queue-health indicator for the whole page, not per-feed detail text

Preferred meaning:

- the search bar row should expose overall queue pressure at page scope
- the per-feed panel should focus on the selected feed's current run, stage details, recent history, and grouped queue context

This separation makes the information architecture clearer:

- page-level row shows global backlog pressure
- feed detail sheet shows feed-specific execution details

## Recommended Implementation Order

1. add shared active-run lookup helper
2. patch `enqueue_feed_refresh_job(...)` to reuse active runs
3. patch `fetch_all_feeds(...)` to skip feeds with active runs
4. add tests for both paths
5. deploy fix
6. perform one-time queue cleanup if needed

## Non-Goals For The First Patch

The first patch does not need to:

- redesign ETA prediction
- change RSSHub fetch logic
- increase worker concurrency
- split workers into multiple queues

Those may still be useful later, but they are not the root-cause fix.

## One-Sentence Summary

`queue_wait` is getting stuck because the scheduler keeps enqueueing duplicate `fetch_feed_task` jobs for feeds that already have active queued or running runs, eventually overwhelming a 4-slot worker and causing permanent backlog growth.
