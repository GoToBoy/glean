# MTran Language Code Contract

## Goal

Stop MTran viewport translation requests for English-to-Chinese content from falling into unsupported auto-detected pairs such as `ha -> en`.

## Scope

- Update `MTranProvider` language normalization and lightweight source detection.
- Add focused provider tests for the production request shape.
- Exclude frontend translation UI changes, feed fetching, worker scheduling, and database changes.

## Done Means

- Glean target language `zh-CN` is sent to MTranServer as `zh-Hans`.
- English text that contains normal article punctuation still sends `from: en` when caller uses `source_language: auto`.
- Mostly English mixed titles with a short Chinese label, such as `中文 Literacy Speedrun II: Character Cyclotron`, still send `from: en`.
- Existing MTran batch chunking and response parsing behavior remains covered.
- Focused backend provider tests pass.

## Risks

- MTranServer exposes multiple compatible APIs, but the native `/translate` and `/translate/batch` docs call out `from`, `to`, and recommend `zh-Hans` for Chinese.
- Source detection is intentionally lightweight; it should override obvious Latin-script English text and mostly-English mixed titles, and otherwise leave `auto`.

## Evaluator Focus

- Verify this remains isolated to `MTranProvider`.
- Verify Chinese-dominant source text still uses `auto` rather than being forced incorrectly.
- Verify no non-MTran providers or public API request/response shapes changed.
