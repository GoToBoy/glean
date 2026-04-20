# 2026-04-19 Remove Reader Mode And Preference DB Contract

## Scope

- remove the Settings page "Reader mode" tab entirely
- keep the product on the new reader only; no user-facing legacy/new toggle
- keep entry ordering time-based by default
- remove `reader_mode` and previous preference keys from public settings schemas and local mock data
- add a database migration to drop preference storage that is no longer part of the product
- remove runtime code that still depends on preference score tables/vectors

## Completion Criteria

1. Settings UI no longer exposes reader mode or preference controls.
2. Frontend/backend user settings schemas no longer mention `reader_mode`, `ranking_mode`, `recommendation_strength`, `explore_ratio`, or `manual_only`.
3. Database migration removes `user_entries.is_liked`, `user_entries.liked_at`, `user_preference_stats`, and `user_preference_vectors`.
4. Runtime vector validation/rebuild no longer references removed preference-vector tables.
5. Typecheck, API-client tests, migration, Docker rebuild, and smoke checks pass or failures are documented.

## Notes

- The old-reader implementation can be removed separately if it still has code-level references after the mode toggle is gone.
- Historical migrations remain as history; cleanup happens in a forward migration.
