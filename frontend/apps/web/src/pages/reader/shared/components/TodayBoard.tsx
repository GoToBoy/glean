import { format } from 'date-fns'
import { Clock, Inbox, Languages } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { cn } from '@glean/ui'
import { useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { stripHtmlTags } from '../../../../lib/html'
import {
  buildTodayBoardGroups,
  truncateTodayBoardCardSummary,
  type TodayBoardEntry,
} from '../todayBoard'

interface TodayBoardProps {
  entries: TodayBoardEntry[]
  selectedEntryId: string | null
  onSelectEntry: (entry: TodayBoardEntry) => void
  onCloseDetail: () => void
  listWidthPx?: number
  isTranslationActive?: boolean
  isTranslationLoading?: boolean
  translationLoadingPhase?: 'idle' | 'start' | 'settled'
  translatedTexts?: Record<string, { title?: string; summary?: string }>
  onToggleTranslation?: () => void
  renderDetail?: (entry: TodayBoardEntry) => ReactNode
}

export function TodayBoard({
  entries,
  selectedEntryId,
  onSelectEntry,
  onCloseDetail,
  listWidthPx = 360,
  isTranslationActive = false,
  isTranslationLoading = false,
  translationLoadingPhase = 'idle',
  translatedTexts = {},
  onToggleTranslation,
  renderDetail,
}: TodayBoardProps) {
  const { t } = useTranslation('reader')
  const selectedEntry = entries.find((entry) => entry.id === selectedEntryId) ?? null
  const [expandedFeedIds, setExpandedFeedIds] = useState<Set<string>>(() => new Set())
  const selectedEntryRefs = useRef(new Map<string, HTMLButtonElement>())
  const groups = useMemo(
    () =>
      buildTodayBoardGroups(entries, {
        expandedFeedIds,
        selectedEntryId,
      }),
    [entries, expandedFeedIds, selectedEntryId]
  )

  useEffect(() => {
    if (!selectedEntryId || !selectedEntry) return
    selectedEntryRefs.current
      .get(selectedEntryId)
      ?.scrollIntoView({ block: 'center' })
  }, [selectedEntryId, selectedEntry])

  const toggleFeed = (feedId: string) => {
    setExpandedFeedIds((current) => {
      const next = new Set(current)
      if (next.has(feedId)) {
        next.delete(feedId)
      } else {
        next.add(feedId)
      }
      return next
    })
  }

  return (
    <div
      className="flex h-full min-w-0 flex-1 bg-[linear-gradient(180deg,rgba(250,248,242,0.9),rgba(255,255,255,0.96))]"
      data-testid="today-board-layout"
    >
      <div
        className={cn(
          'min-w-0 overflow-y-auto transition-[width,max-width] duration-200',
          selectedEntry ? 'shrink-0' : 'w-full flex-1'
        )}
        style={
          selectedEntry
            ? { width: `${listWidthPx}px`, minWidth: 280, maxWidth: 500 }
            : undefined
        }
        data-testid="today-board-blank-space"
        onClick={() => onCloseDetail()}
      >
        <div className="border-border/60 sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-[linear-gradient(180deg,rgba(255,251,245,0.96),rgba(255,255,255,0.92))] px-4 py-3 backdrop-blur">
          <div className="min-w-0">
            <div className="text-primary mb-1 text-xs font-semibold tracking-[0.18em] uppercase">
              {t('todayBoard.title')}
            </div>
            <div className="text-muted-foreground text-sm">{t('todayBoard.description')}</div>
          </div>
          {onToggleTranslation ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onToggleTranslation()
              }}
              title={
                isTranslationLoading
                  ? t('translation.translating')
                  : isTranslationActive
                    ? t('translation.hideTranslation')
                    : t('translation.translate')
              }
              aria-label={
                isTranslationLoading
                  ? t('translation.translating')
                  : isTranslationActive
                    ? t('translation.hideTranslation')
                    : t('translation.translate')
              }
              className={cn(
                'list-translation-toggle hover:bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                isTranslationActive ? 'text-primary' : 'text-muted-foreground',
                isTranslationLoading && 'list-translation-toggle-loading',
                translationLoadingPhase === 'start' && 'list-translation-toggle-loading-start',
                translationLoadingPhase === 'settled' && 'list-translation-toggle-loading-settled'
              )}
            >
              <span className="list-translation-toggle__icon-wrap">
                <span className="list-translation-toggle__ring" aria-hidden="true" />
                <Languages className="list-translation-toggle__icon h-4 w-4" />
              </span>
            </button>
          ) : null}
        </div>

        {entries.length === 0 ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center">
            <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
              <Inbox className="text-muted-foreground h-8 w-8" />
            </div>
            <p className="text-muted-foreground text-sm">{t('todayBoard.empty')}</p>
          </div>
        ) : (
          <TodayBoardEntries
            groups={groups}
            selectedEntryId={selectedEntryId}
            selectedEntryRefs={selectedEntryRefs}
            isDetailOpen={!!selectedEntry}
            isTranslationActive={isTranslationActive}
            translatedTexts={translatedTexts}
            onSelectEntry={onSelectEntry}
            onToggleFeed={toggleFeed}
          />
        )}
      </div>

      {selectedEntry && renderDetail ? (
        <aside
          className="border-border bg-background flex min-w-0 flex-1 flex-col border-l"
          data-testid="today-board-detail-pane"
        >
          {renderDetail(selectedEntry)}
        </aside>
      ) : null}
    </div>
  )
}

