import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { getFeedColor } from './digestHelpers'
import type { ListEntryTranslation } from '../../../../../hooks/useListEntriesTranslation'
import { stripHtmlTags } from '@/lib/html'

interface DigestArticleCardProps {
  entry: EntryWithState
  onClick: () => void
  isFocused?: boolean
  translation?: ListEntryTranslation
}

function formatPublishedAt(dateStr: string | null): string {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const hours = d.getHours().toString().padStart(2, '0')
    const mins = d.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hours}:${mins}`
  } catch {
    return ''
  }
}

export function DigestArticleCard({ entry, onClick, isFocused = false, translation }: DigestArticleCardProps) {
  const { t } = useTranslation('digest')
  const feedColor = getFeedColor(entry.feed_id)

  const feedName = entry.feed_title || t('card.unknownSource')
  const timeStr = formatPublishedAt(entry.published_at)
  const isRead = entry.is_read
  const displayTitle = translation?.title || entry.title
  const displaySummary = translation?.summary || stripHtmlTags(entry.summary)

  return (
    <article
      id={`digest-card-${entry.id}`}
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
      <div
        className="pointer-events-none absolute left-0 top-6 h-[18px] w-[3px] rounded-sm opacity-0 transition-opacity group-hover/card:opacity-100"
        style={{ background: 'var(--digest-accent, #B8312F)' }}
      />

      {/* Header: feed name on left, time on right */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 flex-shrink-0 rounded-[2px]"
            style={{ background: feedColor }}
          />
          <span
            className="truncate text-[11px] font-medium uppercase tracking-[0.1em]"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
          >
            {feedName}
          </span>
        </div>
        {timeStr && (
          <span
            className="flex-shrink-0 text-[11px]"
            style={{
              color: 'var(--digest-text-tertiary, #9A968C)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {timeStr}
          </span>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-[19px] font-semibold leading-snug tracking-[-0.01em] transition-colors group-hover/card:[color:var(--digest-accent,#B8312F)]"
        style={{
          fontFamily: "'Noto Serif SC', Georgia, serif",
          color: 'var(--digest-text, #1A1A1A)',
          opacity: isRead ? 0.75 : 1,
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
          style={{
            color: 'var(--digest-text-secondary, #5E5A52)',
            opacity: isRead ? 0.75 : 1,
          }}
        >
          {displaySummary}
        </p>
      )}
    </article>
  )
}
