# Server Time Implementation Handoff

## What Changed

- Added server timezone helpers and `/api/system/time` so clients can use server date metadata.
- Changed Today entries API to derive collection windows from `date` plus server timezone.
- Changed local AI Today entries and summary lookup/writeback to use server timezone identity, with client `timezone` treated as deprecated.
- Changed web Today Board to use server `current_date`, generate the recent calendar from that date, and send only `date` for Today entries.
- Removed browser timezone from AI summary frontend requests.
- Added local AI API reference documentation for AI callers.

## Files Touched

- `backend/packages/core/glean_core/server_time.py`
- `backend/apps/api/glean_api/routers/system.py`
- `backend/apps/api/glean_api/routers/entries.py`
- `backend/apps/api/glean_api/routers/ai.py`
- `backend/packages/core/glean_core/services/ai_integration_service.py`
- `frontend/apps/web/src/hooks/useSystemTime.ts`
- `frontend/apps/web/src/pages/reader/shared/useReaderController.ts`
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/hooks/useEntries.ts`
- `frontend/packages/api-client/src/services/entries.ts`
- `frontend/packages/api-client/src/services/ai.ts`
- `docs/references/local-ai-api.md`

## Verification Run

- `npm test -- --run src/__tests__/hooks/useEntries.test.ts src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx src/__tests__/pages/reader/useReaderController.todayBoard.test.tsx` passed.
- `npm test -- --run src/__tests__/services/ai.test.ts src/__tests__/services/entries.test.ts src/__tests__/services/system.test.ts` passed.
- `npm run typecheck` passed in `frontend/apps/web`.
- `npm run typecheck` passed in `frontend/packages/api-client`.
- `uv run ruff check ...` passed for touched backend files and tests.
- `uv run pytest tests/unit/test_server_time.py` passed.
- Backend integration tests were attempted but blocked because local Postgres on `127.0.0.1:5433` was not running and Docker daemon was unavailable for harness startup.

## Known Gaps

- The changed backend integration tests still need to run in an environment with the test Postgres available.
- `/api/system/time` currently returns server timezone by checking `TZ`, then OS timezone files, then `UTC`.

## Reviewer Focus

- Confirm Today Board no longer computes browser-local UTC windows for `/entries/today`.
- Confirm AI summary read/write identity uses server timezone and does not depend on browser timezone.
- Confirm the local AI API doc matches implemented request/response semantics.
