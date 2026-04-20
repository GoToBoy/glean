# 2026-04-19 Remove Preference Feedback Handoff

## Implemented

- removed article-reader like/dislike controls and end-of-article feedback prompt
- removed `/preference` route, page, settings tab, and related frontend API service
- removed preference-related user settings fields from frontend/backend public schemas
- removed backend preference router and entry feedback endpoints
- stopped preference job enqueueing from entry and bookmark flows
- removed unused preference worker/service files and related test artifacts
- rebuilt local Docker backend, worker, and web images; restarted running services

## Verification

- `pnpm --dir frontend/apps/web typecheck`
- `pnpm --dir frontend/packages/api-client test`
- `docker compose -f docker-compose.yml -f docker-compose.override.yml build backend worker web`
- `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d backend worker web`
- dockerized smoke checks:
  - `GET /api/entries/today?date=2026-04-19&limit=20` returned `200 OK`
  - `GET /api/preference/stats` returned `404 Not Found`

## Remaining Notes

- database historical columns/migrations for `is_liked` and `preference_score` were left in place to avoid a destructive schema migration in this pass
- preference-related runtime code paths are removed from active app routing, APIs, worker registration, and frontend bundles
