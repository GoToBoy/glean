import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { DigestArticleCard } from './DigestArticleCard'
import { DigestCompactList } from './DigestCompactList'
import { useUpdateEntryState } from '@/hooks/useEntries'
import type { ListEntryTranslation } from '@/hooks/useListEntriesTranslation'

const MAX_VISIBLE_CARDS = 6

interface DigestSectionProps {
  folderId: string | null
  folderName: string
  entries: EntryWithState[]
  sourceCount: number
  onSelectEntry: (entry: EntryWithState) => void
  isCompact?: boolean // Use compact list layout for "Others" section
  focusedEntryId?: string | null
  translations?: Record<string, ListEntryTranslation>
}

export function DigestSection({
  folderId,
  folderName,
  entries,
  sourceCount,
  onSelectEntry,
  isCompact = false,
  focusedEntryId,
  translations,
}: DigestSectionProps) {
  const { t } = useTranslation('digest')
  const displayName = folderId === null ? t('section.otherFolder') : folderName
  const [expanded, setExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const updateMutation = useUpdateEntryState()

  const visibleEntries = expanded ? entries : entries.slice(0, MAX_VISIBLE_CARDS)
  const hasMore = entries.length > MAX_VISIBLE_CARDS && !expanded

  const handleMarkAllRead = async () => {
    const unreadEntries = entries.filter((e) => !e.is_read)
    await Promise.all(
      unreadEntries.map((e) =>
        updateMutation.mutateAsync({
          entryId: e.id,
          data: { is_read: true },
        })
      )
    )
  }

  return (
    <section>
      {/* Section header */}
      <div
        className="mb-3 mt-8 flex items-baseline justify-between gap-4 border-b-2 pb-2"
        style={{ borderColor: 'var(--digest-text, #1A1A1A)' }}
      >
        <h2
          className="flex flex-wrap items-baseline gap-3 text-[22px] font-bold tracking-[-0.01em]"
          style={{
            fontFamily: "'Noto Serif SC', Georgia, serif",
            color: 'var(--digest-text, #1A1A1A)',
          }}
        >
          {displayName}
          <span
            className="text-[12px] font-normal"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
          >
            {t('section.count', { entries: entries.length, sources: sourceCount })}
          </span>
        </h2>

        <div className="flex shrink-0 gap-1">
          <button
            onClick={() => void handleMarkAllRead()}
            className="whitespace-nowrap rounded px-2 py-1 text-xs transition-colors"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ''
              e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
            }}
          >
            {t('section.markAllRead')}
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-xs transition-colors"
            style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--digest-bg-hover, #F1EDE2)'
              e.currentTarget.style.color = 'var(--digest-text, #1A1A1A)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = ''
              e.currentTarget.style.color = 'var(--digest-text-tertiary, #9A968C)'
            }}
          >
            {collapsed ? (
              <>
                <ChevronDown className="h-3 w-3" /> {t('section.expand')}
              </>
            ) : (
              <>
                <ChevronUp className="h-3 w-3" /> {t('section.collapse')}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Section body */}
      {!collapsed && (
        <>
          {isCompact ? (
            <DigestCompactList
              entries={entries}
              onSelectEntry={onSelectEntry}
              focusedEntryId={focusedEntryId}
              translations={translations}
            />
          ) : (
            <>
              <div
                className="grid border-l"
                style={{
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  borderColor: 'var(--digest-divider, #E5E0D2)',
                }}
              >
                {visibleEntries.map((entry) => (
                  <DigestArticleCard
                    key={entry.id}
                    entry={entry}
                    onClick={() => onSelectEntry(entry)}
                    isFocused={focusedEntryId === entry.id}
                    translation={translations?.[entry.id]}
                  />
                ))}
              </div>

              {hasMore && (
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={() => setExpanded(true)}
                    className="rounded-md px-4 py-2 text-sm transition-colors"
                    style={{
                      color: 'var(--digest-text, #1A1A1A)',
                      border: '1px solid var(--digest-divider, #E5E0D2)',
                    }}
                  >
                    {t('section.viewAll', { count: entries.length })}
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
