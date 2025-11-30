# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Glean (拾灵) is a personal knowledge management tool and RSS reader built with a Python backend and TypeScript frontend. The project uses a monorepo structure with workspaces for both backend and frontend.

## Development Commands

### Infrastructure
```bash
make up              # Start PostgreSQL + Redis via Docker
make down            # Stop Docker services
make logs            # View Docker service logs
```

### Development Servers (run in separate terminals)
```bash
make api             # Start FastAPI server (http://localhost:8000)
make worker          # Start arq background worker
make web             # Start React web app (http://localhost:3000)
make admin           # Start admin dashboard
```

### Database Migrations
```bash
make db-upgrade                    # Apply migrations
make db-migrate MSG="description"  # Create new migration (autogenerate)
make db-downgrade                  # Revert last migration
make db-reset                      # Drop DB, recreate, and apply migrations
```

Working directory for migrations: `backend/packages/database`
Migration tool: Alembic (SQLAlchemy 2.0)

### Testing & Code Quality
```bash
make test            # Run pytest for all backend packages/apps
make test-cov        # Run tests with coverage report
make lint            # Run ruff + pyright (backend), eslint (frontend)
make format          # Format code with ruff (backend), prettier (frontend)
```

### Package Management
```bash
# Backend: uv (Python 3.11+)
cd backend && uv sync --all-packages     # Install all workspace packages
cd backend && uv add <package>           # Add dependency to specific package

# Frontend: pnpm + Turborepo
cd frontend && pnpm install              # Install all workspace packages
cd frontend && pnpm add <package>        # Add to specific workspace
```

### Single Test Execution
```bash
# Backend: pytest with specific file or test
cd backend && uv run pytest apps/api/tests/test_auth.py
cd backend && uv run pytest apps/api/tests/test_auth.py::test_login

# Frontend: (Configure test runner in individual packages as needed)
cd frontend/apps/web && pnpm test
```

## Architecture

### Backend Monorepo Structure

The backend uses a **workspace-based monorepo** managed by `uv`:

**Apps** (deployable applications):
- `apps/api/` - FastAPI REST API server
  - Entry: `glean_api.main:app`
  - Routers: auth, feeds, entries, admin
  - Runs on port 8000

- `apps/worker/` - arq background task worker
  - Entry: `glean_worker.main.WorkerSettings`
  - Tasks: feed fetching, scheduled jobs (every 15 min)
  - Uses Redis for task queue

**Packages** (shared libraries):
- `packages/database/` - SQLAlchemy 2.0 models & Alembic migrations
  - Models: User, Feed, Entry, Subscription, UserEntry, Admin
  - Session management with async PostgreSQL

- `packages/core/` - Business logic and domain services
  - Depends on `glean-database`

- `packages/rss/` - RSS/Atom feed parsing utilities
  - Used by worker for feed fetching

**Dependency Flow**: `api` → `core` → `database` ← `rss` ← `worker`

All packages use workspace dependencies (e.g., `glean-database = { workspace = true }`).

### Frontend Monorepo Structure

The frontend uses **pnpm workspaces + Turborepo**:

**Apps**:
- `apps/web/` - Main user-facing React app (Vite + React 18)
  - Port 3000
  - Uses Tailwind CSS, Zustand, TanStack Query

- `apps/admin/` - Admin dashboard

**Packages**:
- `packages/ui/` - Shared React components
- `packages/api-client/` - TypeScript API client SDK
- `packages/types/` - Shared TypeScript types

Turbo tasks are configured in `frontend/turbo.json` for build, dev, lint, test, and typecheck.

### Technology Stack

**Backend**:
- Python 3.11+ with strict type checking (pyright)
- FastAPI for REST API
- SQLAlchemy 2.0 (async) + asyncpg + PostgreSQL
- arq (task queue) + Redis
- uv for package management
- ruff for linting/formatting

**Frontend**:
- React 18 + TypeScript
- Vite build tool
- Tailwind CSS
- Zustand (state management)
- TanStack Query (data fetching)
- pnpm + Turborepo

**Infrastructure**:
- PostgreSQL 16 (port 5432)
- Redis 7 (port 6379)
- Docker Compose for local development

### Configuration

Environment variables are defined in `.env` (copy from `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string (asyncpg driver)
- `REDIS_URL` - Redis connection for arq worker
- `SECRET_KEY` - JWT signing key
- `CORS_ORIGINS` - Allowed frontend origins (JSON array)
- `DEBUG` - Enable/disable API docs and debug mode

The API and worker both load config using `pydantic-settings`.

## Key Development Notes

### Database Changes
1. Modify models in `backend/packages/database/glean_database/models/`
2. Create migration: `make db-migrate MSG="add_field_to_table"`
3. Review generated migration in `packages/database/glean_database/migrations/versions/`
4. Apply: `make db-upgrade`

### Adding API Endpoints
1. Create/modify router in `backend/apps/api/glean_api/routers/`
2. Register in `backend/apps/api/glean_api/main.py`
3. Endpoint pattern: `/api/{resource}` (e.g., `/api/feeds`, `/api/entries`)

### Adding Background Tasks
1. Create task function in `backend/apps/worker/glean_worker/tasks/`
2. Register in `WorkerSettings.functions` or `WorkerSettings.cron_jobs` in `main.py`
3. Tasks are async functions with `ctx` parameter

### Type Checking
- Backend uses strict type checking with pyright
- All function signatures require type hints
- SQLAlchemy models use `Mapped[T]` annotations

### Code Style
- Backend: 100 char line length, ruff for formatting
- Frontend: Prettier with Tailwind plugin
- Import order: stdlib → third-party → workspace packages
