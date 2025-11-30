import { useState, useRef, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useEntries, useEntry, useUpdateEntryState, useMarkAllRead } from '../hooks/useEntries'
import { useContentRenderer } from '../hooks/useContentRenderer'
import type { EntryWithState } from '@glean/types'
import {
  Heart,
  CheckCheck,
  Bookmark,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  Maximize2,
  Minimize2,
  Inbox,
  ThumbsDown,
} from 'lucide-react'
import { format } from 'date-fns'
import { stripHtmlTags, processHtmlContent } from '../lib/html'
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

/**
 * Reader page.
 *
 * Main reading interface with entry list, filters, and reading pane.
 */
export default function ReaderPage() {
  const [searchParams] = useSearchParams()
  const selectedFeedId = searchParams.get('feed') || undefined
  
  const [filterType, setFilterType] = useState<FilterType>('all')
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [entriesWidth, setEntriesWidth] = useState(() => {
    const saved = localStorage.getItem('glean:entriesWidth')
    return saved !== null ? Number(saved) : 360
  })
  const [isFullscreen, setIsFullscreen] = useState(false)

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

  return (
    <div className="flex h-full">
      {/* Entry list */}
      {!isFullscreen && (
        <>
          <div
            className="flex min-w-0 flex-col border-r border-border bg-card/50"
            style={{ width: `${entriesWidth}px`, minWidth: '280px', maxWidth: '500px' }}
          >
            {/* Filters */}
            <div className="border-b border-border bg-card p-3">
              <div className="flex items-center gap-2">
                {/* Filter tabs */}
                <div className="flex min-w-0 flex-1 items-center gap-1 rounded-lg bg-muted/50 p-1">
                  <FilterTab
                    active={filterType === 'all'}
                    onClick={() => setFilterType('all')}
                    icon={<Inbox className="h-3.5 w-3.5" />}
                    label="All"
                  />
                  <FilterTab
                    active={filterType === 'unread'}
                    onClick={() => setFilterType('unread')}
                    icon={<div className="h-2 w-2 rounded-full bg-current" />}
                    label="Unread"
                  />
                  <FilterTab
                    active={filterType === 'liked'}
                    onClick={() => setFilterType('liked')}
                    icon={<Heart className="h-3.5 w-3.5" />}
                    label="Liked"
                  />
                  <FilterTab
                    active={filterType === 'read-later'}
                    onClick={() => setFilterType('read-later')}
                    icon={<Bookmark className="h-3.5 w-3.5" />}
                    label="Saved"
                  />
                </div>

                {/* Mark all read button */}
                <MarkAllReadButton feedId={selectedFeedId} />
              </div>
            </div>

            {/* Entry list */}
            <div className="flex-1 overflow-y-auto">
              {isLoading && (
                <div className="divide-y divide-border">
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

              <div className="divide-y divide-border">
                {entries.map((entry, index) => (
                  <EntryListItem
                    key={entry.id}
                    entry={entry}
                    isSelected={selectedEntryId === entry.id}
                    onClick={() => handleSelectEntry(entry)}
                    style={{ animationDelay: `${index * 0.03}s` }}
                  />
                ))}
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
          </div>

          <ResizeHandle
            onResize={(delta) => setEntriesWidth((w) => Math.max(280, Math.min(500, w + delta)))}
          />
        </>
      )}

      {/* Reading pane */}
      {isLoadingEntry && selectedEntryId ? (
        <ReadingPaneSkeleton isFullscreen={isFullscreen} />
      ) : selectedEntry ? (
        <ReadingPane
          entry={selectedEntry}
          onClose={() => setSelectedEntryId(null)}
          isFullscreen={isFullscreen}
          onToggleFullscreen={() => setIsFullscreen(!isFullscreen)}
        />
      ) : (
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
      className={`group relative w-1 cursor-col-resize transition-colors ${
        isDragging ? 'bg-primary' : 'bg-border hover:bg-primary/50'
      }`}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-y-0 -left-1 -right-1" />
    </div>
  )
}

function EntryListItem({
  entry,
  isSelected,
  onClick,
  style,
}: {
  entry: EntryWithState
  isSelected: boolean
  onClick: () => void
  style?: React.CSSProperties
}) {
  return (
    <div
      onClick={onClick}
      className={`animate-fade-in cursor-pointer p-4 transition-all duration-200 ${
        isSelected 
          ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' 
          : 'hover:bg-accent/50'
      }`}
      style={style}
    >
      <div className="flex gap-3">
        {/* Unread indicator */}
        <div className="mt-1.5 shrink-0">
          {!entry.is_read && (
            <div className="h-2 w-2 rounded-full bg-primary shadow-sm shadow-primary/50" />
          )}
        </div>
        
        <div className="min-w-0 flex-1">
          <h3
            className={`mb-1 leading-snug ${
              entry.is_read 
                ? 'font-normal text-muted-foreground' 
                : 'font-medium text-foreground'
            }`}
          >
            {entry.title}
          </h3>

          {entry.summary && (
            <p className="mb-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground/80">
              {stripHtmlTags(entry.summary)}
            </p>
          )}

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {entry.author && (
              <span className="truncate">{entry.author}</span>
            )}
            {entry.published_at && (
              <span>{format(new Date(entry.published_at), 'MMM d')}</span>
            )}

            <div className="ml-auto flex items-center gap-1.5">
              {entry.is_liked === true && (
                <Heart className="h-3.5 w-3.5 fill-current text-red-500" />
              )}
              {entry.is_liked === false && (
                <ThumbsDown className="h-3.5 w-3.5 fill-current text-muted-foreground" />
              )}
              {entry.read_later && (
                <Bookmark className="h-3.5 w-3.5 fill-current text-primary" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ReadingPane({
  entry,
  isFullscreen,
  onToggleFullscreen,
}: {
  entry: EntryWithState
  onClose: () => void
  isFullscreen: boolean
  onToggleFullscreen: () => void
}) {
  const updateMutation = useUpdateEntryState()
  const contentRef = useContentRenderer(entry.content || entry.summary || undefined)

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

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card px-6 py-4">
        <div className="mb-3 flex items-start justify-between gap-4">
          <h1 className="font-display text-2xl font-bold leading-tight text-foreground">
            {entry.title}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            {isFullscreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-3 text-sm text-muted-foreground">
          {entry.author && <span className="font-medium">{entry.author}</span>}
          {entry.author && entry.published_at && <span>·</span>}
          {entry.published_at && (
            <span>{format(new Date(entry.published_at), 'MMMM d, yyyy')}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={(props) => (
              <a
                {...props}
                href={entry.url}
                target="_blank"
                rel="noopener noreferrer"
              />
            )}
            className="text-muted-foreground"
          >
            <ExternalLink className="h-4 w-4" />
            <span>Open Original</span>
          </Button>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleToggleRead}
            className={entry.is_read ? 'text-muted-foreground' : 'text-primary'}
          >
            <CheckCheck className="h-4 w-4" />
            <span>{entry.is_read ? 'Mark Unread' : 'Mark Read'}</span>
          </Button>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLike}
            className={entry.is_liked === true ? 'text-red-500' : 'text-muted-foreground'}
          >
            <Heart className={`h-4 w-4 ${entry.is_liked === true ? 'fill-current' : ''}`} />
            <span>{entry.is_liked === true ? 'Liked' : 'Like'}</span>
          </Button>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDislike}
            className={entry.is_liked === false ? 'text-foreground' : 'text-muted-foreground'}
          >
            <ThumbsDown className={`h-4 w-4 ${entry.is_liked === false ? 'fill-current' : ''}`} />
            <span>{entry.is_liked === false ? 'Disliked' : 'Dislike'}</span>
          </Button>

          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleToggleReadLater}
            className={entry.read_later ? 'text-primary' : 'text-muted-foreground'}
          >
            <Bookmark className={`h-4 w-4 ${entry.read_later ? 'fill-current' : ''}`} />
            <span>{entry.read_later ? 'Saved' : 'Read Later'}</span>
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
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
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all duration-200 ${
        active
          ? 'bg-background text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'
      }`}
    >
      <span className={`transition-colors duration-200 ${active ? 'text-primary' : ''}`}>
        {icon}
      </span>
      <span>{label}</span>
    </button>
  )
}

function MarkAllReadButton({ feedId }: { feedId?: string }) {
  const markAllMutation = useMarkAllRead()
  const [showConfirm, setShowConfirm] = useState(false)

  const handleMarkAll = async () => {
    await markAllMutation.mutateAsync(feedId)
    setShowConfirm(false)
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
              This will mark all {feedId ? 'entries in this feed' : 'entries'} as read. This action cannot be undone.
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
    <div className="p-4">
      <div className="flex gap-3">
        {/* Unread indicator placeholder */}
        <div className="mt-1.5 shrink-0">
          <Skeleton className="h-2 w-2 rounded-full" />
        </div>
        
        <div className="min-w-0 flex-1 space-y-2">
          {/* Title */}
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          
          {/* Summary */}
          <div className="space-y-1.5 pt-1">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          
          {/* Meta info */}
          <div className="flex items-center gap-3 pt-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}

function ReadingPaneSkeleton({ isFullscreen: _isFullscreen }: { isFullscreen: boolean }) {
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
