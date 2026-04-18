# Implementation Handoff

## What Changed

- MTran Chinese language normalization now sends `zh-Hans` for Glean Chinese variants such as `zh-CN`.
- MTran auto-source detection now classifies obvious Latin-script article text as `en` even when the text contains normal Unicode punctuation such as en dashes.
- Mostly English mixed titles with short Chinese labels now classify as `en`.
- Added focused provider tests for both payload behaviors.

## Files Touched

- `backend/packages/core/glean_core/services/translation_providers.py`
- `backend/packages/core/tests/test_translation_providers.py`
- `docs/exec-plans/active/2026-04-18-mtran-language-code-contract.md`

## Verification Run

- `uv run pytest packages/core/tests/test_translation_providers.py -q`
  - 14 passed, 1 existing FastAPI `regex` deprecation warning
- Manual payload probe for the supplied 24-title sample
  - every title produced `from: en`, `to: zh-Hans`
- `uv run ruff check packages/core/glean_core/services/translation_providers.py packages/core/tests/test_translation_providers.py`
  - all checks passed

## Known Gaps

- Did not boot a live MTranServer container; verification uses adapter-level payload assertions.
- Did not change frontend request shape because the supplied request already correctly asks for `target_language: "zh-CN"` and `source_language: "auto"`.

## Reviewer Focus

- Confirm the change is isolated to `MTranProvider`.
- Confirm Chinese-dominant text under `source_language: auto` still remains `from: auto`.
- Confirm non-MTran providers are unaffected.
