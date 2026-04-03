# Feed Fetch Progress Design

Last updated: 2026-04-03

## Goal

Expose reusable feed-fetch progress visibility for both the admin feed management page and the end-user subscription settings page, including:

- queue state
- predicted start and finish time
- current fetch stage
- per-stage result summaries
- last fetch time
- next scheduled fetch time
- recent fetch history

The design must support both normal feed paths and RSSHub-backed paths without mixing their timing profiles.

## Problem Statement

The current UI only exposes coarse refresh state derived from arq job status and the `feeds` table timestamps. It does not answer the questions users now care about:

- Is this feed waiting in queue or actively running?
- When is it expected to start?
- Which stage is it in now?
- Did it use the direct feed URL or an RSSHub path?
- Why did it take long this time?
- What happened in the last few runs?

This is especially visible for RSSHub-backed feeds, where fetch timing differs from direct feed fetches and should not share one prediction bucket.

## Confirmed Requirements

- Use the `C` mixed-mode UI:
  - compact inline summary in feed rows
  - detailed timeline + history in an expandable detail surface
- Reuse the same progress capability in:
  - admin `FeedsPage`
  - user `SubscriptionsTab`
- Predict start and finish times using historical calibration
- Use a hybrid prediction strategy:
  - prefer feed-specific history
  - fall back to profile history
  - finally fall back to global defaults
- Distinguish timing profiles between:
  - direct feed fetches
  - RSSHub feeds used as the primary feed URL
  - RSSHub feeds used as fallback from a non-RSSHub source
- Keep recent run history, with an initial retention target of the latest 10 runs per feed
- Stay at feed-level observability for v1
- Do not build entry-by-entry live progress in v1

## Chosen Approach

Implement a moderate observability layer centered on persisted fetch runs and stage events.

The system will add:

1. A persisted `feed_fetch_run` record for each refresh attempt
2. A persisted `feed_fetch_stage_event` record for each stage transition
3. Backend APIs that expose:
   - latest run state
   - detailed current timeline
   - recent history
   - calibrated ETA fields
4. A shared frontend data model and shared progress UI components consumed by both admin and end-user pages

This design keeps the UI simple while providing enough structure to support history, ETA calibration, and RSSHub-aware timing buckets.

## Alternatives Considered

### Option A: Extend existing refresh-status payload only

Add a few extra fields to `/refresh-status`, such as:

- `current_stage`
- `stage_summary`
- `estimated_start_at`
- `estimated_finish_at`

Pros:

- lowest code churn
- no new tables

Cons:

- poor auditability
- no recent history
- weak prediction inputs
- hard to share a stable model across admin and user pages

Rejected because it would not support the requested history and historical ETA calibration cleanly.

### Option B: Persist run + stage history, limited retention

Add persisted run and stage records, keep the latest `N` runs, and drive both pages from a shared progress model.

Pros:

- supports timeline and history
- supports ETA calibration
- keeps complexity controlled
- reusable across admin and user UI

Cons:

- requires schema changes
- requires worker instrumentation

Chosen for v1.

### Option C: Full per-entry observability

Track not only feed stages but every processed entry and every extraction attempt as first-class progress items.

Pros:

- maximum detail

Cons:

- much higher storage volume
- more intrusive worker changes
- noisy UI
- unnecessary for the main user problem

Rejected for v1.

## Domain Model

### Feed Fetch Run

Represents one queued or executed feed refresh attempt.

Suggested fields:

- `id`
- `feed_id`
- `job_id`
- `trigger_type`
  - `scheduled`
  - `manual_user`
  - `manual_admin`
  - `subscription_bootstrap`
- `status`
  - `queued`
  - `in_progress`
  - `success`
  - `not_modified`
  - `error`
- `current_stage`
- `path_kind`
  - `direct_feed`
  - `rsshub_primary`
  - `rsshub_fallback`
- `profile_key`
- `queue_entered_at`
- `predicted_start_at`
- `predicted_finish_at`
- `started_at`
- `finished_at`
- `summary_json`
- `error_message`
- `created_at`
- `updated_at`

### Feed Fetch Stage Event

Represents a stage transition or completed stage for one run.

Suggested fields:

- `id`
- `run_id`
- `stage_name`
  - `queue_wait`
  - `resolve_attempt_urls`
  - `fetch_xml`
  - `parse_feed`
  - `process_entries`
  - `backfill_content`
  - `store_results`
  - `complete`
