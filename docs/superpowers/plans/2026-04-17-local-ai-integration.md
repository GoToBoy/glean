# Local AI Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build REST endpoints, storage, configuration, and reader/admin UI for local AI systems to read 今日收录 data and write back day-level and entry-level AI summaries.

**Architecture:** Add a dedicated `/api/ai/*` FastAPI router that authenticates `glean_...` API tokens, gates access through typed `ai_integration` system config, and delegates querying/upsert behavior to a focused AI integration service. Store generated content in user-scoped tables separate from source `entries`, and expose read-only UI endpoints to the web app for 今日收录 AI summary mode.

**Tech Stack:** FastAPI, SQLAlchemy async ORM, Alembic-style migration files, Pydantic schemas, pytest/httpx backend integration tests, React/Vite/TanStack Query frontend, admin React settings page.

---

## File Map

- Create `backend/packages/database/glean_database/models/ai_summary.py`: ORM models for daily summaries and entry supplements.
- Modify `backend/packages/database/glean_database/models/__init__.py`: export new models.
- Create `backend/packages/database/glean_database/migrations/versions/<revision>_add_ai_summaries.py`: migration for both tables and indexes.
- Modify `backend/packages/core/glean_core/schemas/config.py`: add `AIIntegrationConfig` and update request/response schemas.
- Modify `backend/packages/core/glean_core/schemas/__init__.py`: export AI config schemas.
- Create `backend/packages/core/glean_core/schemas/ai.py`: request/response schemas for AI REST payloads.
- Create `backend/packages/core/glean_core/services/ai_integration_service.py`: query 今日收录, detail, summary upsert, supplement upsert.
- Modify `backend/packages/core/glean_core/services/__init__.py`: export service.
- Modify `backend/apps/api/glean_api/dependencies.py`: add API-token user dependency and optional JWT/API-token reader dependency for AI read endpoints.
- Create `backend/apps/api/glean_api/routers/ai.py`: AI REST routes.
- Modify `backend/apps/api/glean_api/routers/admin.py`: add admin get/update AI integration settings.
- Modify `backend/apps/api/glean_api/routers/system.py`: expose non-sensitive AI integration status/default view to the web app.
- Modify `backend/apps/api/glean_api/main.py` and `backend/apps/api/glean_api/routers/__init__.py`: register router.
- Create `backend/tests/integration/test_ai_integration_api.py`: API token, config gate, list/detail, and writeback tests.
- Add frontend API types/services/hooks for AI integration under `frontend/packages/types`, `frontend/packages/api-client`, and `frontend/apps/web/src/hooks`.
- Modify `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx` and Today Board components to add AI summary/list mode.
- Modify `frontend/apps/admin/src/pages/RegistrationSettingsPage.tsx` to edit AI integration settings.
- Add focused web/admin tests around default AI view and config form behavior if existing test harness supports them.

## Task 1: Backend Storage And Schemas

**Files:**
- Create: `backend/packages/database/glean_database/models/ai_summary.py`
- Modify: `backend/packages/database/glean_database/models/__init__.py`
- Create: `backend/packages/database/glean_database/migrations/versions/<revision>_add_ai_summaries.py`
- Modify: `backend/packages/core/glean_core/schemas/config.py`
- Create: `backend/packages/core/glean_core/schemas/ai.py`
- Modify: `backend/packages/core/glean_core/schemas/__init__.py`

- [ ] **Step 1: Write failing schema/model tests or API-facing tests**

Add backend integration tests that expect AI config defaults, summary payload validation, and new tables to exist through `Base.metadata.create_all`.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

Expected: fail because schemas/routes/models do not exist yet.

- [ ] **Step 3: Add minimal models and schemas**

Use `metadata_json` as ORM/database field names while preserving API payload field name `metadata`.

- [ ] **Step 4: Run focused tests**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

Expected: storage/schema failures are resolved, route failures remain until later tasks.

## Task 2: AI Token Authentication And Config Gates

**Files:**
- Modify: `backend/apps/api/glean_api/dependencies.py`
- Modify: `backend/apps/api/glean_api/routers/admin.py`
- Modify: `backend/apps/api/glean_api/routers/system.py`
- Modify: `backend/packages/core/glean_core/schemas/config.py`

- [ ] **Step 1: Write failing tests**

Cover:

- invalid/missing bearer token returns `401`
- normal JWT is rejected for AI write endpoints
- disabled `AIIntegrationConfig.enabled` returns `403`
- admin can read/update AI integration config
- web can read public AI integration status/default view

- [ ] **Step 2: Verify red**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

- [ ] **Step 3: Implement dependencies and config endpoints**

Add token verification through `APITokenService`, update `last_used_at`, and avoid accepting plaintext token values in config payloads.

- [ ] **Step 4: Verify green for auth/config cases**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

## Task 3: AI Read APIs

**Files:**
- Create: `backend/packages/core/glean_core/services/ai_integration_service.py`
- Create: `backend/apps/api/glean_api/routers/ai.py`
- Modify: `backend/apps/api/glean_api/main.py`
- Modify: `backend/apps/api/glean_api/routers/__init__.py`
- Test: `backend/tests/integration/test_ai_integration_api.py`

