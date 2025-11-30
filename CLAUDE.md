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

### Development Servers

**Option 1: Start all services concurrently (recommended):**
```bash
make dev-all         # Start API + Worker + Web concurrently using concurrently
npm run dev          # Alternative: use npm script directly
npm run dev:all      # Start all services including admin dashboard
```

**Option 2: Run in separate terminals:**
```bash
make api             # Start FastAPI server (http://localhost:8000)
make worker          # Start arq background worker
make web             # Start React web app (http://localhost:3000)
make admin           # Start admin dashboard (http://localhost:3001)
```

**Note**: The project uses `concurrently` to run multiple services in a single terminal. Install root dependencies with `npm install` to use `make dev-all`.

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
# Root: npm (for concurrently tool)
npm install                               # Install concurrently for dev-all command

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
  - Port 3001
  - Requires admin account to access
  - Create admin account: `cd backend && uv run python ../scripts/create-admin.py`

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

## Project Layout

```
glean/                              # Project root
├── .env                          # Environment configuration
├── .env.example                  # Environment template
├── .github/                      # GitHub Actions workflows
├── .gitignore                    # Git ignore patterns
├── CLAUDE.md                     # This file - Claude Code guidance
├── LICENSE                       # Project license
├── Makefile                      # Development commands
├── README.md                     # Project documentation
├── backend/                      # Python backend monorepo
│   ├── apps/                     # Deployable applications
│   │   ├── api/                  # FastAPI REST API server
│   │   │   ├── glean_api/        # API source code
│   │   │   │   ├── middleware/   # Custom middleware
│   │   │   │   └── routers/      # API route handlers
│   │   │   │       ├── auth.py   # Authentication endpoints
│   │   │   │       ├── feeds.py   # RSS feed endpoints
│   │   │   │       ├── entries.py # Article/entry endpoints
│   │   │   │       └── admin.py   # Admin endpoints
│   │   │   └── tests/            # API tests
│   │   └── worker/               # Background task worker
│   │       ├── glean_worker/     # Worker source code
│   │       │   └── tasks/        # Background task functions
│   │       └── tests/            # Worker tests
│   ├── packages/                 # Shared backend libraries
│   │   ├── database/             # SQLAlchemy models & migrations
│   │   │   ├── glean_database/
│   │   │   │   ├── models/       # SQLAlchemy model definitions
│   │   │   │   ├── migrations/   # Alembic migration scripts
│   │   │   │   │   └── versions/  # Generated migration files
│   │   │   │   └── session.py    # Database session management
│   │   │   └── alembic.ini       # Alembic configuration
│   │   ├── core/                 # Business logic & domain services
│   │   │   ├── glean_core/
│   │   │   │   ├── auth/         # Authentication utilities
│   │   │   │   ├── schemas/      # Pydantic data models
│   │   │   │   └── services/     # Business logic services
│   │   │   └── pyproject.toml    # Core package configuration
│   │   └── rss/                  # RSS/Atom parsing utilities
│   │       ├── glean_rss/        # RSS parsing source code
│   │       └── pyproject.toml    # RSS package configuration
│   ├── tests/                    # Backend test suites
│   ├── Dockerfile                # Backend container definition
│   └── pyproject.toml            # Backend workspace configuration
├── frontend/                     # TypeScript frontend monorepo
│   ├── apps/                     # Frontend applications
│   │   ├── web/                  # Main React web app
│   │   │   ├── src/
│   │   │   │   ├── components/   # React components
│   │   │   │   ├── pages/        # Page components
│   │   │   │   ├── hooks/        # Custom React hooks
│   │   │   │   ├── stores/       # Zustand state stores
│   │   │   │   ├── lib/          # Utility functions
│   │   │   │   └── styles/       # CSS/Tailwind styles
│   │   │   ├── public/           # Static assets
│   │   │   ├── tests/            # Component and hook tests
│   │   │   ├── Dockerfile        # Web app container
│   │   │   ├── index.html        # HTML template
│   │   │   ├── nginx.conf        # Nginx configuration
│   │   │   ├── package.json      # Dependencies and scripts
│   │   │   ├── tailwind.config.ts # Tailwind CSS configuration
│   │   │   ├── tsconfig.json     # TypeScript configuration
│   │   │   ├── vite.config.ts    # Vite build configuration
│   │   │   └── postcss.config.js # PostCSS configuration
│   │   └── admin/                # Admin dashboard app
│   │       └── src/              # Admin app source structure
│   │           ├── components/   # Admin-specific components
│   │           ├── hooks/         # Admin-specific hooks
│   │           ├── pages/         # Admin page components
│   │           ├── stores/        # Admin state management
│   │           └── lib/           # Admin utilities
│   ├── packages/                 # Shared frontend libraries
│   │   ├── ui/                   # Shared React components
│   │   │   ├── src/
│   │   │   │   ├── components/   # Reusable UI components
│   │   │   │   └── utils/        # UI utility functions
│   │   │   └── package.json     # UI package configuration
│   │   ├── api-client/           # TypeScript API client SDK
│   │   │   ├── src/
│   │   │   │   └── services/     # API service functions
│   │   │   │       ├── auth.ts   # Authentication API calls
│   │   │   │       ├── feeds.ts  # Feed management API calls
│   │   │   │       └── entries.ts # Entry management API calls
│   │   │   └── package.json     # API client configuration
│   │   └── types/                # Shared TypeScript types
│   │       ├── src/
│   │       │   ├── models.ts     # Data model type definitions
│   │       │   └── api.ts        # API request/response types
│   │       └── package.json     # Types package configuration
│   ├── .eslintrc.cjs             # ESLint configuration
│   ├── .prettierrc               # Prettier formatting rules
│   ├── package.json              # Frontend workspace configuration
│   ├── pnpm-workspace.yaml       # pnpm workspace definition
│   ├── pnpm-lock.yaml            # pnpm lockfile
│   └── turbo.json                # Turborepo task configuration
├── deploy/                       # Deployment configurations
│   ├── docker-compose.dev.yml    # Development stack
│   ├── docker-compose.prod.yml   # Production stack
│   ├── docker/                   # Container build files
│   ├── .env.prod.example         # Production environment template
│   └── README.md                 # Deployment documentation
├── docs/                         # Project documentation
└── scripts/                      # Utility scripts
```

