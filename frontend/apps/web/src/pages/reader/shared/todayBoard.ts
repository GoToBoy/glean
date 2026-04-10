import type { EntryWithState } from '@glean/types'

export interface TodayBoardEntry extends EntryWithState {
  feed_description: string | null
  effective_timestamp: Date
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
      const effectiveTimestamp = getEffectiveEntryTimestamp(entry)
      if (!effectiveTimestamp || !isSameLocalDay(effectiveTimestamp, now)) {
        return null
      }

      return {
        ...entry,
        feed_description: getFeedDescription(entry.feed_id) ?? null,
        effective_timestamp: effectiveTimestamp,
      }
    })
    .filter((entry): entry is TodayBoardEntry => entry !== null)
    .sort((left, right) => {
      if (left.is_read !== right.is_read) {
        return left.is_read ? 1 : -1
      }

      return right.effective_timestamp.getTime() - left.effective_timestamp.getTime()
    })
}
