import { useState } from 'react'
import { useFeeds, useResetFeedError, useUpdateFeed, useDeleteFeed } from '../hooks/useFeeds'
import { Button, Input, Badge, Skeleton, Dialog, DialogTrigger, DialogPopup, DialogHeader, DialogTitle, DialogDescription, DialogPanel, AlertDialog, AlertDialogPopup, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogClose } from '@glean/ui'
import {
  Search,
  Play,
  Pause,
  RotateCcw,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Filter,
} from 'lucide-react'
import { format } from 'date-fns'

type FeedStatus = 'all' | 'active' | 'inactive' | 'error'

/**
 * Feed management page.
 *
 * Features:
 * - List all feeds with pagination
 * - Filter by status
 * - Search by title or URL
 * - Reset error count
 * - Enable/disable feeds
 * - Delete feeds
 */
export default function FeedsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<FeedStatus>('all')
  const [sortBy] = useState<'created_at' | 'last_fetched_at' | 'error_count'>('created_at')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')
  const [pendingFeedId, setPendingFeedId] = useState<string | null>(null)
  const [deleteConfirmFeedId, setDeleteConfirmFeedId] = useState<string | null>(null)

  const { data, isLoading, refetch } = useFeeds({
    page,
    per_page: 20,
    status: statusFilter === 'all' ? undefined : statusFilter,
    search: search || undefined,
    sort: sortBy,
    order: sortOrder,
  })

  const resetErrorMutation = useResetFeedError()
  const updateFeedMutation = useUpdateFeed()
  const deleteFeedMutation = useDeleteFeed()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleResetError = async (feedId: string) => {
    await resetErrorMutation.mutateAsync(feedId)
  }

  const handleToggleStatus = async (feedId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active'
    setPendingFeedId(feedId)
    try {
      await updateFeedMutation.mutateAsync({ feedId, data: { status: newStatus } })
      // Explicitly refetch to ensure list is updated
      await refetch()
    } finally {
      setPendingFeedId(null)
    }
  }

  const handleDeleteClick = (feedId: string) => {
    setDeleteConfirmFeedId(feedId)
  }

  const handleDeleteConfirm = async () => {
    if (deleteConfirmFeedId) {
      await deleteFeedMutation.mutateAsync(deleteConfirmFeedId)
      setDeleteConfirmFeedId(null)
    }
  }

  const getStatusBadge = (status: string, errorCount: number, errorMessage?: string | null) => {
    if (errorCount > 0) {
      return (
        <Dialog>
          <DialogTrigger>
            <Badge variant="destructive" className="cursor-pointer gap-1 hover:opacity-80">
              <AlertCircle className="h-3 w-3" />
              Error ({errorCount})
            </Badge>
          </DialogTrigger>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>Feed Error</DialogTitle>
              <DialogDescription>
                This feed has encountered {errorCount} consecutive error(s).
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="rounded-lg bg-destructive/10 p-4">
                <p className="text-sm font-medium text-destructive">Error Message:</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {errorMessage || 'No error message available'}
                </p>
              </div>
            </DialogPanel>
          </DialogPopup>
        </Dialog>
      )
    }
    if (status === 'active') {
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle className="h-3 w-3" />
          Active
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="h-3 w-3" />
        Inactive
      </Badge>
    )
  }

  const statusFilters: { value: FeedStatus; label: string }[] = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
    { value: 'error', label: 'Error' },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border bg-card px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Feed Management</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Manage and monitor all RSS feeds
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        {/* Filters */}
        <div className="mb-6 flex flex-wrap items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by title or URL..."
                className="w-64 pl-10"
              />
            </div>
            <Button type="submit">Search</Button>
            {search && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setSearchInput('')
                  setPage(1)
                }}
              >
                Clear
              </Button>
            )}
          </form>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <div className="flex gap-1">
              {statusFilters.map((filter) => (
                <Button
                  key={filter.value}
                  size="sm"
                  variant={statusFilter === filter.value ? 'default' : 'outline'}
                  onClick={() => {
                    setStatusFilter(filter.value)
                    setPage(1)
                  }}
                >
                  {filter.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Feeds table */}
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Feed
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Status
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Subscribers
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Last Fetched
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Created
                  </th>
                  <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="mt-1 h-3 w-64" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-6 w-20" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-8" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-6 py-4">
                        <Skeleton className="h-4 w-32" />
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex justify-end gap-2">
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                          <Skeleton className="h-8 w-8" />
                        </div>
                      </td>
                    </tr>
                  ))
                ) : data && data.items.length > 0 ? (
                  data.items.map((feed) => (
                    <tr key={feed.id} className="transition-colors hover:bg-muted/50">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {feed.title}
                            </p>
                            <a
                              href={feed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground hover:text-primary"
                            >
                              {feed.url}
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(feed.status, feed.error_count, feed.fetch_error_message)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-muted-foreground">{feed.subscriber_count}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-muted-foreground">
                          {feed.last_fetched_at
                            ? format(new Date(feed.last_fetched_at), 'MMM d, yyyy HH:mm')
                            : 'Never'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(feed.created_at), 'MMM d, yyyy')}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          {/* Reset error button - only show if there are errors */}
                          {feed.error_count > 0 && (
                            <Button
                              size="icon"
                              variant="outline"
                              onClick={() => handleResetError(feed.id)}
                              disabled={resetErrorMutation.isPending}
                              title="Reset error count"
                            >
                              {resetErrorMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {/* Toggle status button */}
                          <Button
                            size="icon"
                            variant={feed.status === 'active' ? 'outline' : 'default'}
                            onClick={() => handleToggleStatus(feed.id, feed.status)}
                            disabled={pendingFeedId === feed.id}
                            title={feed.status === 'active' ? 'Disable feed' : 'Enable feed'}
                          >
                            {pendingFeedId === feed.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : feed.status === 'active' ? (
                              <Pause className="h-4 w-4" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                          {/* Delete button */}
                          <Button
                            size="icon"
                            variant="destructive-outline"
                            onClick={() => handleDeleteClick(feed.id)}
                            disabled={deleteFeedMutation.isPending}
                            title="Delete feed"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <p className="text-sm text-muted-foreground">
                        {search || statusFilter !== 'all'
                          ? 'No feeds found matching your criteria'
                          : 'No feeds yet'}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total_pages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-6 py-4">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.total_pages} ({data.total} total feeds)
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page === 1}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.page === data.total_pages}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmFeedId} onOpenChange={() => setDeleteConfirmFeedId(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Feed?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this feed? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleDeleteConfirm}
              disabled={deleteFeedMutation.isPending}
            >
              {deleteFeedMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}

