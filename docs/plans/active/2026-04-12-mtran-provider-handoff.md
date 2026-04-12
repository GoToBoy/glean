# MTran Provider Handoff

Date: 2026-04-12

## Summary

The MTran provider now speaks the MTranServer v4 HTTP contract:

- `/translate` sends `text`, `from`, and `to`.
- `/translate/batch` sends `texts`, `from`, and `to`.
- `zh-CN`, `zh-TW`, and related Chinese codes are normalized to `zh`.
- `auto` is preserved as `auto`.
- Repository defaults now use the in-network container endpoint `http://mtranserver:8989`.

The shared translation route remains provider-agnostic: Google, DeepL, OpenAI, and MTran still flow through `create_translation_provider(...).translate_batch(...)`.

## Changed Files

- `backend/packages/core/glean_core/services/translation_providers.py`
- `backend/packages/core/tests/test_translation_providers.py`
- `docker-compose.yml`
- `docker-compose.lite.yml`
- `frontend/apps/web/src/components/tabs/TranslationTab.tsx`
- `README.md`
- `README.zh-CN.md`

## Verification

- `cd backend && uv run pytest packages/core/tests/test_translation_providers.py`
- `cd backend && uv run ruff check packages/core/glean_core/services/translation_providers.py packages/core/tests/test_translation_providers.py`
- NAS live check from `glean-backend` to `http://mtranserver:8989/translate` with `{"from":"auto","to":"zh","text":"Hello world"}` returned `{"result":"你好"}`.

## Notes

- `cd backend && uv run pytest tests/integration/test_translations_api.py` could not run locally because the test database at `127.0.0.1:5433` was unavailable.
- Local Docker was not running, so a temporary `glean-test-postgres` container could not be started for the integration suite.
- Saved user settings with an explicit stale `http://mtranserver:5001` value will still override defaults until the user setting is updated.
