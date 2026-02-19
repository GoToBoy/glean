import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useInfiniteEntries, useEntry, useUpdateEntryState } from '../../../hooks/useEntries'
import { useEntryListEngagementTracking } from '../../../hooks/useEntryListEngagementTracking'
import { useReaderBehaviorConfig } from '../../../hooks/useReaderBehaviorConfig'
import { entryService } from '@glean/api-client'
import { useVectorizationStatus } from '../../../hooks/useVectorizationStatus'
import { ArticleReader, ArticleReaderSkeleton } from '../../../components/ArticleReader'
import { useAuthStore } from '../../../stores/authStore'
import { useUIStore } from '../../../stores/uiStore'
import { useTranslation } from '@glean/i18n'
import { useLanguageStore } from '../../../stores/languageStore'
import type { EntryWithState, ReaderListResumeMap } from '@glean/types'
import { Loader2, AlertCircle, Sparkles, Info, Inbox, Languages } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@glean/ui'
import { useReaderController, type FilterType } from './useReaderController'
import {
  BookOpenIcon,
  ResizeHandle,
  EntryListItem,
  MarkAllReadButton,
  EntryListItemSkeleton,
  ReaderSmartTabs,
  ReaderFilterTabs,
} from './components/ReaderCoreParts'
import { stripHtmlTags } from '../../../lib/html'

const FILTER_ORDER: FilterType[] = ['all', 'unread', 'smart', 'read-later']
const READER_LIST_RESUME_MAX_SCOPES = 60
const READER_LIST_RESUME_MAX_FETCH_ATTEMPTS = 30

function isLikelyEnglishText(text: string): boolean {
  const sample = text.slice(0, 220)
  const latinMatches = sample.match(/[A-Za-z]/g)
  const chineseMatches = sample.match(/[\u4e00-\u9fff]/g)
  const latinCount = latinMatches?.length ?? 0
  const chineseCount = chineseMatches?.length ?? 0

  if (latinCount < 6) return false
  if (chineseCount === 0) return true
  return latinCount / Math.max(chineseCount, 1) > 2.5
}

/**
 * Reader page.
 *
 * Main reading interface with entry list, filters, and reading pane.
 */
