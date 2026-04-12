# MTran Provider Contract

## Goal

Make the MTran translation provider work against the deployed MTranServer v4 API while preserving the existing provider-neutral `/api/entries/translate-texts` contract.

## Scope

- Update the MTran provider adapter to translate Glean's provider-neutral source/target inputs into MTranServer request fields.
- Update default MTran base URLs and Docker port wiring from `5001` to `8989`.
- Keep Google, DeepL, OpenAI, and public Glean API request/response shapes unchanged.

## Done Means

- MTran single and batch provider tests assert `from`/`to` request payloads and `result`/`results` response parsing.
- MTran defaults use `http://mtranserver:8989`.
- Existing translation provider behavior remains covered by focused tests.
- Focused backend tests and lint pass.

## Risks

- `auto` source language is accepted by Glean callers but MTranServer expects concrete short language codes.
- Existing saved user settings may still contain stale `http://mtranserver:5001` values.
- Compose changes alter deployment defaults and must match current MTranServer image behavior.

## Evaluator Focus

- Verify MTran does not fall back to Google when `http://mtranserver:8989` is reachable.
- Verify provider-specific payload mapping is isolated to `MTranProvider`.
- Verify defaults are consistent across backend, compose, docs, and settings UI.
