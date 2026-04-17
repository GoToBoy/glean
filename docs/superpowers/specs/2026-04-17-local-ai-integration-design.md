# Local AI Integration Design

Date: 2026-04-17

## Goal

Add REST APIs and UI wiring so a local AI system can:

- fetch the current user's 今日收录 article list for a local day
- fetch full article details only when needed
- write back a day-level AI summary
- write back per-entry AI supplements
- let the reader choose between the AI summary view and the existing 今日收录 list/detail view

This design targets local AI systems that can call HTTP endpoints with a bearer token. MCP integration is intentionally out of scope for this phase.

## Existing Context

今日收录 already exists as the `today-board` reader view. The web client fetches a bounded aggregate through `GET /api/entries/today`, and membership is based on collection time using `entries.ingested_at` with fallbacks inside `EntryService`.

The repository already has API tokens named with the `glean_` prefix. They are used by the MCP server and map a token to a user. The new REST AI endpoints should reuse that token mechanism instead of introducing a second shared secret format.

## Approach

Use a dedicated REST router under `/api/ai/*`.

The AI router should be separate from the existing reader-oriented `/api/entries/*` endpoints because it has a different contract:

- it accepts API tokens, not browser JWT sessions
- it is optimized for local AI batch retrieval
- it returns stable AI-oriented payloads
- it supports writeback of generated data
- it is gated by a system-level AI integration config

The existing `/api/entries/today` endpoint remains the reader UI's aggregate endpoint.

## Authentication

AI endpoints require:

```http
Authorization: Bearer glean_xxx
```

Request handling:

1. Extract bearer token.
2. Verify it through `APITokenService`.
3. Resolve the token owner `user_id`.
4. Update token `last_used_at`.
5. Check `AIIntegrationConfig.enabled`.
6. Authorize all reads and writes to the token owner's subscriptions and AI records.

普通前端 JWT should not be accepted for AI write APIs. This keeps the local AI integration explicit and auditable.

## System Configuration

Add typed config schema:

```python
class AIIntegrationConfig(BaseModel):
    NAMESPACE: ClassVar[str] = "ai_integration"

    enabled: bool = False
    allow_today_entries_api: bool = True
    allow_entry_detail_api: bool = True
    allow_ai_writeback: bool = True
    default_today_view: Literal["list", "ai_summary"] = "list"
```

Admin settings should expose:

- Enable local AI integration
- Allow AI to fetch today's article list
- Allow AI to fetch full article details
- Allow AI to write summaries and supplements
- 今日收录 default view: `AI 总结` or `收录列表`
- API token instructions that point users to the existing API token flow

Do not store a plaintext API token in `system_configs`. API tokens are only shown once when created.

## Data Model

Add `ai_daily_summaries`.

Fields:

- `id`
- `user_id`
- `summary_date`
- `timezone`
- `title`
- `summary`
- `highlights` JSONB
- `topics` JSONB
- `recommended_entry_ids` JSONB
- `model`
- `metadata_json` JSONB
- `created_at`
- `updated_at`

Constraints:

- unique `user_id + summary_date + timezone`
- foreign key `user_id -> users.id`

Add `ai_entry_supplements`.

Fields:

- `id`
- `user_id`
- `entry_id`
- `summary`
- `key_points` JSONB
- `tags` JSONB
- `reading_priority`
- `reason`
- `model`
- `metadata_json` JSONB
- `created_at`
- `updated_at`

Constraints:

- unique `user_id + entry_id`
- foreign key `user_id -> users.id`
- foreign key `entry_id -> entries.id`

AI-generated content must not overwrite `entries.summary` or `entries.content`. Those fields represent fetched source content, while AI summaries are user-scoped derived data.

API payloads may expose this field as `metadata`, but the ORM/database field should use `metadata_json` to avoid colliding with SQLAlchemy's declarative `metadata` attribute.

## REST API

### Get Today's Entries

```http
GET /api/ai/today-entries?date=2026-04-17&timezone=America/Los_Angeles&include_summary=true&include_content=false&limit=500
Authorization: Bearer glean_xxx
```

Semantics:

- `date` is a local date in the requested timezone.
- The server converts it to a `[start, end)` UTC range.
- Membership is based on collection time: `Entry.ingested_at`, falling back consistently with `EntryService`.
- Only entries from feeds the token owner subscribes to are returned.
- `include_content=false` is the default. The local AI should fetch details for selected entries through the detail endpoint.
- `limit` is bounded, default 500 and max 500.

Response:

```json
{
  "date": "2026-04-17",
  "timezone": "America/Los_Angeles",
  "total": 42,
  "items": [
    {
      "id": "entry-id",
      "title": "Article title",
      "url": "https://example.com/article",
      "author": "Author",
      "feed_id": "feed-id",
      "feed_title": "Feed title",
      "published_at": "2026-04-17T08:20:00Z",
      "ingested_at": "2026-04-17T09:10:00Z",
      "summary": "RSS summary or excerpt",
      "content": null,
      "content_available": true,
      "is_read": false,
      "is_bookmarked": false,
      "ai_supplement_available": true
    }
  ]
}
```

### Get Entry Detail

```http
GET /api/ai/entries/{entry_id}
Authorization: Bearer glean_xxx
```

Semantics:

- Requires `allow_entry_detail_api`.
- Verifies the token owner subscribes to the entry's feed.
- Returns source content and existing AI supplement if one exists.

Response:

