# Sprint Contract

## Goal

Remove the Smart reader view, tag module, and discover module from the product, runtime wiring, and local/dev support files without breaking the remaining reader, bookmarks, feeds, and Today Board flows.

## Scope

- Remove Smart view entry points and logic from web reader routes, layout, filters, and settings.
- Remove tag CRUD, tag sidebar UI, tag dialogs/stores/hooks/client types, and bookmark/user-entry tag application flows.
- Remove discover UI page, API client, backend router/service/schema/model wiring, and related tests/docs references.
- Update backend entry APIs and services so only supported reader views remain.
- Add a forward migration that drops discovery/tag tables and junction tables instead of deleting historical migrations.
- Update Docker/local runtime and top-level docs where these removed features are referenced.

## Explicit Exclusions

- Do not remove Today Board (`view=today-board`) or general feed discovery during subscription creation (`POST /api/feeds/discover`).
- Do not rewrite unrelated bookmark/folder/feed features beyond the cleanup required by tag removal.
- Do not delete old Alembic history files that are already part of the migration chain.

## Done Means

- The web app no longer exposes Smart view, tag management, or Discover navigation/routes.
- The backend no longer registers `/api/tags` or `/api/discover`, and `/api/entries` no longer accepts `view=smart`.
- Bookmark payloads and bookmark APIs no longer depend on tag entities.
- Runtime imports, client exports, and tests no longer reference the removed modules.
- A new migration cleanly removes `tags`, `bookmark_tags`, `user_entry_tags`, `discovery_candidates`, and `discovery_feedback`.
- Focused verification passes for changed frontend/backend surfaces, or any unverified gaps are documented clearly.

## Risks

- Bookmark models and APIs currently embed tag payloads, so removal can ripple into list/detail rendering and tests.
- Smart view and preference-score UI share reader filter/state code with timeline and Today Board, so route cleanup must avoid regressions there.
- Discovery naming overlaps with feed subscription discovery, which must remain intact.
- Historical migration files must stay in place even though the feature is being removed from current runtime code.

## Evaluator Focus

- Confirm Today Board and normal timeline reader routes still work after Smart view removal.
- Confirm bookmark listing/detail/update flows still compile and serialize correctly without tag fields.
- Confirm no remaining runtime imports point at removed services, schemas, stores, or pages.
- Confirm the migration strategy removes live tables without breaking the Alembic chain.
