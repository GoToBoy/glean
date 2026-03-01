import { useState, useRef, useEffect, useMemo } from 'react'
import {
  useSubscriptions,
  useDeleteSubscription,
  useRefreshFeed,
  useRefreshAllFeeds,
  useRefreshStatus,
  useImportOPML,
  useExportOPML,
} from '../../hooks/useSubscriptions'
import { useFolderStore } from '../../stores/folderStore'
import type { FolderTreeNode, RefreshStatusItem, Subscription, SubscriptionListResponse } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import {
  Button,
  Skeleton,
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from '@glean/ui'
import {
  Search,
  Trash2,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Rss,
  ExternalLink,
  AlertCircle,
  Plus,
  Upload,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Folder,
} from 'lucide-react'

type FeedRefreshState = {
  jobId: string
  status: string
  resultStatus: string | null
  newEntries: number | null
  totalEntries: number | null
  message: string | null
  lastFetchAttemptAt: string | null
  lastFetchSuccessAt: string | null
  lastFetchedAt: string | null
  errorCount: number
  fetchErrorMessage: string | null
  updatedAt: string
}

/**
 * Simple Manage Feeds tab component for Settings.
 *
 * Provides a basic list view of subscriptions.
 */
export function SubscriptionsTab() {
  const { t } = useTranslation('settings')
  const { fetchFolders, feedFolders } = useFolderStore()

  // Build flat folderId → name map from the folder tree
  const folderMap = useMemo(() => {
    const map = new Map<string, string>()
    const traverse = (nodes: FolderTreeNode[]) => {
      for (const node of nodes) {
        map.set(node.id, node.name)
        if (node.children.length > 0) traverse(node.children)
      }
    }
    traverse(feedFolders)
    return map
  }, [feedFolders])
  const deleteMutation = useDeleteSubscription()
  const refreshMutation = useRefreshFeed()
  const refreshAllMutation = useRefreshAllFeeds()
  const refreshStatusMutation = useRefreshStatus()
  const importMutation = useImportOPML()
  const exportMutation = useExportOPML()

  // State
  const [searchQuery, setSearchQuery] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [feedRefreshState, setFeedRefreshState] = useState<Record<string, FeedRefreshState>>({})
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [perPage] = useState(10)

  // Fetch subscriptions
  const { data, isLoading, error } = useSubscriptions({
    search: searchQuery,
    page,
    per_page: perPage,
  }) as { data: SubscriptionListResponse | undefined; isLoading: boolean; error: Error | null }

  // File input for OPML import
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Fetch folders on mount
  useEffect(() => {
    fetchFolders('feed')
  }, [fetchFolders])

  // Reset page when search query changes
  useEffect(() => {
    setPage(1)
  }, [searchQuery])

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id)
  }

  const handleRefresh = async (id: string) => {
    setRefreshingId(id)
    setRefreshError(null)
    try {
      const result = await refreshMutation.mutateAsync(id)
      setFeedRefreshState((prev) => ({
        ...prev,
        [result.feed_id]: {
          jobId: result.job_id,
          status: 'queued',
          resultStatus: null,
          newEntries: null,
          totalEntries: null,
          message: null,
          lastFetchAttemptAt: null,
          lastFetchSuccessAt: null,
          lastFetchedAt: null,
          errorCount: 0,
          fetchErrorMessage: null,
          updatedAt: new Date().toISOString(),
        },
      }))
    } catch (err) {
      setRefreshError((err as Error).message)
    } finally {
      setRefreshingId(null)
    }
  }

  const handleRefreshAll = async () => {
    setRefreshError(null)
    try {
      const result = await refreshAllMutation.mutateAsync()
      const now = new Date().toISOString()
      setFeedRefreshState((prev) => {
        const next = { ...prev }
        for (const job of result.jobs) {
          next[job.feed_id] = {
            jobId: job.job_id,
            status: 'queued',
            resultStatus: null,
            newEntries: null,
            totalEntries: null,
            message: null,
            lastFetchAttemptAt: null,
            lastFetchSuccessAt: null,
            lastFetchedAt: null,
            errorCount: 0,
            fetchErrorMessage: null,
            updatedAt: now,
          }
        }
        return next
      })
    } catch (err) {
      setRefreshError((err as Error).message)
    }
  }

  const handleImport = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await importMutation.mutateAsync(file)
      fetchFolders('feed') // Refresh folder list after import
    } catch {
      // Error is handled by the mutation
    }
  }

  const handleExport = () => {
    exportMutation.mutate()
  }

  const upsertRefreshStates = (items: RefreshStatusItem[]) => {
    const now = new Date().toISOString()
    setFeedRefreshState((prev) => {
      const next = { ...prev }
      for (const item of items) {
        next[item.feed_id] = {
          jobId: item.job_id,
          status: item.status,
          resultStatus: item.result_status,
          newEntries: item.new_entries,
          totalEntries: item.total_entries,
          message: item.message,
          lastFetchAttemptAt: item.last_fetch_attempt_at,
          lastFetchSuccessAt: item.last_fetch_success_at,
          lastFetchedAt: item.last_fetched_at,
          errorCount: item.error_count,
          fetchErrorMessage: item.fetch_error_message,
          updatedAt: now,
        }
      }
      return next
    })
  }

  const isPendingRefreshStatus = (statusValue: string) =>
    statusValue === 'queued' || statusValue === 'deferred' || statusValue === 'in_progress'

  useEffect(() => {
    const pendingItems = Object.entries(feedRefreshState)
      .filter(([, state]) => isPendingRefreshStatus(state.status))
      .map(([feedId, state]) => ({ feed_id: feedId, job_id: state.jobId }))

    if (pendingItems.length === 0) {
      return
    }

    const timer = window.setInterval(async () => {
      try {
        const statusResult = await refreshStatusMutation.mutateAsync({ items: pendingItems })
        upsertRefreshStates(statusResult.items)
      } catch {
        // Keep current state if poll fails
      }
    }, 2000)

    return () => window.clearInterval(timer)
  }, [feedRefreshState, refreshStatusMutation])

  // Pagination calculations
  const totalItems = data?.total || 0
  const totalPages = Math.max(1, Math.ceil(totalItems / perPage))
  const hasNextPage = page < totalPages
  const hasPrevPage = page > 1

  const pageItems: Array<number | 'ellipsis'> = (() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }

    const items: Array<number | 'ellipsis'> = [1]
    const start = Math.max(2, page - 1)
    const end = Math.min(totalPages - 1, page + 1)

    if (start > 2) {
      items.push('ellipsis')
    }
    for (let p = start; p <= end; p += 1) {
      items.push(p)
    }
    if (end < totalPages - 1) {
      items.push('ellipsis')
    }

    items.push(totalPages)
    return items
  })()

  const handlePrevPage = () => {
    if (hasPrevPage) {
      setPage(page - 1)
    }
  }

  const handleNextPage = () => {
    if (hasNextPage) {
      setPage(page + 1)
    }
  }

  return (
    <div className="stagger-children flex h-full min-h-0 w-full flex-col gap-4">
      {/* Refresh error banner */}
      {refreshError && (
        <div className="text-destructive border-destructive/30 bg-destructive/10 flex items-center gap-2 rounded-lg border px-4 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{refreshError}</span>
          <button onClick={() => setRefreshError(null)} className="hover:text-destructive/70 shrink-0">
            ✕
          </button>
        </div>
      )}

      {/* Actions Bar */}
      <div className="animate-fade-in flex w-full shrink-0 items-center justify-between gap-4">
        <div className="relative flex-1 sm:max-w-48">
          <Search className="text-muted-foreground/50 pointer-events-none absolute top-1/2 left-2.5 z-10 h-4 w-4 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('manageFeeds.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="border-input bg-background placeholder:text-muted-foreground/60 focus:border-input h-11 w-full rounded-lg border pr-3 pl-8 text-sm transition-colors outline-none sm:h-8"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefreshAll}
            disabled={refreshAllMutation.isPending}
            className="gap-1.5"
          >
            {refreshAllMutation.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 shrink-0" />
            )}
            <span className="hidden sm:inline">Refresh All</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleImport}
            disabled={importMutation.isPending}
            className="gap-1.5"
          >
            <Upload className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('manageFeeds.importOPML')}</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exportMutation.isPending}
            className="gap-1.5"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{t('manageFeeds.exportOPML')}</span>
          </Button>
        </div>
      </div>

      {/* Import progress banner */}
      {importMutation.isPending && (
        <div className="border-border bg-muted/30 flex items-center gap-3 rounded-lg border px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span className="flex-1">{t('manageFeeds.importing')}</span>
          <div className="bg-muted h-1 w-32 overflow-hidden rounded-full">
            <div className="bg-primary h-full w-1/4 animate-progress-indeterminate rounded-full" />
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".opml,.xml"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Subscriptions List */}
      <div className="animate-fade-in border-border flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg border">
        {/* Header */}
        <div className="bg-muted/50 border-border shrink-0 border-b px-4 py-3">
          <span className="text-muted-foreground text-sm font-medium">
            {data
              ? t('manageFeeds.subscriptionCount', {
                  count: data.total || 0,
                })
              : t('manageFeeds.loading')}
          </span>
        </div>

        {/* List */}
        <div className="divide-border min-h-0 flex-1 overflow-y-auto divide-y">
          {(() => {
            if (isLoading) {
              return Array.from({ length: 5 }, (_, i) => `skeleton-${i}`).map((key) => (
                <div key={key} className="space-y-2 p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))
            }

            if (error) {
              return (
                <div className="p-8 text-center">
                  <AlertCircle className="text-destructive mx-auto mb-2 h-8 w-8" />
                  <p className="text-muted-foreground text-sm">{t('manageFeeds.failedToLoad')}</p>
                </div>
              )
            }

            if (data?.items && data.items.length > 0) {
              return data.items.map((subscription: Subscription) => {
                const refreshState = feedRefreshState[subscription.feed_id]
                const isRefreshingRow =
                  refreshState && isPendingRefreshStatus(refreshState.status)
                const isError = refreshState?.resultStatus === 'error'
                const isDone =
                  refreshState?.status === 'complete' || refreshState?.status === 'not_found'
                const isPendingRow = refreshState ? isPendingRefreshStatus(refreshState.status) : false
                const statusLabelMap: Record<string, string> = {
                  queued: t('manageFeeds.refreshStatus.queued'),
                  deferred: t('manageFeeds.refreshStatus.deferred'),
                  in_progress: t('manageFeeds.refreshStatus.refreshing'),
                  complete: t('manageFeeds.refreshStatus.completed'),
                  not_found: t('manageFeeds.refreshStatus.notFound'),
                }
                const resultStatusLabelMap: Record<string, string> = {
                  success: t('manageFeeds.refreshResult.success'),
                  not_modified: t('manageFeeds.refreshResult.notModified'),
                  error: t('manageFeeds.refreshResult.failed'),
                }
                const statusLabel = refreshState
                  ? statusLabelMap[refreshState.status] || refreshState.status
                  : null
                const resultStatusLabel =
                  refreshState?.resultStatus &&
                  (resultStatusLabelMap[refreshState.resultStatus] || refreshState.resultStatus)
                const rowLogMessage =
                  refreshState?.message ||
                  refreshState?.fetchErrorMessage ||
                  (isDone && !isError ? null : subscription.feed.fetch_error_message)
                const effectiveLastFetchAttemptAt =
                  refreshState?.lastFetchAttemptAt ||
                  subscription.feed.last_fetch_attempt_at ||
                  refreshState?.lastFetchedAt
                const effectiveLastFetchSuccessAt =
                  refreshState?.lastFetchSuccessAt || subscription.feed.last_fetch_success_at

                return (
                <div
                  key={subscription.id}
                  className="hover:bg-muted/30 w-full p-4 transition-colors"
                >
                  <div className="flex w-full items-center gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {subscription.feed.icon_url ? (
                        <img
                          src={subscription.feed.icon_url}
                          alt=""
                          className="h-5 w-5 shrink-0 rounded"
                        />
                      ) : (
                        <div className="bg-muted h-5 w-5 shrink-0 rounded" />
                      )}

                      <div className="min-w-0 flex-1">
                        <h3 className="text-foreground truncate font-medium">
                          {subscription.custom_title ||
                            subscription.feed.title ||
                            t('manageFeeds.untitledFeed')}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-2">
                          <p className="text-muted-foreground truncate text-sm">
                            {subscription.feed.url}
                          </p>
                          {subscription.folder_id && folderMap.get(subscription.folder_id) && (
                            <span className="text-muted-foreground bg-muted flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs">
                              <Folder className="h-3 w-3" />
                              {folderMap.get(subscription.folder_id)}
                            </span>
                          )}
                        </div>
                        {refreshState && (
                          <div className="mt-2 space-y-1">
                            <div className={`flex items-center gap-2 text-xs ${isError ? 'text-destructive' : 'text-muted-foreground'}`}>
                              <span>
                                {statusLabel}
                                {resultStatusLabel ? ` · ${resultStatusLabel}` : ''}
                                {refreshState.newEntries !== null
                                  ? ` · +${refreshState.newEntries}${refreshState.totalEntries !== null ? ` / ${refreshState.totalEntries}` : ''} ${t('manageFeeds.entriesSuffix')}`
                                  : ''}
                              </span>
                              <span>
                                {new Date(
                                  effectiveLastFetchAttemptAt || refreshState.updatedAt
                                ).toLocaleString()}
                              </span>
                            </div>
                            {effectiveLastFetchSuccessAt && (
                              <p className="text-muted-foreground text-xs">
                                {t('manageFeeds.lastSuccessLabel')}:{' '}
                                {new Date(effectiveLastFetchSuccessAt).toLocaleString()}
                              </p>
                            )}
                            <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
                              {isPendingRow && (
                                <div className="bg-primary h-full w-1/4 animate-progress-indeterminate rounded-full" />
                              )}
                              {isDone && !isError && (
                                <div className="bg-primary h-full w-full transition-all duration-500 rounded-full" />
                              )}
                              {isError && (
                                <div className="bg-destructive h-full w-full rounded-full" />
                              )}
                            </div>
                            {rowLogMessage && (
                              <div
                                className={`flex items-start gap-1 text-xs ${isError ? 'text-destructive' : 'text-muted-foreground'}`}
                              >
                                {isError && (
                                  <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                                )}
                                <p className="line-clamp-2">{rowLogMessage}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => window.open(subscription.feed.url, '_blank')}
                        title={t('manageFeeds.openFeed')}
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>

                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleRefresh(subscription.id)}
                        disabled={refreshingId === subscription.id || isRefreshingRow}
                        title={t('manageFeeds.refreshFeed')}
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${refreshingId === subscription.id || isRefreshingRow ? 'animate-spin' : ''}`}
                        />
                      </Button>

                      <Menu>
                        <MenuTrigger className="text-muted-foreground hover:bg-accent hover:text-foreground flex h-8 w-8 items-center justify-center rounded-lg transition-colors">
                          <MoreHorizontal className="h-4 w-4" />
                        </MenuTrigger>
                        <MenuPopup align="end">
                          <MenuItem
                            onClick={() => {
                              // Edit functionality is available in the feed context menu
                              console.log('Edit feed:', subscription.id)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                            {t('manageFeeds.edit')}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            variant="destructive"
                            onClick={() => handleDelete(subscription.id)}
                            disabled={deleteMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                            {t('manageFeeds.unsubscribe')}
                          </MenuItem>
                        </MenuPopup>
                      </Menu>
                    </div>
                  </div>
                </div>
                )
              })
            }

            return (
              <div className="p-8 text-center">
                <Rss className="text-muted-foreground mx-auto mb-4 h-12 w-12" />
                <h3 className="text-foreground mb-2 text-lg font-medium">
                  {t('manageFeeds.noSubscriptionsFound')}
                </h3>
                <p className="text-muted-foreground mb-4 text-sm">
                  {searchQuery
                    ? t('manageFeeds.tryDifferentSearch')
                    : t('manageFeeds.addFirstFeed')}
                </p>
                {!searchQuery && (
                  <Button
                    onClick={() => {
                      // Navigate to reader page where add feed dialog is available
                      console.log('Add feed')
                    }}
                  >
                    <Plus className="mr-2 h-4 w-4" />
                    {t('manageFeeds.addFeed')}
                  </Button>
                )}
              </div>
            )
          })()}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-border bg-muted/30 flex shrink-0 items-center justify-between border-t px-4 py-3">
            <div className="text-muted-foreground text-sm">
              {t('manageFeeds.pageInfo', {
                page,
                totalPages,
                totalItems,
                plural: totalItems === 1 ? '' : 's',
              })}
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePrevPage}
                disabled={!hasPrevPage || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
                {t('manageFeeds.previous')}
              </Button>
              {pageItems.map((item, index) =>
                item === 'ellipsis' ? (
                  <span key={`ellipsis-${index}`} className="text-muted-foreground px-1 text-sm">
                    ...
                  </span>
                ) : (
                  <Button
                    key={item}
                    variant={item === page ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPage(item)}
                    disabled={isLoading}
                    className="min-w-9 px-2"
                  >
                    {item}
                  </Button>
                )
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextPage}
                disabled={!hasNextPage || isLoading}
              >
                {t('manageFeeds.next')}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
