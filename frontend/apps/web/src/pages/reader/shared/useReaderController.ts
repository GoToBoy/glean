import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  buildRecentTodayBoardDates,
  getTodayBoardDateKey,
  resolveTodayBoardDateParam,
} from './todayBoard'

export type FilterType = 'all' | 'unread' | 'smart' | 'read-later'

const VALID_FILTERS: FilterType[] = ['all', 'unread', 'smart', 'read-later']

/**
 * Route/state controller for reader page-level URL state and selection state.
 */
export function useReaderController() {
  const [searchParams, setSearchParams] = useSearchParams()

  const selectedFeedId = searchParams.get('feed') || undefined
  const selectedFolderId = searchParams.get('folder') || undefined
  const entryIdFromUrl = searchParams.get('entry') || null
  const viewParam = searchParams.get('view') || undefined
  const tabParam = searchParams.get('tab') as FilterType | null
  const isSmartView = viewParam === 'smart'
  const isTodayBoardView = viewParam === 'today-board'
  const todayBoardDateParam = isTodayBoardView ? searchParams.get('date') : null
  const todayBoardNow = new Date()
  const todayBoardTodayDate = getTodayBoardDateKey(todayBoardNow)
  const todayBoardDate = isTodayBoardView
    ? resolveTodayBoardDateParam(todayBoardDateParam, todayBoardNow)
    : todayBoardTodayDate
  const recentTodayBoardDates = buildRecentTodayBoardDates(todayBoardNow)

  const [filterType, setFilterType] = useState<FilterType>(() => {
    if (isTodayBoardView) {
      return 'all'
    }
    if (tabParam && VALID_FILTERS.includes(tabParam)) {
      return tabParam
    }
    return 'unread'
  })

  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(entryIdFromUrl)

  const syncEntryParam = useCallback(
    (entryId: string | null, replace = false) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (entryId) {
            next.set('entry', entryId)
          } else {
            next.delete('entry')
          }
          return next
        },
        { replace }
      )
    },
    [setSearchParams]
  )

  const selectEntry = useCallback(
    (entryId: string) => {
      if (selectedEntryId === entryId && entryIdFromUrl === entryId) return
      setSelectedEntryId(entryId)
      syncEntryParam(entryId, false)
    },
    [selectedEntryId, entryIdFromUrl, syncEntryParam]
  )

  const clearSelectedEntry = useCallback(
    (replace = true) => {
      if (!selectedEntryId && !entryIdFromUrl) return
      setSelectedEntryId(null)
      syncEntryParam(null, replace)
    },
    [selectedEntryId, entryIdFromUrl, syncEntryParam]
  )

  const setTodayBoardDate = useCallback(
    (dateKey: string) => {
      const now = new Date()
      const todayKey = getTodayBoardDateKey(now)
      const resolvedDateKey = resolveTodayBoardDateParam(dateKey, now)

      setSelectedEntryId(null)
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('view', 'today-board')
          next.delete('entry')
          next.delete('tab')

          if (resolvedDateKey === todayKey) {
            next.delete('date')
          } else {
            next.set('date', resolvedDateKey)
          }

          return next
        },
        { replace: false }
      )
    },
    [setSearchParams]
  )

  useEffect(() => {
    setSelectedEntryId(entryIdFromUrl)
  }, [entryIdFromUrl])

  useEffect(() => {
    if (!isTodayBoardView || !todayBoardDateParam) return
    if (todayBoardDateParam === todayBoardDate && todayBoardDate !== todayBoardTodayDate) return

    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (todayBoardDate === todayBoardTodayDate) {
          next.delete('date')
        } else {
          next.set('date', todayBoardDate)
        }
        return next
      },
      { replace: true }
    )
  }, [
    isTodayBoardView,
    todayBoardDateParam,
    todayBoardDate,
    todayBoardTodayDate,
    setSearchParams,
  ])

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (isTodayBoardView) {
          next.delete('tab')
        } else if (tabParam !== filterType) {
          next.set('tab', filterType)
        } else {
          return prev
        }
        return next
      },
      { replace: true }
    )
  }, [filterType, isTodayBoardView, tabParam, setSearchParams])

  return {
    selectedFeedId,
    selectedFolderId,
    entryIdFromUrl,
    viewParam,
    isSmartView,
    isTodayBoardView,
    filterType,
    setFilterType,
    selectedEntryId,
    selectEntry,
    clearSelectedEntry,
    todayBoardDate,
    todayBoardTodayDate,
    recentTodayBoardDates,
    setTodayBoardDate,
  }
}
