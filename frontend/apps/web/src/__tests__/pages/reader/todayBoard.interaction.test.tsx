import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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
        listWidthPx={360}
        renderDetail={(entry) => <div data-testid="today-board-detail">{entry.title}</div>}
      />
    )
  }

  return render(<Wrapper />)
}

describe('TodayBoard interaction', () => {
  afterEach(() => {
    cleanup()
  })

  it('groups card-mode entries by feed, shows counts, and keeps read entries collapsed by default', () => {
    const entries = [
      makeEntry({ id: 'unread-1', title: 'Unread one', ingested_at: '2026-04-10T11:00:00+08:00' }),
      makeEntry({ id: 'unread-2', title: 'Unread two', ingested_at: '2026-04-10T10:00:00+08:00' }),
      makeEntry({ id: 'unread-3', title: 'Unread three', ingested_at: '2026-04-10T09:00:00+08:00' }),
      makeEntry({ id: 'unread-4', title: 'Unread four', ingested_at: '2026-04-10T08:00:00+08:00' }),
      makeEntry({ id: 'read-1', title: 'Read one', is_read: true, ingested_at: '2026-04-10T07:00:00+08:00' }),
    ]

    TodayBoardHarness({ entries })

    expect(screen.getByText('4 / 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unread one/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unread two/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /unread three/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /unread four/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Read one')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand' })).toHaveClass('text-center')
  })

  it('expands collapsed feed groups with lightweight text controls', () => {
    const entries = [
      makeEntry({ id: 'unread-1', title: 'Unread one', ingested_at: '2026-04-10T11:00:00+08:00' }),
      makeEntry({ id: 'unread-2', title: 'Unread two', ingested_at: '2026-04-10T10:00:00+08:00' }),
      makeEntry({ id: 'unread-3', title: 'Unread three', ingested_at: '2026-04-10T09:00:00+08:00' }),
      makeEntry({ id: 'unread-4', title: 'Unread four', ingested_at: '2026-04-10T08:00:00+08:00' }),
      makeEntry({ id: 'read-1', title: 'Read one', is_read: true, ingested_at: '2026-04-10T07:00:00+08:00' }),
    ]

    TodayBoardHarness({ entries })

    fireEvent.click(screen.getByRole('button', { name: 'Expand' }))

    expect(screen.getByRole('button', { name: /unread four/i })).toBeInTheDocument()
    expect(screen.getByText('Read one')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument()
  })

  it('moves completed feed groups after unread groups and shows read entries without expansion', () => {
    const entries = [
      makeEntry({
        id: 'completed-read-1',
        feed_id: 'completed-feed',
        feed_title: 'Completed feed',
        title: 'Completed read one',
        is_read: true,
        ingested_at: '2026-04-10T12:00:00+08:00',
      }),
      makeEntry({
        id: 'completed-read-2',
        feed_id: 'completed-feed',
        feed_title: 'Completed feed',
        title: 'Completed read two',
        is_read: true,
        ingested_at: '2026-04-10T11:00:00+08:00',
      }),
      makeEntry({
        id: 'active-unread',
        feed_id: 'active-feed',
        feed_title: 'Active feed',
        title: 'Active unread',
        ingested_at: '2026-04-10T08:00:00+08:00',
      }),
    ]

    TodayBoardHarness({ entries })

    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByText('2 · Read')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /completed read one/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /completed read two/i })).toBeInTheDocument()
    expect(
      screen.getByText('Active feed').compareDocumentPosition(screen.getByText('Completed feed')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  it('truncates very long summaries consistently in card and detail-list modes', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const longSummary = 'a'.repeat(220)
    const truncatedSummary = `${'a'.repeat(180)}...`

    TodayBoardHarness({
      entries: [makeEntry({ id: 'entry-1', title: 'Long summary entry', summary: longSummary })],
    })

    expect(screen.getByText(truncatedSummary)).toBeInTheDocument()
    expect(screen.queryByText(longSummary)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /long summary entry/i }))

    expect(screen.getByTestId('today-board-detail-list')).toBeInTheDocument()
    expect(screen.getByText(truncatedSummary)).toBeInTheDocument()
    expect(screen.queryByText(longSummary)).not.toBeInTheDocument()
  })

  it('opens detail on card click, changes the left side to a list, scrolls to the selected item, and closes detail when blank space is clicked', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const entries = [
      makeEntry({ id: 'entry-1', title: 'First entry' }),
      makeEntry({ id: 'entry-2', title: 'Second entry' }),
    ]

    TodayBoardHarness({ entries })

    expect(screen.getByTestId('today-board-layout').className).toContain('flex-1')
    expect(screen.getByTestId('today-board-card-board').className).toContain('columns-1')

    fireEvent.click(screen.getByRole('button', { name: /first entry/i }))
    expect(screen.getByTestId('today-board-detail')).toHaveTextContent('First entry')
    expect(screen.getByTestId('today-board-detail-list')).toBeInTheDocument()
    expect(screen.queryByTestId('today-board-card-board')).not.toBeInTheDocument()
    expect(screen.getByTestId('today-board-blank-space')).toHaveStyle({ width: '360px' })
    expect(screen.getByTestId('today-board-detail-pane').className).toContain('flex-1')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })

    fireEvent.click(screen.getByTestId('today-board-blank-space'))
    expect(screen.queryByTestId('today-board-detail')).not.toBeInTheDocument()
    expect(screen.getByTestId('today-board-card-board')).toBeInTheDocument()
  })

  it('renders translated card text and exposes a translation toggle', () => {
    const boardEntries = buildTodayBoardEntries(
      [makeEntry({ id: 'entry-1', title: 'Original title', summary: 'Original summary' })],
      {
        now: new Date('2026-04-10T12:00:00+08:00'),
        getFeedDescription: () => 'Feed summary',
      }
    )
    const onToggleTranslation = vi.fn()

    render(
      <TodayBoard
        entries={boardEntries}
        selectedEntryId={null}
        onSelectEntry={() => undefined}
        onCloseDetail={() => undefined}
        isTranslationActive
        translatedTexts={{
          'entry-1': {
            title: '翻译标题',
            summary: '翻译摘要',
          },
        }}
        onToggleTranslation={onToggleTranslation}
      />
    )

    expect(screen.getByRole('button', { name: 'Hide Translation' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /翻译标题/i })).toBeInTheDocument()
    expect(screen.getByText('翻译摘要')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Hide Translation' }))
    expect(onToggleTranslation).toHaveBeenCalledTimes(1)
  })
})
