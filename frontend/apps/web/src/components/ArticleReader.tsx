import { useState, useRef, useEffect, useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useContentRenderer } from '../hooks/useContentRenderer'
import { useUpdateEntryState, entryKeys } from '../hooks/useEntries'
import { bookmarkService } from '@glean/api-client'
import type { EntryWithState } from '@glean/types'
import {
  Heart,
  CheckCheck,
  Clock,
  Archive,
  ExternalLink,
  Loader2,
  Maximize2,
  Minimize2,
  ThumbsDown,
  X,
  ChevronLeft,
} from 'lucide-react'
import { format } from 'date-fns'
import { processHtmlContent } from '../lib/html'
import { Button, Skeleton } from '@glean/ui'
import { ArticleOutline } from './ArticleOutline'

const ORIGINAL_PREF_KEY = 'glean:feed-original-pref-v1'

function getFeedOriginalPreference(feedId?: string): boolean | null {
  if (!feedId || typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(ORIGINAL_PREF_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return typeof parsed[feedId] === 'boolean' ? parsed[feedId] : null
  } catch (error) {
    console.warn('Failed to read original content preference', error)
    return null
  }
}

function setFeedOriginalPreference(feedId: string, value: boolean) {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(ORIGINAL_PREF_KEY)
    const parsed: Record<string, boolean> = raw ? JSON.parse(raw) : {}
    parsed[feedId] = value
    localStorage.setItem(ORIGINAL_PREF_KEY, JSON.stringify(parsed))
  } catch (error) {
    console.warn('Failed to save original content preference', error)
  }
}

type OriginalContentReason = 'short' | 'empty' | null

interface OriginalContentViewerProps {
  url: string
  feedId?: string
  feedTitle?: string | null
  reason?: OriginalContentReason
}

