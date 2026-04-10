import { describe, expect, it } from 'vitest'
import type { EntryWithState } from '@glean/types'
import { getEffectiveEntryTimestamp, buildTodayBoardEntries } from '@/pages/reader/shared/todayBoard'

function makeEntry(overrides: Partial<EntryWithState> = {}): EntryWithState {
  return {
    id: overrides.id ?? 'entry-1',
    feed_id: overrides.feed_id ?? 'feed-1',
    guid: overrides.guid ?? 'guid-1',
    url: overrides.url ?? 'https://example.com/1',
    title: overrides.title ?? 'Entry title',
    author: overrides.author ?? null,
    content: overrides.content ?? null,
    summary: overrides.summary ?? 'Entry summary',
    published_at: overrides.published_at ?? null,
    created_at: overrides.created_at ?? '2026-04-10T02:00:00.000Z',
    is_read: overrides.is_read ?? false,
    is_liked: overrides.is_liked ?? null,
    read_later: overrides.read_later ?? false,
    read_later_until: overrides.read_later_until ?? null,
    triage_state: overrides.triage_state,
    defer_until: overrides.defer_until ?? null,
    expires_at: overrides.expires_at ?? null,
    estimated_read_time_sec: overrides.estimated_read_time_sec ?? null,
    content_temporality: overrides.content_temporality,
    read_at: overrides.read_at ?? null,
    ingested_at: overrides.ingested_at ?? overrides.created_at ?? '2026-04-10T02:00:00.000Z',
    is_bookmarked: overrides.is_bookmarked ?? false,
    bookmark_id: overrides.bookmark_id ?? null,
    feed_title: overrides.feed_title ?? 'Feed title',
    feed_icon_url: overrides.feed_icon_url ?? null,
    preference_score: overrides.preference_score ?? null,
    debug_info: overrides.debug_info ?? null,
  }
}

describe('todayBoard helpers', () => {
  it('prefers published_at over ingested_at when choosing the effective timestamp', () => {
    const entry = makeEntry({
      published_at: '2026-04-09T23:00:00.000Z',
      ingested_at: '2026-04-10T01:00:00.000Z',
      created_at: '2026-04-10T01:00:00.000Z',
    })

    expect(getEffectiveEntryTimestamp(entry)?.toISOString()).toBe('2026-04-09T23:00:00.000Z')
  })

  it('falls back to ingested_at and then created_at when published_at is missing', () => {
    const withIngestedAt = makeEntry({
      published_at: null,
      ingested_at: '2026-04-10T05:00:00.000Z',
      created_at: '2026-04-10T02:00:00.000Z',
    })
    const withCreatedAtOnly = makeEntry({
      id: 'entry-2',
      published_at: null,
      ingested_at: null,
      created_at: '2026-04-10T03:00:00.000Z',
    })

    expect(getEffectiveEntryTimestamp(withIngestedAt)?.toISOString()).toBe('2026-04-10T05:00:00.000Z')
    expect(getEffectiveEntryTimestamp(withCreatedAtOnly)?.toISOString()).toBe(
      '2026-04-10T03:00:00.000Z'
    )
  })

  it('keeps only today entries and sorts unread before read, newest first within each group', () => {
    const now = new Date('2026-04-10T12:00:00+08:00')

    const results = buildTodayBoardEntries(
      [
        makeEntry({
          id: 'read-newest',
          is_read: true,
          published_at: '2026-04-10T11:00:00+08:00',
        }),
        makeEntry({
          id: 'unread-older',
          is_read: false,
          published_at: '2026-04-10T09:00:00+08:00',
        }),
        makeEntry({
          id: 'unread-newest',
          is_read: false,
          published_at: '2026-04-10T10:00:00+08:00',
        }),
        makeEntry({
          id: 'fallback-ingested',
          is_read: false,
          published_at: null,
          ingested_at: '2026-04-10T08:30:00+08:00',
          created_at: '2026-04-08T08:30:00+08:00',
        }),
        makeEntry({
          id: 'published-yesterday-ingested-today',
          is_read: false,
          published_at: '2026-04-09T12:30:00+08:00',
          ingested_at: '2026-04-10T01:00:00+08:00',
        }),
      ],
      {
        now,
        getFeedDescription: (feedId) => (feedId === 'feed-1' ? 'Feed summary text' : null),
      }
    )

    expect(results.map((entry) => entry.id)).toEqual([
      'unread-newest',
      'unread-older',
      'fallback-ingested',
      'read-newest',
    ])
    expect(results.every((entry) => entry.feed_description === 'Feed summary text')).toBe(true)
  })
})