function TodayBoardEntries({
  groups,
  selectedEntryId,
  selectedEntryRefs,
  isDetailOpen,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  onToggleFeed,
}: {
  groups: ReturnType<typeof buildTodayBoardGroups>
  selectedEntryId: string | null
  selectedEntryRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  isDetailOpen: boolean
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  onToggleFeed: (feedId: string) => void
}) {
  return isDetailOpen ? (
    <div data-testid="today-board-detail-list" className="space-y-3 p-3">
      {groups.map((group) => (
        <FeedListGroup
          key={group.feedId}
          group={group}
          selectedEntryId={selectedEntryId}
          selectedEntryRefs={selectedEntryRefs}
          isTranslationActive={isTranslationActive}
          translatedTexts={translatedTexts}
          onSelectEntry={onSelectEntry}
          onToggleFeed={onToggleFeed}
        />
      ))}
    </div>
  ) : (
    <div
      data-testid="today-board-card-board"
      className="columns-1 gap-3 p-3 md:columns-2 xl:columns-3"
    >
      {groups.map((group) => (
        <FeedCardGroup
          key={group.feedId}
          group={group}
          selectedEntryId={selectedEntryId}
          isTranslationActive={isTranslationActive}
          translatedTexts={translatedTexts}
          onSelectEntry={onSelectEntry}
          onToggleFeed={onToggleFeed}
        />
      ))}
    </div>
  )
}

function FeedCardGroup({
  group,
  selectedEntryId,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  onToggleFeed,
}: {
  group: ReturnType<typeof buildTodayBoardGroups>[number]
  selectedEntryId: string | null
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  onToggleFeed: (feedId: string) => void
}) {
  const { t } = useTranslation('reader')

  return (
    <section className="border-border/70 mb-3 inline-block w-full break-inside-avoid overflow-hidden rounded-lg border bg-white shadow-[0_1px_0_rgba(15,23,42,0.03)]">
      <FeedGroupHeader group={group} />
      <div className="space-y-2 p-2">
        {group.visibleEntries.map((entry) => (
          <TodayBoardEntryCard
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedEntryId}
            isTranslationActive={isTranslationActive}
            translatedTexts={translatedTexts}
            onSelectEntry={onSelectEntry}
          />
        ))}
        {group.isCollapsible ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              onToggleFeed(group.feedId)
            }}
            className="text-primary hover:text-primary/80 block w-full py-1 text-center text-[13px] font-medium transition-colors"
          >
            {group.isExpanded ? t('todayBoard.collapse') : t('todayBoard.expand')}
          </button>
        ) : null}
      </div>
    </section>
  )
}

function FeedListGroup({
  group,
  selectedEntryId,
  selectedEntryRefs,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  onToggleFeed,
}: {
  group: ReturnType<typeof buildTodayBoardGroups>[number]
  selectedEntryId: string | null
  selectedEntryRefs: MutableRefObject<Map<string, HTMLButtonElement>>
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  onToggleFeed: (feedId: string) => void
}) {
  const { t } = useTranslation('reader')

  return (
    <section className="border-border/60 border-b pb-2 last:border-b-0">
      <FeedGroupHeader group={group} compact />
      <div className="divide-border/50 divide-y">
        {group.visibleEntries.map((entry) => (
          <TodayBoardEntryListItem
            key={entry.id}
            entry={entry}
            isSelected={entry.id === selectedEntryId}
            isTranslationActive={isTranslationActive}
            translatedTexts={translatedTexts}
            onSelectEntry={onSelectEntry}
            selectedEntryRefs={selectedEntryRefs}
          />
        ))}
      </div>
      {group.isCollapsible ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onToggleFeed(group.feedId)
          }}
          className="text-primary hover:text-primary/80 block w-full py-2 text-center text-[13px] font-medium transition-colors"
        >
          {group.isExpanded ? t('todayBoard.collapse') : t('todayBoard.expand')}
        </button>
      ) : null}
    </section>
  )
}