function OriginalContentViewer({ url, feedId, feedTitle, reason = null }: OriginalContentViewerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [hasEverOpened, setHasEverOpened] = useState(false)
  const [iframeLoaded, setIframeLoaded] = useState(false)
  const [rememberFeed, setRememberFeed] = useState(false)

  useEffect(() => {
    const pref = getFeedOriginalPreference(feedId)
    const openByDefault = pref === true
    setIsOpen(openByDefault)
    setRememberFeed(openByDefault)
    setHasEverOpened(openByDefault)
    setIframeLoaded(false)
  }, [feedId, url])

  useEffect(() => {
    if (isOpen) {
      setHasEverOpened(true)
    }
  }, [isOpen])

  const handleToggleRemember = (checked: boolean) => {
    if (!feedId) return
    setRememberFeed(checked)
    setFeedOriginalPreference(feedId, checked)
    if (checked) {
      setIsOpen(true)
      setHasEverOpened(true)
    }
  }

  const mountIframe = hasEverOpened || isOpen

  return (
    <div className="mt-6 rounded-lg border border-border/70 bg-card/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-foreground">Original article</div>
          <p className="text-xs text-muted-foreground">
            {rememberFeed
              ? 'Opens by default for this feed.'
              : reason === 'empty'
                ? 'This entry did not include body content. Load the source page inline.'
                : 'Open the source page inline without leaving the reader.'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsOpen((prev) => !prev)}>
          {isOpen ? 'Hide original' : 'Show original'}
        </Button>
      </div>

      {feedId && (
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 rounded border-border bg-background accent-primary"
            checked={rememberFeed}
            onChange={(event) => handleToggleRemember(event.target.checked)}
          />
          <span>Always open for this feed{feedTitle ? ` (${feedTitle})` : ''}</span>
        </label>
      )}

      {mountIframe && (
        <div className="mt-4 overflow-hidden rounded-md border border-border bg-background/60">
          <div className={`relative transition-[height] duration-300 ${isOpen ? 'h-[70vh]' : 'h-0'}`}>
            {!iframeLoaded && isOpen && (
              <div className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-muted/70 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs font-medium">Loading original…</span>
              </div>
            )}
            <iframe
              src={url}
              title="Original content"
              className="h-[70vh] w-full border-0"
              loading="lazy"
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              style={{ display: isOpen ? 'block' : 'none' }}
              onLoad={() => setIframeLoaded(true)}
            />
          </div>
        </div>
      )}
    </div>
  )
}

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
  showCloseButton?: boolean
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
function useScrollHide(scrollContainerRef: React.RefObject<HTMLDivElement | null>) {
  const [isVisible, setIsVisible] = useState(true)
  const lastScrollY = useRef(0)
  const ticking = useRef(false)

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current) return

    const currentScrollY = scrollContainerRef.current.scrollTop
    const scrollDelta = currentScrollY - lastScrollY.current

    // Show bars when at top or scrolling up
    if (currentScrollY < 50) {
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

  return isVisible
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
  showCloseButton = false,
  showFullscreenButton = true,
  hideReadStatus = false,
}: ArticleReaderProps) {
  const queryClient = useQueryClient()
  const updateMutation = useUpdateEntryState()
  const contentRef = useContentRenderer(entry.content || entry.summary || undefined)
  const [isBookmarking, setIsBookmarking] = useState(false)
  const [hasOutline, setHasOutline] = useState(false)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()
  const barsVisible = useScrollHide(scrollContainerRef)
  const originalContentReason: OriginalContentReason = !entry.content && !entry.summary ? 'empty' : null

  // Reset outline state when entry changes
  useEffect(() => {
    setHasOutline(false)
  }, [entry.id])
  
  // Animation triggers for action buttons
  const likeAnimation = useAnimationTrigger(entry.is_liked === true, 'action-btn-heart-active')
  const dislikeAnimation = useAnimationTrigger(entry.is_liked === false, 'action-btn-dislike-active')
  const readLaterAnimation = useAnimationTrigger(entry.read_later, 'action-btn-clock-active')
  const bookmarkAnimation = useAnimationTrigger(entry.is_bookmarked, 'action-btn-archive-active')
  const readAnimation = useAnimationTrigger(entry.is_read, 'action-btn-check')

  const handleToggleRead = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { is_read: !entry.is_read },
    })
  }

  const handleLike = async () => {
    // If already liked, remove like (set to null). Otherwise, set to liked (true)
    const newValue = entry.is_liked === true ? null : true
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { is_liked: newValue },
    })
  }

  const handleDislike = async () => {
    // If already disliked, remove dislike (set to null). Otherwise, set to disliked (false)
    const newValue = entry.is_liked === false ? null : false
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { is_liked: newValue },
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

  return (
    <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Mobile Header - auto-hide on scroll */}
      {isMobile && (
        <div
          className={`absolute inset-x-0 top-0 z-10 border-b border-border bg-card/95 backdrop-blur-sm transition-transform duration-300 ${
            barsVisible ? 'translate-y-0' : '-translate-y-full'
          }`}
        >
          <div className="flex h-12 items-center gap-2 px-3">
            {showCloseButton && onClose && (
              <button
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            )}
            <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
              {entry.title}
            </h1>
          </div>
        </div>
      )}

      {/* Desktop Header */}
      {!isMobile && (
        <div className="border-b border-border bg-card px-6 py-4">
          <div className="mb-3 flex items-start justify-between gap-4">
            <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
              {entry.title}
            </h1>
            <div className="flex shrink-0 items-center gap-1">
              {showFullscreenButton && onToggleFullscreen && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleFullscreen}
                  title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                </Button>
              )}
              {showCloseButton && onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  title="Close"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>
          </div>

          <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
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
              render={(props) => (
                <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
              )}
              className="action-btn action-btn-external text-muted-foreground"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open Original</span>
            </Button>

            {!hideReadStatus && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleToggleRead}
                className={`action-btn ${readAnimation} ${entry.is_read ? 'text-muted-foreground' : 'text-primary'}`}
              >
                <CheckCheck className="h-4 w-4" />
                <span>{entry.is_read ? 'Mark Unread' : 'Mark Read'}</span>
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleLike}
              className={`action-btn ${likeAnimation} ${entry.is_liked === true ? 'text-red-500' : 'text-muted-foreground'}`}
            >
              <Heart className={`h-4 w-4 ${entry.is_liked === true ? 'fill-current' : ''}`} />
              <span>{entry.is_liked === true ? 'Liked' : 'Like'}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleDislike}
              className={`action-btn ${dislikeAnimation} ${entry.is_liked === false ? 'text-foreground' : 'text-muted-foreground'}`}
            >
              <ThumbsDown className={`h-4 w-4 ${entry.is_liked === false ? 'fill-current' : ''}`} />
              <span>{entry.is_liked === false ? 'Disliked' : 'Dislike'}</span>
            </Button>

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleReadLater}
              className={`action-btn ${readLaterAnimation} ${entry.read_later ? 'text-primary' : 'text-muted-foreground'}`}
            >
              <Clock className="h-4 w-4" />
              <span>{entry.read_later ? 'Saved for Later' : 'Read Later'}</span>
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
              <span>{entry.is_bookmarked ? 'Archived' : 'Archive'}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Content with Outline */}
      <div className="flex flex-1 overflow-hidden">
        {/* Scrollable content area - hide scrollbar for cleaner reading */}
        <div
          ref={scrollContainerRef}
          className={`hide-scrollbar flex-1 overflow-y-auto ${isMobile ? 'pt-12 pb-16' : ''}`}
        >
          <div className={`px-4 py-6 sm:px-6 sm:py-8 ${!isMobile ? 'mx-auto max-w-3xl' : 'max-w-3xl'}`}>
            {/* Mobile: Author and date at top of content */}
            {isMobile && (entry.author || entry.published_at) && (
              <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground">
                {entry.author && <span className="font-medium">{entry.author}</span>}
                {entry.author && entry.published_at && <span>·</span>}
                {entry.published_at && (
                  <span>{format(new Date(entry.published_at), 'MMM d, yyyy')}</span>
                )}
              </div>
            )}
            
            {entry.content ? (
              <article
                ref={contentRef}
                className="prose prose-invert prose-lg font-reading prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-strong:text-foreground prose-blockquote:border-primary prose-blockquote:text-foreground/80 prose-code:text-foreground prose-pre:bg-muted max-w-none"
                dangerouslySetInnerHTML={{ __html: processHtmlContent(entry.content) }}
              />
            ) : entry.summary ? (
              <article
                ref={contentRef}
                className="prose prose-invert prose-lg font-reading prose-headings:font-display prose-headings:text-foreground prose-p:text-foreground/90 max-w-none"
                dangerouslySetInnerHTML={{ __html: processHtmlContent(entry.summary) }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="italic text-muted-foreground">No content available</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  render={(props) => (
                    <a {...props} href={entry.url} target="_blank" rel="noopener noreferrer" />
                  )}
                >
                  <ExternalLink className="h-4 w-4" />
                  View Original Article
                </Button>
              </div>
            )}
            <OriginalContentViewer
              url={entry.url}
              feedId={entry.feed_id}
              feedTitle={entry.feed_title}
              reason={originalContentReason}
            />
          </div>
        </div>

        {/* Desktop Outline - Sidebar that only takes space when there are headings */}
        {!isMobile && (entry.content || entry.summary) && (
          <div className={`hidden 2xl:block ${hasOutline ? 'w-52 shrink-0' : 'w-0'}`}>
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
          className={`absolute inset-x-0 bottom-0 z-10 border-t border-border bg-card/95 backdrop-blur-sm transition-transform duration-300 safe-bottom ${
            barsVisible ? 'translate-y-0' : 'translate-y-full'
          }`}
        >
          <div className="flex h-14 items-center justify-around px-2">
            <button
              onClick={() => window.open(entry.url, '_blank', 'noopener,noreferrer')}
              className="action-btn action-btn-mobile action-btn-external flex flex-col items-center gap-0.5 px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-5 w-5" />
              <span className="text-[10px]">Open</span>
            </button>

            {!hideReadStatus && (
              <button
                onClick={handleToggleRead}
                className={`action-btn action-btn-mobile ${readAnimation} flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                  entry.is_read ? 'text-muted-foreground' : 'text-primary'
                }`}
              >
                <CheckCheck className="h-5 w-5" />
                <span className="text-[10px]">{entry.is_read ? 'Unread' : 'Read'}</span>
              </button>
            )}

            <button
              onClick={handleLike}
              className={`action-btn action-btn-mobile ${likeAnimation} flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                entry.is_liked === true ? 'text-red-500' : 'text-muted-foreground'
              }`}
            >
              <Heart className={`h-5 w-5 ${entry.is_liked === true ? 'fill-current' : ''}`} />
              <span className="text-[10px]">Like</span>
            </button>

            <button
              onClick={handleDislike}
              className={`action-btn action-btn-mobile ${dislikeAnimation} flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                entry.is_liked === false ? 'text-foreground' : 'text-muted-foreground'
              }`}
            >
              <ThumbsDown className={`h-5 w-5 ${entry.is_liked === false ? 'fill-current' : ''}`} />
              <span className="text-[10px]">Dislike</span>
            </button>

            <button
              onClick={handleToggleReadLater}
              className={`action-btn action-btn-mobile ${readLaterAnimation} flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                entry.read_later ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Clock className="h-5 w-5" />
              <span className="text-[10px]">Later</span>
            </button>

            <button
              onClick={handleToggleBookmark}
              disabled={isBookmarking}
              className={`action-btn action-btn-mobile ${bookmarkAnimation} flex flex-col items-center gap-0.5 px-3 py-1.5 transition-colors ${
                entry.is_bookmarked ? 'text-primary' : 'text-muted-foreground'
              } disabled:opacity-50`}
            >
              {isBookmarking ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Archive className="h-5 w-5" />
              )}
              <span className="text-[10px]">{entry.is_bookmarked ? 'Archived' : 'Archive'}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Skeleton loader for the article reader.
 */
export function ArticleReaderSkeleton() {
  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
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