- `status`
  - `pending`
  - `running`
  - `success`
  - `error`
  - `skipped`
- `started_at`
- `finished_at`
- `summary`
- `metrics_json`
- `created_at`

## Path Classification Rules

The ETA model must not blend timing histories from direct feeds and RSSHub feeds.

Rules:

1. `direct_feed`
   - the saved `feed.url` is not an RSSHub URL
   - the run succeeds using the primary direct feed URL

2. `rsshub_primary`
   - the saved `feed.url` itself is an RSSHub URL
   - examples:
     - manually subscribed RSSHub path
     - feed already stored as RSSHub feed

3. `rsshub_fallback`
   - the saved `feed.url` is not RSSHub
   - the worker eventually succeeds through an RSSHub candidate generated by fallback logic

This classification should be assigned after the attempt URL is resolved successfully, and updated on the run record before stage completion.

## Profile Key Strategy

ETA prediction uses a three-level fallback:

1. feed-specific history
2. profile history
3. global baseline

Suggested `profile_key` shapes:

- direct feeds:
  - `direct:<host>`
- RSSHub primary:
  - `rsshub_primary:<route_family>`
- RSSHub fallback:
  - `rsshub_fallback:<route_family>`

`route_family` should be derived from the RSSHub rule family rather than the full path. Examples:

- `bilibili_user_dynamic`
- `youtube_channel`
- `github_release`

This keeps buckets useful without overfitting to a single full path.

## ETA Calibration Algorithm

### Primary principle

Use simple, explicit, explainable calibration rather than a complex opaque model.

### Inputs

- worker concurrency limit (`max_jobs`)
- queue depth ahead of the run
- recent completed durations for:
  - the same feed and same `path_kind`
  - the same `profile_key`
  - the same stage buckets globally
- lightweight current-run facts when available:
  - parsed `total_entries`
  - count of summary-only entries
  - count of backfill attempts triggered

### Prediction layers

1. Feed history layer
   - use latest 10 completed runs for the same `feed_id` and same `path_kind`
   - weight recent samples more heavily

2. Profile layer
   - if feed-specific completed samples are fewer than 3, fall back to `profile_key`

3. Global fallback
   - use default per-stage durations when there is insufficient profile history

### Predicted start time

`predicted_start_at` should be computed using:

- jobs ahead in the queue
- expected remaining durations of already-running jobs
- expected durations of queued jobs before this run
- worker concurrency

The goal is not perfect scheduling accuracy. The goal is a reasonable and continuously improving estimate.

### Predicted finish time

`predicted_finish_at` should be:

- `predicted_start_at + predicted_run_duration` before execution starts
- recomputed once real stage timings become available

As soon as a stage begins, prediction should switch from pure historical estimate to:

- actual elapsed time for completed stages
- calibrated estimate for remaining stages

### Stage-level estimation

Use historical medians or weighted averages per stage, especially for:

- `fetch_xml`
- `parse_feed`
- `process_entries`
- `backfill_content`
- `store_results`

`process_entries` and `backfill_content` should be adjusted by current-run scale indicators when available:

- total entry count
- summary-only count
- backfill count

### Initial UX contract

The UI should clearly communicate predicted values as estimates. Suggested labels:

- `Estimated start`
- `Estimated finish`
- `Prediction based on recent runs`

## Backend Responsibilities

### API enqueue path

When a refresh is enqueued:

- create a `feed_fetch_run`
- write `queue_entered_at`
- compute initial `predicted_start_at`
- compute initial `predicted_finish_at`
- return `run_id` alongside `job_id`

Trigger sources that should create runs:

- user single refresh
- user refresh-all
- admin single refresh
- admin refresh-all
- admin refresh-errored
- subscription bootstrap fetch
- scheduled fetch

### Worker path

The worker should update run state as it progresses:

1. mark run `in_progress`
2. write `started_at`
3. open `queue_wait` completion
4. create and update stage events as the task advances
5. update `current_stage` on the run
6. write stage summary metrics
7. write final `status`, `summary_json`, and `finished_at`

### Summary payloads

`summary_json` and stage metrics should include only high-value feed-level aggregates, such as:

- `new_entries`
- `total_entries`
- `summary_only_count`
- `backfill_attempted_count`
- `backfill_success_http_count`
- `backfill_success_browser_count`
- `backfill_failed_count`
- `fallback_used`
- `used_url`
- `retry_minutes`

