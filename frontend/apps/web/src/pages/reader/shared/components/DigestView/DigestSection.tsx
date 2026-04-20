import { useMemo, useState, type KeyboardEvent } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import type { EntryWithState } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import { DigestArticleCard } from './DigestArticleCard'
import { DigestCompactList } from './DigestCompactList'
import { useMarkAllRead, useUpdateEntryState } from '@/hooks/useEntries'
import type { ListEntryTranslation } from '@/hooks/useListEntriesTranslation'

const MAX_VISIBLE_CARDS = 6

interface DigestSectionProps {
  groupId: string | null
  groupName: string
  groupKind: 'folder' | 'feed' | 'all'
  entries: EntryWithState[]
  sourceCount: number
  onSelectEntry: (entry: EntryWithState) => void
  isCompact?: boolean
  focusedEntryId?: string | null
  translations?: Record<string, ListEntryTranslation>
  /** Hide the section header entirely (e.g. when grouping is 'none' and the masthead already shows context). */
  hideHeader?: boolean
}

export function DigestSection({
  groupId,
  groupName,
  groupKind,
  entries,
  sourceCount,
  onSelectEntry,
  isCompact = false,
  focusedEntryId,
  translations,
  hideHeader = false,
}: DigestSectionProps) {
  const { t } = useTranslation('digest')
  const displayName =
    groupKind === 'folder' && groupId === null ? t('section.otherFolder') : groupName
  const [expanded, setExpanded] = useState(false)
  // Auto-collapse fully-read sections on mount; don't fight the user if they expand it later.
  const [collapsed, setCollapsed] = useState(
    () => entries.length > 0 && entries.every((e) => e.is_read)
  )
  const [readExpanded, setReadExpanded] = useState(false)
  const markAllReadMutation = useMarkAllRead()
  const updateMutation = useUpdateEntryState()

  // Split: fresh entries (unread + not-yet-committed) vs committed-read (floats to bottom)
  const { fresh, readTail } = useMemo(() => {
    const freshList: EntryWithState[] = []
    const readList: EntryWithState[] = []
    for (const e of entries) {
      if (e.is_read) {
        readList.push(e)
      } else {
        freshList.push(e)
      }
    }
    return { fresh: freshList, readTail: readList }
  }, [entries])

  const visibleFresh = expanded ? fresh : fresh.slice(0, MAX_VISIBLE_CARDS)
  const hasMore = fresh.length > MAX_VISIBLE_CARDS && !expanded
  const allRead = entries.length > 0 && entries.every((e) => e.is_read)

  const toggleCollapsed = () => setCollapsed((v) => !v)
  const handleTitleKeyDown = (e: KeyboardEvent<HTMLHeadingElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleCollapsed()
    }
  }

  const handleMarkAllRead = async () => {
    if (groupId && groupKind === 'folder') {
      markAllReadMutation.mutate({ folderId: groupId })
      return
    }
    if (groupId && groupKind === 'feed') {
      markAllReadMutation.mutate({ feedId: groupId })
      return
    }
    const unread = entries.filter((e) => !e.is_read)
    if (unread.length === 0) return
    await Promise.all(
      unread.map((e) =>
        updateMutation.mutateAsync({
          entryId: e.id,
          data: { is_read: true },
        })
      )
    )
  }

  return (
    <section>
      {!hideHeader && (
      <div
        className="mb-3 mt-8 flex items-baseline justify-between gap-4 border-b-2 pb-2"
        style={{ borderColor: 'var(--digest-text, #1A1A1A)' }}
      >
        <h2
          role="button"
          tabIndex={0}
          onClick={toggleCollapsed}
          onKeyDown={handleTitleKeyDown}
          className="flex flex-wrap items-baseline gap-3 text-[22px] font-bold tracking-[-0.01em]"
          style={{
            fontFamily: "'Noto Serif SC', Georgia, serif",
            color: 'var(--digest-text, #1A1A1A)',
            cursor: 'pointer',
            userSelect: 'none',
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

        <div className="flex shrink-0 gap-1" onClick={(e) => e.stopPropagation()}>
          {!allRead && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              void handleMarkAllRead()
            }}
            disabled={markAllReadMutation.isPending}
            className="whitespace-nowrap rounded px-2 py-1 text-xs transition-colors disabled:opacity-50"
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
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              toggleCollapsed()
            }}
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
      )}

      {!collapsed && (
        <>
          {isCompact ? (
            <DigestCompactList
              entries={[...fresh, ...readTail]}
              onSelectEntry={onSelectEntry}
              focusedEntryId={focusedEntryId}
              translations={translations}
            />
          ) : (
            <>
              {fresh.length === 0 ? (
                <DigestCompactList
                  entries={readTail}
                  onSelectEntry={onSelectEntry}
                  focusedEntryId={focusedEntryId}
                  translations={translations}
                />
              ) : (
                <div
                  className="grid border-l"
                  style={{
                    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                    borderColor: 'var(--digest-divider, #E5E0D2)',
                  }}
                >
                  {visibleFresh.map((entry) => (
                    <DigestArticleCard
                      key={entry.id}
                      entry={entry}
                      onClick={() => onSelectEntry(entry)}
                      isFocused={focusedEntryId === entry.id}
                      translation={translations?.[entry.id]}
                    />
                  ))}
                </div>
              )}

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
                    {t('section.viewAll', { count: fresh.length })}
                  </button>
                </div>
              )}

              {fresh.length > 0 && readTail.length > 0 && (
                <div className="mt-4">
                  <button
                    onClick={() => setReadExpanded((v) => !v)}
                    className="flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors"
                    style={{ color: 'var(--digest-text-tertiary, #9A968C)' }}
                  >
                    {readExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                    {t('section.readTail', { count: readTail.length })}
                  </button>
                  {readExpanded && (
                    <div className="mt-2">
                      <DigestCompactList
                        entries={readTail}
                        onSelectEntry={onSelectEntry}
                        focusedEntryId={focusedEntryId}
                        translations={translations}
                      />
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}
