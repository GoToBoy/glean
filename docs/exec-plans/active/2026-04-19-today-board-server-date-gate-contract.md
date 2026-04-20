# Today Board Server Date Gate Contract

## Goal

Prevent Today's Intake from requesting `/api/entries/today` before the server-provided date is available.

## Scope

- Frontend entries query hook enablement.
- Reader Today Board request timing.
- Focused frontend regression coverage.

## Done Means

- Timeline entry queries keep their existing behavior.
- Today Board entry queries are disabled until `todayBoardDate` is truthy.
- The first Today Board list request includes the server date once `/api/system/time` resolves.
- A focused hook test proves a disabled Today Board query does not call either entries API.

## Risks

- Query prefetch callers should remain unaffected by the new option.
- The Today Board loading state should remain pending rather than erroring while server time loads.

## Evaluator Focus

- Verify `enabled` defaults preserve existing callers.
- Verify ReaderCore gates only Today Board, not timeline views.
- Verify the regression test covers the no-date/no-request behavior.
