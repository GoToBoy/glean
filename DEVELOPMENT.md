# Glean Development Guide

This guide covers setting up your development environment for contributing to Glean.

## Prerequisites

- **Python 3.11+** - Backend development
- **Node.js 20+** - Frontend development
- **Docker** - For running PostgreSQL and Redis
- **uv** - Python package manager ([install](https://docs.astral.sh/uv/getting-started/installation/))
- **pnpm** - Node.js package manager ([install](https://pnpm.io/installation))

## Quick Setup

```bash
# Clone the repository
git clone https://github.com/LesliLeung/glean.git
cd glean

# Install root dependencies (for concurrent dev command)
npm install

# Start PostgreSQL and Redis
make up

# Start all development services concurrently
make dev-all
```

This starts:
- **API Server**: http://localhost:8000
- **Web App**: http://localhost:3000
- **Admin Dashboard**: http://localhost:3001
- **API Docs**: http://localhost:8000/api/docs

## Project Structure

```
glean/
├── backend/                  # Python backend (uv workspace)
│   ├── apps/
│   │   ├── api/             # FastAPI application
│   │   └── worker/          # Background task worker
│   └── packages/
│       ├── database/        # SQLAlchemy models & migrations
│       ├── core/            # Business logic
│       └── rss/             # RSS parsing utilities
│
├── frontend/                 # TypeScript frontend (pnpm workspace)
│   ├── apps/
│   │   ├── web/             # User-facing React app
│   │   └── admin/           # Admin dashboard
│   └── packages/
│       ├── ui/              # Shared UI components
│       ├── api-client/      # TypeScript API client
│       └── types/           # Shared type definitions
│
├── deploy/                   # Docker deployment configs
├── docs/                     # Documentation
└── scripts/                  # Utility scripts
```

## Backend Development

### Setup

```bash
cd backend

# Install all workspace packages
uv sync --all-packages

# Run database migrations
uv run alembic -c packages/database/alembic.ini upgrade head
```

### Running Services

```bash
# Option 1: Run individually
make api      # Start API server (http://localhost:8000)
make worker   # Start background worker

# Option 2: From backend directory
cd backend
uv run uvicorn glean_api.main:app --reload --port 8000
uv run arq glean_worker.main.WorkerSettings
```

### Database Migrations

```bash
# Apply migrations
make db-upgrade

# Create new migration (auto-generate from model changes)
make db-migrate MSG="add_new_field"

# Revert last migration
make db-downgrade

# Reset database (drop, recreate, migrate)
make db-reset
```

### Adding Dependencies

```bash
cd backend

# Add to root workspace
uv add some-package

# Add to specific package
uv add --package glean-core some-package
uv add --package glean-api some-package --dev
```

### Code Quality

```bash
cd backend

# Run linter
uv run ruff check .

# Auto-fix lint issues
uv run ruff check --fix .

# Format code
uv run ruff format .

# Type checking
uv run pyright
```

### Running Tests

```bash
cd backend

# Run all tests
uv run pytest

# Run with coverage
uv run pytest --cov --cov-report=html

# Run specific test file
uv run pytest tests/integration/test_auth_api.py

# Run specific test
uv run pytest tests/integration/test_auth_api.py::test_login -v
```

## Frontend Development

### Setup

```bash
cd frontend

# Install dependencies
pnpm install
```

### Running Development Server

```bash
# Option 1: Run individually
make web      # Start web app (http://localhost:3000)
make admin    # Start admin dashboard (http://localhost:3001)

# Option 2: From frontend directory
cd frontend
pnpm --filter=@glean/web dev
pnpm --filter=@glean/admin dev
```

### Adding Dependencies

```bash
cd frontend

# Add to specific workspace
pnpm --filter=@glean/web add some-package
pnpm --filter=@glean/ui add some-package --save-dev
```

### Code Quality

```bash
cd frontend

# Run ESLint
pnpm lint

# Type checking
pnpm typecheck

# Format code
pnpm format
```

### Building

```bash
cd frontend

# Build all packages
pnpm build

# Build specific app
pnpm --filter=@glean/web build
```

## Common Development Tasks

### Create Admin Account

```bash
# Use default credentials (admin/Admin123!)
cd backend && uv run python ../scripts/create-admin.py

# Custom credentials
cd backend && uv run python ../scripts/create-admin.py \
  --username myadmin \
  --password MySecurePass123! \
  --role super_admin
```

### Adding a New API Endpoint

1. Create/modify router in `backend/apps/api/glean_api/routers/`
2. Register router in `backend/apps/api/glean_api/main.py`
3. Add corresponding types in `frontend/packages/types/`
4. Update API client in `frontend/packages/api-client/`

### Adding Database Models

1. Create model in `backend/packages/database/glean_database/models/`
2. Export from `backend/packages/database/glean_database/models/__init__.py`
3. Create migration: `make db-migrate MSG="add_new_model"`
4. Review generated migration in `packages/database/glean_database/migrations/versions/`
5. Apply migration: `make db-upgrade`

### Adding UI Components

This project uses [COSS UI](https://coss.com/ui/) for UI components.

1. Check if component exists at https://coss.com/ui/docs/components/
2. Get component code from `https://coss.com/ui/r/{component-name}.json`
3. Add to `frontend/packages/ui/src/components/`
4. Export from `frontend/packages/ui/src/components/index.ts`

## Environment Variables

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection URL | `postgresql+asyncpg://glean:devpassword@localhost:5432/glean` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `SECRET_KEY` | JWT signing key | Required in production |
| `CORS_ORIGINS` | Allowed origins (JSON array) | `["http://localhost:3000"]` |
| `DEBUG` | Enable debug mode | `true` |

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8000` |

## Docker Development

### Build Images Locally

```bash
# Build backend image
docker build -t glean-backend ./backend

# Build web frontend
docker build -t glean-web -f frontend/apps/web/Dockerfile ./frontend

# Build admin dashboard
docker build -t glean-admin -f frontend/apps/admin/Dockerfile ./frontend
```

### Run with Docker Compose

```bash
# Development (infrastructure only)
docker compose -f deploy/docker-compose.dev.yml up -d

# Production-like (build from source)
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

## Make Commands Reference

| Command | Description |
|---------|-------------|
| `make up` | Start PostgreSQL & Redis |
| `make down` | Stop Docker services |
| `make logs` | View Docker logs |
| `make dev-all` | Start all dev services |
| `make api` | Start API server |
| `make worker` | Start background worker |
| `make web` | Start web app |
| `make admin` | Start admin dashboard |
| `make test` | Run backend tests |
| `make test-cov` | Run tests with coverage |
| `make lint` | Run all linters |
| `make format` | Format all code |
| `make db-upgrade` | Apply migrations |
| `make db-migrate` | Create new migration |
| `make db-downgrade` | Revert migration |
| `make db-reset` | Reset database |

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :8000

# Kill process
kill -9 <PID>
```

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker compose -f deploy/docker-compose.dev.yml ps

# View logs
docker compose -f deploy/docker-compose.dev.yml logs postgres
```

### Dependency Issues

```bash
# Backend: clear and reinstall
cd backend && rm -rf .venv && uv sync --all-packages

# Frontend: clear and reinstall
cd frontend && rm -rf node_modules && pnpm install
```

### Migration Errors

```bash
# Check current migration state
cd backend && uv run alembic -c packages/database/alembic.ini current

# Show migration history
cd backend && uv run alembic -c packages/database/alembic.ini history

# Reset to clean state (WARNING: deletes all data)
make db-reset
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests: `make test && cd frontend && pnpm lint`
5. Commit: `git commit -m "feat: add my feature"`
6. Push: `git push origin feature/my-feature`
7. Create a Pull Request

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation only
- `style:` Code style (formatting, etc.)
- `refactor:` Code refactoring
- `test:` Adding tests
- `chore:` Maintenance tasks

## Resources

- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [SQLAlchemy 2.0 Documentation](https://docs.sqlalchemy.org/en/20/)
- [React Documentation](https://react.dev/)
- [TanStack Query](https://tanstack.com/query/latest)
- [Tailwind CSS](https://tailwindcss.com/)
- [COSS UI Components](https://coss.com/ui/)