```json
{
  "id": "entry-id",
  "title": "Article title",
  "url": "https://example.com/article",
  "author": "Author",
  "feed_id": "feed-id",
  "feed_title": "Feed title",
  "published_at": "2026-04-17T08:20:00Z",
  "ingested_at": "2026-04-17T09:10:00Z",
  "summary": "RSS summary or excerpt",
  "content": "<article html>",
  "content_source": "backfill_http",
  "ai_supplement": null
}
```

### Upsert Day Summary

```http
PUT /api/ai/today-summary
Authorization: Bearer glean_xxx
Content-Type: application/json
```

Request:

```json
{
  "date": "2026-04-17",
  "timezone": "America/Los_Angeles",
  "model": "local-qwen",
  "title": "今日重点",
  "summary": "今天值得关注的是...",
  "highlights": [
    {
      "entry_id": "entry-id",
      "title": "Article title",
      "reason": "为什么重要"
    }
  ],
  "topics": [
    {
      "name": "AI",
      "entry_ids": ["entry-id-1", "entry-id-2"]
    }
  ],
  "recommended_entry_ids": ["entry-id-1", "entry-id-2"],
  "metadata": {
    "generated_by": "local-ai",
    "prompt_version": "v1"
  }
}
```

Semantics:

- Requires `allow_ai_writeback`.
- Upserts by `user_id + date + timezone`.
- The service should validate referenced `entry_id` values belong to the token owner's subscribed feeds.

### Get Day Summary

```http
GET /api/ai/today-summary?date=2026-04-17&timezone=America/Los_Angeles
```

Reader UI may use normal JWT auth for this read endpoint, while local AI may use API token auth. The returned record is scoped to the requesting user.

### Upsert Entry Supplement

```http
PUT /api/ai/entries/{entry_id}/supplement
Authorization: Bearer glean_xxx
Content-Type: application/json
```

Request:

```json
{
  "model": "local-qwen",
  "summary": "这篇文章主要讲...",
  "key_points": ["要点一", "要点二"],
  "tags": ["AI", "产品"],
  "reading_priority": "high",
  "reason": "和你的近期关注高度相关",
  "metadata": {
    "generated_by": "local-ai"
  }
}
```

Semantics:

- Requires `allow_ai_writeback`.
- Verifies the token owner subscribes to the entry's feed.
- Upserts by `user_id + entry_id`.

### Get Entry Supplement

```http
GET /api/ai/entries/{entry_id}/supplement
```

Reader UI may use normal JWT auth for this read endpoint, while local AI may use API token auth. The returned record is scoped to the requesting user.

## Frontend Reader Behavior

今日收录 gets an AI entrance without replacing the existing list/detail workflow.

UI behavior:

- Show two modes inside 今日收录: `AI 总结` and `收录列表`.
- If `AIIntegrationConfig.default_today_view == "ai_summary"`, open 今日收录 in AI summary mode by default.
- If config is `list`, preserve the existing 今日收录 board behavior.
- If no summary has been generated for the selected date, show an empty state that says local AI has not written a summary yet.
- Highlight cards and recommended entries from AI summary can open the existing article detail pane.
- Per-entry AI supplements may appear inside the detail pane as a compact section above or below the original article summary.

URL state should remain compatible with the current route:

- `/reader?view=today-board` keeps today's board.
- The local UI mode may be stored as `ai=summary` or `ai=list`, or kept in local component state if the team chooses not to make it shareable.
- Historical date behavior should keep using the existing `date=YYYY-MM-DD` parameter.

## Admin Behavior

Add a Local AI Integration section to the existing system settings surface.

The token area should not ask admins to paste a token into system config. It should either:

- link users to the existing API Tokens tab, or
- create a named token through the existing API token service and show it once

The initial implementation can use the link/instructions approach to avoid coupling admin settings to per-user token creation.

## Error Handling

Expected errors:

- `401`: missing or invalid bearer token
- `403`: AI integration disabled or the specific capability is disabled
- `404`: entry or summary not found for the requesting user
- `422`: invalid date, timezone, payload shape, or referenced entry IDs

Timezone handling:

- Require an IANA timezone string for AI list and summary endpoints.
- Invalid timezones return `422`.
- Default may be the server's configured worker timezone only if a future system setting exposes it clearly. The first implementation should require explicit timezone from the client to avoid hidden day-boundary bugs.

## Testing

Backend tests:

- API token authentication succeeds for valid `glean_` token and fails for JWT or invalid token.
- `GET /api/ai/today-entries` filters by `ingested_at` collection day, not `published_at`.
- Today's entries only include feeds subscribed by the token owner.
- Config `enabled=false` returns `403`.
- Capability switches return `403` for disabled operations.
- Day summary upsert is idempotent by `user_id + date + timezone`.
- Entry supplement upsert is idempotent by `user_id + entry_id`.
- Writeback rejects referenced entries outside the user's subscriptions.

Frontend tests:

- 今日收录 defaults to AI summary mode when config says `ai_summary`.
- 今日收录 preserves existing list mode when config says `list`.
- Missing AI summary renders empty state, not an article load error.
- Clicking an AI summary recommendation opens the existing article detail.

Admin tests:

- Local AI config loads, edits, and saves.
- Token instructions are visible and do not expose stored plaintext tokens.

## Non-Goals

- No MCP tool changes in this phase.
- No automatic AI execution job inside Glean.
- No queue or worker changes for AI generation.
- No replacement of original RSS article content.
- No multi-user shared AI summaries.

## Open Decisions For Implementation

- Whether reader UI mode should be shareable in the URL as `ai=summary`.
- Whether per-entry AI supplements should be shown in the article detail by default or behind a collapsible section.
- Whether the admin UI should link to user token management or provide a one-click token creation flow later.
