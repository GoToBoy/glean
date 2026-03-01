import { useEffect, useMemo, useState } from 'react'
import {
  useFeeds,
  useResetFeedError,
  useUpdateFeed,
  useDeleteFeed,
  useRefreshFeedNow,
  useRefreshAllFeedsNow,
  useRefreshErroredFeedsNow,
  useRefreshFeedStatus,
  useBatchFeedOperation,
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
  CheckSquare,
  Square,
} from 'lucide-react'
import { format } from 'date-fns'
import { useTranslation } from '@glean/i18n'

type FeedStatus = 'all' | 'active' | 'disabled' | 'error'

type FeedRefreshState = {
  jobId: string
  status: string
  resultStatus: string | null
  newEntries: number | null
  message: string | null
  lastFetchAttemptAt: string | null
  lastFetchSuccessAt: string | null
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false)

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
  const refreshErroredFeedsNowMutation = useRefreshErroredFeedsNow()
  const refreshFeedStatusMutation = useRefreshFeedStatus()
  const batchMutation = useBatchFeedOperation()

  const currentPageIds = useMemo(() => data?.items.map((f) => f.id) ?? [], [data?.items])
  const allCurrentPageSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selectedIds.has(id))

  const toggleSelectAll = () => {
    if (allCurrentPageSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        currentPageIds.forEach((id) => next.delete(id))
        return next
      })
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev)
        currentPageIds.forEach((id) => next.add(id))
        return next
      })
    }
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleBatchAction = async (action: string) => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    if (action === 'refresh') {
      // Refresh each selected feed individually
      const jobs: Array<{ feed_id: string; job_id: string }> = []
      for (const feedId of ids) {
        try {
          const result = await refreshFeedNowMutation.mutateAsync(feedId)
          jobs.push({ feed_id: result.feed_id, job_id: result.job_id })
        } catch {
          // Continue with remaining feeds
        }
      }
      applyRefreshJobs(jobs)
    } else {
      await batchMutation.mutateAsync({ action, feedIds: ids })
      await refetch()
    }
    clearSelection()
  }

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
      result_status: string | null
      new_entries: number | null
      message: string | null
      last_fetch_attempt_at: string | null
      last_fetch_success_at: string | null
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
          resultStatus: item.result_status,
          newEntries: item.new_entries,
          message: item.message,
          lastFetchAttemptAt: item.last_fetch_attempt_at,
          lastFetchSuccessAt: item.last_fetch_success_at,
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
        resultStatus: null,
        newEntries: null,
        message: null,
        lastFetchAttemptAt: null,
        lastFetchSuccessAt: null,
        lastFetchedAt: null,
        errorCount: 0,
        fetchErrorMessage: null,
        updatedAt: new Date().toISOString(),
      },
    }))
  }

  const applyRefreshJobs = (jobs: Array<{ feed_id: string; job_id: string }>) => {
    const nowIso = new Date().toISOString()
    setFeedRefreshState((prev) => {
      const next = { ...prev }
      for (const job of jobs) {
        next[job.feed_id] = {
          jobId: job.job_id,
          status: 'queued',
          resultStatus: null,
          newEntries: null,
          message: null,
          lastFetchAttemptAt: null,
          lastFetchSuccessAt: null,
          lastFetchedAt: null,
          errorCount: 0,
          fetchErrorMessage: null,
          updatedAt: nowIso,
        }
      }
      return next
    })
  }

  const handleRefreshAllFeeds = async () => {
    const result = await refreshAllFeedsNowMutation.mutateAsync()
    applyRefreshJobs(result.jobs)
  }

  const handleRefreshErroredFeeds = async () => {
    const result = await refreshErroredFeedsNowMutation.mutateAsync()
    applyRefreshJobs(result.jobs)
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
        if (result.items.some((item) => item.status === 'complete')) {
          void refetch()
        }
      } catch {
        // Keep previous status on polling failures
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [feedRefreshState, refreshFeedStatusMutation, refetch])

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
          {statusFilter === 'error' && (
            <Button
              variant="outline"
              onClick={handleRefreshErroredFeeds}
              disabled={refreshErroredFeedsNowMutation.isPending}
              className="border-destructive/50 text-destructive hover:bg-destructive/10"
            >
              {refreshErroredFeedsNowMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {t('admin:feeds.retryErrored')}
            </Button>
          )}
        </div>

        {/* Batch action toolbar */}
        {selectedIds.size > 0 && (
          <div className="border-primary/30 bg-primary/5 flex items-center gap-3 rounded-lg border px-4 py-2">
            <span className="text-primary text-sm font-medium">
              {t('admin:feeds.batch.selected', { count: selectedIds.size })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchAction('refresh')}
                disabled={batchMutation.isPending || refreshFeedNowMutation.isPending}
              >
                <RefreshCw className="h-3.5 w-3.5" />
                {t('admin:feeds.batch.refresh')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchAction('enable')}
                disabled={batchMutation.isPending}
              >
                <Play className="h-3.5 w-3.5" />
                {t('admin:feeds.batch.enable')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchAction('disable')}
                disabled={batchMutation.isPending}
              >
                <Pause className="h-3.5 w-3.5" />
                {t('admin:feeds.batch.disable')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => handleBatchAction('reset_error')}
                disabled={batchMutation.isPending}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t('admin:feeds.batch.resetError')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => setBatchDeleteConfirm(true)}
                disabled={batchMutation.isPending}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t('admin:feeds.batch.delete')}
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={clearSelection} className="ml-auto">
              {t('admin:feeds.batch.clearSelection')}
            </Button>
          </div>
        )}

        {/* Feeds table */}
        <div className="border-border bg-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border shadow-sm">
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full">
              <thead>
                <tr className="border-border bg-muted/50 border-b">
                  <th className="w-10 px-4 py-4">
                    <button
                      onClick={toggleSelectAll}
                      className="text-muted-foreground hover:text-foreground flex items-center"
                      title={allCurrentPageSelected ? t('admin:feeds.batch.deselectAll') : t('admin:feeds.batch.selectAll')}
                    >
                      {allCurrentPageSelected ? (
                        <CheckSquare className="h-4 w-4" />
                      ) : (
                        <Square className="h-4 w-4" />
                      )}
                    </button>
                  </th>
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
                      <td className="w-10 px-4 py-4">
                        <Skeleton className="h-4 w-4" />
                      </td>
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
                    const effectiveLastFetchAttemptAt =
                      refreshState?.lastFetchAttemptAt ??
                      feed.last_fetch_attempt_at ??
                      refreshState?.lastFetchedAt ??
                      feed.last_fetched_at
                    const effectiveLastFetchSuccessAt =
                      refreshState?.lastFetchSuccessAt ?? feed.last_fetch_success_at
                    const isRowError = refreshState?.resultStatus === 'error'
                    const isRowDone =
                      refreshState?.status === 'complete' || refreshState?.status === 'not_found'
                    const isRowPending = !!refreshState && isPendingRefreshStatus(refreshState.status)
                    const statusLabelMap: Record<string, string> = {
                      queued: t('admin:feeds.refreshStatus.queued'),
                      deferred: t('admin:feeds.refreshStatus.deferred'),
                      in_progress: t('admin:feeds.refreshStatus.refreshing'),
                      complete: t('admin:feeds.refreshStatus.completed'),
                      not_found: t('admin:feeds.refreshStatus.notFound'),
                    }
                    const resultStatusLabelMap: Record<string, string> = {
                      success: t('admin:feeds.refreshResult.success'),
                      not_modified: t('admin:feeds.refreshResult.notModified'),
                      error: t('admin:feeds.refreshResult.failed'),
                    }
                    const rowLogMessage =
                      refreshState?.message ||
                      refreshState?.fetchErrorMessage ||
                      (isRowDone && !isRowError ? null : feed.fetch_error_message)
                    const baseStatusText = refreshState
                      ? statusLabelMap[refreshState.status] ?? refreshState.status
                      : null
                    const resultStatusText =
                      refreshState?.resultStatus &&
                      (resultStatusLabelMap[refreshState.resultStatus] ?? refreshState.resultStatus)
                    const statusText = refreshState
                      ? `${baseStatusText}${resultStatusText ? ` · ${resultStatusText}` : ''}${refreshState.newEntries !== null ? ` · +${refreshState.newEntries}` : ''}`
                      : null

                    return (
                    <tr key={feed.id} className={`hover:bg-muted/50 transition-colors ${selectedIds.has(feed.id) ? 'bg-primary/5' : ''}`}>
                      <td className="w-10 px-4 py-4">
                        <button
                          onClick={() => toggleSelectOne(feed.id)}
                          className="text-muted-foreground hover:text-foreground flex items-center"
                        >
                          {selectedIds.has(feed.id) ? (
                            <CheckSquare className="h-4 w-4 text-primary" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </button>
                      </td>
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
                                <div className={`flex items-center gap-2 text-xs ${isRowError ? 'text-destructive' : 'text-muted-foreground'}`}>
                                  <span>{statusText}</span>
                                  <span>
                                    {format(
                                      new Date(
                                        refreshState.lastFetchAttemptAt ||
                                          refreshState.lastFetchedAt ||
                                          refreshState.updatedAt
                                      ),
                                      'MMM d, yyyy HH:mm:ss'
                                    )}
                                  </span>
                                </div>
                                {effectiveLastFetchSuccessAt && (
                                  <div className="text-muted-foreground text-xs">
                                    {t('admin:feeds.lastSuccessLabel')}:{' '}
                                    {format(new Date(effectiveLastFetchSuccessAt), 'MMM d, yyyy HH:mm:ss')}
                                  </div>
                                )}
                                <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                                  {isRowPending && (
                                    <div className="bg-primary h-full w-1/4 animate-progress-indeterminate rounded-full" />
                                  )}
                                  {isRowDone && !isRowError && (
                                    <div className="bg-primary h-full w-full transition-all duration-500 rounded-full" />
                                  )}
                                  {isRowError && (
                                    <div className="bg-destructive h-full w-full rounded-full" />
                                  )}
                                </div>
                                {rowLogMessage && (
                                  <div
                                    className={`flex items-start gap-1 text-xs ${isRowError ? 'text-destructive' : 'text-muted-foreground'}`}
                                  >
                                    {isRowError && (
                                      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                    )}
                                    <p className="line-clamp-2">{rowLogMessage}</p>
                                  </div>
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
                          {effectiveLastFetchAttemptAt
                            ? format(new Date(effectiveLastFetchAttemptAt), 'MMM d, yyyy HH:mm')
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
                    <td colSpan={7} className="px-6 py-12 text-center">
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

      {/* Batch Delete Confirmation Dialog */}
      <AlertDialog open={batchDeleteConfirm} onOpenChange={() => setBatchDeleteConfirm(false)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('admin:feeds.batch.batchDeleteTitle', { count: selectedIds.size })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin:feeds.batch.batchDeleteDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose className={buttonVariants({ variant: 'ghost' })}>
              {t('common:actions.cancel')}
            </AlertDialogClose>
            <AlertDialogClose
              className={buttonVariants({ variant: 'destructive' })}
              onClick={async () => {
                await handleBatchAction('delete')
                setBatchDeleteConfirm(false)
              }}
              disabled={batchMutation.isPending}
            >
              {batchMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t('admin:feeds.deleting')}
                </>
              ) : (
                t('admin:feeds.batch.delete')
              )}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}
