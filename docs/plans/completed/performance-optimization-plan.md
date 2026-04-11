# Performance Optimization Plan: Accelerate Page & Content Loading

## Context

Glean's current architecture has several performance bottlenecks that significantly slow down the user experience. The most critical issue is that the entry list API returns **full HTML content** for every entry in paginated responses — meaning a page of 20 entries can transfer several MB of unused article HTML just to render a title+summary list. Combined with no response compression, no HTTP caching headers, and heavy JS libraries loaded globally, the initial page load and content rendering are far slower than they could be.

**Goal**: Minimize time-to-interactive for the reader page, and make article content appear instantly when selected.

---

## Current Bottleneck Analysis

| Issue | Severity | Location | Impact |
|-------|----------|----------|--------|
| Full `content` in list responses | CRITICAL | `backend/packages/core/glean_core/schemas/entry.py:19-46` | 100+ KB per list API call wasted |
| No response compression | CRITICAL | `backend/apps/api/glean_api/main.py:111-120` | 3-5x bandwidth waste |
| N+1 queries in `mark_all_read` | HIGH | `backend/packages/core/glean_core/services/entry_service.py:524-549` | 500+ queries for bulk ops |
| Heavy JS libraries bundled globally | HIGH | `frontend/apps/web/src/hooks/useContentRenderer.ts:2-3` | 100+ KB unused JS on every page |
| No Cache-Control headers | MEDIUM | `backend/apps/api/glean_api/routers/entries.py` | Unnecessary re-fetches |
| Missing lazy loading on images | MEDIUM | `frontend/apps/web/src/lib/html.ts:40-126` | Off-screen images block rendering |
| No entry prefetch on hover | MEDIUM | `frontend/apps/web/src/pages/ReaderPage.tsx` | Full round-trip to show article |

---

## Phase 1: Backend Response Optimization (Highest Impact)

### 1.1 Exclude `content` from list responses

**Problem**: `GET /api/entries` returns `EntryResponse` with full `content` HTML for every entry. Users only see title + summary snippet in the list.

**Files to modify**:
- `backend/packages/core/glean_core/schemas/entry.py` — Add `EntryListItemResponse` (same as `EntryResponse` minus `content`)
- `backend/packages/core/glean_core/schemas/__init__.py` — Export new schema
- `backend/packages/core/glean_core/services/entry_service.py` — Use `EntryListItemResponse` in `get_entries()`, keep `EntryResponse` for `get_entry()`
- `backend/apps/api/glean_api/routers/entries.py` — Update return types
- `frontend/packages/types/src/models.ts` — Add `EntryListItem` type (without `content`)
- `frontend/packages/api-client/src/services/entries.ts` — Update `getEntries()` return type
- `frontend/apps/web/src/hooks/useEntries.ts` — Update types

**Implementation**:
```python
# New schema in entry.py
class EntryListItemResponse(BaseModel):
    """Lightweight entry response for list views (no content field)."""
    id: str
    feed_id: str
    url: str
    title: str
    author: str | None
    summary: str | None          # Keep summary for preview
    # content: REMOVED           # Full HTML excluded from list
    published_at: datetime | None
    created_at: datetime | None
    is_read: bool
    is_liked: bool | None
    read_later: bool
    read_later_until: datetime | None
    read_at: datetime | None
    is_bookmarked: bool
    bookmark_id: str | None
    preference_score: float | None
    feed_title: str | None
    feed_icon_url: str | None
```

**Estimated impact**: 80-95% reduction in list API response size.

### 1.2 Add GZip response compression

**Problem**: No compression middleware — all responses sent raw.

**File to modify**:
- `backend/apps/api/glean_api/main.py`

**Implementation**:
```python
from starlette.middleware.gzip import GZipMiddleware

app.add_middleware(GZipMiddleware, minimum_size=1000)
```

**Estimated impact**: 3-5x further reduction in transfer size for JSON/HTML responses.

### 1.3 Optimize `mark_all_read` with bulk SQL

**Problem**: N+1 queries — one SELECT per entry to check existence, then individual INSERT/UPDATE.

**File to modify**:
- `backend/packages/core/glean_core/services/entry_service.py`

**Implementation approach**: Replace the per-entry loop with:
1. Bulk UPDATE existing `UserEntry` records using a single `UPDATE ... WHERE entry_id IN (...)`
2. Bulk INSERT missing `UserEntry` records using `INSERT ... ON CONFLICT DO UPDATE`

