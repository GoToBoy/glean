# Glean

Self-hosted RSS reader with bilingual reading, bookmarking, tagging, and AI-powered knowledge organization (fork with faster iteration on `personal-main`).

## Stack

**Backend:** Python 3.11+, FastAPI, SQLAlchemy 2.0 async, PostgreSQL 16 + pgvector, Redis + arq (job queue), Alembic, uv  
**Frontend:** React 18, TypeScript, Vite, Tailwind CSS, TanStack Query, Zustand, React Router, Electron (desktop), pnpm + Turbo monorepo

## Structure

```
glean/
├── backend/
│   ├── apps/api/glean_api/          # FastAPI app — routers/, mcp/, config.py
│   ├── apps/worker/glean_worker/    # Background jobs — tasks/ (feed fetch, translation, embeddings)
│   └── packages/
│       ├── core/glean_core/         # Services + Pydantic schemas (business logic)
│       ├── database/glean_database/ # SQLAlchemy models + Alembic migrations
│       ├── rss/glean_rss/           # Feed parsing, OPML
│       └── vector/glean_vector/     # Embeddings, preference scoring
└── frontend/
    ├── apps/web/src/                # Main reader UI + Electron (pages/, components/, hooks/)
    ├── apps/admin/src/              # Admin dashboard
    └── packages/                   # Shared: api-client, types, ui, logger, i18n
```

## Dev Commands

```bash
make install       # install all deps
make up            # start postgres + redis (Docker)
make db-upgrade    # apply migrations
make api           # FastAPI on :8000
make worker        # arq background worker
make web           # React dev server on :3000
make admin         # admin dashboard
make dev-all       # run all services concurrently
make test          # run tests
make lint          # ruff + pyright + eslint
make format        # format all code
```

## Local Docker (dev containers)

The locally running containers use image tags defined in `docker-compose.override.yml` (NOT `docker-compose.personal.yml`). Always verify the live tag with `docker ps` before building — a wrong tag rebuilds an image nothing is actually using.

Tags in use locally:
- `glean-web:local` — web app (nginx + built Vite bundle)
- `glean-admin:local` — admin dashboard
- Backend / worker: see `docker-compose.override.yml` for the active tag

Rebuild + pick up changes:

```bash
# Web
docker build -f frontend/apps/web/Dockerfile -t glean-web:local frontend && docker restart glean-web

# Admin
docker build -f frontend/apps/admin/Dockerfile -t glean-admin:local frontend && docker restart glean-admin
```

**Important:** `docker restart <name>` only reboots the existing container with the OLD image — it does NOT swap to the freshly built one. Use `docker compose up -d --force-recreate` to recreate the container with the new image:

```bash
# Web (after rebuild)
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --no-deps --force-recreate web

# Admin (after rebuild)
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d --no-deps --force-recreate admin
```

Verify with `docker inspect <name> --format '{{.Image}}'` matches `docker image inspect <tag> --format '{{.Id}}'`.

## Key Config

- `.env.example` — all env vars documented here
- `backend/apps/api/glean_api/config.py` — Pydantic settings
- `docker-compose.yml` — production; `docker-compose.dev.yml` — dev infra only

Critical env vars: `SECRET_KEY`, `DATABASE_URL`, `REDIS_URL`, `MTRAN_SERVER_URL`, `EMBEDDING_PROVIDER`

## Patterns

**Backend:**
- Service-layer architecture: business logic in `glean_core/services/`
- Pydantic schemas in `glean_core/schemas/` for all API contracts
- Async SQLAlchemy sessions everywhere; FastAPI dependency injection for DB/Redis/services
- UUID PKs + `TimestampMixin` (`created_at`/`updated_at`) on all models
- Strict pyright + ruff (E, F, I, N, W, UP, B, C4, SIM rules)
- Logging: loguru + structlog via `glean_core.init_logging()`

**Frontend:**
- Zustand for global state; TanStack Query for server state
- Shared types via `@glean/types`; API calls via `@glean/api-client` (Axios)
- TypeScript strict mode throughout

## Testing

```bash
make test          # pytest (asyncio mode) + vitest
make test-cov      # with coverage
```

Test infra via `docker-compose.test.yml` (spun up automatically).
