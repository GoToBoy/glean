# Server Time Sprint Contract

## Goal

Make Today Board and local AI summary date logic use the server-configured timezone as the single source of truth instead of the browser timezone.

## Scope

- Backend server-time helper and public system time endpoint.
- Backend Today entries and AI summary lookup/write paths that currently accept client-local date windows or timezone keys.
- Frontend API client, hooks, and Reader Today Board state so the UI uses server date keys and sends only server-scoped dates.
- Focused tests for changed API contracts and Today Board query parameters.

## Done Means

- `/api/system/time` returns the server timezone, current server timestamp, and current server date.
- `/api/entries/today` derives its collection window from the server timezone and a `date` key, not browser-computed `collected_after` / `collected_before`.
- `/api/ai/today-summary` and related local AI daily summary paths ignore client timezone for lookup identity and return the server timezone.
- Reader Today Board obtains its current date from server time after load and sends a date key to the Today entries endpoint.
- Existing affected backend and frontend tests pass, with focused regression updates for the new contracts.

## Risks

- The first client render can occur before `/api/system/time` resolves; fallback behavior must not permanently lock in browser-local dates.
- Existing clients may still send legacy Today entries bounds; the endpoint should remain tolerant while moving the web client to server-date semantics.
- AI summaries already written under old browser timezone keys will not be found unless lookup/write consistently converge on the server timezone going forward.

## Evaluator Focus

- Verify no browser timezone is sent for AI daily summary requests.
- Verify Today Board list requests send `date` rather than client-computed UTC bounds.
- Verify backend converts dates using server timezone helper consistently.