- [ ] **Step 1: Write failing tests**

Cover:

- `GET /api/ai/today-entries` returns only subscribed entries for the token owner
- membership uses `ingested_at` collection day instead of `published_at`
- `include_content=false` omits content and reports `content_available`
- `GET /api/ai/entries/{entry_id}` returns full content only for subscribed entries
- `allow_today_entries_api=false` and `allow_entry_detail_api=false` return `403`

- [ ] **Step 2: Verify red**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

- [ ] **Step 3: Implement read service and router**

Use timezone-aware day range conversion via `zoneinfo.ZoneInfo`. Return `422` for invalid timezone or date.

- [ ] **Step 4: Verify green**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

## Task 4: AI Writeback APIs

**Files:**
- Modify: `backend/packages/core/glean_core/services/ai_integration_service.py`
- Modify: `backend/apps/api/glean_api/routers/ai.py`
- Test: `backend/tests/integration/test_ai_integration_api.py`

- [ ] **Step 1: Write failing tests**

Cover:

- `PUT /api/ai/today-summary` upserts by `user_id + date + timezone`
- referenced entry IDs outside subscriptions return `422`
- `GET /api/ai/today-summary` returns the scoped summary for JWT web users and API token callers
- `PUT /api/ai/entries/{entry_id}/supplement` upserts by `user_id + entry_id`
- `GET /api/ai/entries/{entry_id}/supplement` returns scoped supplement
- `allow_ai_writeback=false` returns `403`

- [ ] **Step 2: Verify red**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

- [ ] **Step 3: Implement upserts and reads**

Keep generated data user-scoped and never mutate `Entry.summary` or `Entry.content`.

- [ ] **Step 4: Verify green**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py -q`

## Task 5: Frontend API Client And Reader UI

**Files:**
- Modify: `frontend/packages/types/src/api.ts`
- Modify: `frontend/packages/types/src/models.ts`
- Create or modify: `frontend/packages/api-client/src/services/ai.ts`
- Modify: `frontend/packages/api-client/src/index.ts`
- Create: `frontend/apps/web/src/hooks/useAIIntegration.ts`
- Modify: `frontend/apps/web/src/pages/reader/shared/ReaderCore.tsx`
- Modify: `frontend/apps/web/src/pages/reader/shared/components/TodayBoard.tsx`
- Test: focused reader tests under `frontend/apps/web/src/__tests__/pages/reader/`

- [ ] **Step 1: Write failing frontend tests**

Cover:

- config default `ai_summary` opens 今日收录 in AI summary mode
- config default `list` preserves current Today Board behavior
- missing summary renders empty state
- recommendation click opens existing article detail path

- [ ] **Step 2: Verify red**

Run: `pnpm --filter @glean/web test -- src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx src/__tests__/pages/reader/todayBoard.interaction.test.tsx`

- [ ] **Step 3: Implement API client and reader UI**

Keep existing `/reader?view=today-board&date=YYYY-MM-DD` behavior. Add local AI/list UI mode with minimal state unless URL persistence is clearly needed.

- [ ] **Step 4: Verify green**

Run: `pnpm --filter @glean/web test -- src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx src/__tests__/pages/reader/todayBoard.interaction.test.tsx`

## Task 6: Admin Settings UI

**Files:**
- Modify: `frontend/apps/admin/src/pages/RegistrationSettingsPage.tsx`
- Possibly modify: `frontend/apps/admin/src/lib/api.ts` only if endpoint conventions require it.
- Add or update admin tests if present for settings pages.

- [ ] **Step 1: Write failing admin test or document missing test harness**

Cover loading/saving AI integration settings and token guidance visibility.

- [ ] **Step 2: Implement minimal settings controls**

Add switches for AI enable/list/detail/writeback and a select for default 今日收录 view. Include token guidance, not plaintext token storage.

- [ ] **Step 3: Verify admin build or focused tests**

Run the available admin test/build command discovered from `frontend/apps/admin/package.json`.

## Task 7: Final Verification And Handoff

**Files:**
- Create: `docs/exec-plans/active/2026-04-17-local-ai-integration-handoff.md`
- Create: `docs/exec-plans/active/2026-04-17-local-ai-integration-evaluation.md`

- [ ] **Step 1: Run backend focused tests**

Run: `uv run pytest backend/tests/integration/test_ai_integration_api.py backend/tests/integration/test_api_tokens.py backend/tests/integration/test_entries_api.py -q`

- [ ] **Step 2: Run frontend focused tests**

Run the focused web/admin tests used in Tasks 5 and 6.

- [ ] **Step 3: Run type/lint checks if practical**

Use existing package scripts and record any unavailable checks.

- [ ] **Step 4: Write generator handoff**

Use `docs/agent-workflows/handoff-template.md`.

- [ ] **Step 5: Write evaluator assessment**

Evaluate against `docs/agent-workflows/evaluator-rubric.md` and record residual risks.
