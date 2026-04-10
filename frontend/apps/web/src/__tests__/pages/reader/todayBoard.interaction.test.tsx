import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { EntryWithState } from '@glean/types'
import { TodayBoard } from '@/pages/reader/shared/components/TodayBoard'
import { buildTodayBoardEntries } from '@/pages/reader/shared/todayBoard'

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
    published_at: overrides.published_at ?? '2026-04-10T10:00:00.000Z',
    created_at: overrides.created_at ?? '2026-04-10T10:00:00.000Z',
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
    ingested_at: overrides.ingested_at ?? '2026-04-10T10:00:00.000Z',
    is_bookmarked: overrides.is_bookmarked ?? false,
    bookmark_id: overrides.bookmark_id ?? null,
    feed_title: overrides.feed_title ?? 'Feed title',
    feed_icon_url: overrides.feed_icon_url ?? null,
    preference_score: overrides.preference_score ?? null,
    debug_info: overrides.debug_info ?? null,
  }
}

function TodayBoardHarness({ entries }: { entries: EntryWithState[] }) {
  const boardEntries = buildTodayBoardEntries(entries, {
    now: new Date('2026-04-10T12:00:00+08:00'),
    getFeedDescription: () => 'Feed summary',
  })

  function Wrapper() {
    const [selectedId, setSelectedId] = useState<string | null>(null)

    return (
      <TodayBoard
        entries={boardEntries}
        selectedEntryId={selectedId}
        onSelectEntry={(entry) => setSelectedId(entry.id)}
        onCloseDetail={() => setSelectedId(null)}
        renderDetail={(entry) => <div data-testid="today-board-detail">{entry.title}</div>}
      />
    )
  }

  return render(<Wrapper />)
}

describe('TodayBoard interaction', () => {
  it('opens detail on card click and closes detail when blank board space is clicked', () => {
    const entries = [
      makeEntry({ id: 'entry-1', title: 'First entry' }),
      makeEntry({ id: 'entry-2', title: 'Second entry' }),
    ]

    TodayBoardHarness({ entries })

    fireEvent.click(screen.getByRole('button', { name: /first entry/i }))
    expect(screen.getByTestId('today-board-detail')).toHaveTextContent('First entry')

    fireEvent.click(screen.getByTestId('today-board-blank-space'))
    expect(screen.queryByTestId('today-board-detail')).not.toBeInTheDocument()
  })
})
