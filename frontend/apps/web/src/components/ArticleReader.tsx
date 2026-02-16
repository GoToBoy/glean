import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useContentRenderer } from '../hooks/useContentRenderer'
import { useUpdateEntryState, entryKeys } from '../hooks/useEntries'
import { bookmarkService } from '@glean/api-client'
import { useTranslation } from '@glean/i18n'
import type { EntryWithState } from '@glean/types'
import {
  CheckCheck,
  Clock,
  Archive,
  ExternalLink,
  Globe,
  Languages,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  ChevronLeft,
  Menu as MenuIcon,
  Ellipsis,
  ThumbsDown,
  ThumbsUp,
} from 'lucide-react'
import { format } from 'date-fns'
import { processHtmlContent } from '../lib/html'
import { detectTargetLanguage } from '../lib/languageDetect'
import {
  Button,
  Skeleton,
  Sheet,
  SheetPopup,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetPanel,
} from '@glean/ui'
import { ArticleOutline } from './ArticleOutline'
import { PreferenceButtons } from './EntryActions/PreferenceButtons'
import { useViewportTranslation } from '../hooks/useViewportTranslation'
import { useEntryEngagementTracking } from '../hooks/useEntryEngagementTracking'
import { useEndOfArticleFeedbackPrompt } from '../hooks/useEndOfArticleFeedbackPrompt'

/**
 * Hook to track animation state for action buttons
 * Returns the animation class only once when state changes from false to true
 */
function useAnimationTrigger(isActive: boolean | null | undefined, animationClass: string) {
  const prevState = useRef(isActive)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useEffect(() => {
    // Only trigger animation when state changes to active
    if (isActive && !prevState.current) {
      setShouldAnimate(true)
      // Reset animation state after animation completes
      const timer = setTimeout(() => setShouldAnimate(false), 500)
      return () => clearTimeout(timer)
    }
    prevState.current = isActive
  }, [isActive])

  return shouldAnimate ? animationClass : ''
}

interface ArticleReaderProps {
  entry: EntryWithState
  onClose?: () => void
  isFullscreen?: boolean
  onToggleFullscreen?: () => void
  /**
   * Show close button. Defaults to `true` on mobile, `false` on desktop.
   * Override with explicit boolean if needed.
   */
  showCloseButton?: boolean
  /**
   * Show fullscreen toggle button. Defaults to `true` on desktop, `false` on mobile.
   * Override with explicit boolean if needed.
   */
  showFullscreenButton?: boolean
  /** Hide read/unread status actions (for bookmarks page) */
  hideReadStatus?: boolean
}

/**
 * Hook to detect mobile viewport
 */
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false
  )

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < breakpoint)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [breakpoint])

  return isMobile
}

/**
 * Hook for auto-hiding bars on scroll
 */
function useScrollHide(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  resetKey?: string
) {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return

    const currentScrollY = scrollContainerRef.current.scrollTop
    const scrollHeight = scrollContainerRef.current.scrollHeight
    const clientHeight = scrollContainerRef.current.clientHeight
    const scrollDelta = currentScrollY - lastScrollY.current

    // Check if scrolled to bottom (with 10px tolerance)
    const isAtBottom = scrollHeight - currentScrollY - clientHeight < 10

    // Show bars when at top, at bottom, or scrolling up
    if (currentScrollY < 50 || isAtBottom) {
      setIsVisible(true)
    } else if (scrollDelta > 5) {
      // Scrolling down - hide
      setIsVisible(false)
    } else if (scrollDelta < -5) {
      // Scrolling up - show
      setIsVisible(true)
    }

    lastScrollY.current = currentScrollY
    ticking.current = false
  }, [scrollContainerRef])

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    const onScroll = () => {
      if (!ticking.current) {
        requestAnimationFrame(handleScroll)
        ticking.current = true
      }
    }

    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', onScroll)
  }, [handleScroll, scrollContainerRef])

  useEffect(() => {
    // Reset bars visibility for each newly opened article.
    setIsVisible(true)
    const scrollTop = scrollContainerRef.current?.scrollTop ?? 0
    lastScrollY.current = scrollTop
  }, [resetKey, scrollContainerRef])

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current
    if (!scrollContainer) return

    // Keep controls discoverable on first touch/drag.
    const onTouchStart = () => setIsVisible(true)
    scrollContainer.addEventListener('touchstart', onTouchStart, { passive: true })
    return () => scrollContainer.removeEventListener('touchstart', onTouchStart)
  }, [scrollContainerRef])

  return isVisible
}

