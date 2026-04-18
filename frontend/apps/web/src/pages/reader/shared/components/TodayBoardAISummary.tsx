import { Sparkles } from 'lucide-react'
import { useTranslation } from '@glean/i18n'
import type { AIDailySummaryResponse } from '@glean/types'
import type { TodayBoardEntry } from '../todayBoard'

interface TodayBoardAISummaryProps {
  summary: AIDailySummaryResponse | null
  entries: TodayBoardEntry[]
  isLoading: boolean
  error: unknown
  onSelectEntry: (entry: TodayBoardEntry) => void
}

export function TodayBoardAISummary({
  summary,
  entries,
  isLoading,
  error,
  onSelectEntry,
}: TodayBoardAISummaryProps) {
  const { t } = useTranslation('reader')

  if (isLoading) {
    return (
      <div className="space-y-3 p-4" data-testid="today-board-ai-summary-loading">
        <div className="border-border/70 rounded-lg border bg-white p-4">
          <div className="bg-muted h-5 w-2/3 rounded" />
          <div className="bg-muted mt-4 h-3 w-full rounded" />
          <div className="bg-muted mt-2 h-3 w-5/6 rounded" />
          <div className="bg-muted mt-2 h-3 w-4/6 rounded" />
        </div>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center px-6 py-10 text-center">
        <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
          <Sparkles className="text-muted-foreground h-8 w-8" />
        </div>
        <p className="text-foreground text-sm font-medium">{t('todayBoard.ai.emptyTitle')}</p>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          {t('todayBoard.ai.emptyDescription')}
        </p>
      </div>
    )
  }

  const recommendedEntries = summary.recommended_entry_ids
    .map((entryId) => entries.find((entry) => entry.id === entryId))
    .filter((entry): entry is TodayBoardEntry => !!entry)

  return (
    <div className="space-y-4 p-4" data-testid="today-board-ai-summary">
      <section className="border-border/70 rounded-lg border bg-white p-4 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
        <div className="text-primary mb-2 flex items-center gap-2 text-xs font-semibold uppercase">
          <Sparkles className="h-4 w-4" />
          {t('todayBoard.ai.title')}
        </div>
        <h2 className="text-xl leading-8 font-semibold text-stone-900">
          {summary.title || t('todayBoard.ai.fallbackTitle')}
        </h2>
        {summary.summary ? (
          <p className="mt-3 text-sm leading-7 whitespace-pre-wrap text-stone-700">
            {summary.summary}
          </p>
        ) : null}
        <div className="text-muted-foreground mt-4 flex flex-wrap gap-2 text-xs">
          {summary.model ? <span>{summary.model}</span> : null}
          <span>{new Date(summary.updated_at).toLocaleString()}</span>
        </div>
      </section>

      {summary.highlights.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-stone-800">{t('todayBoard.ai.highlights')}</h3>
          <div className="space-y-2">
            {summary.highlights.map((highlight, index) => {
              const title = getRecordString(highlight, 'title')
              const reason = getRecordString(highlight, 'reason')
              const entry = entries.find(
                (item) => item.id === getRecordString(highlight, 'entry_id')
              )

              return (
                <button
                  key={`${title ?? 'highlight'}-${index}`}
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    if (entry) onSelectEntry(entry)
                  }}
                  disabled={!entry}
                  className="border-border/70 w-full rounded-lg border bg-white px-3 py-2.5 text-left disabled:cursor-default"
                >
                  <div className="text-sm leading-6 font-medium text-stone-900">
                    {title ?? entry?.title ?? t('todayBoard.ai.highlightFallback')}
                  </div>
                  {reason ? (
                    <p className="text-muted-foreground mt-1 text-sm leading-6">{reason}</p>
                  ) : null}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {summary.topics.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-stone-800">{t('todayBoard.ai.topics')}</h3>
          <div className="flex flex-wrap gap-2">
            {summary.topics.map((topic, index) => {
              const name = getRecordString(topic, 'name') ?? getRecordString(topic, 'topic')
              return name ? (
                <span
                  key={`${name}-${index}`}
                  className="rounded-md bg-stone-100 px-2.5 py-1 text-xs font-medium text-stone-700"
                >
                  {name}
                </span>
              ) : null
            })}
          </div>
        </section>
      ) : null}

      {recommendedEntries.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-stone-800">{t('todayBoard.ai.recommended')}</h3>
          <div className="space-y-2">
            {recommendedEntries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelectEntry(entry)
                }}
                className="border-border/70 hover:border-primary/40 w-full rounded-lg border bg-white px-3 py-2.5 text-left transition-colors"
              >
                <div className="line-clamp-2 text-sm leading-6 font-medium text-stone-900">
                  {entry.title}
                </div>
                {entry.feed_title ? (
                  <div className="text-muted-foreground mt-1 text-xs">{entry.feed_title}</div>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}

function getRecordString(record: Record<string, unknown>, key: string) {
  const value = record[key]
  return typeof value === 'string' && value.trim() ? value : null
}
