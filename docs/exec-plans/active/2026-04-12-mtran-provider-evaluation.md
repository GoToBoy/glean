# MTran Provider Evaluation

Date: 2026-04-12

## Contract Check

- MTran single translation request uses MTranServer fields `from`, `to`, and `text`: pass.
- MTran batch translation request uses MTranServer fields `from`, `to`, and `texts`: pass.
- MTran single response parses `result`: pass.
- MTran batch response parses `results`: pass.
- Default internal URL is `http://mtranserver:8989`: pass.
- Google, DeepL, and OpenAI provider selection and batch interfaces are unchanged: pass by inspection.

## Test Results

- Provider unit tests: pass, `11 passed`.
- Ruff on changed backend provider/test files: pass.
- API integration suite: blocked by missing local Postgres on `127.0.0.1:5433`, before test assertions.

## Risk Review

- The live NAS MTranServer accepts `from:auto`, so preserving `auto` is compatible with the deployed service.
- MTran `translation_model` is still stored on `MTranProvider` for settings compatibility, but is no longer sent in the MTranServer payload because the deployed API contract does not require it.
- Frontend Today Board can still initiate multiple translation batches when both viewport and board-wide triggers run; backend correctness no longer depends on fallback to Google for MTran requests, but frontend request deduplication remains a separate performance issue.