export function ReaderCore({ isMobile }: { isMobile: boolean }) {
  const { t } = useTranslation('reader')
  const {
    selectedFeedId,
    selectedFolderId,
    entryIdFromUrl,
    viewParam,
    isSmartView,
    filterType,
    setFilterType,
    selectedEntryId,
    selectEntry,
    clearSelectedEntry,
  } = useReaderController()
  const { user, updateSettingsSilently } = useAuthStore()
  const { showPreferenceScore } = useUIStore()
  const { language } = useLanguageStore()

  // Check vectorization status for Smart view
  const { data: vectorizationStatus } = useVectorizationStatus()
  const { data: readerBehaviorConfig } = useReaderBehaviorConfig()
  const isVectorizationEnabled =
    vectorizationStatus?.enabled && vectorizationStatus?.status === 'idle'

  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)

  // Store the original position data of the selected entry when it was first clicked
  // This ensures the entry stays in its original position even after like/dislike/bookmark actions
  const selectedEntryOriginalDataRef = useRef<{
    id: string
    preferenceScore: number | null
    publishedAt: string | null
  } | null>(null)

  // Track previous view state for animations
  const prevViewRef = useRef<{
    feedId: string | undefined
    folderId: string | undefined
    isSmartView: boolean
  }>({ feedId: selectedFeedId, folderId: selectedFolderId, isSmartView })
  const [entriesWidth, setEntriesWidth] = useState(() => {
    const saved = localStorage.getItem('glean:entriesWidth')
    return saved !== null ? Number(saved) : 360
  })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isExitingArticle, setIsExitingArticle] = useState(false)
  const [isExitingEntryList, setIsExitingEntryList] = useState(false)
  const [isEnteringEntryList, setIsEnteringEntryList] = useState(false)
  const exitingEntryRef = useRef<EntryWithState | null>(null)
  const entryListRef = useRef<HTMLDivElement>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const translationObserverRef = useRef<IntersectionObserver | null>(null)
  const translationCacheRef = useRef<Map<string, string>>(new Map())
  const pendingTranslationEntryIdsRef = useRef<Set<string>>(new Set())
  const translatedEntryIdsRef = useRef<Set<string>>(new Set())
  const [isListTranslationActive, setIsListTranslationActive] = useState(
    user?.settings?.list_translation_auto_enabled ?? false
  )
  const [translatedEntryTexts, setTranslatedEntryTexts] = useState<
    Record<string, { title?: string; summary?: string }>
  >({})
  const [newEntriesAboveCount, setNewEntriesAboveCount] = useState(0)
  const restoredScopeKeyRef = useRef<string | null>(null)
  const resumeFetchAttemptsRef = useRef(0)
  const anchorPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingAnchorRef = useRef<{ scopeKey: string; entryId: string; index: number } | null>(null)
  const lastPersistedAnchorRef = useRef<string | null>(null)
  const autoMarkQueueRef = useRef<string[]>([])
  const autoMarkQueuedSetRef = useRef<Set<string>>(new Set())
  const autoMarkInFlightSetRef = useRef<Set<string>>(new Set())
  const autoMarkFailedUntilRef = useRef<Map<string, number>>(new Map())
  const autoMarkLastScrollTopRef = useRef(0)

  const updateMutation = useUpdateEntryState()

  // Computed value: whether we're using smart sorting (by preference score vs timeline)
  const usesSmartSorting = isSmartView || filterType === 'smart'

  const getFilterParams = () => {
    switch (filterType) {
      case 'unread':
        return { is_read: false }
      case 'smart':
        // Smart filter shows unread items with smart sorting (via line 148: view='smart')
        // Difference from 'unread': smart uses preference score sorting, unread uses timeline
        return { is_read: false }
      case 'read-later':
        return { read_later: true }
      default:
        return {}
    }
  }

  const {
    data: entriesData,
    isLoading,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteEntries({
    feed_id: selectedFeedId,
    folder_id: selectedFolderId,
    ...getFilterParams(),
    // The 'view' parameter differentiates 'smart' from 'unread' filters:
    // - 'smart': sorted by preference_score (descending)
    // - 'timeline': sorted by published_at (descending)
    // Both 'smart' and 'unread' filters use is_read: false, but differ in sort order
    view: usesSmartSorting ? 'smart' : 'timeline',
  })

  const rawEntries = entriesData?.pages.flatMap((page) => page.items) || []
  const listTrackingScopeKey = `${selectedFeedId || 'all'}:${selectedFolderId || 'none'}:${filterType}:${viewParam || 'timeline'}`
  const listResumePositions = useMemo<ReaderListResumeMap>(() => {
    const raw = user?.settings?.reader_list_resume_positions
    if (!raw || typeof raw !== 'object') return {}
    return raw
  }, [user?.settings?.reader_list_resume_positions])
  const currentResumeAnchor = listResumePositions[listTrackingScopeKey]
  const autoMarkReadOnScrollEnabled = user?.settings?.auto_mark_read_on_scroll_enabled ?? false
  const configuredThreshold = user?.settings?.auto_mark_read_on_scroll_threshold_screens
  const autoMarkReadThresholdScreens =
    typeof configuredThreshold === 'number' && configuredThreshold > 0 ? configuredThreshold : 1.5

  // Fetch selected entry separately to keep it visible even when filtered out of list
  const { data: selectedEntry, isLoading: isLoadingEntry } = useEntry(selectedEntryId || '')

  // Merge selected entry into the list if it's not already there
  // This ensures the currently viewed article doesn't disappear from the list
  // when marked as read while viewing in the "unread" tab or Smart view
  // However, for explicit filters like "read-later", we should show the real filtered results
  const entries = (() => {
    if (!selectedEntry || !selectedEntryId) return rawEntries
    const isSelectedInList = rawEntries.some((e) => e.id === selectedEntryId)
    if (isSelectedInList) return rawEntries

    // Keep selected entry visible for flexible filters (all, unread, smart),
    // not for strict filters (read-later) that must show exact matches
    const isStrictFilter = filterType === 'read-later'
    if (isStrictFilter) {
      return rawEntries
    }

    // For Smart view, keep the selected entry visible even if marked as read
    // This prevents the article from disappearing while the user is reading it
    // (Only applies when there's an actively selected entry)

    // Don't merge if the selected entry is from a different feed than the one being viewed
    // (when viewing a specific feed, not all feeds or a folder)
    if (selectedFeedId && selectedEntry.feed_id !== selectedFeedId) {
      return rawEntries
    }

    // For folder views, we still want to keep the selected entry visible
    // even if it's been marked as read and filtered out
    // The backend has already filtered by folder, so we know this entry belongs to the folder
    // if we have it in selectedEntry (it was in the list when user clicked it)

    // Insert selected entry at its ORIGINAL position based on sorting rules
    // Use the saved original data to ensure the position doesn't change after like/dislike/bookmark
    // In Smart view, entries are sorted by preference score (descending)
    // In timeline view, entries are sorted by published_at (descending)
    const originalData = selectedEntryOriginalDataRef.current

    // Merge the original preference_score back into the entry to ensure it displays correctly
    // This is needed because the single entry API may not return preference_score
    const entryWithOriginalScore =
      originalData?.id === selectedEntryId
        ? {
            ...selectedEntry,
            preference_score: originalData.preferenceScore ?? selectedEntry.preference_score,
          }
        : selectedEntry

    if (usesSmartSorting) {
      // For Smart view or Smart filter, insert based on ORIGINAL preference_score to maintain correct order
      // Use the saved original score, not the current score (which may have changed after like/dislike)
      const selectedScore =
        originalData?.id === selectedEntryId
          ? (originalData.preferenceScore ?? -1)
          : (selectedEntry.preference_score ?? -1)
      let insertIdx = rawEntries.findIndex((e) => {
        const entryScore = e.preference_score ?? -1
        return entryScore < selectedScore
      })
      if (insertIdx === -1) insertIdx = rawEntries.length
      return [
        ...rawEntries.slice(0, insertIdx),
        entryWithOriginalScore,
        ...rawEntries.slice(insertIdx),
      ]
    } else {
      // For timeline view, insert based on ORIGINAL published_at to maintain chronological order
      const publishedAt =
        originalData?.id === selectedEntryId ? originalData.publishedAt : selectedEntry.published_at
      const selectedDate = publishedAt ? new Date(publishedAt) : new Date(0)
      let insertIdx = rawEntries.findIndex((e) => {
        const entryDate = e.published_at ? new Date(e.published_at) : new Date(0)
        return entryDate < selectedDate
      })
      if (insertIdx === -1) insertIdx = rawEntries.length
      return [
        ...rawEntries.slice(0, insertIdx),
        entryWithOriginalScore,
        ...rawEntries.slice(insertIdx),
      ]
    }
  })()

  const entriesById = useMemo(() => {
    const map = new Map<string, EntryWithState>()
    for (const entry of entries) {
      map.set(entry.id, entry)
    }
    return map
  }, [entries])

  const entryIndexById = useMemo(() => {
    const map = new Map<string, number>()
    entries.forEach((entry, index) => {
      map.set(entry.id, index)
    })
    return map
  }, [entries])

  const listTranslationTargetLanguage = language === 'zh-CN' ? 'zh-CN' : 'en'
  const listTranslationEnglishOnly = user?.settings?.list_translation_english_only ?? true

  // Handle filter change with slide direction
  const handleFilterChange = (newFilter: FilterType) => {
    if (newFilter === filterType) return

    const currentIndex = FILTER_ORDER.indexOf(filterType)
    const newIndex = FILTER_ORDER.indexOf(newFilter)
    const direction = newIndex > currentIndex ? 'right' : 'left'

    setSlideDirection(direction)
    setFilterType(newFilter)

    // Reset slide direction after animation completes
    setTimeout(() => setSlideDirection(null), 250)
  }

  const scrollListToEntryIndex = useCallback(
    (index: number) => {
      const container = entryListRef.current
      if (!container) return
      if (entries.length === 0) {
        container.scrollTop = 0
        return
      }

      const clampedIndex = Math.max(0, Math.min(index, entries.length - 1))
      const targetEntry = entries[clampedIndex]
      if (!targetEntry) {
        container.scrollTop = 0
        return
      }

      const node = container.querySelector<HTMLElement>(`[data-entry-id="${targetEntry.id}"]`)
      if (!node) {
        if (clampedIndex === 0) container.scrollTop = 0
        return
      }
      node.scrollIntoView({ block: 'start', behavior: 'auto' })
    },
    [entries]
  )

  const persistResumeAnchor = useCallback(
    async (scopeKey: string, anchorEntryId: string, anchorIndex: number) => {
      if (!scopeKey || !anchorEntryId || anchorIndex < 0) return

      const marker = `${scopeKey}|${anchorEntryId}|${anchorIndex}`
      if (lastPersistedAnchorRef.current === marker) return

      const nowIso = new Date().toISOString()
      const currentSettings = useAuthStore.getState().user?.settings
      const currentPositions =
        currentSettings?.reader_list_resume_positions &&
        typeof currentSettings.reader_list_resume_positions === 'object'
          ? currentSettings.reader_list_resume_positions
          : {}
      const normalizedCurrentPositions: ReaderListResumeMap = Object.fromEntries(
        Object.entries(currentPositions).filter(([, value]: [string, any]) => {
          return (
            !!value &&
            typeof value === 'object' &&
            typeof value.anchor_entry_id === 'string' &&
            typeof value.anchor_index === 'number'
          )
        })
      )

      const nextPositions: ReaderListResumeMap = {
        ...normalizedCurrentPositions,
        [scopeKey]: {
          anchor_entry_id: anchorEntryId,
          anchor_index: anchorIndex,
          updated_at: nowIso,
        },
      }

      const prunedEntries = Object.entries(nextPositions)
        .sort(([, a], [, b]) => {
          const ta = Date.parse(a.updated_at || '') || 0
          const tb = Date.parse(b.updated_at || '') || 0
          return tb - ta
        })
        .slice(0, READER_LIST_RESUME_MAX_SCOPES)
      const pruned: ReaderListResumeMap = Object.fromEntries(prunedEntries)

      await updateSettingsSilently({ reader_list_resume_positions: pruned })
      lastPersistedAnchorRef.current = marker
    },
    [updateSettingsSilently]
  )

  const schedulePersistAnchor = useCallback(
    (scopeKey: string, entryId: string, index: number) => {
      pendingAnchorRef.current = { scopeKey, entryId, index }
      if (anchorPersistTimerRef.current) {
        clearTimeout(anchorPersistTimerRef.current)
      }
      anchorPersistTimerRef.current = setTimeout(() => {
        const pending = pendingAnchorRef.current
        if (!pending) return
        void persistResumeAnchor(pending.scopeKey, pending.entryId, pending.index)
      }, 1200)
    },
    [persistResumeAnchor]
  )

  const flushPersistAnchor = useCallback(() => {
    if (anchorPersistTimerRef.current) {
      clearTimeout(anchorPersistTimerRef.current)
      anchorPersistTimerRef.current = null
    }
    const pending = pendingAnchorRef.current
    if (!pending) return
    void persistResumeAnchor(pending.scopeKey, pending.entryId, pending.index)
  }, [persistResumeAnchor])

  const enqueueAutoMarkRead = useCallback((entryIds: string[]) => {
    const now = Date.now()
    entryIds.forEach((entryId) => {
      if (!entryId) return
      const cooldownUntil = autoMarkFailedUntilRef.current.get(entryId) ?? 0
      if (cooldownUntil > now) return
      if (autoMarkQueuedSetRef.current.has(entryId) || autoMarkInFlightSetRef.current.has(entryId)) {
        return
      }
      autoMarkQueueRef.current.push(entryId)
      autoMarkQueuedSetRef.current.add(entryId)
    })
  }, [])

  const drainAutoMarkReadQueue = useCallback(() => {
    const MAX_CONCURRENT = 2
    while (
      autoMarkInFlightSetRef.current.size < MAX_CONCURRENT &&
      autoMarkQueueRef.current.length > 0
    ) {
      const nextId = autoMarkQueueRef.current.shift()
      if (!nextId) continue
      autoMarkQueuedSetRef.current.delete(nextId)

      const entry = entriesById.get(nextId)
      if (!entry || entry.is_read) continue

      autoMarkInFlightSetRef.current.add(nextId)
      updateMutation
        .mutateAsync({
          entryId: nextId,
          data: { is_read: true },
        })
        .catch(() => {
          autoMarkFailedUntilRef.current.set(nextId, Date.now() + 30_000)
        })
        .finally(() => {
          autoMarkInFlightSetRef.current.delete(nextId)
          drainAutoMarkReadQueue()
        })
    }
  }, [entriesById, updateMutation])

  const handleJumpToNewEntries = useCallback(() => {
    const container = entryListRef.current
    if (!container) return
    container.scrollTop = 0
    setNewEntriesAboveCount(0)

    const firstEntry = entries[0]
    if (firstEntry) {
      schedulePersistAnchor(listTrackingScopeKey, firstEntry.id, 0)
      flushPersistAnchor()
    }
  }, [entries, listTrackingScopeKey, schedulePersistAnchor, flushPersistAnchor])

  // Infinite scroll: use Intersection Observer to detect when load-more element is visible
  useEffect(() => {
    const loadMoreElement = loadMoreRef.current
    const container = entryListRef.current

    if (!loadMoreElement || !container || isLoading) return

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries
        // Only fetch if the element is intersecting, has next page, and not already fetching
        if (entry.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage()
        }
      },
      {
        root: container,
        // Trigger prefetch earlier to avoid "must scroll to absolute bottom" on mobile.
        rootMargin: '500px 0px',
        threshold: 0,
      }
    )

    observer.observe(loadMoreElement)

    return () => {
      observer.disconnect()
    }
    // Refs (loadMoreRef, entryListRef) are stable and don't need to be in dependencies
    // Filter params (filterType, feedId, folderId, viewParam) are handled by React Query
    // fetchNextPage is stable and always uses current query parameters
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, isLoading])

  // Scroll handling: prefetch next page, persist resume anchors, and auto-mark read.
  useEffect(() => {
    const container = entryListRef.current
    if (!container || isLoading) return

    const onScroll = () => {
      const currentScrollTop = container.scrollTop

      if (hasNextPage && !isFetchingNextPage) {
        const remaining = container.scrollHeight - container.scrollTop - container.clientHeight
        if (remaining < 480) {
          fetchNextPage()
        }
      }
      if (currentScrollTop <= 4) {
        setNewEntriesAboveCount((prev) => (prev > 0 ? 0 : prev))
      }

      const entryNodes = container.querySelectorAll<HTMLElement>('[data-entry-id]')

      // Persist top visible anchor for cross-device resume.
      for (const node of entryNodes) {
        const nodeBottom = node.offsetTop + node.offsetHeight
        if (nodeBottom <= currentScrollTop + 1) continue
        const entryId = node.dataset.entryId
        if (!entryId) break
        const anchorIndex = entryIndexById.get(entryId)
        if (anchorIndex !== undefined) {
          schedulePersistAnchor(listTrackingScopeKey, entryId, anchorIndex)
        }
        break
      }

      // Auto-mark entries as read after scrolling past N screens.
      if (autoMarkReadOnScrollEnabled) {
        const previousScrollTop = autoMarkLastScrollTopRef.current
        autoMarkLastScrollTopRef.current = currentScrollTop
        if (currentScrollTop > previousScrollTop) {
          const readBoundary =
            currentScrollTop - container.clientHeight * autoMarkReadThresholdScreens
          if (readBoundary > 0) {
            const passedEntryIds: string[] = []
            for (const node of entryNodes) {
              const nodeBottom = node.offsetTop + node.offsetHeight
              if (nodeBottom > readBoundary) break
              const entryId = node.dataset.entryId
              if (!entryId) continue
              const entry = entriesById.get(entryId)
              if (entry && !entry.is_read) {
                passedEntryIds.push(entryId)
              }
            }
            if (passedEntryIds.length > 0) {
              enqueueAutoMarkRead(passedEntryIds)
              drainAutoMarkReadQueue()
            }
          }
        }
      } else {
        autoMarkLastScrollTopRef.current = currentScrollTop
      }
    }

    container.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      flushPersistAnchor()
      container.removeEventListener('scroll', onScroll)
    }
  }, [
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    isLoading,
    entryIndexById,
    listTrackingScopeKey,
    schedulePersistAnchor,
    flushPersistAnchor,
    autoMarkReadOnScrollEnabled,
    autoMarkReadThresholdScreens,
    entriesById,
    enqueueAutoMarkRead,
    drainAutoMarkReadQueue,
  ])

  // Initialize list translation toggle from persisted setting
  useEffect(() => {
    setIsListTranslationActive(user?.settings?.list_translation_auto_enabled ?? false)
  }, [user?.settings?.list_translation_auto_enabled])

  useEffect(() => {
    if (isListTranslationActive) return
    translatedEntryIdsRef.current.clear()
    pendingTranslationEntryIdsRef.current.clear()
    translationCacheRef.current.clear()
    setTranslatedEntryTexts({})
  }, [isListTranslationActive])

  const translateListEntry = useCallback(
    async (entryId: string) => {
      if (!isListTranslationActive) return
      if (pendingTranslationEntryIdsRef.current.has(entryId)) return
      if (translatedEntryIdsRef.current.has(entryId)) return
      if (listTranslationTargetLanguage === 'en' && listTranslationEnglishOnly) return

      const entry = entriesById.get(entryId)
      if (!entry) return

      const summaryPlain = stripHtmlTags(entry.summary || '').trim()
      const sourceTexts = [entry.title, summaryPlain]
        .filter((text) => text.length > 0)
        .filter((text) => (listTranslationEnglishOnly ? isLikelyEnglishText(text) : true))
      if (sourceTexts.length === 0) return

      const uncachedTexts = sourceTexts.filter((text) => !translationCacheRef.current.has(text))
      pendingTranslationEntryIdsRef.current.add(entryId)
      try {
        if (uncachedTexts.length > 0) {
          const response = await entryService.translateTexts(
            uncachedTexts,
            listTranslationTargetLanguage,
            'auto',
            entry.id
          )
          uncachedTexts.forEach((text, index) => {
            const translated = response.translations[index]
            if (translated && translated.trim()) {
              translationCacheRef.current.set(text, translated.trim())
            }
          })
        }

        setTranslatedEntryTexts((prev) => ({
          ...prev,
          [entryId]: {
            title: translationCacheRef.current.get(entry.title),
            summary: summaryPlain ? translationCacheRef.current.get(summaryPlain) : undefined,
          },
        }))
        translatedEntryIdsRef.current.add(entryId)
      } catch (error) {
        console.error('Failed to translate list entry:', error)
      } finally {
        pendingTranslationEntryIdsRef.current.delete(entryId)
      }
    },
    [
      entriesById,
      isListTranslationActive,
      listTranslationTargetLanguage,
      listTranslationEnglishOnly,
    ]
  )

  // Viewport-only list translation to reduce API usage
  useEffect(() => {
    if (!isListTranslationActive || !entryListRef.current || entries.length === 0) return

    const container = entryListRef.current
    let pendingIds: string[] = []
    let timer: ReturnType<typeof setTimeout> | null = null

    const observer = new IntersectionObserver(
      (intersectionEntries) => {
        const visibleIds = intersectionEntries
          .filter((item) => item.isIntersecting)
          .map((item) => (item.target as HTMLElement).dataset.entryId)
          .filter((id): id is string => !!id)

        if (visibleIds.length === 0) return
        pendingIds.push(...visibleIds)

        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          const unique = Array.from(new Set(pendingIds))
          pendingIds = []
          unique.forEach((id) => {
            void translateListEntry(id)
          })
        }, 120)
      },
      { root: container, rootMargin: '0px 0px 220px 0px', threshold: 0.1 }
    )

    translationObserverRef.current = observer
    const entryNodes = container.querySelectorAll('[data-entry-id]')
    entryNodes.forEach((node) => observer.observe(node))

    return () => {
      if (timer) clearTimeout(timer)
      observer.disconnect()
      translationObserverRef.current = null
    }
  }, [entries, isListTranslationActive, translateListEntry])

  // Reset filter when switching to smart view (default to unread)
  useEffect(() => {
    const prev = prevViewRef.current

    // When entering smart view, default to 'unread' filter
    if (isSmartView && !prev.isSmartView) {
      setFilterType('unread')
    }
    // When leaving smart view, reset to 'all' filter
    else if (!isSmartView && prev.isSmartView) {
      setFilterType('all')
    }
  }, [isSmartView])

  // Trigger animation on view change (Smart <-> Feed/Folder/All)
  // Also reset selected entry when switching views to prevent stale entries
  useEffect(() => {
    if (!entryIdFromUrl) {
      selectedEntryOriginalDataRef.current = null
    }
  }, [entryIdFromUrl])

  useEffect(() => {
    const prev = prevViewRef.current
    const viewChanged =
      prev.feedId !== selectedFeedId ||
      prev.folderId !== selectedFolderId ||
      prev.isSmartView !== isSmartView

    if (viewChanged) {
      // Clear selected entry when switching views
      // This prevents showing an entry from a different feed/folder in the new view
      // Only clear if the change is not due to URL entry parameter
      if (!entryIdFromUrl) {
        clearSelectedEntry(true)
      }

      // Determine slide direction based on view change
      // Smart view slides from left, others slide from right
      if (isSmartView && !prev.isSmartView) {
        setSlideDirection('left')
      } else if (!isSmartView && prev.isSmartView) {
        setSlideDirection('right')
      } else {
        // Feed to feed change - use right direction
        setSlideDirection('right')
      }

      // Update ref
      prevViewRef.current = { feedId: selectedFeedId, folderId: selectedFolderId, isSmartView }

      // Reset slide direction after animation
      setTimeout(() => setSlideDirection(null), 300)
    }
  }, [selectedFeedId, selectedFolderId, isSmartView, entryIdFromUrl, clearSelectedEntry])

  // Keyboard navigation: arrow keys and j/k to switch between entries
  const handleKeyboardNavigation = useCallback(
    (e: KeyboardEvent) => {
      // Ignore when focus is in input, textarea, or contenteditable elements
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      const isNext = e.key === 'ArrowDown' || e.key === 'j'
      const isPrev = e.key === 'ArrowUp' || e.key === 'k'
      if (!isNext && !isPrev) return

      e.preventDefault()

      if (entries.length === 0) return

      const currentIndex = selectedEntryId
        ? entries.findIndex((entry) => entry.id === selectedEntryId)
        : -1

      let nextIndex: number
      if (currentIndex === -1) {
        // No entry selected: select the first one
        nextIndex = 0
      } else if (isNext) {
        if (currentIndex >= entries.length - 1) return // Already at the end
        nextIndex = currentIndex + 1
      } else {
        if (currentIndex <= 0) return // Already at the beginning
        nextIndex = currentIndex - 1
      }

      const nextEntry = entries[nextIndex]
      if (nextEntry) {
        handleSelectEntry(nextEntry)
        // Scroll the entry into view within the list
        const entryEl = entryListRef.current?.querySelector(
          `[data-entry-id="${nextEntry.id}"]`
        )
        if (entryEl) {
          entryEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
        }
      }
    },
    [entries, selectedEntryId] // eslint-disable-line react-hooks/exhaustive-deps
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardNavigation)
    return () => document.removeEventListener('keydown', handleKeyboardNavigation)
  }, [handleKeyboardNavigation])

  // Handle entry selection - automatically mark as read
  const handleSelectEntry = async (entry: EntryWithState) => {
    // On mobile, trigger entry list exit animation while opening reader
    if (isMobile) {
      setIsExitingEntryList(true)
      selectEntry(entry.id)
      // Notify Layout to hide its header (ArticleReader will show its own)
      window.dispatchEvent(new CustomEvent('showArticleReader'))
    } else {
      selectEntry(entry.id)
    }

    // Save the original position data when first selecting an entry
    // This ensures the entry stays in place even after like/dislike/bookmark actions
    if (selectedEntryOriginalDataRef.current?.id !== entry.id) {
      selectedEntryOriginalDataRef.current = {
        id: entry.id,
        preferenceScore: entry.preference_score,
        publishedAt: entry.published_at,
      }
    }

    // Auto-mark as read when selecting an unread entry
    if (!entry.is_read) {
      await updateMutation.mutateAsync({
        entryId: entry.id,
        data: { is_read: true },
      })
    }
  }

  useEffect(() => {
    localStorage.setItem('glean:entriesWidth', String(entriesWidth))
  }, [entriesWidth])

  useEffect(() => {
    restoredScopeKeyRef.current = null
    resumeFetchAttemptsRef.current = 0
    autoMarkLastScrollTopRef.current = 0
    setNewEntriesAboveCount(0)
  }, [listTrackingScopeKey])

  // Restore list by anchor entry first, then fallback to anchor index.
  useEffect(() => {
    const container = entryListRef.current
    if (!container || isLoading) return
    if (restoredScopeKeyRef.current === listTrackingScopeKey) return

    const anchorEntryId = currentResumeAnchor?.anchor_entry_id
    const anchorIndex = Math.max(0, currentResumeAnchor?.anchor_index ?? 0)

    if (!currentResumeAnchor) {
      restoredScopeKeyRef.current = listTrackingScopeKey
      container.scrollTop = 0
      setNewEntriesAboveCount(0)
      return
    }

    const anchorEntryIndex =
      typeof anchorEntryId === 'string' && anchorEntryId.length > 0
        ? entryIndexById.get(anchorEntryId)
        : undefined

    if (anchorEntryIndex !== undefined) {
      const savedIndex = Math.max(0, anchorIndex)
      const deltaAbove = anchorEntryIndex - savedIndex
      setNewEntriesAboveCount(deltaAbove > 0 ? deltaAbove : 0)
      window.requestAnimationFrame(() => {
        scrollListToEntryIndex(anchorEntryIndex)
        restoredScopeKeyRef.current = listTrackingScopeKey
      })
      return
    }

    const shouldTryLoadingMore =
      hasNextPage &&
      !isFetchingNextPage &&
      resumeFetchAttemptsRef.current < READER_LIST_RESUME_MAX_FETCH_ATTEMPTS &&
      (anchorEntryId || anchorIndex >= entries.length)

    if (shouldTryLoadingMore) {
      resumeFetchAttemptsRef.current += 1
      void fetchNextPage()
      return
    }

    window.requestAnimationFrame(() => {
      scrollListToEntryIndex(anchorIndex)
      restoredScopeKeyRef.current = listTrackingScopeKey
      setNewEntriesAboveCount(0)
    })
  }, [
    isLoading,
    listTrackingScopeKey,
    currentResumeAnchor,
    entryIndexById,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
    entries.length,
    scrollListToEntryIndex,
  ])

  useEffect(() => {
    return () => {
      flushPersistAnchor()
    }
  }, [flushPersistAnchor])

  // On mobile, keep list mounted to preserve scroll position and observer bindings.
  const isReaderVisibleOnMobile = isMobile && (!!selectedEntryId || isExitingArticle)
  const showReader = !isMobile || !!selectedEntryId
  const trackedEntryIds = useMemo(() => entries.map((entry) => entry.id), [entries])

  useEntryListEngagementTracking({
    entryIds: trackedEntryIds,
    scrollContainerRef: entryListRef,
    scopeKey: listTrackingScopeKey,
    minVisibleRatio: readerBehaviorConfig?.list_min_visible_ratio ?? 0.5,
    exposedMs: readerBehaviorConfig?.list_exposed_ms ?? 300,
    skimmedMs: readerBehaviorConfig?.list_skimmed_ms ?? 600,
    enabled: entries.length > 0 && !isLoading,
  })

  useEffect(() => {
    const onToggleTranslation = () => {
      if (!isMobile || isReaderVisibleOnMobile) return
      setIsListTranslationActive((v) => !v)
    }
    const onSetFilter = (event: Event) => {
      if (!isMobile || isReaderVisibleOnMobile) return
      const detail = (event as CustomEvent).detail as { filter?: FilterType } | undefined
      const nextFilter = detail?.filter
      if (!nextFilter || !FILTER_ORDER.includes(nextFilter)) return
      handleFilterChange(nextFilter)
    }

    window.addEventListener('readerMobileListActions:toggleTranslation', onToggleTranslation)
    window.addEventListener('readerMobileListActions:setFilter', onSetFilter)
    return () => {
      window.removeEventListener('readerMobileListActions:toggleTranslation', onToggleTranslation)
      window.removeEventListener('readerMobileListActions:setFilter', onSetFilter)
    }
  }, [isMobile, isReaderVisibleOnMobile, filterType]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={`flex h-full ${isMobile ? 'relative' : ''}`}>
      {/* Entry list */}
      {!isFullscreen && (
        <>
          <div
            className={`border-border bg-card/50 relative flex min-w-0 flex-col border-r ${
              isMobile
                ? `absolute inset-0 z-10 w-full transition-opacity duration-200 ${
                    isExitingEntryList
                      ? 'entry-list-transition-exit'
                      : isEnteringEntryList
                        ? 'entry-list-transition'
                        : isReaderVisibleOnMobile
                          ? 'pointer-events-none opacity-0'
                        : ''
                  }`
                : ''
            }`}
            style={
              !isMobile
                ? { width: `${entriesWidth}px`, minWidth: '280px', maxWidth: '500px' }
                : undefined
            }
            onAnimationEnd={(e) => {
              // Only handle the entry list animation end, not nested animations
              if (isMobile && e.currentTarget === e.target) {
                if (isExitingEntryList) {
                  setIsExitingEntryList(false)
                }
                if (isEnteringEntryList) {
                  setIsEnteringEntryList(false)
                }
              }
            }}
          >
            {/* Filters */}
            {!isMobile && (
              <div className="border-border bg-card border-b px-3 py-2">
                <>
                  {isSmartView && !selectedFeedId && !selectedFolderId ? (
                    /* Smart view header + filters */
                    <div className="space-y-2">
                      {/* Smart Header */}
                      <div className="bg-primary/5 animate-fade-in flex min-w-0 items-center gap-2 rounded-lg px-3 py-1">
                        <Sparkles className="text-primary h-4 w-4 animate-pulse" />
                        <span className="text-primary text-sm font-medium">{t('smart.title')}</span>
                        <span className="text-muted-foreground text-xs">
                          {t('smart.description')}
                        </span>
                      </div>
                      {/* Filter tabs for Smart view */}
                      <div className="bg-muted/50 @container flex min-w-0 items-center gap-1 rounded-lg p-1">
                        <ReaderSmartTabs
                          filterType={filterType}
                          onFilterChange={handleFilterChange}
                        />
                      </div>
                    </div>
                  ) : (
                    /* Regular view filters */
                    <div className="flex items-center gap-2">
                      {/* Filter tabs */}
                      <div className="bg-muted/50 @container flex min-w-0 flex-1 items-center gap-1 rounded-lg p-1">
                        <ReaderFilterTabs
                          filterType={filterType}
                          onFilterChange={handleFilterChange}
                        />
                      </div>

                      <button
                        onClick={() => setIsListTranslationActive((v) => !v)}
                        title={
                          isListTranslationActive
                            ? t('translation.hideTranslation')
                            : t('translation.translate')
                        }
                        className={`hover:bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors ${
                          isListTranslationActive ? 'text-primary' : 'text-muted-foreground'
                        }`}
                      >
                        <Languages className="h-4 w-4" />
                      </button>

                      {/* Mark all read button */}
                      <MarkAllReadButton feedId={selectedFeedId} folderId={selectedFolderId} />
                    </div>
                  )}
                </>
              </div>
            )}

            {/* Smart view banner when vectorization is disabled */}
            {isSmartView && !isVectorizationEnabled && (
              <div className="border-border bg-muted/30 border-b px-3 py-2">
                <div className="flex items-start gap-2 text-sm">
                  <Info className="text-muted-foreground mt-0.5 h-4 w-4 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-foreground font-medium">{t('smart.limitedMode')}</p>
                    <p className="text-muted-foreground">{t('smart.enableVectorizationHint')}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Entry list */}
            <div
              ref={entryListRef}
              className="reader-pan-y no-horizontal-overscroll flex-1 overflow-y-auto"
            >
              <div
                key={`${selectedFeedId || 'all'}-${selectedFolderId || 'none'}-${filterType}-${viewParam || 'timeline'}`}
                className={`feed-content-transition ${
                  slideDirection === 'right'
                    ? 'animate-slide-from-right'
                    : slideDirection === 'left'
                      ? 'animate-slide-from-left'
                      : ''
                }`}
              >
                {newEntriesAboveCount > 0 && (
                  <div className="sticky top-0 z-20 px-2 pt-2">
                    <button
                      type="button"
                      onClick={handleJumpToNewEntries}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 w-full rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition-colors"
                    >
                      {t('entries.newAbove', { count: newEntriesAboveCount })} ·{' '}
                      {t('entries.jumpToNew')}
                    </button>
                  </div>
                )}

                {isLoading && (
                  <div className="divide-border/40 divide-y px-1 py-0.5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <EntryListItemSkeleton key={index} />
                    ))}
                  </div>
                )}

                {error && (
                  <div className="p-4">
                    <Alert variant="error">
                      <AlertCircle />
                      <AlertTitle>{t('entries.loadError')}</AlertTitle>
                      <AlertDescription>{(error as Error).message}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {entries.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="bg-muted mb-4 flex h-16 w-16 items-center justify-center rounded-full">
                      <Inbox className="text-muted-foreground h-8 w-8" />
                    </div>
                    <p className="text-muted-foreground">{t('entries.noEntries')}</p>
                    <p className="text-muted-foreground/60 mt-1 text-xs">
                      {t('empty.tryChangingFilter')}
                    </p>
                  </div>
                )}

                <div className="divide-border/40 divide-y px-1 py-0.5">
                  {entries.map((entry, index) => (
                    <EntryListItem
                      key={entry.id}
                      entry={entry}
                      isSelected={selectedEntryId === entry.id}
                      onClick={() => handleSelectEntry(entry)}
                      style={{ animationDelay: `${index * 0.03}s` }}
                      showFeedInfo={!selectedFeedId}
                      showReadLaterRemaining={
                        !isMobile &&
                        filterType === 'read-later' &&
                        (user?.settings?.show_read_later_remaining ?? true)
                      }
                      showPreferenceScore={usesSmartSorting && showPreferenceScore}
                      hideReadStatusIndicator={isMobile}
                      hideReadLaterIndicator={isMobile}
                      translatedTitle={
                        isListTranslationActive ? translatedEntryTexts[entry.id]?.title : undefined
                      }
                      translatedSummary={
                        isListTranslationActive ? translatedEntryTexts[entry.id]?.summary : undefined
                      }
                      dataEntryId={entry.id}
                    />
                  ))}
                </div>

                {/* Intersection observer target for infinite scroll */}
                {hasNextPage && !isFetchingNextPage && entries.length > 0 && (
                  <div ref={loadMoreRef} className="h-4" />
                )}

                {/* Loading more indicator */}
                {isFetchingNextPage && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
                    <span className="text-muted-foreground ml-2 text-sm">
                      {t('entries.loadingMore')}
                    </span>
                  </div>
                )}

                {/* End of list indicator */}
                {!hasNextPage && entries.length > 0 && (
                  <div className="flex items-center justify-center py-6">
                    <span className="text-muted-foreground text-sm">
                      {t('entries.noMoreEntries')}
                    </span>
                  </div>
                )}
              </div>
            </div>
            {/* Resize handle - desktop only, positioned inside container */}
            {!isMobile && (
              <ResizeHandle
                onResize={(delta) =>
                  setEntriesWidth((w) => Math.max(280, Math.min(500, w + delta)))
                }
              />
            )}
          </div>
        </>
      )}

      {/* Reading pane */}
      {(showReader || isExitingArticle) && (
        <div
          key={selectedEntryId || 'exiting'}
          className={`flex min-w-0 flex-1 flex-col ${
            isMobile
              ? `absolute inset-0 z-20 ${isExitingArticle ? 'reader-transition-exit' : 'reader-transition'}`
              : isExitingArticle
                ? 'reader-transition-exit'
                : 'reader-transition'
          }`}
          onAnimationEnd={() => {
            if (isExitingArticle) {
              setIsExitingArticle(false)
              exitingEntryRef.current = null
            }
          }}
        >
          {isLoadingEntry && selectedEntryId ? (
            <ArticleReaderSkeleton />
          ) : selectedEntry || exitingEntryRef.current ? (
            <ArticleReader
              entry={(selectedEntry || exitingEntryRef.current)!}
              onClose={() => {
                if (isMobile && selectedEntry) {
                  // Notify Layout to show its header immediately (starts fade-in animation
                  // concurrently with reader slide-out animation)
                  window.dispatchEvent(new CustomEvent('hideArticleReader'))
                  exitingEntryRef.current = selectedEntry
                  setIsExitingArticle(true)
                  setIsEnteringEntryList(true)
                  clearSelectedEntry(true)
                } else {
                  clearSelectedEntry(true)
                }
              }}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
            />
          ) : !isMobile ? (
            <div className="bg-background flex min-w-0 flex-1 flex-col items-center justify-center">
              <div className="text-center">
                <div className="bg-muted mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl">
                  <BookOpenIcon className="text-muted-foreground h-10 w-10" />
                </div>
                <h3 className="font-display text-foreground text-lg font-semibold">
                  {t('empty.selectArticle')}
                </h3>
                <p className="text-muted-foreground mt-1 text-sm">
                  {t('empty.selectArticleDescription')}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