### Retention

Keep only the latest 10 runs per feed in v1.

Cleanup can be implemented by:

- periodic trim during run finalization, or
- a scheduled cleanup job

Either is acceptable in v1 as long as retention remains bounded.

## API Surface

Add dedicated progress APIs instead of overloading the current `refresh-status` contract too aggressively.

Suggested endpoints:

- `GET /api/feeds/{feed_id}/fetch-runs/latest`
- `GET /api/feeds/{feed_id}/fetch-runs/history`
- `GET /api/admin/feeds/{feed_id}/fetch-runs/latest`
- `GET /api/admin/feeds/{feed_id}/fetch-runs/history`

If list views need batched access, add:

- `POST /api/feeds/fetch-runs/latest/batch`
- `POST /api/admin/feeds/fetch-runs/latest/batch`

Current `/refresh-status` can remain temporarily for backward compatibility, but new UI should pivot toward the run-based APIs.

## Shared Frontend Architecture

### Shared data layer

Extract a common progress data model and polling logic instead of keeping separate admin and user state machines.

Responsibilities:

- fetch latest run state
- poll active runs
- normalize backend payloads into a UI-friendly view model
- expose pending/running/completed semantics consistently

Suggested shared hooks/utilities:

- `useFeedFetchLatestRuns(...)`
- `useFeedFetchHistory(...)`
- `useFeedFetchPolling(...)`
- `mapFeedFetchRunToViewModel(...)`

### Shared presentation layer

Create reusable components usable in both admin and user UI:

- `FeedFetchProgressInline`
  - compact summary for table/tree rows
- `FeedFetchProgressDrawer`
  - expanded timeline, timestamps, history
- `FeedFetchStageTimeline`
  - reusable stage renderer

### Page integration

- Admin:
  - integrate into `frontend/apps/admin/src/pages/FeedsPage.tsx`
- User settings:
  - integrate into `frontend/apps/web/src/components/tabs/SubscriptionsTab.tsx`

Each page should only manage layout concerns and permissions. Progress state logic should live in shared code.

## UI Design Contract

The chosen `C` mixed-mode layout should provide:

### Inline row summary

- status pill
- current stage label
- stage progress such as `3 / 7`
- estimated start time when queued
- estimated finish time when running
- short result summary
- last success / next scheduled fetch when relevant

### Expanded detail surface

- ordered stage timeline
- per-stage timestamps
- per-stage summaries
- final result summary
- fallback path information when applicable
- last fetch time
- next fetch time
- recent 10 runs with status and duration

### Messaging

The UI should distinguish:

- waiting in queue
- actively running
- completed successfully
- completed with `not_modified`
- failed

It should also show when a run used:

- direct feed URL
- RSSHub primary route
- RSSHub fallback route

## Non-Goals For V1

Do not implement the following in the first version:

- per-entry live progress lists
- WebSocket-based push transport
- fully generic observability dashboards across all worker tasks
- predictive models beyond historical weighted heuristics
- deep per-article extraction telemetry in UI

## Migration and Rollout Notes

Recommended rollout order:

1. schema and backend models
2. worker instrumentation and run persistence
3. latest-run API
4. shared frontend progress model
5. admin page integration
6. user settings page integration
7. history view
8. ETA calibration tuning

The initial implementation may launch with conservative ETA estimates and improve once real run history accumulates.

## Risks

### Risk: ETA quality is poor at launch

Mitigation:

- use explicit fallback layers
- label values as estimates
- improve accuracy as history accumulates

### Risk: duplicate state systems remain in frontend

Mitigation:

- move polling and view-model mapping into shared code before UI expansion

### Risk: RSSHub route families are over- or under-bucketed

Mitigation:

- keep initial route-family mapping simple
- allow later tuning without changing UI contract

### Risk: run retention cleanup is forgotten

Mitigation:

- make retention trimming part of the implementation checklist

## Acceptance Criteria

The design is successful when:

- admins can see current feed fetch queue/running state and detailed stage history
- end users can see the same progress model for feeds they own
- both pages use shared progress components rather than duplicating state logic
- queued runs display estimated start time
- running runs display estimated finish time
- recent history is visible for the latest 10 runs
- RSSHub and non-RSSHub runs are classified and predicted separately
- v1 remains feed-level rather than per-entry live progress