/**
 * Mobile close gestures:
 * - Pull down to close when scrolled to top.
 * - Edge swipe right (from left edge) to close.
 */
function useMobileCloseGestures(
  scrollContainerRef: React.RefObject<HTMLDivElement | null>,
  enabled: boolean,
  onClose?: () => void
) {
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  const pullDistanceRef = useRef(0)
  const edgeSwipeDistanceRef = useRef(0)
  const startedFromLeftEdgeRef = useRef(false)

  const onTouchStart = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!enabled) return
      if (!scrollContainerRef.current || scrollContainerRef.current.scrollTop > 0) return

      const touch = e.touches[0]
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
      pullDistanceRef.current = 0
      edgeSwipeDistanceRef.current = 0
      startedFromLeftEdgeRef.current = touch.clientX <= 36
    },
    [enabled, scrollContainerRef]
  )

  const onTouchMove = useCallback(
    (e: React.TouchEvent<HTMLDivElement>) => {
      if (!enabled || !touchStartRef.current) return
      const touch = e.touches[0]
      const dx = touch.clientX - touchStartRef.current.x
      const dy = touch.clientY - touchStartRef.current.y

      // Only track mostly-vertical downward movement.
      if (dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        pullDistanceRef.current = dy
      } else {
        pullDistanceRef.current = 0
      }

      // Track left-edge horizontal swipe-to-close.
      if (startedFromLeftEdgeRef.current && dx > 0 && Math.abs(dx) > Math.abs(dy) * 1.2) {
        edgeSwipeDistanceRef.current = dx
      } else {
        edgeSwipeDistanceRef.current = 0
      }
    },
    [enabled]
  )

  const onTouchEnd = useCallback(() => {
    if (!enabled || !touchStartRef.current) return

    const shouldCloseByPull = pullDistanceRef.current > 96
    const shouldCloseByEdgeSwipe = edgeSwipeDistanceRef.current > 96
    touchStartRef.current = null
    pullDistanceRef.current = 0
    edgeSwipeDistanceRef.current = 0
    startedFromLeftEdgeRef.current = false

    if ((shouldCloseByPull || shouldCloseByEdgeSwipe) && onClose) {
      onClose()
    }
  }, [enabled, onClose])

  return { onTouchStart, onTouchMove, onTouchEnd }
}

/**
 * Standalone article reader component.
 *
 * Displays article content with actions like like, bookmark, mark read, etc.
 * Can be used in the reader page or as a slide-out panel in bookmarks.
 */
