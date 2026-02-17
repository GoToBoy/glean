import { useEffect, useMemo, useState } from 'react'
import {
  useFeeds,
  useResetFeedError,
  useUpdateFeed,
  useDeleteFeed,
  useRefreshFeedNow,
  useRefreshAllFeedsNow,
  useRefreshFeedStatus,
} from '../hooks/useFeeds'
import {
  Button,
  buttonVariants,
  Input,
  Badge,
  Skeleton,
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from '@glean/ui'
import {
  Search,
  Play,
  Pause,
  RotateCcw,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  XCircle,
  ExternalLink,
  Filter,
} from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@glean/i18n'

type FeedStatus = 'all' | 'active' | 'disabled' | 'error'

type FeedRefreshState = {
  jobId: string
  status: string
  newEntries: number | null
  message: string | null
  lastFetchedAt: string | null
  errorCount: number
  fetchErrorMessage: string | null
  updatedAt: string
}

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
  const { t } = useTranslation(['admin', 'common'])
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [statusFilter, setStatusFilter] = useState<FeedStatus>('all')
  const [sortBy] = useState<'created_at' | 'last_fetched_at' | 'error_count'>('created_at')
  const [sortOrder] = useState<'asc' | 'desc'>('desc')
  const [pendingFeedId, setPendingFeedId] = useState<string | null>(null)
  const [deleteConfirmFeedId, setDeleteConfirmFeedId] = useState<string | null>(null)
  const [feedRefreshState, setFeedRefreshState] = useState<Record<string, FeedRefreshState>>({})

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
  const refreshFeedNowMutation = useRefreshFeedNow()
  const refreshAllFeedsNowMutation = useRefreshAllFeedsNow()
  const refreshFeedStatusMutation = useRefreshFeedStatus()

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
    setPage(1)
  }

  const handleResetError = async (feedId: string) => {
    await resetErrorMutation.mutateAsync(feedId)
  }

  const handleToggleStatus = async (
    feedId: string,
    currentStatus: 'active' | 'error' | 'disabled'
  ) => {
    const newStatus = currentStatus === 'active' ? 'disabled' : 'active'
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

  const isPendingRefreshStatus = (statusValue: string) =>
    statusValue === 'queued' || statusValue === 'deferred' || statusValue === 'in_progress'

  const upsertFeedRefreshStatus = (
    items: Array<{
      feed_id: string
      job_id: string
      status: string
      new_entries: number | null
      message: string | null
      last_fetched_at: string | null
      error_count: number
      fetch_error_message: string | null
    }>
  ) => {
    const nowIso = new Date().toISOString()
    setFeedRefreshState((prev) => {
      const next = { ...prev }
      for (const item of items) {
        next[item.feed_id] = {
          jobId: item.job_id,
          status: item.status,
          newEntries: item.new_entries,
          message: item.message,
          lastFetchedAt: item.last_fetched_at,
          errorCount: item.error_count,
          fetchErrorMessage: item.fetch_error_message,
          updatedAt: nowIso,
        }
      }
      return next
    })
  }

  const handleRefreshFeed = async (feedId: string) => {
    const result = await refreshFeedNowMutation.mutateAsync(feedId)
    setFeedRefreshState((prev) => ({
      ...prev,
      [result.feed_id]: {
        jobId: result.job_id,
        status: 'queued',
        newEntries: null,
        message: null,
        lastFetchedAt: null,
        errorCount: 0,
        fetchErrorMessage: null,
        updatedAt: new Date().toISOString(),
      },
    }))
  }

  const handleRefreshAllFeeds = async () => {
    const result = await refreshAllFeedsNowMutation.mutateAsync()
    const nowIso = new Date().toISOString()
    setFeedRefreshState((prev) => {
      const next = { ...prev }
      for (const job of result.jobs) {
        next[job.feed_id] = {
          jobId: job.job_id,
          status: 'queued',
          newEntries: null,
          message: null,
          lastFetchedAt: null,
          errorCount: 0,
          fetchErrorMessage: null,
          updatedAt: nowIso,
        }
      }
      return next
    })
  }

  useEffect(() => {
    const pendingItems = Object.entries(feedRefreshState)
      .filter(([, state]) => isPendingRefreshStatus(state.status))
      .map(([feedId, state]) => ({ feed_id: feedId, job_id: state.jobId }))

    if (pendingItems.length === 0) {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const result = await refreshFeedStatusMutation.mutateAsync(pendingItems)
        upsertFeedRefreshStatus(result.items)
      } catch {
        // Keep previous status on polling failures
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [feedRefreshState, refreshFeedStatusMutation])

  const pageItems: Array<number | 'ellipsis'> = useMemo(() => {
    const totalPages = data?.total_pages ?? 1
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const items: Array<number | 'ellipsis'> = [1]
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)
    if (start > 2) items.push('ellipsis')
    for (let p = start; p <= end; p += 1) items.push(p)
    if (end < totalPages - 1) items.push('ellipsis')
    items.push(totalPages)
    return items
  }, [data?.total_pages, page])

  const getStatusBadge = (status: string, errorCount: number, errorMessage?: string | null) => {
    if (errorCount > 0) {
      return (
        <Dialog>
          <DialogTrigger>
            <Badge variant="destructive" className="cursor-pointer gap-1 hover:opacity-80">
              <AlertCircle className="h-3 w-3" />
              {t('admin:feeds.status.error')} ({errorCount})
            </Badge>
          </DialogTrigger>
          <DialogPopup>
            <DialogHeader>
              <DialogTitle>{t('admin:feeds.feedErrorTitle')}</DialogTitle>
              <DialogDescription>
                {t('admin:feeds.feedErrorDescription', { count: errorCount })}
              </DialogDescription>
            </DialogHeader>
            <DialogPanel>
              <div className="bg-destructive/10 rounded-lg p-4">
                <p className="text-destructive text-sm font-medium">
                  {t('admin:feeds.feedErrorMessageLabel')}
                </p>
                <p className="text-muted-foreground mt-2 text-sm whitespace-pre-wrap">
                  {errorMessage || t('admin:feeds.noErrorMessage')}
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
          {t('admin:feeds.status.active')}
        </Badge>
      )
    }
    return (
      <Badge variant="secondary" className="gap-1">
        <XCircle className="h-3 w-3" />
        {t('admin:feeds.status.inactive')}
      </Badge>
    )
  }

  const statusFilters: { value: FeedStatus; label: string }[] = [
    { value: 'all', label: t('admin:feeds.status.all') },
    { value: 'active', label: t('admin:feeds.status.active') },
    { value: 'disabled', label: t('admin:feeds.status.inactive') },
    { value: 'error', label: t('admin:feeds.status.error') },
  ]

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-border bg-card border-b px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-foreground text-2xl font-bold">{t('admin:feeds.title')}</h1>
            <p className="text-muted-foreground mt-1 text-sm">{t('admin:feeds.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-8">
        {/* Filters */}
        <div className="mb-6 flex shrink-0 flex-wrap items-center gap-4">
          {/* Search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2" />
              <Input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('admin:feeds.searchPlaceholder')}
                className="w-64 pl-10"
              />
            </div>
            <Button type="submit">{t('admin:feeds.search')}</Button>
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
                {t('admin:feeds.clear')}
              </Button>
            )}
          </form>

          {/* Status filter */}
          <div className="flex items-center gap-2">
            <Filter className="text-muted-foreground h-4 w-4" />
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

          <Button
            variant="outline"
            onClick={handleRefreshAllFeeds}
            disabled={refreshAllFeedsNowMutation.isPending}
          >
            {refreshAllFeedsNowMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            {t('admin:feeds.refreshAll')}
          </Button>
        </div>

        {/* Feeds table */}
        <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="border-border bg-muted/50 border-b">
                  <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold tracking-wider uppercase">
                    {t('admin:feeds.table.feed')}
                  </th>
                  <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold tracking-wider uppercase">
                    {t('admin:feeds.table.status')}
                  </th>
                  <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold tracking-wider uppercase">
                    {t('admin:feeds.table.subscribers')}
                  </th>
                  <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold tracking-wider uppercase">
                    {t('admin:feeds.table.lastFetched')}
                  </th>
                  <th className="text-muted-foreground px-6 py-4 text-left text-xs font-semibold tracking-wider uppercase">
                    {t('admin:feeds.table.created')}
                  </th>
                  <th className="text-muted-foreground px-6 py-4 text-right text-xs font-semibold tracking-wider uppercase">
                    {t('admin:feeds.table.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-border divide-y">
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
                  data.items.map((feed) => {
                    const refreshState = feedRefreshState[feed.id]
                    const isRefreshing = !!refreshState && isPendingRefreshStatus(refreshState.status)
                    const progressMap: Record<string, number> = {
                      queued: 20,
                      deferred: 40,
                      in_progress: 65,
                      complete: 100,
                      not_found: 100,
                    }
                    const statusLabelMap: Record<string, string> = {
                      queued: t('admin:feeds.refreshStatus.queued'),
                      deferred: t('admin:feeds.refreshStatus.deferred'),
                      in_progress: t('admin:feeds.refreshStatus.refreshing'),
                      complete: t('admin:feeds.refreshStatus.completed'),
                      not_found: t('admin:feeds.refreshStatus.notFound'),
                    }
                    const progress = refreshState ? (progressMap[refreshState.status] ?? 0) : 0
                    const rowLogMessage =
                      refreshState?.message || refreshState?.fetchErrorMessage || feed.fetch_error_message
                    const statusText = refreshState
                      ? `${statusLabelMap[refreshState.status] ?? refreshState.status}${refreshState.newEntries !== null ? ` · +${refreshState.newEntries}` : ''}`
                      : null

                    return (
                    <tr key={feed.id} className="hover:bg-muted/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="text-foreground truncate text-sm font-medium">
                              {feed.title}
                            </p>
                            <a
                              href={feed.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary mt-1 flex items-center gap-1 truncate text-xs"
                            >
                              {feed.url}
                              <ExternalLink className="h-3 w-3 flex-shrink-0" />
                            </a>
                            {refreshState && (
                              <div className="mt-2 space-y-1">
                                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                                  <span>{statusText}</span>
                                  <span>
                                    {format(
                                      new Date(refreshState.lastFetchedAt || refreshState.updatedAt),
                                      'MMM d, yyyy HH:mm:ss'
                                    )}
                                  </span>
                                </div>
                                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                                  <div
                                    className="bg-primary h-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                  />
                                </div>
                                {rowLogMessage && (
                                  <p className="text-muted-foreground line-clamp-2 text-xs">
                                    {t('admin:feeds.logLabel')}: {rowLogMessage}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {getStatusBadge(feed.status, feed.error_count, feed.fetch_error_message)}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-muted-foreground text-sm">{feed.subscriber_count}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-muted-foreground text-sm">
                          {feed.last_fetched_at
                            ? format(new Date(feed.last_fetched_at), 'MMM d, yyyy HH:mm')
                            : t('admin:feeds.neverFetched')}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-muted-foreground text-sm">
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
                              title={t('admin:feeds.resetTooltip')}
                            >
                              {resetErrorMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RotateCcw className="h-4 w-4" />
                              )}
                            </Button>
                          )}
                          {/* Refresh now */}
                          <Button
                            size="icon"
                            variant="outline"
                            onClick={() => handleRefreshFeed(feed.id)}
                            disabled={isRefreshing || refreshFeedNowMutation.isPending}
                            title={t('admin:feeds.refreshNowTooltip')}
                          >
                            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                          </Button>
                          {/* Toggle status button */}
                          <Button
                            size="icon"
                            variant={feed.status === 'active' ? 'outline' : 'default'}
                            onClick={() => handleToggleStatus(feed.id, feed.status)}
                            disabled={pendingFeedId === feed.id}
                            title={
                              feed.status === 'active'
                                ? t('admin:feeds.disableTooltip')
                                : t('admin:feeds.enableTooltip')
                            }
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
                            title={t('admin:feeds.delete')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                    )
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center">
                      <p className="text-muted-foreground text-sm">
                        {search || statusFilter !== 'all'
                          ? t('admin:feeds.emptyFiltered')
                          : t('admin:feeds.empty')}
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.total_pages > 1 && (
            <div className="border-border flex shrink-0 items-center justify-between border-t px-6 py-4">
              <p className="text-muted-foreground text-sm">
                {t('admin:feeds.pagination.page', {
                  page: data.page,
                  totalPages: data.total_pages,
                  total: data.total,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={data.page === 1}
                >
                  {t('admin:feeds.pagination.previous')}
                </Button>
                {pageItems.map((item, index) =>
                  item === 'ellipsis' ? (
                    <span key={`ellipsis-${index}`} className="text-muted-foreground px-1 text-sm">
                      ...
                    </span>
                  ) : (
                    <Button
                      key={item}
                      size="sm"
                      variant={item === page ? 'default' : 'outline'}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </Button>
                  )
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={data.page === data.total_pages}
                >
                  {t('admin:feeds.pagination.next')}
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
            <AlertDialogTitle>{t('admin:feeds.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('admin:feeds.deleteDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants({ variant: 'ghost' })}>
              {t('common:actions.cancel')}
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants({ variant: 'destructive' })}
              onClick={handleDeleteConfirm}
              disabled={deleteFeedMutation.isPending}
            >
              {deleteFeedMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('admin:feeds.deleting')}
                </>
              ) : (
                t('admin:feeds.delete')
              )}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}