```python
# Step 1: Bulk update existing records
await self.session.execute(
    update(UserEntry)
    .where(UserEntry.user_id == user_id, UserEntry.entry_id.in_(entry_ids))
    .values(is_read=True, read_at=now)
)

# Step 2: Bulk insert missing records (using PostgreSQL ON CONFLICT)
from sqlalchemy.dialects.postgresql import insert as pg_insert

existing_stmt = select(UserEntry.entry_id).where(
    UserEntry.user_id == user_id, UserEntry.entry_id.in_(entry_ids)
)
existing_result = await self.session.execute(existing_stmt)
existing_ids = {row[0] for row in existing_result.all()}
new_ids = [eid for eid in entry_ids if eid not in existing_ids]

if new_ids:
    stmt = pg_insert(UserEntry).values([
        {"entry_id": eid, "user_id": user_id, "is_read": True, "read_at": now}
        for eid in new_ids
    ])
    await self.session.execute(stmt)
```

**Estimated impact**: 500+ queries → 2-3 queries for bulk operations.

---

## Phase 2: Frontend Loading Optimization

### 2.1 Lazy-load heavy article rendering libraries

**Problem**: `highlight.js` (~50KB), `lightGallery` (~35KB), `DOMPurify` (~15KB) are imported at module level, bundled into the main chunk even for pages that don't use them (login, register, settings).

**Files to modify**:
- `frontend/apps/web/src/hooks/useContentRenderer.ts` — Dynamic `import()` for highlight.js and lightGallery
- `frontend/apps/web/src/lib/html.ts` — Dynamic `import()` for DOMPurify

**Implementation for useContentRenderer.ts**:
```typescript
export function useContentRenderer(content?: string) {
  const contentRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<LightGallery | null>(null)

  useEffect(() => {
    if (!contentRef.current || !content) return

    let cancelled = false

    const enhance = async () => {
      // Dynamically import only when needed
      const [{ default: hljs }, { default: lightGallery }] = await Promise.all([
        import('highlight.js'),
        import('lightgallery'),
      ])

      if (cancelled || !contentRef.current) return

      hljs.configure({ ignoreUnescapedHTML: true })
      // ... rest of highlighting and gallery setup
    }

    enhance()
    return () => { cancelled = true; /* cleanup gallery */ }
  }, [content])

  return contentRef
}
```

**Implementation for html.ts**:
```typescript
// DOMPurify must be available synchronously for processHtmlContent
// Option: Import at first use and cache the module
let _DOMPurify: typeof import('dompurify').default | null = null

async function getDOMPurify() {
  if (!_DOMPurify) {
    const mod = await import('dompurify')
    _DOMPurify = mod.default
  }
  return _DOMPurify
}

// Since processHtmlContent is called synchronously in render,
// an alternative: preload DOMPurify when the reader page loads
export async function preloadSanitizer() {
  await getDOMPurify()
}
```

**Note**: DOMPurify is trickier because `processHtmlContent` is called synchronously in render. Consider preloading it when navigating to reader page, or keeping it in the main bundle since it's small (~15KB) and security-critical.

**Estimated impact**: ~100KB less JS in initial bundle, faster first paint.

### 2.2 Add lazy loading to article images

**Problem**: `processHtmlContent()` preserves existing `loading` attributes but doesn't add `loading="lazy"` to images that lack it.

**File to modify**:
- `frontend/apps/web/src/lib/html.ts`

**Implementation**: After DOMPurify sanitization, post-process the HTML to add lazy loading:
```typescript
// After sanitization, add lazy loading to images
const temp = document.createElement('div')
temp.innerHTML = sanitized
temp.querySelectorAll('img').forEach(img => {
  if (!img.hasAttribute('loading')) {
    img.setAttribute('loading', 'lazy')
  }
  if (!img.hasAttribute('decoding')) {
    img.setAttribute('decoding', 'async')
  }
})
return temp.innerHTML
```

**Estimated impact**: Off-screen images don't compete for bandwidth with above-the-fold content.

### 2.3 Prefetch entry detail on hover

**Problem**: Clicking an entry triggers `GET /api/entries/{id}`, requiring a full network round-trip before article content appears. With Phase 1.1, the list no longer has `content`, so the detail fetch is mandatory.

