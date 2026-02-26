# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 工作模式：Superpowers +AI 协作
### 角色分工

**Claude（我）一架构师 /项目经理**：
- 需求分析、架构设计、任务拆分使用 Superpowers 进行规划、凍查、调试
- 代码审核、最终验收、Git 提交管理
- **绝对不亲自编写代码**，所有编码任务必须委派给 Codex 或 Gemini

**Codex一后端开发**：
- 服务端代码、API、数据库、Migration
- 单元测试、集成测试
- 通过`/ask codex "..."`调用

**Gemini—前端开发**：
- 前端组件、页面、样式、交互逻辑
- 代码审查、安全审计
- 通过`/ask gemini "..."`调用

### 降级机制
当某个 AI 提供者不可用时，按以下规则降级：

```
Codex 不可用-> Gemini 接管后端任务
Gemini 不可用-> Codex 接管前端任务
两者都不可用-暂停编码，等待恢复（Claude 不代写代码）
```

降级时在任务描述中注明“降级接管”，便于后续追溯。

### 协作方式
**使用 Superpowers skills 进行**：
- 规划: `superpowers:writing-plans`
- 执行: `superpowers:executing-plans`
- 审查: `superpowers:requesting-code-review` 
- 调试: `superpowers:systematic-debugging` 
- 完成: `superpowers:finishing-a-development-branch` 

**调用 AI 提供者执行代码任务**：
```bash
# 指派 Codex 实现后端
/ask codex "实现 XXX 后端功能，涉及文件：..."

# 指派 Gemini 实现前端
/ask gemini“实现 XXX 前端功能，涉及文件：..."

# 查看执行结果
/pend codex
/pend gemini
```

---

##Linus 三向（決策前必向）
1. **这是现实问题还是想象问题？**- 拒绝过度设计
2. **有没有更简单的做法？**-始终寻找最简方案
3. **会破坏什么？**-向后兼容是铁律

--- 

## Git 规范
- 功能开发在`feature/<task-name>`分支
- 提交前必须通过代码审查
- 提交信息：`＜类型>：＜描述>`（中文）
- 类型: feat / fix / docs / refactor / chore
- **禁止**：force push、修改已push历史


## Project Overview

Glean (拾灵) is a personal knowledge management tool and RSS reader built with a Python backend and TypeScript frontend. The project uses a monorepo structure with workspaces for both backend and frontend.

For backend-specific development guidance, see [backend/CLAUDE.md](backend/CLAUDE.md).
For frontend-specific development guidance, see [frontend/CLAUDE.md](frontend/CLAUDE.md).

## Quick Start

```bash
# Start infrastructure (PostgreSQL + Redis + Milvus)
make up

# Start all services (API + Worker + Web)
make dev-all

# Or run services individually
make api             # FastAPI server (http://localhost:8000)
make worker          # arq background worker
make web             # React web app (http://localhost:3000)
make admin           # Admin dashboard (http://localhost:3001)
make electron        # Electron desktop app
```

For detailed deployment instructions, see [DEPLOY.md](DEPLOY.md).

## Docker Compose Configuration

The project includes multiple Docker Compose configurations for different use cases:

### Production Deployment

```bash
# Basic deployment (without admin dashboard)
docker compose up -d

# Full deployment with admin dashboard
docker compose --profile admin up -d

# Stop services
docker compose down

# Test pre-release versions (alpha/beta/rc)
IMAGE_TAG=v0.3.0-alpha.1 docker compose up -d
# Or set in .env: IMAGE_TAG=v0.3.0-alpha.1
```

### Development Environment

```bash
# Start development infrastructure (PostgreSQL, Redis, Milvus)
docker compose -f docker-compose.dev.yml up -d

# View logs
docker compose -f docker-compose.dev.yml logs -f

# Stop services
docker compose -f docker-compose.dev.yml down
```

### Local Development with Override

```bash
# Use local builds instead of Docker images
docker compose -f docker-compose.yml -f docker-compose.override.yml up -d
```

### Test Environment

```bash
# Start test database (port 5433, isolated from dev)
docker compose -f docker-compose.test.yml up -d

# Or use Makefile shortcut
make test-db-up
```

### Environment Variables

Key environment variables for Docker deployments:

