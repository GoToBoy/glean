# Glean 拾灵

A personal knowledge management tool for information-heavy consumers.

> ✅ **M1 Phase Complete** - Full MVP ready! | 🚀 **Ready for Production**

## Overview

Glean (拾灵) is a powerful RSS reader and personal knowledge management tool that helps you efficiently manage information consumption through intelligent preference learning and AI-assisted processing.

## Features

- 📰 **RSS Subscription Management** - Subscribe and organize RSS/Atom feeds
- 📚 **Smart Reading** - Intelligent content recommendations based on your preferences
- 🔖 **Bookmarks** - Save and organize content from feeds or external URLs
- 🤖 **AI Enhancement** - Summarization, tagging, and content analysis
- 🔧 **Rule Engine** - Automate content processing with custom rules
- 🔒 **Self-hosted** - Full data ownership with Docker deployment

## Tech Stack

### Backend
- Python 3.11+
- FastAPI
- SQLAlchemy 2.0 + PostgreSQL
- Redis + arq (task queue)
- uv (package management)

### Frontend
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand + TanStack Query
- pnpm + Turborepo

## Quick Start

### Development Setup

**1. Start infrastructure:**
```bash
make up    # Start PostgreSQL & Redis
```

**2. Start services (3 terminals):**
```bash
make api      # Terminal 1: Backend API (http://localhost:8000)
make worker   # Terminal 2: Background Worker
make web      # Terminal 3: Web App (http://localhost:3000)
```

**3. Access the application:**
- 🌐 Web App: http://localhost:3000
- 📚 API Docs: http://localhost:8000/api/docs
- ❤️ Health: http://localhost:8000/api/health

### Production Deployment

**Using Docker Compose:**

```bash
# 1. Configure environment
cd deploy
cp .env.prod.example .env.prod
# Edit .env.prod with your secure values

# 2. Start all services
docker compose -f deploy/docker-compose.prod.yml --env-file .env.prod up -d --build

# 3. Run migrations
docker exec -it glean-backend uv run alembic -c packages/database/alembic.ini upgrade head

# 4. Access at http://localhost (or your configured domain)
```

📖 **Full deployment guide:** [deploy/README.md](./deploy/README.md)

## Project Structure

```
glean/
├── backend/                 # Python backend
│   ├── apps/
│   │   ├── api/            # FastAPI application
│   │   └── worker/         # Background task worker
│   └── packages/
│       ├── database/       # Database models & migrations
│       ├── core/           # Core business logic
│       └── rss/            # RSS parsing utilities
│
├── frontend/               # TypeScript frontend
│   ├── apps/
│   │   ├── web/           # User-facing web app
│   │   └── admin/         # Admin dashboard
│   └── packages/
│       ├── ui/            # Shared UI components
│       ├── api-client/    # API client SDK
│       └── types/         # Shared type definitions
│
├── deploy/                 # Deployment configurations
│   └── docker-compose.dev.yml
│
└── docs/                   # Documentation
```

## Documentation

### 🚀 Getting Started
- [Deployment Guide](./deploy/README.md) - Production deployment with Docker
- [Development Commands](./CLAUDE.md) - Makefile commands and development workflow
- [Quick Start](./QUICKSTART.md) - 5-minute setup

### 📋 Architecture & Planning
- [PRD (Product Requirements)](./docs/glean-prd-v1.2.md)
- [Architecture Design](./docs/glean-architecture.md)
- [M0 Development Guide](./docs/glean-m0-development-guide.md)
- [M1 Development Guide](./docs/glean-m1-development-guide.md)

### 🎯 Implemented Features (M1)

**Backend:**
- ✅ User authentication (JWT-based)
- ✅ Feed subscription management
- ✅ RSS/Atom feed parsing and fetching
- ✅ Entry storage and retrieval
- ✅ User entry state tracking (read, liked, read later)
- ✅ OPML import/export
- ✅ Background worker for feed updates
- ✅ RESTful API with FastAPI

**Frontend:**
- ✅ User authentication UI (login/register)
- ✅ RSS reader interface
- ✅ Subscription management
- ✅ Entry filtering and pagination
- ✅ Reading pane with content display
- ✅ State management (Zustand + React Query)
- ✅ Responsive design with Tailwind CSS

**Infrastructure:**
- ✅ Docker deployment configuration
- ✅ Database migrations with Alembic
- ✅ Production-ready docker-compose setup
- ✅ Development environment with hot reload

## License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](LICENSE) file for details.
