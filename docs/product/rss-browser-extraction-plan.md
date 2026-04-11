# RSS Browser Extraction Plan

## Goal

Provide a general-purpose RSS article acquisition pipeline that can store full article content even when:

- RSS only exposes `description` / summary
- article pages require JavaScript rendering
- article pages return anti-bot challenge HTML to plain HTTP clients

The current `glean` flow already does RSS parsing and HTTP full-text fallback, but it fails on sites like `openai.com/news/rss.xml` because the article URL returns a Cloudflare challenge page to the current `httpx` client.

## Current Flow

### Existing entry path

1. Worker fetches the feed in `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`
2. RSS/Atom is parsed in `backend/packages/rss/glean_rss/parser.py`
3. If an entry does not contain full content, worker calls `fetch_and_extract_fulltext(url)`
4. `fetch_and_extract_fulltext()` in `backend/packages/rss/glean_rss/extractor.py`:
   - requests the article with `httpx`
   - runs `readability-lxml`
   - returns `None` on any exception
5. Worker falls back to RSS summary when extraction returns `None`

### Confirmed failure mode for OpenAI News

Running the current code path against `https://openai.com/news/rss.xml` shows:

- RSS fetch succeeds
- parser marks the entry as `has_full_content = False`
- article URL fetch returns `403`
- body is challenge HTML: `Enable JavaScript and cookies to continue`
- extraction therefore returns `None`
- worker stores RSS summary instead of full article

## Target Architecture

Keep the worker call site unchanged and upgrade the extractor into a layered acquisition pipeline.

### New pipeline

1. Feed content layer
   - If RSS/Atom already contains full content, use it directly.

2. HTTP acquisition layer
   - Fetch article HTML with `httpx`
   - Run lightweight extraction:
     - `readability-lxml`
     - semantic container extraction: `article`, `main`, `[role=main]`
     - JSON-LD `articleBody`

3. Browser acquisition layer
   - If HTTP fetch is blocked or extraction quality is poor, use Playwright to render the page
   - Extract `page.content()` after render
   - Reuse the same extraction pipeline on rendered HTML

4. Summary fallback layer
   - Only if all extraction paths fail, store the RSS summary

## Design Principles

### 1. Browser is a fallback, not the default

Using Playwright for every article would:

- reduce feed throughput significantly
- raise CPU and memory usage in the worker
- increase timeout risk
- make bulk feed sync less predictable

The browser path should only activate on failure signals.

### 2. One extraction pipeline for all HTML

Whether HTML comes from plain HTTP or Playwright, it should flow through one shared extractor. This avoids duplicated content-cleaning logic.

### 3. Return structured extraction results

Replace plain `str | None` with a structured result object so the worker can log and debug failures.

Suggested shape:

```python
@dataclass
class ExtractionResult:
    content: str
    method: str
    fetched_url: str
    status_code: int | None = None
    challenge_detected: bool = False
    used_browser: bool = False
    failure_reason: str | None = None
```

## Planned Code Changes

### A. Extractor refactor

Main file: `backend/packages/rss/glean_rss/extractor.py`

Add internal helpers:

- `_fetch_html_http(url) -> FetchResult`
- `_fetch_html_browser(url) -> FetchResult`
- `_extract_from_html(html, url) -> str | None`
- `_looks_like_challenge_page(html, status_code, headers) -> bool`
- `_looks_like_shell_page(html) -> bool`
- `_extract_semantic_html(html) -> str | None`
- `_extract_json_ld_article_body(html) -> str | None`

Keep a single public entrypoint:

- `fetch_and_extract_fulltext(url) -> ExtractionResult | None`

### B. Worker integration

Main file: `backend/apps/worker/glean_worker/tasks/feed_fetcher.py`

Changes:

- Continue calling one extractor entrypoint only
- Log structured extraction details
- When extraction fails, keep current summary fallback behavior
- Optionally persist extraction method metadata later

### C. Parser

Main file: `backend/packages/rss/glean_rss/parser.py`

No architecture change required for the browser plan itself. Parser should continue deciding whether the feed already contains full content.

## Browser Fallback Trigger Conditions

Trigger Playwright when any of the following is true:

- HTTP response status is `401`, `403`, `429`, or `503`
- challenge markers exist in HTML
  - `Enable JavaScript and cookies to continue`
  - Cloudflare or anti-bot challenge DOM markers
- HTTP extraction returns empty content
- fetched HTML is obviously shell content with no meaningful body

## Playwright Runtime Plan

### Python dependency

Add Playwright to the backend runtime dependency set used by the worker image.

### Docker image

The worker cannot rely on Compose alone. The image must contain:

- Python `playwright` package
- browser binary, likely Chromium
- required system libraries for headless browser execution

Current backend image is built from `backend/Dockerfile`, and both API and worker use it today.

Recommended deployment direction:

- keep `backend` on the lighter existing image if possible
- create a dedicated worker-capable image with Playwright baked in
- switch the `worker` service to that image

If maintaining one shared image is preferred, it will still work, but the API image will become larger.

## Dockerfile Change Plan

Main file: `backend/Dockerfile`

Required changes:

1. install OS packages needed by Playwright/Chromium
2. install Python Playwright dependency via existing `uv sync`
3. run browser installation during image build
   - e.g. `playwright install chromium`

Potential split:

- `backend/Dockerfile` remains current API-friendly image
- add a worker-specific Dockerfile for browser extraction if image size matters

## Compose Impact

Official `docker-compose.yml` should remain generic.

Personal deployment file can carry the deployment-specific image references. For browser extraction, the future compose change is minimal:

- `backend` may keep current image
- `worker` should point to a Playwright-enabled image

Environment variables that may be introduced later:

- `BROWSER_EXTRACTION_ENABLED=true`
- `BROWSER_EXTRACTION_TIMEOUT_SECONDS=30`
- `BROWSER_EXTRACTION_MAX_CONCURRENCY=2`

## Operational Safeguards

### Timeouts

- HTTP fetch timeout
- browser navigation timeout
- total extraction timeout per article

### Concurrency control

Limit browser extraction concurrency to avoid exhausting worker memory.

### Resource blocking

In Playwright, block images, fonts, video, and other non-essential resources where possible.

### Logging

Add structured logs for:

- article URL
- HTTP status
- challenge detection result
- extraction method used
- content length
- final fallback reason

## Testing Plan

### Unit tests

Files:

- `backend/packages/rss/tests/test_extractor.py`
- `backend/apps/worker/tests/test_feed_fetcher.py`

Add cases for:

- HTTP extraction success
- HTTP challenge page detection
- semantic extraction from rendered HTML
- browser fallback path invoked
- final summary fallback when both HTTP and browser fail

### Integration tests

Prefer mocked browser/network tests first. Real-site integration tests are likely too flaky for CI.

## Rollout Plan

1. Refactor extractor to return structured results
2. Add lightweight challenge detection and semantic extraction
3. Integrate Playwright fallback in extractor
4. Build browser-capable worker image
5. Point personal deployment worker service to the new image
6. Validate with blocked sources such as OpenAI News

## Expected Outcome

For feeds like `https://openai.com/news/rss.xml`:

- RSS fetch still succeeds
- entry still starts from summary-only metadata
- plain HTTP article fetch is detected as blocked
- browser fallback renders the page
- rendered HTML is extracted and stored as full content

If rendering still fails, the system keeps the current safe fallback: store RSS summary instead of dropping the item.