export function ArticleReader({
  entry,
  onClose,
  isFullscreen = false,
  onToggleFullscreen,
  showCloseButton,
  showFullscreenButton,
  hideReadStatus = false,
}: ArticleReaderProps) {
  const { t } = useTranslation('reader')
  const queryClient = useQueryClient()

  const handleOpenMenu = () => {
    // Dispatch custom event to open mobile sidebar in Layout
    window.dispatchEvent(new CustomEvent('openMobileSidebar'))
  }
  const updateMutation = useUpdateEntryState()

  // Always render original content — translations are inserted into DOM by the hook
  const displayContent = entry.content || entry.summary || undefined

  const contentRef = useContentRenderer(displayContent)
  const [isBookmarking, setIsBookmarking] = useState(false)
  const [isMoreSheetOpen, setIsMoreSheetOpen] = useState(false)
  const [hasOutline, setHasOutline] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [showOriginalInline, setShowOriginalInline] = useState(false)
  const [iframeStatus, setIframeStatus] = useState<'idle' | 'loading' | 'loaded' | 'blocked'>('idle')
  const iframeTimeoutRef = useRef<number | null>(null)

  // Viewport-based sentence-level translation
  const targetLanguage = useMemo(
    () => detectTargetLanguage(entry.title + ' ' + (entry.content || entry.summary || '')),
    [entry.title, entry.content, entry.summary],
  )
  const {
    isActive: showTranslation,
    isTranslating,
    error: translationError,
    toggle: toggleTranslation,
    activate: activateTranslation,
  } = useViewportTranslation({
    contentRef,
    scrollContainerRef,
    targetLanguage,
    entryId: entry.id,
  })
  const isMobile = useIsMobile()
  const barsVisible = useScrollHide(scrollContainerRef, entry.id)
  const closeGestureHandlers = useMobileCloseGestures(scrollContainerRef, isMobile, onClose)
  useEntryEngagementTracking({
    entryId: entry.id,
    content: displayContent,
    scrollContainerRef,
  })
  const { showPrompt, dismissPrompt } = useEndOfArticleFeedbackPrompt({
    entryId: entry.id,
    isLiked: entry.is_liked,
    content: displayContent,
    scrollContainerRef,
  })

  // Apply smart defaults based on mobile detection
  // On mobile: show close button, hide fullscreen button
  // On desktop: hide close button, show fullscreen button
  const shouldShowCloseButton = showCloseButton ?? isMobile
  const shouldShowFullscreenButton = showFullscreenButton ?? !isMobile

  // Reset outline state when entry changes
  useEffect(() => {
    setHasOutline(false)
    setShowOriginalInline(false)
    setIframeStatus('idle')
  }, [entry.id])

  const clearIframeTimeout = useCallback(() => {
    if (iframeTimeoutRef.current !== null) {
      window.clearTimeout(iframeTimeoutRef.current)
      iframeTimeoutRef.current = null
    }
  }, [])

  useEffect(
    () => () => {
      clearIframeTimeout()
    },
    [clearIframeTimeout]
  )

  // Animation triggers for action buttons
  const readLaterAnimation = useAnimationTrigger(entry.read_later, 'action-btn-clock-active')
  const bookmarkAnimation = useAnimationTrigger(entry.is_bookmarked, 'action-btn-archive-active')
  const readAnimation = useAnimationTrigger(entry.is_read, 'action-btn-check')

  const handleToggleRead = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { is_read: !entry.is_read },
    })
  }

  const handleToggleReadLater = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { read_later: !entry.read_later },
    })
  }

  const handleToggleBookmark = async () => {
    setIsBookmarking(true)
    try {
      if (entry.is_bookmarked && entry.bookmark_id) {
        // Remove bookmark
        await bookmarkService.deleteBookmark(entry.bookmark_id)
      } else {
        // Create bookmark
        await bookmarkService.createBookmark({
          entry_id: entry.id,
        })
      }
      // Invalidate queries to refetch with updated is_bookmarked status
      await queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
      await queryClient.invalidateQueries({ queryKey: entryKeys.detail(entry.id) })
    } catch (err) {
      console.error('Failed to toggle bookmark:', err)
    } finally {
      setIsBookmarking(false)
    }
  }

  const handlePromptFeedback = async (liked: boolean) => {
    if (isSubmittingFeedback) return
    setIsSubmittingFeedback(true)
    try {
      await updateMutation.mutateAsync({
        entryId: entry.id,
        data: { is_liked: liked },
      })
      dismissPrompt()
    } finally {
      setIsSubmittingFeedback(false)
    }
  }

  const handleOpenOriginalInline = () => {
    if (showOriginalInline) {
      clearIframeTimeout()
      setShowOriginalInline(false)
      setIframeStatus('idle')
      return
    }

    setShowOriginalInline(true)
    setIframeStatus('loading')
    clearIframeTimeout()
    iframeTimeoutRef.current = window.setTimeout(() => {
      setIframeStatus((prev) => (prev === 'loading' ? 'blocked' : prev))
    }, 4500)
  }

  const handleIframeLoaded = () => {
    clearIframeTimeout()
    setIframeStatus('loaded')
  }

  const handleIframeError = () => {
    clearIframeTimeout()
    setIframeStatus('blocked')
  }

  const handleOpenExternal = () => {
    window.open(entry.url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="bg-background relative flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Mobile Header - auto-hide on scroll */}
      {isMobile && (
        <div
          className={`border-border bg-card/95 absolute inset-x-0 top-0 z-10 border-b backdrop-blur-sm transition-transform duration-300 ${
            barsVisible ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <div className="flex h-14 items-center gap-2 px-4">
            {shouldShowCloseButton && onClose ? (
              <button
                onClick={onClose}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            ) : (
              <button
                onClick={handleOpenMenu}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors"
              >
                <MenuIcon className="h-5 w-5" />
              </button>
            )}
            <h1 className="text-foreground min-w-0 flex-1 truncate text-base font-semibold">
              {entry.title}
            </h1>
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobile && (
        <div className="border-border bg-card border-b px-6 py-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h1 className="font-display text-foreground text-2xl leading-tight font-bold">
              {entry.title}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {shouldShowFullscreenButton && onToggleFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleFullscreen}
                  title={isFullscreen ? t('actions.exitFullscreen') : t('actions.fullscreen')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isFullscreen ? (
                    <Minimize2 className="h-5 w-5" />
                  ) : (
                    <Maximize2 className="h-5 w-5" />
                  )}
                </Button>
              )}
              {shouldShowCloseButton && onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  title={t('actions.close')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>

          <div className="text-muted-foreground mb-4 flex items-center gap-3 text-sm">
            {entry.author && <span className="font-medium">{entry.author}</span>}
            {entry.author && entry.published_at && <span>·</span>}
            {entry.published_at && (
              <span>{format(new Date(entry.published_at), 'MMMM d, yyyy')}</span>
            )}
          </div>

          {/* Desktop Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleOpenOriginalInline}
              className="action-btn action-btn-external text-muted-foreground"
            >
              <Globe className="h-4 w-4" />
              <span>
                {showOriginalInline ? t('actions.backToArticle') : t('actions.openOriginal')}
              </span>
            </Button>

            {showTranslation ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={toggleTranslation}
                className="action-btn text-primary"
              >
                <Languages className="h-4 w-4" />
                <span>{t('translation.hideTranslation')}</span>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={activateTranslation}
                disabled={isTranslating}
                className="action-btn text-muted-foreground"
              >
                {isTranslating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Languages className="h-4 w-4" />
                )}
                <span>
                  {isTranslating ? t('translation.translating') : t('translation.translate')}
                </span>
              </Button>
            )}

            {!hideReadStatus && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleRead}
                className={`action-btn ${readAnimation} ${entry.is_read ? 'text-muted-foreground' : 'text-primary'}`}
              >
                <CheckCheck className="h-4 w-4" />
                <span>{entry.is_read ? t('actions.markUnread') : t('actions.markRead')}</span>
              </Button>
            )}

            <PreferenceButtons entry={entry} />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleReadLater}
              className={`action-btn ${readLaterAnimation} ${entry.read_later ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <Clock className="h-4 w-4" />
              <span>{entry.read_later ? t('actions.savedForLater') : t('actions.readLater')}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleBookmark}
              disabled={isBookmarking}
              className={`action-btn ${bookmarkAnimation} ${entry.is_bookmarked ? 'text-primary' : 'text-muted-foreground'}`}
            >
              {isBookmarking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              <span>{entry.is_bookmarked ? t('actions.archived') : t('actions.archive')}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Content with Outline */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scrollable content area - hide scrollbar for cleaner reading */}
        <div
          ref={scrollContainerRef}
          className={`hide-scrollbar reader-pan-y no-horizontal-overscroll flex-1 overflow-y-auto ${
            isMobile ? 'pt-14 pb-16' : ''
          }`}
          onTouchStart={closeGestureHandlers.onTouchStart}
          onTouchMove={closeGestureHandlers.onTouchMove}
          onTouchEnd={closeGestureHandlers.onTouchEnd}
        >
          <div
            className={`px-4 py-6 sm:px-6 sm:py-8 ${!isMobile ? 'mx-auto max-w-3xl' : 'max-w-3xl'}`}
          >
            {/* Mobile: Author and date at top of content */}
            {isMobile && (entry.author || entry.published_at) && (
              <div className="text-muted-foreground mb-4 flex items-center gap-2 text-xs">
                {entry.author && <span className="font-medium">{entry.author}</span>}
                {entry.author && entry.published_at && <span>·</span>}
                {entry.published_at && (
                  <span>{format(new Date(entry.published_at), 'MMM d, yyyy')}</span>
                )}
              </div>
            )}

            {/* Sentence translation banner */}
            {showTranslation && (
              <div className="border-primary/20 bg-primary/5 mb-4 flex items-center justify-between rounded-lg border px-4 py-2">
                <span className="text-muted-foreground text-xs">
                  {t('translation.sentenceMode')}
                  {isTranslating && (
                    <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin" />
                  )}
                </span>
                <button
                  onClick={toggleTranslation}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  {t('translation.hideTranslation')}
                </button>
              </div>
            )}

            {translationError && (
              <div className="border-destructive/20 bg-destructive/5 mb-4 flex items-center justify-between rounded-lg border px-4 py-2">
                <span className="text-destructive text-xs">{t('translation.failed')}</span>
                <button
                  onClick={activateTranslation}
                  className="text-primary text-xs font-medium hover:underline"
                >
                  {t('translation.retry')}
                </button>
              </div>
            )}

            {showOriginalInline ? (
              <div className="relative space-y-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenExternal}
                  aria-label={t('actions.openExternally')}
                  title={t('actions.openExternally')}
                  className="group bg-background/90 border-border absolute top-2 right-2 z-10 h-8 w-8 px-0 backdrop-blur-sm transition-all hover:w-auto hover:px-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  <span className="max-w-0 overflow-hidden opacity-0 transition-all group-hover:ml-1 group-hover:max-w-40 group-hover:opacity-100">
                    {t('actions.openExternally')}
                  </span>
                </Button>
                {(iframeStatus === 'loading' || iframeStatus === 'blocked') && (
                  <div
                    className={`rounded-lg border px-4 py-2 text-sm ${
                      iframeStatus === 'blocked'
                        ? 'border-destructive/30 bg-destructive/5 text-destructive'
                        : 'border-primary/20 bg-primary/5 text-muted-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>
                        {iframeStatus === 'blocked'
                          ? t('actions.openOriginalBlocked')
                          : t('actions.openOriginalLoading')}
                      </span>
                      {iframeStatus === 'blocked' && (
                        <Button variant="outline" size="sm" onClick={handleOpenExternal}>
                          <ExternalLink className="h-4 w-4" />
                          <span>{t('actions.openExternally')}</span>
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                <iframe
                  title={entry.title || 'Original article'}
                  src={entry.url}
                  className="border-border h-[70vh] w-full rounded-xl border"
                  loading="lazy"
                  onLoad={handleIframeLoaded}
                  onError={handleIframeError}
                />
              </div>
            ) : displayContent ? (
              <article
                ref={contentRef}
                className="prose prose-lg font-reading max-w-none"
                dangerouslySetInnerHTML={{ __html: processHtmlContent(displayContent) }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-muted-foreground italic">{t('article.noContent')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  render={(props) => (
                    <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('article.viewOriginal')}
                </Button>
              </div>
            )}

            {showPrompt && (
              <div className="border-border bg-card mt-6 rounded-xl border p-4">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="text-foreground text-sm font-medium">{t('feedback.title')}</p>
                  <button
                    onClick={dismissPrompt}
                    className="text-muted-foreground hover:text-foreground text-xs"
                  >
                    {t('feedback.later')}
                  </button>
                </div>
                <p className="text-muted-foreground mb-3 text-xs">{t('feedback.description')}</p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePromptFeedback(true)}
                    disabled={isSubmittingFeedback}
                  >
                    <ThumbsUp className="h-4 w-4" />
                    {t('actions.like')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePromptFeedback(false)}
                    disabled={isSubmittingFeedback}
                  >
                    <ThumbsDown className="h-4 w-4" />
                    {t('actions.dislike')}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Desktop Outline - Sidebar that only takes space when there are headings */}
        {!isMobile && (entry.content || entry.summary) && (
          <div className={`hidden flex-col xl:flex ${hasOutline ? 'w-52 shrink-0' : 'w-0'}`}>
            <ArticleOutline
              contentRef={contentRef}
              scrollContainerRef={scrollContainerRef}
              isMobile={false}
              onHasHeadings={setHasOutline}
            />
          </div>
        )}
      </div>

      {/* Mobile Outline */}
      {isMobile && (entry.content || entry.summary) && (
        <ArticleOutline
          contentRef={contentRef}
          scrollContainerRef={scrollContainerRef}
          isMobile={true}
        />
      )}

      {/* Mobile Bottom Action Bar - auto-hide on scroll */}
      {isMobile && (
        <div
          className={`border-border bg-card/95 safe-bottom absolute inset-x-0 bottom-0 z-10 border-t backdrop-blur-sm transition-transform duration-300 ${
            barsVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex h-14 items-center justify-around px-2">
            <button
              onClick={handleOpenOriginalInline}
              className="action-btn action-btn-mobile action-btn-external text-muted-foreground hover:text-foreground flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
            >
              <Globe className="h-5 w-5" />
              <span className="text-[10px]">
                {showOriginalInline ? t('actions.backShort') : t('actions.open')}
              </span>
            </button>

            {!hideReadStatus && (
              <button
                onClick={handleToggleRead}
                className={`action-btn action-btn-mobile ${readAnimation} flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                  entry.is_read ? 'text-muted-foreground' : 'text-primary'
                }`}
              >
                <CheckCheck className="h-5 w-5" />
                <span className="text-[10px]">
                  {entry.is_read ? t('filters.unread') : t('actions.markRead')}
                </span>
              </button>
            )}

            <button
              onClick={toggleTranslation}
              disabled={isTranslating}
              className={`action-btn action-btn-mobile flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                showTranslation ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {isTranslating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Languages className="h-5 w-5" />
              )}
              <span className="text-[10px]">
                {showTranslation ? t('translation.hideTranslation') : t('translation.translate')}
              </span>
            </button>

            <button
              onClick={() => setIsMoreSheetOpen(true)}
              className="action-btn action-btn-mobile text-muted-foreground hover:text-foreground flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors"
            >
              <Ellipsis className="h-5 w-5" />
              <span className="text-[10px]">{t('actions.more')}</span>
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <Sheet open={isMoreSheetOpen} onOpenChange={setIsMoreSheetOpen}>
          <SheetPopup side="bottom">
            <SheetHeader>
              <SheetTitle>{t('actions.more')}</SheetTitle>
              <SheetDescription>{t('actions.moreDescription')}</SheetDescription>
            </SheetHeader>
            <SheetPanel>
              <div className="space-y-2">
                <button
                  onClick={handleToggleReadLater}
                  className={`border-border hover:bg-accent ${readLaterAnimation} flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors ${
                    entry.read_later ? 'text-primary' : 'text-foreground'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    <span>
                      {entry.read_later ? t('actions.savedForLater') : t('actions.readLater')}
                    </span>
                  </span>
                </button>

                <div className="border-border rounded-lg border p-1.5">
                  <PreferenceButtons entry={entry} mobileStyle />
                </div>

                <button
                  onClick={handleToggleBookmark}
                  disabled={isBookmarking}
                  className={`border-border hover:bg-accent flex w-full items-center justify-between rounded-lg border px-3 py-3 text-left transition-colors ${
                    entry.is_bookmarked ? 'text-primary' : 'text-foreground'
                  } disabled:opacity-50`}
                >
                  <span className="flex items-center gap-2">
                    {isBookmarking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Archive className="h-4 w-4" />
                    )}
                    <span>
                      {entry.is_bookmarked ? t('actions.archived') : t('actions.archive')}
                    </span>
                  </span>
                </button>
              </div>
            </SheetPanel>
          </SheetPopup>
        </Sheet>
      )}
    </div>
  )
}

/**
 * Skeleton loader for the article reader.
 */
export function ArticleReaderSkeleton() {
  return (
    <div className="bg-background flex min-w-0 flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border bg-card border-b px-6 py-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          {/* Title skeleton */}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-3/4" />
          </div>
          <Skeleton className="h-10 w-10 shrink-0" />
        </div>

        {/* Meta info skeleton */}
        <div className="mb-4 flex items-center gap-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
        </div>

        {/* Actions skeleton */}
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-24" />
        </div>
      </div>

      {/* Content skeleton */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl space-y-4 px-6 py-8">
          {/* Paragraph skeletons */}
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/5" />

          <div className="py-2" />

          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />

          <div className="py-2" />

          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-5/6" />

          <div className="py-2" />

          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      </div>
    </div>
  )
}
