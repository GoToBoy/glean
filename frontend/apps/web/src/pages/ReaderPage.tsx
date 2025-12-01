import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEntries, useEntry, useUpdateEntryState, useMarkAllRead } from '../hooks/useEntries'
import { ArticleReader, ArticleReaderSkeleton } from '../components/ArticleReader'
import { useAuthStore } from '../stores/authStore'
import type { EntryWithState } from '@glean/types'
import {
  Heart,
  CheckCheck,
  Clock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Inbox,
  ThumbsDown,
  Timer,
} from 'lucide-react'
import { format, formatDistanceToNow, isPast } from 'date-fns'
import { stripHtmlTags } from '../lib/html'
import {
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from '@glean/ui'

type FilterType = 'all' | 'unread' | 'liked' | 'read-later'

const FILTER_ORDER: FilterType[] = ['all', 'unread', 'liked', 'read-later']

/**
 * Hook to detect mobile viewport
 */
function useIsMobile(breakpoint = 768) {
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
 * Reader page.
 *
 * Main reading interface with entry list, filters, and reading pane.
 */
export default function ReaderPage() {
  const [searchParams] = useSearchParams()
  const selectedFeedId = searchParams.get('feed') || undefined
  const selectedFolderId = searchParams.get('folder') || undefined
  const entryIdFromUrl = searchParams.get('entry') || null
  const { user } = useAuthStore()
  
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(entryIdFromUrl)
  const [currentPage, setCurrentPage] = useState(1)
  const [entriesWidth, setEntriesWidth] = useState(() => {
    const saved = localStorage.getItem('glean:entriesWidth')
    return saved !== null ? Number(saved) : 360
  })
  const [isFullscreen, setIsFullscreen] = useState(false)
  const isMobile = useIsMobile()

  const updateMutation = useUpdateEntryState()
  const getFilterParams = () => {
    switch (filterType) {
      case 'unread':
        return { is_read: false }
      case 'liked':
        return { is_liked: true }
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
  } = useEntries({
    feed_id: selectedFeedId,
    folder_id: selectedFolderId,
    ...getFilterParams(),
    page: currentPage,
    per_page: 20,
  })

  const rawEntries = entriesData?.items || []
  const totalPages = entriesData?.total_pages || 1
  
  // Fetch selected entry separately to keep it visible even when filtered out of list
  const { data: selectedEntry, isLoading: isLoadingEntry } = useEntry(selectedEntryId || '')

  // Merge selected entry into the list if it's not already there
  // This ensures the currently viewed article doesn't disappear from the list
  // when marked as read while viewing in the "unread" tab
  // However, for explicit filters like "liked" and "read-later", we should show the real filtered results
  const entries = (() => {
    if (!selectedEntry || !selectedEntryId) return rawEntries
    const isSelectedInList = rawEntries.some((e) => e.id === selectedEntryId)
    if (isSelectedInList) return rawEntries
    
    // Only keep the selected entry visible for "all" and "unread" filters
    // For "liked" and "read-later", show only entries that match the filter
    if (filterType === 'liked' || filterType === 'read-later') {
      return rawEntries
    }
    
    // Don't merge if the selected entry is from a different feed than the one being viewed
    // (when viewing a specific feed, not all feeds or a folder)
    if (selectedFeedId && selectedEntry.feed_id !== selectedFeedId) {
      return rawEntries
    }
    
    // Don't merge if we're viewing a folder and the entry is not in the current list
    // (the backend already filtered by folder, so if it's not in rawEntries, it's not in the folder)
    if (selectedFolderId) {
      return rawEntries
    }
    
    // Insert selected entry at its original position or at the top
    // Find the right position based on published_at
    const selectedDate = selectedEntry.published_at ? new Date(selectedEntry.published_at) : new Date(0)
    let insertIdx = rawEntries.findIndex((e) => {
      const entryDate = e.published_at ? new Date(e.published_at) : new Date(0)
      return entryDate < selectedDate
    })
    if (insertIdx === -1) insertIdx = rawEntries.length
    return [...rawEntries.slice(0, insertIdx), selectedEntry, ...rawEntries.slice(insertIdx)]
  })()

  // Handle filter change with slide direction
  const handleFilterChange = (newFilter: FilterType) => {
    if (newFilter === filterType) return
    
    const currentIndex = FILTER_ORDER.indexOf(filterType)
    const newIndex = FILTER_ORDER.indexOf(newFilter)
    const direction = newIndex > currentIndex ? 'right' : 'left'
    
    setSlideDirection(direction)
    setFilterType(newFilter)
    setCurrentPage(1)
    
    // Reset slide direction after animation completes
    setTimeout(() => setSlideDirection(null), 250)
  }

  // Handle entry selection - automatically mark as read
  const handleSelectEntry = async (entry: EntryWithState) => {
    setSelectedEntryId(entry.id)
    
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

  // On mobile, show list OR reader, not both
  const showEntryList = !isMobile || !selectedEntryId
  const showReader = !isMobile || !!selectedEntryId

  return (
    <div className="flex h-full">
      {/* Entry list */}
      {!isFullscreen && showEntryList && (
        <>
          <div
            className={`relative flex min-w-0 flex-col border-r border-border bg-card/50 ${
              isMobile ? 'w-full' : ''
            }`}
            style={!isMobile ? { width: `${entriesWidth}px`, minWidth: '280px', maxWidth: '500px' } : undefined}
          >
            {/* Filters */}
            <div className="border-b border-border bg-card p-3">
              <div className="flex items-center gap-2">
                {/* Filter tabs */}
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-muted/50 p-1">
                  <FilterTab
                    active={filterType === 'all'}
                    onClick={() => handleFilterChange('all')}
                    icon={<Inbox className="h-3.5 w-3.5" />}
                    label="All"
                  />
                  <FilterTab
                    active={filterType === 'unread'}
                    onClick={() => handleFilterChange('unread')}
                    icon={<div className="h-2 w-2 rounded-full bg-current" />}
                    label="Unread"
                  />
                  <FilterTab
                    active={filterType === 'liked'}
                    onClick={() => handleFilterChange('liked')}
                    icon={<Heart className="h-3.5 w-3.5" />}
                    label="Liked"
                  />
                  <FilterTab
                    active={filterType === 'read-later'}
                    onClick={() => handleFilterChange('read-later')}
                    icon={<Clock className="h-3.5 w-3.5" />}
                    label="Later"
                  />
                </div>

                {/* Mark all read button */}
                <MarkAllReadButton feedId={selectedFeedId} folderId={selectedFolderId} />
              </div>
            </div>

            {/* Entry list */}
            <div className="flex-1 overflow-y-auto">
              <div
                key={`${selectedFeedId || 'all'}-${selectedFolderId || 'none'}-${filterType}`}
                className={`feed-content-transition ${
                  slideDirection === 'right'
                    ? 'animate-slide-from-right'
                    : slideDirection === 'left'
                      ? 'animate-slide-from-left'
                      : ''
                }`}
              >
                {isLoading && (
                  <div className="divide-y divide-border/40 px-1 py-0.5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <EntryListItemSkeleton key={index} />
                    ))}
                  </div>
                )}

                {error && (
                  <div className="p-4">
                    <Alert variant="error">
                      <AlertCircle />
                      <AlertTitle>Failed to load entries</AlertTitle>
                      <AlertDescription>{(error as Error).message}</AlertDescription>
                    </Alert>
                  </div>
                )}

                {entries.length === 0 && !isLoading && (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
                      <Inbox className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-muted-foreground">No entries found</p>
                    <p className="mt-1 text-xs text-muted-foreground/60">
                      Try changing the filter or adding more feeds
                    </p>
                  </div>
                )}

                <div className="divide-y divide-border/40 px-1 py-0.5">
                  {entries.map((entry, index) => (
                    <EntryListItem
                      key={entry.id}
                      entry={entry}
                      isSelected={selectedEntryId === entry.id}
                      onClick={() => handleSelectEntry(entry)}
                      style={{ animationDelay: `${index * 0.03}s` }}
                      showFeedInfo={!selectedFeedId}
                      showReadLaterRemaining={filterType === 'read-later' && (user?.settings?.show_read_later_remaining ?? true)}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="text-muted-foreground"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span>Prev</span>
                </Button>

                <span className="text-sm text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="text-muted-foreground"
                >
                  <span>Next</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
            {/* Resize handle - desktop only, positioned inside container */}
            {!isMobile && (
              <ResizeHandle
                onResize={(delta) => setEntriesWidth((w) => Math.max(280, Math.min(500, w + delta)))}
              />
            )}
          </div>
        </>
      )}

      {/* Reading pane */}
      {showReader && (
        <div key={selectedEntryId || 'empty'} className="reader-transition flex min-w-0 flex-1 flex-col">
          {isLoadingEntry && selectedEntryId ? (
            <ArticleReaderSkeleton />
          ) : selectedEntry ? (
            <ArticleReader
              entry={selectedEntry}
              onClose={() => setSelectedEntryId(null)}
              isFullscreen={isFullscreen}
              onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
              showFullscreenButton={!isMobile}
              showCloseButton={isMobile}
            />
          ) : !isMobile ? (
            <div className="flex min-w-0 flex-1 flex-col items-center justify-center bg-background">
              <div className="text-center">
                <div className="mb-4 inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
                  <BookOpen className="h-10 w-10 text-muted-foreground" />
                </div>
                <h3 className="font-display text-lg font-semibold text-foreground">Select an article</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose an article from the list to start reading
                </p>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

function BookOpen(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function ResizeHandle({ onResize }: { onResize: (delta: number) => void }) {
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      startXRef.current = e.clientX
      onResize(delta)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onResize])

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    startXRef.current = e.clientX
    setIsDragging(true)
  }

  return (
    <div
      className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize"
      onMouseDown={handleMouseDown}
    >
      <div
        className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
          isDragging ? 'bg-primary' : 'bg-transparent hover:bg-border'
        }`}
      />
    </div>
  )
}

/**
 * Format remaining time for read later items
 */
function formatRemainingTime(readLaterUntil: string | null): string | null {
  if (!readLaterUntil) return null
  const untilDate = new Date(readLaterUntil)
  if (isPast(untilDate)) return 'Expired'
  return formatDistanceToNow(untilDate, { addSuffix: false })
}

function EntryListItem({
  entry,
  isSelected,
  onClick,
  style,
  showFeedInfo = false,
  showReadLaterRemaining = false,
}: {
  entry: EntryWithState
  isSelected: boolean
  onClick: () => void
  style?: React.CSSProperties
  showFeedInfo?: boolean
  showReadLaterRemaining?: boolean
}) {
  const remainingTime = showReadLaterRemaining ? formatRemainingTime(entry.read_later_until) : null
  return (
    <div
      onClick={onClick}
      className={`group animate-fade-in cursor-pointer px-1.5 py-1.5 transition-all duration-200 ${
        isSelected 
          ? 'relative before:absolute before:inset-y-0.5 before:left-0 before:w-0.5 before:rounded-full before:bg-primary' 
          : ''
      }`}
      style={style}
    >
      <div 
        className={`rounded-lg px-2.5 py-2 transition-all duration-200 ${
          isSelected 
            ? 'bg-primary/8 ring-1 ring-primary/20' 
            : 'hover:bg-accent/40'
        }`}
      >
        <div className="flex gap-2.5">
          {/* Unread indicator */}
          <div className="mt-1.5 flex w-2.5 shrink-0 justify-center">
            {!entry.is_read && (
              <div className="h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_6px_1px] shadow-primary/40" />
            )}
          </div>
          
          <div className="min-w-0 flex-1">
            {/* Feed info for aggregated views */}
            {showFeedInfo && (entry.feed_title || entry.feed_icon_url) && (
              <div className="mb-1 flex items-center gap-1.5">
                {entry.feed_icon_url ? (
                  <img 
                    src={entry.feed_icon_url} 
                    alt="" 
                    className="h-3.5 w-3.5 shrink-0 rounded-sm object-cover" 
                  />
                ) : (
                  <div className="h-3.5 w-3.5 shrink-0 rounded-sm bg-muted" />
                )}
                <span className="truncate text-xs font-medium text-muted-foreground">
                  {entry.feed_title || 'Unknown feed'}
                </span>
              </div>
            )}
            
            <h3
              className={`mb-1 line-clamp-2 text-[15px] leading-snug transition-colors duration-200 ${
                entry.is_read 
                  ? 'text-muted-foreground group-hover:text-foreground/80' 
                  : 'font-medium text-foreground'
              }`}
            >
              {entry.title}
            </h3>

            {/* Fixed height summary area for consistent card size */}
            <div className="mb-1.5 h-10">
              {entry.summary && (
                <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground/70">
                  {stripHtmlTags(entry.summary)}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground/80">
              {entry.author && (
                <span className="max-w-[120px] truncate">{entry.author}</span>
              )}
              {entry.author && entry.published_at && (
                <span className="text-muted-foreground/40">·</span>
              )}
              {entry.published_at && (
                <span className="tabular-nums">{format(new Date(entry.published_at), 'MMM d')}</span>
              )}

              <div className="ml-auto flex items-center gap-1.5">
                {entry.is_liked === true && (
                  <Heart className="h-3.5 w-3.5 fill-current text-red-500" />
                )}
                {entry.is_liked === false && (
                  <ThumbsDown className="h-3.5 w-3.5 fill-current text-muted-foreground" />
                )}
                {entry.read_later && !showReadLaterRemaining && (
                  <Clock className="h-3.5 w-3.5 text-primary" />
                )}
                {remainingTime && (
                  <span className={`flex items-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-medium ${
                    remainingTime === 'Expired' 
                      ? 'bg-destructive/10 text-destructive' 
                      : 'bg-primary/10 text-primary'
                  }`}>
                    <Timer className="h-2.5 w-2.5" />
                    {remainingTime}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


function FilterTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 overflow-hidden rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className={`shrink-0 transition-colors duration-200 ${active ? 'text-primary' : ''}`}>
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </button>
  )
}

function MarkAllReadButton({ feedId, folderId }: { feedId?: string; folderId?: string }) {
  const markAllMutation = useMarkAllRead()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleMarkAll = async () => {
    await markAllMutation.mutateAsync({ feedId, folderId })
    setShowConfirm(false)
  }

  const getScopeText = () => {
    if (feedId) return 'entries in this feed'
    if (folderId) return 'entries in this folder'
    return 'entries'
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={markAllMutation.isPending}
        title="Mark all as read"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <CheckCheck className="h-4 w-4" />
      </button>

      {/* Mark all read confirmation dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark all entries as read?</AlertDialogTitle>
            <AlertDialogDescription>
              This will mark all {getScopeText()} as read. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button />}
              onClick={handleMarkAll}
              disabled={markAllMutation.isPending}
            >
              {markAllMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Marking...</span>
                </>
              ) : (
                'Mark as Read'
              )}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </>
  )
}

function EntryListItemSkeleton() {
  return (
    <div className="px-1.5 py-1.5">
      <div className="rounded-lg px-2.5 py-2">
        <div className="flex gap-2.5">
          {/* Unread indicator placeholder */}
          <div className="mt-1.5 flex w-2.5 shrink-0 justify-center">
            <Skeleton className="h-1.5 w-1.5 rounded-full" />
          </div>
          
          <div className="min-w-0 flex-1 space-y-1">
            {/* Title - 2 lines */}
            <div className="space-y-1">
              <Skeleton className="h-[18px] w-full" />
              <Skeleton className="h-[18px] w-3/4" />
            </div>
            
            {/* Summary - fixed height area */}
            <div className="h-10 space-y-1">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
            
            {/* Meta info */}
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-12" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