### Key Directory Relationships

- **Backend Apps → Packages**: `api` and `worker` depend on `core`, `database`, and `rss` packages
- **Frontend Apps → Packages**: `web` and `admin` depend on `ui`, `api-client`, and `types` packages
- **Database Flow**: `api` → `core` → `database` ← `rss` ← `worker`
- **Frontend Flow**: `apps` → `packages` (shared dependencies)

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

### Executing Commands
- Note that this project uses monorepo structure, so you need to check your current working directory before executing commands.
- Use `uv` instead of `python` to avoid virtual environment issues.

### Test Account
- Always use this account for automated testing
- email: claude.test@example.com
- password: TestPass123!
- feed: https://ameow.xyz/feed.xml

### Admin Dashboard Access
- **URL**: http://localhost:3001
- **Create admin account**: `cd backend && uv run python ../scripts/create-admin.py`
- **Default credentials**: admin / Admin123! (if using default script)
- **Requirements**: 
  - API server must be running (port 8000)
  - Admin service must be running (port 3001)
  - Admin account must exist in database

### MCPs
- When debugging frontend issues, use chrome-devtools to help you

### UI Components

**IMPORTANT**: This project uses [COSS UI](https://coss.com/ui/) for UI components. 

- **When adding new components**: Always check COSS UI first at https://coss.com/ui/docs/components/
- **Component library**: 50+ components including Button, Input, Alert, Dialog, Table, etc.
- **Documentation**: `https://coss.com/ui/llms.txt` (optimized for LLMs)
- **Installation**: Components are added to `frontend/packages/ui/src/components/`
- **Dependencies**: Built on Base UI and Tailwind CSS, uses `class-variance-authority` for variants

Available components include: Accordion, Alert, Alert Dialog, Autocomplete, Avatar, Badge, Breadcrumb, Button, Card, Checkbox, Combobox, Dialog, Form, Input, Label, Menu, Popover, Select, Table, Tabs, Toast, Tooltip, and more.

To add a new component:
1. Visit https://coss.com/ui/r/{component-name}.json to get the component code
2. Copy the component to `frontend/packages/ui/src/components/`
3. Export it from `frontend/packages/ui/src/components/index.ts`
4. Update imports in your pages to use `@glean/ui`

### Frontend Design System

**CRITICAL**: All frontend development MUST follow the design system documented in `docs/design.md`.

**Key Design Principles**:
- **Warm Dark Theme**: Default theme with amber (`hsl(38 92% 50%)`) as primary color
- **Typography**: DM Sans for UI/headings, Crimson Pro for reading content
- **Color Variables**: Always use CSS variables (e.g., `hsl(var(--primary))`) instead of hard-coded colors
- **Animations**: Fade In (400ms), Slide In (300ms), Pulse Glow (2s) - use sparingly
- **Spacing**: 4px base unit, consistent border radius (--radius-lg: 0.75rem)
- **Reading Experience**: Max-width 3xl (768px), generous line-height (1.75) for prose

**Component Styling Guidelines**:
- Buttons: Primary (with glow effect), Ghost (transparent), Outline (bordered)
- Cards: Glass morphism effect with `backdrop-filter: blur(16px)`
- Navigation: Collapsible sidebar (72px ↔ 256px), active state with primary/10 background
- Lists: Stagger animations with 50ms delay increments
- Focus states: Custom focus ring with 4px ring in primary color

**Color Usage**:
```tsx
// ✅ Correct - Use semantic color variables
className="bg-primary text-primary-foreground"
className="text-muted-foreground hover:text-foreground"

// ❌ Incorrect - Hard-coded colors
className="bg-amber-500 text-slate-900"
className="text-gray-600 hover:text-black"
```

**Typography Usage**:
```tsx
// ✅ Correct - Semantic font classes
<h1 className="font-display text-2xl font-bold">Heading</h1>
<article className="prose font-reading">Content</article>

// ❌ Incorrect - Generic fonts
<h1 className="text-2xl font-bold">Heading</h1>
<article className="text-lg">Content</article>
```

**Animation Usage**:
```tsx
// ✅ Correct - Use predefined animations
<div className="animate-fade-in">Content</div>
<div className="stagger-children">{items}</div>

// ❌ Incorrect - Custom animations without coordination
<div className="animate-bounce">Content</div>
```

**Component Patterns**:
- Glass effect: Use `.glass` class for modal overlays
- Card hover: Use `.card-hover` class for interactive cards
- Button glow: Use `.btn-glow` class for primary action buttons
- Unread indicators: 2px rounded dot with primary color and shadow

Refer to `docs/design.md` for complete color palettes, spacing scales, component patterns, and accessibility guidelines.