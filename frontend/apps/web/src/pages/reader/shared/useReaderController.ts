import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

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

  useEffect(() => {
    setSelectedEntryId(entryIdFromUrl)
  }, [entryIdFromUrl])

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
  }
}
