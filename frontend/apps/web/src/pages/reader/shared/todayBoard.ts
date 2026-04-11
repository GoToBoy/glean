import type { EntryWithState } from '@glean/types'

export interface TodayBoardEntry extends EntryWithState {
  feed_description: string | null
  effective_timestamp: Date
  collection_timestamp: Date
}

export interface TodayBoardFeedGroup {
  feedId: string
  feedTitle: string | null
  feedDescription: string | null
  feedIconUrl: string | null
  unreadCount: number
  totalCount: number
  entries: TodayBoardEntry[]
  visibleEntries: TodayBoardEntry[]
  isExpanded: boolean
  isCollapsible: boolean
}

const DEFAULT_VISIBLE_UNREAD_PER_FEED = 3
export const TODAY_BOARD_SUMMARY_MAX_CHARACTERS = 180

export function truncateTodayBoardSummary(
  summary: string,
  maxCharacters: number = TODAY_BOARD_SUMMARY_MAX_CHARACTERS
) {
  const characters = Array.from(summary)
  if (characters.length <= maxCharacters) return summary

  return `${characters.slice(0, maxCharacters).join('').trimEnd()}...`
}

export function getTodayCollectionRange(now: Date = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)

  const end = new Date(start)
  end.setDate(end.getDate() + 1)

  return {
    collected_after: start.toISOString(),
    collected_before: end.toISOString(),
  }
}

function parseTimestamp(value: string | null | undefined): Date | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function getEffectiveEntryTimestamp(entry: EntryWithState): Date | null {
  return (
    parseTimestamp(entry.published_at) ??
    parseTimestamp(entry.ingested_at) ??
    parseTimestamp(entry.created_at)
  )
}

export function getCollectionTimestamp(entry: EntryWithState): Date | null {
  return (
    parseTimestamp(entry.ingested_at) ??
    parseTimestamp(entry.created_at) ??
    parseTimestamp(entry.published_at)
  )
}

function isSameLocalDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}

export function buildTodayBoardEntries(
  entries: EntryWithState[],
  options: {
    now?: Date
    getFeedDescription?: (feedId: string) => string | null | undefined
  } = {}
): TodayBoardEntry[] {
  const now = options.now ?? new Date()
  const getFeedDescription = options.getFeedDescription ?? (() => null)

  return entries
    .map((entry) => {
      const collectionTimestamp = getCollectionTimestamp(entry)
      if (!collectionTimestamp || !isSameLocalDay(collectionTimestamp, now)) {
        return null
      }

      const effectiveTimestamp = getEffectiveEntryTimestamp(entry) ?? collectionTimestamp

      return {
        ...entry,
        feed_description: getFeedDescription(entry.feed_id) ?? null,
        effective_timestamp: effectiveTimestamp,
        collection_timestamp: collectionTimestamp,
      }
    })
    .filter((entry): entry is TodayBoardEntry => entry !== null)
    .sort((left, right) => {
      if (left.is_read !== right.is_read) {
        return left.is_read ? 1 : -1
      }

      return right.collection_timestamp.getTime() - left.collection_timestamp.getTime()
    })
}

export function buildTodayBoardGroups(
  entries: TodayBoardEntry[],
  options: {
    expandedFeedIds?: Set<string>
    selectedEntryId?: string | null
    visibleUnreadLimit?: number
  } = {}
): TodayBoardFeedGroup[] {
  const expandedFeedIds = options.expandedFeedIds ?? new Set<string>()
  const selectedEntryId = options.selectedEntryId ?? null
  const visibleUnreadLimit = options.visibleUnreadLimit ?? DEFAULT_VISIBLE_UNREAD_PER_FEED
  const groupsByFeed = new Map<string, TodayBoardEntry[]>()

  for (const entry of entries) {
    const groupEntries = groupsByFeed.get(entry.feed_id) ?? []
    groupEntries.push(entry)
    groupsByFeed.set(entry.feed_id, groupEntries)
  }

  return Array.from(groupsByFeed.entries())
    .map(([feedId, groupEntries]) => {
      const entriesForFeed = [...groupEntries].sort((left, right) => {
        if (left.is_read !== right.is_read) {
          return left.is_read ? 1 : -1
        }

        return right.collection_timestamp.getTime() - left.collection_timestamp.getTime()
      })
      const unreadEntries = entriesForFeed.filter((entry) => !entry.is_read)
      const isExpanded = expandedFeedIds.has(feedId)
      const isCompleted = unreadEntries.length === 0
      const defaultVisibleEntries = isCompleted
        ? entriesForFeed.slice(0, visibleUnreadLimit)
        : unreadEntries.slice(0, visibleUnreadLimit)
      const selectedEntry = selectedEntryId
        ? entriesForFeed.find((entry) => entry.id === selectedEntryId)
        : undefined
      const visibleEntries =
        isExpanded || entriesForFeed.length <= defaultVisibleEntries.length
          ? entriesForFeed
          : selectedEntry && !defaultVisibleEntries.some((entry) => entry.id === selectedEntry.id)
            ? [...defaultVisibleEntries, selectedEntry]
            : defaultVisibleEntries

      return {
        feedId,
        feedTitle: entriesForFeed[0]?.feed_title ?? null,
        feedDescription: entriesForFeed[0]?.feed_description ?? null,
        feedIconUrl: entriesForFeed[0]?.feed_icon_url ?? null,
        unreadCount: unreadEntries.length,
        totalCount: entriesForFeed.length,
        entries: entriesForFeed,
        visibleEntries,
        isExpanded,
        isCollapsible: entriesForFeed.length > defaultVisibleEntries.length,
      }
    })
    .sort((left, right) => {
      const leftCompleted = left.unreadCount === 0
      const rightCompleted = right.unreadCount === 0
      if (leftCompleted !== rightCompleted) {
        return leftCompleted ? 1 : -1
      }

      const leftLatest = left.entries[0]?.collection_timestamp.getTime() ?? 0
      const rightLatest = right.entries[0]?.collection_timestamp.getTime() ?? 0
      return rightLatest - leftLatest
    })
}
