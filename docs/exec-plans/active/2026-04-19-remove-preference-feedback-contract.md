# 2026-04-19 Remove Preference Feedback Contract

## Scope

Remove low-value preference feedback features from the product and runtime:

- remove article-page like/dislike actions
- remove the standalone `/preference` page and its route
- remove settings-page preference controls
- remove preference-related frontend API clients, mocks, and translations
- remove backend preference endpoints and entry feedback endpoints
- stop background preference task scheduling from entry/bookmark flows

## Out Of Scope

- renaming internal database columns or dropping historical preference tables in this pass
- changing archive/bookmark storage semantics beyond user-facing labels already updated
- redesigning reader layout beyond removing the feedback affordances

## Completion Criteria

1. Web app has no user-visible like/dislike controls or preference settings entry points.
2. `/preference` is no longer routable from the web app.
3. Frontend no longer depends on preference service APIs for normal flows.
4. Backend no longer exposes preference-management or like/dislike convenience endpoints.
5. Entry and bookmark state updates no longer enqueue preference rebuild/update jobs.
6. Typecheck and targeted smoke checks pass, or remaining failures are documented.

## Verification Plan

- run `pnpm --dir frontend/apps/web typecheck`
- run `pnpm --dir frontend/packages/api-client test`
- if backend import-level verification is feasible, run a targeted API smoke check in Docker

## Risks

- entry response shapes are shared across several reader tests and mocks
- older docs may still reference preference concepts after runtime removal
- worker registration cleanup must not break unrelated queue startup
