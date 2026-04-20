import { useCallback } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { zhCN, enUS } from 'date-fns/locale'
import type { Locale } from 'date-fns'
import { Bookmark, Check } from 'lucide-react'
import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { getFeedColor } from './digestHelpers'
import { useUpdateEntryState } from '../../../../../hooks/useEntries'
import type { ListEntryTranslation } from '../../../../../hooks/useListEntriesTranslation'
import { stripHtmlTags } from '@/lib/html'

interface DigestArticleCardProps {
  entry: EntryWithState
  onClick: () => void
  isFocused?: boolean
  translation?: ListEntryTranslation
}

function formatRelativeTime(dateStr: string | null, locale: Locale): string {
  if (!dateStr) return ''
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale })
  } catch {
    return ''
  }
}

export function DigestArticleCard({ entry, onClick, isFocused = false, translation }: DigestArticleCardProps) {
  const { t, i18n } = useTranslation('digest')
  const dateLocale = i18n.language.startsWith('zh') ? zhCN : enUS
  const updateMutation = useUpdateEntryState()
  const feedColor = getFeedColor(entry.feed_id)

  const handleMarkRead = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void updateMutation.mutateAsync({
        entryId: entry.id,
        data: { is_read: !entry.is_read },
      })
    },
    [entry.id, entry.is_read, updateMutation]
  )

  const handleSaveLater = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      void updateMutation.mutateAsync({
        entryId: entry.id,
        data: { read_later: !entry.read_later },
      })
    },
    [entry.id, entry.read_later, updateMutation]
  )

  const feedName = entry.feed_title || t('card.unknownSource')
  const timeStr = formatRelativeTime(entry.published_at, dateLocale)
  const isRead = entry.is_read
  const displayTitle = translation?.title || entry.title
  const displaySummary = translation?.summary || stripHtmlTags(entry.summary)

  return (
    <article
      data-entry-id={entry.id}
      onClick={onClick}
      className="group/card relative flex cursor-pointer flex-col gap-2 border-b border-r px-7 py-6 transition-colors"
      style={{
        borderColor: 'var(--digest-divider, #E5E0D2)',
        background: isFocused ? 'var(--digest-bg-hover, #F1EDE2)' : undefined,
        boxShadow: isFocused ? 'inset 3px 0 0 var(--digest-accent, #B8312F)' : undefined,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = isFocused ? 'var(--digest-bg-hover, #F1EDE2)' : ''
      }}
    >
      {/* Left red accent bar on hover */}
      <div
        className="pointer-events-none absolute left-0 top-6 h-[18px] w-[3px] rounded-sm opacity-0 transition-opacity group-hover/card:opacity-100"
        style={{ background: 'var(--digest-accent, #B8312F)' }}
      />

      {/* Tag / category */}
      <div
        className="text-[11px] font-medium uppercase tracking-[0.1em]"
        style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
      >
        {feedName}
      </div>

      {/* Title */}
      <h3
        className="text-[19px] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover/card:[color:var(--digest-accent,#B8312F)]"
        style={{
          fontFamily: "'Noto Serif SC', Georgia, serif",
          color: 'var(--digest-text, #1A1A1A)',
        }}
      >
        {!isRead && (
          <span
            className="mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle"
            style={{ background: 'var(--digest-accent, #B8312F)' }}
          />
        )}
        {displayTitle}
      </h3>

      {/* Excerpt */}
      {displaySummary && (
        <p
          className="line-clamp-3 flex-1 text-[13.5px] leading-relaxed"
          style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}
        >
          {displaySummary}
        </p>
      )}

      {/* Bottom row */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}>
          <span
            className="inline-block h-2 w-2 flex-shrink-0 rounded-[2px]"
            style={{ background: feedColor }}
          />
          <span className="font-medium" style={{ color: 'var(--digest-text-secondary, #5E5A52)' }}>
            {feedName}
          </span>
          {timeStr && (
            <>
              <span
                className="inline-block h-[3px] w-[3px] rounded-full"
                style={{ background: 'var(--digest-text-tertiary, #9A968C)' }}
              />
              <span>{timeStr}</span>
            </>
          )}
        </div>

        {/* Action buttons - visible on hover */}
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover/card:opacity-100">
          <button
            onClick={handleMarkRead}
            title={entry.is_read ? t('card.markUnread') : t('card.markRead')}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
          <button
            onClick={handleSaveLater}
            title={entry.read_later ? t('card.unsave') : t('card.save')}
            className="flex h-6 w-6 items-center justify-center rounded transition-colors"
            style={{
              color: entry.read_later
                ? 'var(--digest-accent, #B8312F)'
                : 'var(--digest-text-tertiary, #9A968C)',
            }}
          >
            <Bookmark className="h-3.5 w-3.5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </article>
  )
}
