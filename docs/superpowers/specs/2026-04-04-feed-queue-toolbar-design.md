# Feed Queue Toolbar Design

Last updated: 2026-04-04

## Goal

Move global feed queue activity out of each feed's progress sheet and surface it on the subscriptions search toolbar row instead.

## Confirmed Scope

- keep the existing backend/API shape
- keep the existing deploy path: GitHub Actions build, then NAS Docker rebuild
- update only the frontend presentation and copy

## Design

### Toolbar placement

The subscriptions search row should include one compact queue activity badge at the end of the row.

Required behavior:

- the queue badge lives on the same row as the search input
- it appears after the other toolbar controls on that row
- the summary text order is always:
  - running count first
  - queued count second

Target copy example:

- `5 个进行中 · 145 个排队中`

When there is no queue activity, the badge should be hidden instead of showing an idle placeholder.

### Feed progress sheet

The per-feed progress sheet should stop rendering the shared global queue activity list.

The sheet remains responsible for feed-local information only:

- current run state
- stage progress
- diagnostics
- recent history

This removes duplicated global queue context from every feed detail panel.

## Implementation Notes

- reuse the existing `useActiveFeedFetchRuns()` query and existing queue summary helper
- keep queue grouping helpers in place for admin or future reuse, but stop passing queue sections into the web subscriptions feed progress sheet
- update `settings` locale strings to match the new toolbar phrasing