- `WEB_PORT`: Web interface port (default: 80)
- `ADMIN_PORT`: Admin dashboard port (default: 3001)
- `POSTGRES_DB/USER/PASSWORD`: Database credentials
- `SECRET_KEY`: JWT signing key
- `CREATE_ADMIN`: Create admin account on startup (default: false)
- `ADMIN_USERNAME/PASSWORD`: Admin credentials
- `DEBUG`: Enable debug mode (default: false)

For a complete list of environment variables, see `.env.example` in the project root.

## Development Commands

### Database Migrations
```bash
make db-upgrade                    # Apply migrations
make db-migrate MSG="description"  # Create new migration (autogenerate)
make db-downgrade                  # Revert last migration
make db-reset                      # Drop DB, recreate, and apply migrations (REQUIRES USER CONSENT)
```

Working directory: `backend/packages/database` | Tool: Alembic (SQLAlchemy 2.0)

### Testing & Code Quality
```bash
make test            # Run pytest for all backend packages/apps
make test-cov        # Run tests with coverage report
make lint            # Run ruff + pyright (backend), eslint (frontend)
make format          # Format code with ruff (backend), prettier (frontend)

# Frontend-specific (from frontend/ directory)
pnpm typecheck                          # Type check all packages
pnpm --filter=@glean/web typecheck      # Type check specific package
pnpm --filter=@glean/web build          # Build specific package
```

### Package Management
```bash
# Root: npm (for concurrently tool)
npm install

# Backend: uv (Python 3.11+)
cd backend && uv sync --all-packages

# Frontend: pnpm + Turborepo
cd frontend && pnpm install
```

## Architecture

### Technology Stack

| Layer       | Backend                                | Frontend                 |
| ----------- | -------------------------------------- | ------------------------ |
| Language    | Python 3.11+ (strict pyright)          | TypeScript (strict)      |
| Framework   | FastAPI                                | React 18 + Vite          |
| Database    | SQLAlchemy 2.0 (async) + PostgreSQL 16 | -                        |
| State/Cache | Redis 7 + arq                          | Zustand + TanStack Query |
| Styling     | -                                      | Tailwind CSS             |
| Package Mgr | uv                                     | pnpm + Turborepo         |
| Linting     | ruff + pyright                         | ESLint + Prettier        |

**Infrastructure**: PostgreSQL 16 (5432), Redis 7 (6379), Milvus (optional), Docker Compose

### Backend Structure

```
backend/
├── apps/
│   ├── api/           # FastAPI REST API (port 8000)
│   │   └── routers/   # auth, feeds, entries, bookmarks, folders, tags, admin, preference
│   └── worker/        # arq background worker (Redis queue)
│       └── tasks/     # feed_fetcher, bookmark_metadata, cleanup, embedding_worker, preference_worker
├── packages/
│   ├── database/      # SQLAlchemy models + Alembic migrations
│   ├── core/          # Business logic and domain services
│   ├── rss/           # RSS/Atom feed parsing
│   └── vector/        # Vector embeddings & preference learning (M3)
```

**Dependency Flow**: `api` → `core` → `database` ← `rss` ← `worker`, `vector` → `database`

See [backend/CLAUDE.md](backend/CLAUDE.md) for detailed backend development guidance.

### Frontend Structure

```
frontend/
├── apps/
│   ├── web/           # Main React app (port 3000) + Electron desktop app
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── stores/    # Zustand state stores
│   │   └── electron/  # Electron main & preload scripts
│   └── admin/         # Admin dashboard (port 3001)
├── packages/
│   ├── ui/            # Shared components (COSS UI based)
│   ├── api-client/    # TypeScript API client SDK
│   ├── types/         # Shared TypeScript types
│   └── logger/        # Unified logging (loglevel based)
```

See [frontend/CLAUDE.md](frontend/CLAUDE.md) for detailed frontend development guidance.

### Configuration

Environment variables in `.env` (copy from `.env.example`):
- `DATABASE_URL` - PostgreSQL connection string (asyncpg driver)
- `REDIS_URL` - Redis connection for arq worker
- `SECRET_KEY` - JWT signing key
- `CORS_ORIGINS` - Allowed frontend origins (JSON array)
- `DEBUG` - Enable/disable API docs and debug mode

## Testing

### Test Database

