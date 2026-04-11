# Development Guide

This is the short entrypoint for local development.

## Start Here

- Repository docs index: [docs/index.md](./docs/index.md)
- Local runtime harness: [docs/operations/local-harness.md](./docs/operations/local-harness.md)
- Backend development guide: [backend/CLAUDE.md](./backend/CLAUDE.md)
- Frontend development guide: [frontend/CLAUDE.md](./frontend/CLAUDE.md)

## Preferred Local Startup

```bash
python3 -m harness up
python3 -m harness status
python3 -m harness health
python3 -m harness doctor
python3 -m harness snapshot
python3 -m harness instances
```

Stop everything with:

```bash
python3 -m harness down
```

## Direct Commands Still Available

```bash
make up
make api
make worker
make web
make admin
make test
make lint
```
