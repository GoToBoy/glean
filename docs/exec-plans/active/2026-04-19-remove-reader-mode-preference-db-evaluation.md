# 2026-04-19 Remove Reader Mode And Preference DB Evaluation

## Contract Check

1. Settings UI no longer exposes reader mode or preference controls.
   - Pass
2. Frontend/backend user settings schemas no longer mention `reader_mode`, `ranking_mode`, `recommendation_strength`, `explore_ratio`, or `manual_only`.
   - Pass
3. Database migration removes `user_entries.is_liked`, `user_entries.liked_at`, `user_preference_stats`, and `user_preference_vectors`.
   - Pass
4. Runtime vector validation/rebuild no longer references removed preference-vector tables.
   - Pass
5. Typecheck, API-client tests, migration, Docker rebuild, and smoke checks pass or failures are documented.
   - Pass

## Independent Checks

- searched active frontend/backend code for removed reader/preference symbols; only historical migrations and the new migration retain old names
- verified Postgres has no `is_liked`, `liked_at`, or `preference_score` columns on `user_entries`
- verified `user_preference_stats` and `user_preference_vectors` resolve to null with `to_regclass`
- verified no user rows retain removed settings keys
- verified local Docker services are running with rebuilt `backend`, `worker`, and `web` images

## Residual Risk

- old migration history still documents removed schema, which is normal for forward-only migrations
- old-reader code may still exist as implementation detail, but there is no user setting or tab to select it