**Files to modify**:
- `frontend/apps/web/src/pages/ReaderPage.tsx` — Add `onMouseEnter`/`onTouchStart` to `EntryListItem`
- `frontend/apps/web/src/hooks/useEntries.ts` — Add `prefetchEntry()` utility

**Implementation**:
```typescript
// In useEntries.ts
export function usePrefetchEntry() {
  const queryClient = useQueryClient()
  return useCallback((entryId: string) => {
    queryClient.prefetchQuery({
      queryKey: entryKeys.detail(entryId),
      queryFn: () => entryService.getEntry(entryId),
      staleTime: 1000 * 60 * 5,
    })
  }, [queryClient])
}

// In ReaderPage.tsx EntryListItem
<div
  onMouseEnter={() => prefetchEntry(entry.id)}
  onClick={() => handleSelectEntry(entry)}
>
```

**Estimated impact**: On desktop, hovering for 100-200ms before clicking gives enough time for prefetch. Article appears instantly from TanStack cache.

---

## Phase 3: Caching & Network Optimization

### 3.1 Add Cache-Control headers to entry endpoints

**Files to modify**:
- `backend/apps/api/glean_api/routers/entries.py`

**Implementation**:
```python
from fastapi.responses import Response

@router.get("/entries")
async def get_entries(..., response: Response):
    response.headers["Cache-Control"] = "private, max-age=60"
    # ... existing logic

@router.get("/entries/{entry_id}")
async def get_entry(..., response: Response):
    response.headers["Cache-Control"] = "private, max-age=300"
    # ... existing logic
```

**Estimated impact**: Browser HTTP cache supplements TanStack Query cache; reduces redundant requests.

### 3.2 Optimize font loading

**File to modify**:
- `frontend/apps/web/index.html`

**Implementation**: Use `media="print" onload` trick for non-blocking font CSS:
```html
<link rel="preload" href="https://fonts.googleapis.com/css2?family=..." as="style" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=..."
      media="print" onload="this.media='all'" />
<noscript>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=..." />
</noscript>
```

Or better: self-host the two font families to eliminate the external dependency entirely.

**Estimated impact**: Marginal improvement (~50-100ms FTTB), but eliminates external dependency.

---

## Implementation Priority (by impact/effort ratio)

| Priority | Task | Impact | Effort | Category |
|----------|------|--------|--------|----------|
| 1 | 1.1 Exclude content from list | **Extreme** | Medium | Backend |
| 2 | 1.2 GZip compression | **High** | Trivial (1 line) | Backend |
| 3 | 2.3 Prefetch entry on hover | **High** | Low | Frontend |
| 4 | 2.1 Lazy-load heavy JS libs | **High** | Low | Frontend |
| 5 | 2.2 Image lazy loading | **Medium** | Trivial | Frontend |
| 6 | 1.3 Bulk mark_all_read | **Medium** | Medium | Backend |
| 7 | 3.1 Cache-Control headers | **Medium** | Low | Backend |
| 8 | 3.2 Font loading optimization | **Low** | Low | Frontend |

---

## Expected Results

**Before optimization**:
- Entry list API: ~500KB-2MB per page (20 entries with full HTML content)
- Initial JS bundle: includes ~100KB of article-only libraries
- Article opening: 200-500ms network wait after click
- `mark_all_read` with 500 entries: ~500 individual DB queries

**After optimization**:
- Entry list API: ~10-30KB per page (metadata only, gzipped)
- Initial JS bundle: ~100KB smaller (article libs lazy-loaded)
- Article opening: instant from prefetch cache (desktop), <100ms (mobile)
- `mark_all_read` with 500 entries: 2-3 bulk SQL queries

---

## Verification Checklist

1. **Response size**: `curl -s /api/entries | wc -c` — compare before/after Phase 1.1
2. **Compression**: Verify `Content-Encoding: gzip` in response headers after Phase 1.2
3. **Bundle size**: `pnpm --filter=@glean/web build` — compare chunk sizes before/after Phase 2.1
4. **Prefetch**: DevTools Network tab → hover over entry → verify prefetch request fires
5. **Image lazy loading**: Inspect rendered article DOM for `<img loading="lazy">`
6. **Mark all read timing**: Time operation with 100+ entries, compare before/after
7. **Syntax validation**: `python3 -c "import ast; ast.parse(open('file.py').read())"` for backend files
8. **Type check**: `cd frontend && pnpm typecheck` to ensure type changes are consistent
