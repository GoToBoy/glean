# Translation Batch Stability

## Problem

- Today Board list translation could send a large number of title and summary strings in one `translateTexts` call.
- The API then forwarded the whole uncached payload to the configured provider.
- With `mtran`, a healthy server could still fail a single oversized `/translate/batch` request, as seen with a 199-item payload.

## Changes

- Frontend list translation now chunks uncached text requests at 24 strings per API call.
- `MTranProvider.translate_batch` now chunks provider batch requests at 24 strings per `/translate/batch` call.
- Added frontend coverage proving large Today Board list translation requests are split.
- Added backend provider coverage proving large mtran payloads are split into `[24, 6]` for a 30-item request.

## Verification

- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx`
- `pnpm --filter @glean/web test -- src/__tests__/pages/reader/todayBoard.test.ts src/__tests__/pages/reader/todayBoard.interaction.test.tsx src/__tests__/pages/reader/ReaderCore.todayBoard.test.tsx src/__tests__/components/Layout.todayBoardMobile.test.tsx`
- `pnpm --filter @glean/web typecheck`
- `pnpm --filter @glean/web lint`
- `backend/.venv/bin/python -m ruff check backend/packages/core/glean_core/services/translation_providers.py backend/packages/core/tests/test_translation_providers.py`
- `backend/.venv/bin/python -m pytest backend/packages/core/tests/test_translation_providers.py -q`
