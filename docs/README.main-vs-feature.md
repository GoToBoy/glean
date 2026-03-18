# Glean Branch Comparison README (`main` vs `personal-main`)

## 1. Comparison Scope

- Compared branches: `main...personal-main`
- Baseline date: `2026-03-10` (based on latest local `main`, and `main == origin/main`)
- Branch status: feature is `102` commits ahead (`main` is behind by `0`)
- Diff size: `186 files changed`, `+17148 / -3589`
- Diff method: `git diff main...personal-main`

> This document focuses on two things:
> 1) what this feature branch adds compared with `main`;
> 2) what it improves in existing capabilities (stability, performance, UX, operability).

---

## 2. Core Additions Compared with `main`

### 2.1 Vector stack migration from Milvus to pgvector

- Introduces a `pgvector` client and DB migrations, moving vector data into PostgreSQL.
- Default compose stack now uses `pgvector/pgvector:pg16`, reducing extra vector DB ops burden.
- Validation and embedding/preference services are adapted to the pgvector path.

Key locations:
- `backend/packages/vector/glean_vector/clients/pgvector_client.py`
- `backend/packages/database/glean_database/migrations/versions/a1b2c3d4e5f6_add_pgvector_tables.py`
- `docker-compose.yml`

### 2.2 Translation system upgrade (end-to-end)

- Adds multiple translation providers (including MTranServer) with configurable policy.
- Adds paragraph/sentence-level translation pipeline for immersive bilingual reading.
- Adds translation worker tasks and persistence schema.

Key locations:
- `backend/packages/core/glean_core/services/translation_service.py`
- `backend/apps/worker/glean_worker/tasks/translation.py`
- `backend/packages/database/glean_database/models/entry_translation.py`
- `frontend/apps/web/src/hooks/useViewportTranslation.ts`

### 2.3 Discover + RSSHub auto-fallback flow

- Adds Discover services, routes, and frontend page.
- Adds RSSHub rules and auto-fallback/conversion flow.
- Supports per-user API key settings (e.g., Tavily).

Key locations:
- `backend/packages/core/glean_core/services/discovery_service.py`
- `backend/apps/api/glean_api/routers/discover.py`
- `frontend/apps/web/src/pages/DiscoverPage.tsx`

### 2.4 Behavior-signal and ranking support additions

- Adds implicit-feedback event schema and frontend trigger points.
- Provides data foundation for list interaction and ranking strategy tuning (while still allowing controlled rollback/adjustments).

Key locations:
- `backend/packages/database/glean_database/migrations/versions/c9f8d4a7b112_add_implicit_feedback_event_tables.py`
- `frontend/apps/web/src/hooks/useEndOfArticleFeedbackPrompt.ts`

---

## 3. Optimizations on Existing Functionality (Highlights)

### 3.1 Reader and list UX optimizations

- Refactors reader structure (desktop/mobile shells), improving maintainability.
- Improves list virtualization, anchor restore, and resume behavior to reduce jumpiness/misposition.
- Simplifies sidebar/filter interactions to reduce duplicate requests and UI jitter.

Key locations:
- `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- `frontend/apps/web/src/pages/reader/desktop/ReaderDesktopShell.tsx`
- `frontend/apps/web/src/pages/reader/mobile/ReaderMobileShell.tsx`

### 3.2 Feed fetching robustness

- Improves failure-state and retry behavior clarity (including 429 handling).
- Makes ingestion more idempotent (duplicate guid / duplicate entry handling).
- Adds fetch-attempt/fetch-success timestamps for better observability and operations.

Key locations:
- `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
- `backend/packages/database/glean_database/migrations/versions/d1e2f3a4b5c6_add_feed_fetch_attempt_success_timestamps.py`
- `backend/packages/database/glean_database/migrations/versions/e7b9c2d4f1a8_make_feed_fetch_error_message_text.py`

### 3.3 Admin and deployment/ops improvements

- Admin UI adds batch operations, retry actions, and status polling.
- Dockerfile, static precompression, and Nginx improvements improve deployment/runtime performance.
- Adds Cloudflare Tunnel and personal compose deployment docs/configs.

Key locations:
- `frontend/apps/admin/src/pages/FeedsPage.tsx`
- `frontend/apps/web/scripts/precompress-assets.mjs`
- `docs/cloudflare-tunnel-optimization.md`
- `docker-compose.personal.yml`

### 3.4 Test coverage expansion

- Adds multi-layer tests across API, worker, core, and frontend hooks/stores.
- Focuses on high-change modules: translation, Discover, feed fetch, reader interactions.

### 3.5 Boundary note against latest `main`

- OIDC already exists in latest `main`, so it is not counted as a branch addition here.
- This document only captures real residual differences in `main...personal-main`.

---

## 4. Compatibility and Migration Notes

### 4.1 When switching from `main` to this feature branch

1. Run DB migrations (focus on translation, pgvector, discover, implicit-feedback tables).
2. Check added `.env` settings:
   - Translation-related: `MTRAN_*` / translation provider settings
   - Cloudflare Tunnel (optional): `CLOUDFLARE_*`
3. If you follow older deployment docs, update vector dependency assumptions to pgvector.
4. Update compose files together (`docker-compose.yml` / `docker-compose.lite.yml`).

### 4.2 Rollback risks

- Schema expansion is broad; direct rollback to old migration chains is expensive.
- Translation/discovery/vector frontend-backend contracts are coupled; prefer full rollback over partial cherry-pick removals.

---

## 5. Suggested Minimal Validation Checklist

1. Auth: local account login works and remains aligned with main-branch auth flow.
2. Feeds: add feed, refresh, retry failed jobs, and clear error states.
3. Reader: list switch, detail open, mobile list/detail navigation, scroll restore.
4. Translation: trigger in list/detail, cache hit behavior, graceful fallback on failures.
5. Discover: discover search, candidate feedback, subscribe conversion path.
6. Vector: pgvector extension available, embedding write/read and recall behavior works.

---

## 6. Summary

Compared with `main`, this branch is not a small patch. It is a combined “capability expansion + systemic optimization” update:
- Capability expansion: pgvector, translation pipeline, Discover/RSSHub, behavior-signal instrumentation.
- Functional optimization: reader UX, feed robustness, deployment/ops, and testing coverage.
- Engineering outcome: keeps the core RSS/reading flow while improving extensibility, maintainability, and release operability.
