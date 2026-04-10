import { format } from 'date-fns'
import { Clock, Inbox, Languages } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import { cn } from '@glean/ui'
import type { ReactNode } from 'react'
import { stripHtmlTags } from '../../../../lib/html'
import type { TodayBoardEntry } from '../todayBoard'

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
  const gridClassName = selectedEntry
    ? 'grid grid-cols-1 gap-3 p-3'
    : 'grid grid-cols-1 gap-3 p-3 md:grid-cols-2 xl:grid-cols-3'

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
          <div
            data-testid="today-board-grid"
            className={cn(
              gridClassName,
              selectedEntry ? 'max-w-none' : 'max-w-none'
            )}
          >
            {entries.map((entry) => {
              const isSelected = entry.id === selectedEntryId
              const translated = isTranslationActive ? translatedTexts[entry.id] : undefined
              const summary = translated?.summary ?? stripHtmlTags(entry.summary || '')
              return (
                <button
                  key={entry.id}
                  type="button"
                  data-entry-id={entry.id}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelectEntry(entry)
                  }}
                  className={cn(
                    'w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200',
                    'shadow-[0_1px_0_rgba(15,23,42,0.02)] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(15,23,42,0.08)]',
                    entry.is_read
                      ? 'border-stone-200 bg-stone-100/85 text-stone-500'
                      : 'border-amber-200/80 bg-white text-slate-900',
                    isSelected && 'ring-primary/20 border-primary/40 ring-2'
                  )}
                >
                  <div className="mb-2 flex items-start gap-3">
                    {entry.feed_icon_url ? (
                      <img
                        src={entry.feed_icon_url}
                        alt=""
                        className="mt-0.5 h-9 w-9 rounded-xl object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="bg-muted mt-0.5 h-9 w-9 rounded-xl" />
                    )}

                    <div className="min-w-0 flex-1">
                      <div
                        className={cn(
                          'mb-1 flex items-center gap-2 text-xs',
                          entry.is_read ? 'text-stone-400' : 'text-amber-700'
                        )}
                      >
                        <span className="truncate font-medium">{entry.feed_title || 'Unknown feed'}</span>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="h-3 w-3" />
                          {format(entry.effective_timestamp, 'HH:mm')}
                        </span>
                      </div>

                      <h3
                        className={cn(
                          'mb-2 text-sm leading-6 sm:text-[15px]',
                          entry.is_read ? 'text-stone-500' : 'font-semibold text-slate-900'
                        )}
                      >
                        {translated?.title ?? entry.title}
                      </h3>

                      {summary && (
                        <p
                          className={cn(
                            'mb-2 line-clamp-2 text-sm leading-6',
                            entry.is_read ? 'text-stone-400' : 'text-slate-600'
                          )}
                        >
                          {summary}
                        </p>
                      )}

                      {entry.feed_description && (
                        <p
                          className={cn(
                            'line-clamp-1 text-xs leading-5',
                            entry.is_read ? 'text-stone-400' : 'text-slate-500'
                          )}
                        >
                          {entry.feed_description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
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
