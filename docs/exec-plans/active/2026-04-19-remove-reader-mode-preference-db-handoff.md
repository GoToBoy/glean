# 2026-04-19 Remove Reader Mode And Preference DB Handoff

## Implemented

- removed Settings page Reader Mode tab and all `readerMode` i18n copy
- removed `reader_mode` from frontend and backend user settings schemas
- removed stale preference/ranking settings keys from i18n and local mock data
- removed preference-score/debug types from frontend entry models and mocks
- removed preference stats and score services from core/vector packages
- removed preference-related Redis keys and vector schema exports
- removed `UserPreferenceStats` model and user relationship
- removed `is_liked` and `liked_at` from `UserEntry`
- added migration `b6c7d8e9f0a1_remove_reader_mode_preference_storage.py`

## Database Migration

The new migration:

- drops `user_preference_vectors`
- drops `user_preference_stats`
- drops `user_entries.is_liked`
- drops `user_entries.liked_at`
- removes these JSONB settings keys from all users:
  - `reader_mode`
  - `ranking_mode`
  - `recommendation_strength`
  - `explore_ratio`
  - `manual_only`

## Verification

- `pnpm --dir frontend/apps/web typecheck`
- `pnpm --dir frontend/packages/api-client test`
- `docker compose -f docker-compose.yml -f docker-compose.override.yml build backend worker web`
- `docker compose -f docker-compose.yml -f docker-compose.override.yml up -d backend worker web`
- `alembic current` reports `b6c7d8e9f0a1 (head)`
- database checks confirmed removed columns/tables/settings keys are gone
- `GET /api/health` returned `200 OK`
- `GET /api/entries/today?date=2026-04-19&limit=20` returned `200 OK`

## Notes

- historical migration files still contain old column/table names by design
- current UI behavior now assumes the new reader and time-based ordering
