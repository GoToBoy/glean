# Evaluation: Remove Smart / Discover / Tags

Date: 2026-04-19

## Contract check

- Smart reader mode removed from current runtime paths: pass
- Standalone Discover module removed while keeping feed subscription discovery: pass
- Tags module removed from runtime/API/schema wiring: pass
- Forward database migration added instead of rewriting history: pass
- Docs/support files updated for current behavior: pass

## Quality notes

- The implementation keeps historical migrations intact and adds one new removal migration, which is the safest repository-compatible approach.
- The cleanup reached beyond runtime code into mocks, i18n, tests, and docs, which reduces the chance of dead imports or misleading product references lingering.
- Remaining search hits are either:
  - valid feed discovery references (`/api/feeds/discover`)
  - historical/reference docs
  - unrelated `Tag` usages from BeautifulSoup / git tag terminology / lockfile packages

## Risks / residuals

- Full `frontend/apps/web` vitest is not currently green, but the remaining failures observed are outside the removed modules and appear pre-existing.
- Backend integration verification is still pending in a Python environment with `pytest` installed.
- Some historical reference docs intentionally still mention removed files/features for branch history context.

## Verdict

Acceptable for merge once the migration is applied and backend tests are re-run in the normal dev environment.