function FeedGroupHeader({
  group,
  compact = false,
}: {
  group: ReturnType<typeof buildTodayBoardGroups>[number]
  compact?: boolean
}) {
  const { t } = useTranslation('reader')

  return (
    <div
      className={cn(
        'bg-stone-100/80 flex items-center justify-between gap-3 px-3',
        compact ? 'py-2' : 'py-2.5'
      )}
    >
      <div className="min-w-0">
        <div className="truncate text-[13px] font-semibold text-stone-700">
          {group.feedTitle || t('todayBoard.unknownFeed')}
        </div>
        {group.feedDescription ? (
          <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-500">
            {group.feedDescription}
          </div>
        ) : null}
      </div>
      <div className="shrink-0 text-xs font-normal tabular-nums text-stone-500">
        {group.unreadCount} / {group.totalCount}
      </div>
    </div>
  )
}

function TodayBoardEntryCard({
  entry,
  isSelected,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
}: {
  entry: TodayBoardEntry
  isSelected: boolean
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
}) {
  const translated = isTranslationActive ? translatedTexts[entry.id] : undefined
  const summary = truncateTodayBoardCardSummary(
    translated?.summary ?? stripHtmlTags(entry.summary || '')
  )

  return (
    <button
      type="button"
      data-entry-id={entry.id}
      onClick={(event) => {
        event.stopPropagation()
        onSelectEntry(entry)
      }}
      className={cn(
        'w-full rounded-lg border px-3 py-2.5 text-left transition-all duration-200',
        'shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(15,23,42,0.07)]',
        entry.is_read
          ? 'border-stone-200 bg-stone-100/85 text-stone-500'
          : 'border-amber-200/70 bg-white text-slate-900',
        isSelected && 'ring-primary/20 border-primary/40 ring-2'
      )}
    >
      <EntryContent entry={entry} translatedTitle={translated?.title} summary={summary} />
    </button>
  )
}

function TodayBoardEntryListItem({
  entry,
  isSelected,
  isTranslationActive,
  translatedTexts,
  onSelectEntry,
  selectedEntryRefs,
}: {
  entry: TodayBoardEntry
  isSelected: boolean
  isTranslationActive: boolean
  translatedTexts: Record<string, { title?: string; summary?: string }>
  onSelectEntry: (entry: TodayBoardEntry) => void
  selectedEntryRefs: MutableRefObject<Map<string, HTMLButtonElement>>
}) {
  const translated = isTranslationActive ? translatedTexts[entry.id] : undefined
  const summary = translated?.summary ?? stripHtmlTags(entry.summary || '')

  return (
    <button
      type="button"
      data-entry-id={entry.id}
      ref={(node) => {
        if (node) {
          selectedEntryRefs.current.set(entry.id, node)
        } else {
          selectedEntryRefs.current.delete(entry.id)
        }
      }}
      onClick={(event) => {
        event.stopPropagation()
        onSelectEntry(entry)
      }}
      className={cn(
        'w-full px-3 py-2.5 text-left transition-colors',
        entry.is_read ? 'text-stone-500' : 'text-slate-900',
        isSelected && 'bg-emerald-50'
      )}
    >
      <EntryContent entry={entry} translatedTitle={translated?.title} summary={summary} compact />
    </button>
  )
}

function EntryContent({
  entry,
  translatedTitle,
  summary,
  compact = false,
}: {
  entry: TodayBoardEntry
  translatedTitle?: string
  summary: string
  compact?: boolean
}) {
  return (
    <div>
      <h3
        className={cn(
          compact ? 'text-[13px]' : 'text-sm sm:text-[15px]',
          'leading-6',
          entry.is_read ? 'font-medium text-stone-500' : 'font-semibold text-slate-900'
        )}
      >
        {translatedTitle ?? entry.title}
      </h3>

      {summary ? (
        <p
          className={cn(
            'mt-1 text-sm leading-6',
            entry.is_read ? 'text-stone-400' : 'text-slate-600'
          )}
        >
          {summary}
        </p>
      ) : null}

      <div
        className={cn(
          'mt-2 inline-flex items-center gap-1 text-xs tabular-nums',
          entry.is_read ? 'text-stone-400' : 'text-stone-500'
        )}
      >
        <Clock className="h-3 w-3" />
        {format(entry.effective_timestamp, 'HH:mm')}
      </div>
    </div>
  )
}
