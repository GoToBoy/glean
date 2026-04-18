# Local AI API Reference

This document is written for local AI agents that read Today's Intake and write AI summaries back to Glean.

## Core Rules

- Use `Authorization: Bearer <GLEAN_API_TOKEN>` for all `/api/ai/*` calls.
- Do not send browser timezone as identity. Daily summary and Today entries are keyed by the server-configured timezone.
- Use the server date from `GET /api/system/time` when deciding the default day to process.
- Send dates as `YYYY-MM-DD`.
- Treat the `timezone` field in AI summary write payloads and old query examples as deprecated. The server ignores client timezone for lookup/write identity and returns the server timezone in responses.
- Entry IDs referenced in summary writeback must belong to feeds subscribed by the token owner.

## Get Server Date

Use this before generating a Today summary.

```http
GET /api/system/time
Authorization: Bearer <GLEAN_API_TOKEN>
```

Response:

```json
{
  "timezone": "America/Los_Angeles",
  "current_time": "2026-04-18T06:40:00-07:00",
  "current_date": "2026-04-18"
}
```

Use `current_date` as the default `date` for `/api/ai/today-entries` and `/api/ai/today-summary`.

## List Today Entries

```http
GET /api/ai/today-entries?date=2026-04-18&include_content=false&limit=500
Authorization: Bearer <GLEAN_API_TOKEN>
```

Query parameters:

- `date`: required server-local date, `YYYY-MM-DD`.
- `include_content`: optional boolean. Default `false`. Use `true` only when the local model needs full entry content.
- `limit`: optional integer, `1..500`. Default `500`.
- `timezone`: deprecated and ignored for date-window identity.

The server converts `date` into a UTC half-open collection window using the server timezone, then returns entries collected in that window.

Response shape:

```json
{
  "date": "2026-04-18",
  "timezone": "America/Los_Angeles",
  "total": 2,
  "items": [
    {
      "id": "entry-id",
      "title": "Entry title",
      "url": "https://example.com/article",
      "author": null,
      "feed_id": "feed-id",
      "feed_title": "Feed title",
      "published_at": "2026-04-18T10:00:00Z",
      "ingested_at": "2026-04-18T13:00:00Z",
      "summary": "Short summary",
      "content": null,
      "content_available": true,
      "is_read": false,
      "is_bookmarked": false,
      "ai_supplement_available": false
    }
  ]
}
```

## Get Entry Detail

```http
GET /api/ai/entries/{entry_id}
Authorization: Bearer <GLEAN_API_TOKEN>
```

Use this when the Today list item has `content_available: true` but `content` is omitted, or when the model needs complete article text.

Response shape:

```json
{
  "id": "entry-id",
  "title": "Entry title",
  "url": "https://example.com/article",
  "author": null,
  "feed_id": "feed-id",
  "feed_title": "Feed title",
  "published_at": "2026-04-18T10:00:00Z",
  "ingested_at": "2026-04-18T13:00:00Z",
  "summary": "Short summary",
  "content": "Full article content",
  "content_source": "extracted",
  "ai_supplement": null
}
```

## Write Today Summary

```http
PUT /api/ai/today-summary
Authorization: Bearer <GLEAN_API_TOKEN>
Content-Type: application/json
```

Request body:

```json
{
  "date": "2026-04-18",
  "model": "local-qwen",
  "title": "Daily Brief",
  "summary": "One concise overview of today's intake.",
  "highlights": [
    {
      "entry_id": "entry-id",
      "title": "Entry title",
      "reason": "Why this item matters"
    }
  ],
  "topics": [
    {
      "name": "AI",
      "entry_ids": ["entry-id"]
    }
  ],
  "recommended_entry_ids": ["entry-id"],
  "metadata": {
    "generated_by": "local-ai"
  }
}
```

Notes:

- Do not include `timezone`; if included by an older client, the server ignores it and stores under the server timezone.
- The call is an upsert for `(user_id, date, server_timezone)`.
- `highlights[*].entry_id`, `topics[*].entry_ids`, and `recommended_entry_ids` are validated against subscribed entries.

Response includes the server timezone:

```json
{
  "id": "summary-id",
  "user_id": "user-id",
  "date": "2026-04-18",
  "timezone": "America/Los_Angeles",
  "model": "local-qwen",
  "title": "Daily Brief",
  "summary": "One concise overview of today's intake.",
  "highlights": [],
  "topics": [],
  "recommended_entry_ids": [],
  "metadata": {},
  "created_at": "2026-04-18T13:30:00Z",
  "updated_at": "2026-04-18T13:30:00Z"
}
```

## Read Today Summary

```http
GET /api/ai/today-summary?date=2026-04-18
Authorization: Bearer <GLEAN_API_TOKEN>
```

Query parameters:

- `date`: required server-local date, `YYYY-MM-DD`.
- `timezone`: deprecated and ignored.

Returns `404` when no summary exists for `(user_id, date, server_timezone)`.

## Write Entry Supplement

```http
PUT /api/ai/entries/{entry_id}/supplement
Authorization: Bearer <GLEAN_API_TOKEN>
Content-Type: application/json
```

Request body:

```json
{
  "model": "local-qwen",
  "summary": "Entry-specific AI summary.",
  "key_points": ["Point A", "Point B"],
  "tags": ["ai", "research"],
  "reading_priority": "high",
  "reason": "Useful for today's brief.",
  "metadata": {
    "generated_by": "local-ai"
  }
}
```

This is an upsert for `(user_id, entry_id)`.

## Read Entry Supplement

```http
GET /api/ai/entries/{entry_id}/supplement
Authorization: Bearer <GLEAN_API_TOKEN>
```

Returns `404` when no supplement exists for the entry.

## Common Status Codes

- `401`: missing or invalid token.
- `403`: Local AI integration, the user's AI integration setting, or a specific AI capability is disabled.
- `404`: entry, summary, or supplement not found.
- `422`: invalid date, invalid payload, or references to entries outside the user's subscriptions.