Tests use a separate PostgreSQL instance to avoid affecting development data:

```bash
# Start test database (required before running tests)
make test-db-up

# Run tests (automatically starts test database)
make test

# Stop test database
make test-db-down
```

**Important**: The test database runs on port 5433, separate from the development database (port 5432).

### Running Tests

```bash
# Backend (using Makefile - recommended)
make test                    # Run all tests
make test ARGS="-k auth"     # Run tests matching pattern

# Backend (manual)
cd backend && uv run pytest apps/api/tests/test_auth.py
cd backend && uv run pytest apps/api/tests/test_auth.py::test_login

# Frontend
cd frontend/apps/web && pnpm test
```

**Test Account** (for automated testing):
- Email: claude.test@example.com
- Password: TestPass123!
- Feed: https://ameow.xyz/feed.xml

**Admin Account**:
- See [docs/admin-setup.md](docs/admin-setup.md) for detailed setup instructions
- Quick setup: `python backend/scripts/create-admin.py`
- Docker setup: Set `CREATE_ADMIN=true` in `.env` or use `docker exec -it glean-backend /app/scripts/create-admin-docker.sh`
- Default credentials (development only): admin / Admin123!
- Dashboard URL: http://localhost:3001

## CI Compliance

Before submitting code, ensure it passes all CI checks. Run these commands locally to verify:

### Quick Verification

```bash
# Backend: lint, format check, and type check
cd backend && uv run ruff check . && uv run ruff format --check . && uv run pyright

# Frontend: lint, type check, and build
cd frontend && pnpm lint && pnpm typecheck && pnpm build
```

Or use the Makefile shortcuts:
```bash
make lint      # Run all linters (backend + frontend)
make format    # Auto-fix formatting issues
make test      # Run backend tests
```

### CI Pipeline Summary

| Check        | Backend Command                | Frontend Command   |
| ------------ | ------------------------------ | ------------------ |
| Linting      | `uv run ruff check .`          | `pnpm lint`        |
| Format Check | `uv run ruff format --check .` | (included in lint) |
| Type Check   | `uv run pyright`               | `pnpm typecheck`   |
| Tests        | `uv run pytest`                | `pnpm test`        |
| Build        | -                              | `pnpm build`       |

### Pre-Commit Checklist

Before committing changes:

1. **Format code**: `make format`
2. **Run linters**: `make lint`
3. **Run tests** (if modifying logic): `make test`
4. **Type check** (for complex changes):
   - Backend: `cd backend && uv run pyright`
   - Frontend: `cd frontend && pnpm typecheck`

## Electron Desktop App

Glean provides a cross-platform desktop application built with Electron.

### Development

```bash
# Start Electron in development mode (requires backend running)
make electron

# Or from frontend/apps/web directory
pnpm dev:electron
```

**Prerequisites**: Backend API must be running (`make api`) before starting Electron app.

### Building Desktop Apps

```bash
# Build for current platform
cd frontend/apps/web && pnpm build:electron

# Build for specific platforms
pnpm build:win      # Windows (NSIS installer)
pnpm build:mac      # macOS (DMG + zip)
pnpm build:linux    # Linux (AppImage + deb)
```

Built applications will be in `frontend/apps/web/release/`.

### Key Features

- **Secure token storage**: Uses `electron-store` for encrypted credential storage
- **Auto-updates**: Built-in update checker with `electron-updater`
- **API URL configuration**: Customizable backend server URL for self-hosted deployments
- **Native platform integration**: System tray, notifications, and platform-specific behaviors

### Architecture

- **Main process** (`electron/main.ts`): App lifecycle, IPC handlers, auto-update logic
- **Preload script** (`electron/preload.ts`): Secure bridge exposing APIs to renderer via `contextBridge`
- **Renderer process**: Same React app as web version, with conditional Electron-specific features

### Important Notes

- Electron app shares the same codebase as the web app (conditional rendering based on `window.electronAPI`)
- Pre-release versions (alpha/beta/rc) do NOT trigger auto-updates in Electron
- Desktop app requires a backend API to connect to (self-hosted or remote)

## Miscellaneous

- This project uses monorepo structure - always check your current working directory
- You don't have to create documentation unless explicitly asked
- Never run `make db-reset` without explicit user consent
- Always write code comments in English
