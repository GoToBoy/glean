import { useState, useRef, useEffect, useMemo, type ChangeEvent, type Dispatch, type SetStateAction } from 'react'
import {
  useAllSubscriptions,
  useDeleteSubscription,
  useBatchDeleteSubscriptions,
  useRefreshFeed,
  useRefreshAllFeeds,
  useRefreshStatus,
  useImportOPML,
  useExportOPML,
} from '../../hooks/useSubscriptions'
import { useEntries } from '../../hooks/useEntries'
import { useFolderStore } from '../../stores/folderStore'
import { useAuthStore } from '../../stores/authStore'
import type { EntryWithState, FolderTreeNode, RefreshStatusItem, Subscription } from '@glean/types'
import { useTranslation } from '@glean/i18n'
import {
  Button,
  Checkbox,
  Skeleton,
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  cn,
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
  Upload,
  Download,
  Loader2,
  Folder,
  FolderOpen,
  Eye,
  EyeOff,
  CheckSquare,
  Square,
  ChevronRight,
} from 'lucide-react'
import { entryService } from '@glean/api-client'
import { shouldAutoTranslate } from '../../lib/translationLanguagePolicy'

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

const PANEL_CLASS = 'flex min-h-0 flex-1 flex-col overflow-hidden border'
const TOOLBAR_CLASS = 'flex shrink-0 flex-wrap items-center justify-between gap-3'
const SEARCH_CLASS =
  'h-10 w-full rounded-lg border border-input bg-background pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground/60 focus:border-input'
const TREE_ROW_CLASS =
  'flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors'
const ICON_BUTTON_CLASS = 'h-8 w-8'
const allFolderIds = (folders: FolderTreeNode[]): string[] =>
  folders.flatMap((folder) => [folder.id, ...allFolderIds(folder.children)])

function sortUnreadFirst(items: Subscription[]): Subscription[] {
  const unread = items.filter((sub) => sub.unread_count > 0)
  const fullyRead = items.filter((sub) => sub.unread_count === 0)
  return [...unread, ...fullyRead]
}

function matchesSubscription(
  subscription: Subscription,
  folderPath: string,
  query: string
) {
  if (!query) return true

  const text = [
    subscription.custom_title,
    subscription.feed.title,
    subscription.feed.url,
    folderPath,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  return text.includes(query)
}

export function SubscriptionsTab() {
  const { t } = useTranslation('settings')
  const { fetchFolders, feedFolders } = useFolderStore()
  const deleteMutation = useDeleteSubscription()
  const batchDeleteMutation = useBatchDeleteSubscriptions()
  const refreshMutation = useRefreshFeed()
  const refreshAllMutation = useRefreshAllFeeds()
  const refreshStatusMutation = useRefreshStatus()
  const importMutation = useImportOPML()
  const exportMutation = useExportOPML()
  const { data: allSubscriptions = [], isLoading, error } = useAllSubscriptions()

  const [searchQuery, setSearchQuery] = useState('')
  const [refreshingId, setRefreshingId] = useState<string | null>(null)
  const [feedRefreshState, setFeedRefreshState] = useState<Record<string, FeedRefreshState>>({})
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [isBatchMode, setIsBatchMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [previewSubscriptionId, setPreviewSubscriptionId] = useState<string | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetchFolders('feed')
  }, [fetchFolders])

  useEffect(() => {
    if (feedFolders.length === 0) return
    setExpandedFolders((prev) => (prev.size > 0 ? prev : new Set(allFolderIds(feedFolders))))
  }, [feedFolders])

  const normalizedQuery = searchQuery.trim().toLowerCase()

  const folderPathMap = useMemo(() => {
    const map = new Map<string, string>()

    const walk = (nodes: FolderTreeNode[], parentNames: string[] = []) => {
      for (const node of nodes) {
        const names = [...parentNames, node.name]
        map.set(node.id, names.join(' / '))
        walk(node.children, names)
      }
    }

    walk(feedFolders)
    return map
  }, [feedFolders])

  const visibleSubscriptions = useMemo(
    () =>
      allSubscriptions.filter((subscription) =>
        matchesSubscription(
          subscription,
          subscription.folder_id ? (folderPathMap.get(subscription.folder_id) ?? '') : '',
          normalizedQuery
        )
      ),
    [allSubscriptions, folderPathMap, normalizedQuery]
  )

  const visibleIds = useMemo(
    () => new Set(visibleSubscriptions.map((subscription) => subscription.id)),
    [visibleSubscriptions]
  )

  useEffect(() => {
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)))
      return next.size === prev.size ? prev : next
    })

    if (previewSubscriptionId && !visibleIds.has(previewSubscriptionId)) {
      setPreviewSubscriptionId(null)
    }
  }, [previewSubscriptionId, visibleIds])

  useEffect(() => {
    if (!normalizedQuery || feedFolders.length === 0) return
    setExpandedFolders(new Set(allFolderIds(feedFolders)))
  }, [normalizedQuery, feedFolders])

  const subscriptionsByFolder = useMemo(() => {
    const map = new Map<string, Subscription[]>()
    for (const subscription of visibleSubscriptions) {
      if (!subscription.folder_id) continue
      const group = map.get(subscription.folder_id) ?? []
      group.push(subscription)
      map.set(subscription.folder_id, group)
    }
    for (const items of map.values()) {
      const sorted = sortUnreadFirst(items)
      items.splice(0, items.length, ...sorted)
    }
    return map
  }, [visibleSubscriptions])

  const ungroupedSubscriptions = useMemo(
    () => sortUnreadFirst(visibleSubscriptions.filter((subscription) => !subscription.folder_id)),
    [visibleSubscriptions]
  )

  const folderStats = useMemo(() => {
    const countMap = new Map<string, number>()
    const idMap = new Map<string, string[]>()

    const walk = (nodes: FolderTreeNode[]): string[] => {
      const subtreeIds: string[] = []

      for (const node of nodes) {
        const ownIds = (subscriptionsByFolder.get(node.id) ?? []).map((subscription) => subscription.id)
        const childIds = walk(node.children)
        const allIdsForNode = [...ownIds, ...childIds]
        idMap.set(node.id, allIdsForNode)
        countMap.set(node.id, allIdsForNode.length)
        subtreeIds.push(...allIdsForNode)
      }

      return subtreeIds
    }

    walk(feedFolders)
    return { countMap, idMap }
  }, [feedFolders, subscriptionsByFolder])

  const selectedCount = selectedIds.size
  const visibleCount = visibleSubscriptions.length
  const isAllVisibleSelected = visibleCount > 0 && visibleSubscriptions.every((item) => selectedIds.has(item.id))
  const isSomeVisibleSelected = selectedCount > 0 && !isAllVisibleSelected

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync(id)
    setSelectedIds((prev) => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (previewSubscriptionId === id) {
      setPreviewSubscriptionId(null)
    }
  }

  const handleBatchDelete = async () => {
    const subscriptionIds = Array.from(selectedIds)
    if (subscriptionIds.length === 0) return

    await batchDeleteMutation.mutateAsync({ subscription_ids: subscriptionIds })
    setSelectedIds(new Set())
    setPreviewSubscriptionId(null)
  }

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const toggleFolderSelection = (folderId: string) => {
    const folderIds = folderStats.idMap.get(folderId) ?? []
    if (folderIds.length === 0) return

    const allSelected = folderIds.every((id) => selectedIds.has(id))
    setSelectedIds((prev) => {
      const next = new Set(prev)
      for (const id of folderIds) {
        if (allSelected) {
          next.delete(id)
        } else {
          next.add(id)
        }
      }
      return next
    })
  }

  const toggleSelectAllVisible = () => {
    if (visibleSubscriptions.length === 0) return

    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (isAllVisibleSelected) {
        for (const subscription of visibleSubscriptions) {
          next.delete(subscription.id)
        }
      } else {
        for (const subscription of visibleSubscriptions) {
          next.add(subscription.id)
        }
      }
      return next
    })
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

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      await importMutation.mutateAsync(file)
      fetchFolders('feed')
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

    if (pendingItems.length === 0) return

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

  const toggleFolderExpand = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-4">
      {refreshError && (
        <div className="text-destructive flex items-center gap-2 border border-destructive/30 bg-destructive/10 px-4 py-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="flex-1">{refreshError}</span>
          <button type="button" onClick={() => setRefreshError(null)} className="shrink-0">
            ✕
          </button>
        </div>
      )}

      <div className={TOOLBAR_CLASS}>
        <div className="relative w-full flex-1 sm:max-w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground/50" />
          <input
            type="text"
            placeholder={t('manageFeeds.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={SEARCH_CLASS}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={isBatchMode ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setIsBatchMode((prev) => !prev)
              setSelectedIds(new Set())
            }}
            className="gap-1.5"
          >
            {isBatchMode ? (
              <CheckSquare className="h-4 w-4 shrink-0" />
            ) : (
              <Square className="h-4 w-4 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {isBatchMode ? t('manageFeeds.exitBatchMode') : t('manageFeeds.batchManage')}
            </span>
          </Button>
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

      {isBatchMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border bg-muted/30 px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleSelectAllVisible}
              className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <Checkbox
                checked={isAllVisibleSelected}
                indeterminate={isSomeVisibleSelected}
                aria-label={t('manageFeeds.selectAllVisible')}
              />
              <span>{t('manageFeeds.selectAllVisible')}</span>
            </button>
            <span className="text-sm text-muted-foreground">
              {t('manageFeeds.selectedCount', { count: selectedCount })}
            </span>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleBatchDelete}
            disabled={selectedCount === 0 || batchDeleteMutation.isPending}
            className="gap-1.5"
          >
            {batchDeleteMutation.isPending ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 shrink-0" />
            )}
            <span>{t('manageFeeds.unsubscribeSelected')}</span>
          </Button>
        </div>
      )}

      {importMutation.isPending && (
        <div className="flex items-center gap-3 border bg-muted/30 px-4 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span className="flex-1">{t('manageFeeds.importing')}</span>
          <div className="h-1 w-32 overflow-hidden rounded-full bg-muted">
            <div className="h-full w-1/4 animate-progress-indeterminate rounded-full bg-primary" />
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".opml,.xml"
        onChange={handleFileChange}
        className="hidden"
      />

      <div className={PANEL_CLASS}>
        <div className="shrink-0 border-b bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          {isLoading
            ? t('manageFeeds.loading')
            : t('manageFeeds.subscriptionCount', { count: visibleCount })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((key) => (
                <div key={key} className="space-y-2 border p-4">
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="p-8 text-center">
              <AlertCircle className="mx-auto mb-2 h-8 w-8 text-destructive" />
              <p className="text-sm text-muted-foreground">{t('manageFeeds.failedToLoad')}</p>
            </div>
          )}

          {!isLoading && !error && visibleCount === 0 && (
            <div className="p-8 text-center">
              <Rss className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="mb-2 text-lg font-medium text-foreground">
                {t('manageFeeds.noSubscriptionsFound')}
              </h3>
              <p className="text-sm text-muted-foreground">
                {searchQuery ? t('manageFeeds.tryDifferentSearch') : t('manageFeeds.addFirstFeed')}
              </p>
            </div>
          )}

          {!isLoading && !error && visibleCount > 0 && (
            <div className="space-y-1">
              {feedFolders.map((folder) => {
                const count = folderStats.countMap.get(folder.id) ?? 0
                if (count === 0) return null

                return (
                  <FolderBranch
                    key={folder.id}
                    folder={folder}
                    depth={0}
                    expandedFolders={expandedFolders}
                    onToggleExpand={toggleFolderExpand}
                    subscriptionsByFolder={subscriptionsByFolder}
                    folderStats={folderStats}
                    selectedIds={selectedIds}
                    isBatchMode={isBatchMode}
                    onToggleFolderSelection={toggleFolderSelection}
                    onToggleSelection={toggleSelection}
                    previewSubscriptionId={previewSubscriptionId}
                    onTogglePreview={setPreviewSubscriptionId}
                    onDelete={handleDelete}
                    isDeletePending={deleteMutation.isPending}
                    onRefresh={handleRefresh}
                    refreshingId={refreshingId}
                    feedRefreshState={feedRefreshState}
                  />
                )
              })}

              {ungroupedSubscriptions.length > 0 && (
                <div className="pt-2">
                  <div className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t('manageFeeds.uncategorized')}
                  </div>
                  <div className="space-y-1">
                    {ungroupedSubscriptions.map((subscription) => (
                      <SubscriptionRow
                        key={subscription.id}
                        subscription={subscription}
                        depth={0}
                        isBatchMode={isBatchMode}
                        isSelected={selectedIds.has(subscription.id)}
                        onToggleSelection={toggleSelection}
                        isPreviewOpen={previewSubscriptionId === subscription.id}
                        onTogglePreview={setPreviewSubscriptionId}
                        onDelete={handleDelete}
                        isDeletePending={deleteMutation.isPending}
                        onRefresh={handleRefresh}
                        refreshingId={refreshingId}
                        refreshState={feedRefreshState[subscription.feed_id]}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type FolderStats = {
  countMap: Map<string, number>
  idMap: Map<string, string[]>
}

interface FolderBranchProps {
  folder: FolderTreeNode
  depth: number
  expandedFolders: Set<string>
  onToggleExpand: (folderId: string) => void
  subscriptionsByFolder: Map<string, Subscription[]>
  folderStats: FolderStats
  selectedIds: Set<string>
  isBatchMode: boolean
  onToggleFolderSelection: (folderId: string) => void
  onToggleSelection: (id: string) => void
  previewSubscriptionId: string | null
  onTogglePreview: Dispatch<SetStateAction<string | null>>
  onDelete: (id: string) => Promise<void>
  isDeletePending: boolean
  onRefresh: (id: string) => Promise<void>
  refreshingId: string | null
  feedRefreshState: Record<string, FeedRefreshState>
}

function FolderBranch({
  folder,
  depth,
  expandedFolders,
  onToggleExpand,
  subscriptionsByFolder,
  folderStats,
  selectedIds,
  isBatchMode,
  onToggleFolderSelection,
  onToggleSelection,
  previewSubscriptionId,
  onTogglePreview,
  onDelete,
  isDeletePending,
  onRefresh,
  refreshingId,
  feedRefreshState,
}: FolderBranchProps) {
  const { t } = useTranslation('settings')
  const count = folderStats.countMap.get(folder.id) ?? 0
  const folderIds = folderStats.idMap.get(folder.id) ?? []
  const selectedCount = folderIds.filter((id) => selectedIds.has(id)).length
  const isExpanded = expandedFolders.has(folder.id)
  const hasChildren = folder.children.some((child) => (folderStats.countMap.get(child.id) ?? 0) > 0)
  const items = subscriptionsByFolder.get(folder.id) ?? []

  if (count === 0) return null

  return (
    <div>
      <div
        className={cn(TREE_ROW_CLASS, 'bg-muted/30 text-foreground', depth > 0 && 'mt-1')}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {isBatchMode && (
          <Checkbox
            checked={selectedCount > 0 && selectedCount === folderIds.length}
            indeterminate={selectedCount > 0 && selectedCount < folderIds.length}
            aria-label={t('manageFeeds.selectFolder')}
            onCheckedChange={() => onToggleFolderSelection(folder.id)}
          />
        )}
        <button
          type="button"
          onClick={() => onToggleExpand(folder.id)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight className={cn('h-4 w-4 shrink-0 transition-transform', isExpanded && 'rotate-90')} />
          {isExpanded ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-primary" />
          )}
          <span className="truncate font-medium">{folder.name}</span>
          <span className="shrink-0 rounded bg-background px-1.5 py-0.5 text-xs text-muted-foreground">
            {count}
          </span>
        </button>
      </div>

      {isExpanded && (
        <div className="space-y-1">
          {folder.children.map((child) => (
            <FolderBranch
              key={child.id}
              folder={child}
              depth={depth + 1}
              expandedFolders={expandedFolders}
              onToggleExpand={onToggleExpand}
              subscriptionsByFolder={subscriptionsByFolder}
              folderStats={folderStats}
              selectedIds={selectedIds}
              isBatchMode={isBatchMode}
              onToggleFolderSelection={onToggleFolderSelection}
              onToggleSelection={onToggleSelection}
              previewSubscriptionId={previewSubscriptionId}
              onTogglePreview={onTogglePreview}
              onDelete={onDelete}
              isDeletePending={isDeletePending}
              onRefresh={onRefresh}
              refreshingId={refreshingId}
              feedRefreshState={feedRefreshState}
            />
          ))}

          {items.map((subscription) => (
            <SubscriptionRow
              key={subscription.id}
              subscription={subscription}
              depth={depth + 1}
              isBatchMode={isBatchMode}
              isSelected={selectedIds.has(subscription.id)}
              onToggleSelection={onToggleSelection}
              isPreviewOpen={previewSubscriptionId === subscription.id}
              onTogglePreview={onTogglePreview}
              onDelete={onDelete}
              isDeletePending={isDeletePending}
              onRefresh={onRefresh}
              refreshingId={refreshingId}
              refreshState={feedRefreshState[subscription.feed_id]}
            />
          ))}

          {!hasChildren && items.length === 0 && (
            <div
              className="px-3 py-2 text-xs text-muted-foreground"
              style={{ paddingLeft: `${28 + (depth + 1) * 16}px` }}
            >
              {t('manageFeeds.emptyFolder')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface SubscriptionRowProps {
  subscription: Subscription
  depth: number
  isBatchMode: boolean
  isSelected: boolean
  onToggleSelection: (id: string) => void
  isPreviewOpen: boolean
  onTogglePreview: Dispatch<SetStateAction<string | null>>
  onDelete: (id: string) => Promise<void>
  isDeletePending: boolean
  onRefresh: (id: string) => Promise<void>
  refreshingId: string | null
  refreshState?: FeedRefreshState
}

function SubscriptionRow({
  subscription,
  depth,
  isBatchMode,
  isSelected,
  onToggleSelection,
  isPreviewOpen,
  onTogglePreview,
  onDelete,
  isDeletePending,
  onRefresh,
  refreshingId,
  refreshState,
}: SubscriptionRowProps) {
  const { t } = useTranslation('settings')
  const isRefreshingRow = refreshState && isPendingRefreshStatus(refreshState.status)
  const isError = refreshState?.resultStatus === 'error'
  const isDone = refreshState?.status === 'complete' || refreshState?.status === 'not_found'
  const rowLogMessage =
    refreshState?.message ||
    refreshState?.fetchErrorMessage ||
    (isDone && !isError ? null : subscription.feed.fetch_error_message)
  const effectiveLastFetchAttemptAt =
    refreshState?.lastFetchAttemptAt || subscription.feed.last_fetch_attempt_at || refreshState?.updatedAt
  const effectiveLastFetchSuccessAt =
    refreshState?.lastFetchSuccessAt || subscription.feed.last_fetch_success_at

  return (
    <div>
      <div
        className={cn(TREE_ROW_CLASS, 'hover:bg-muted/40')}
        style={{ paddingLeft: `${28 + depth * 16}px` }}
      >
        {isBatchMode && (
          <Checkbox
            checked={isSelected}
            aria-label={t('manageFeeds.selectFeed')}
            onCheckedChange={() => onToggleSelection(subscription.id)}
          />
        )}

        {subscription.feed.icon_url ? (
          <img src={subscription.feed.icon_url} alt="" className="h-5 w-5 shrink-0 rounded" />
        ) : (
          <div className="h-5 w-5 shrink-0 rounded bg-muted" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-medium text-foreground">
              {subscription.custom_title || subscription.feed.title || t('manageFeeds.untitledFeed')}
            </h3>
            {subscription.unread_count > 0 && (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {subscription.unread_count}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted-foreground">{subscription.feed.url}</p>

          {refreshState && (
            <div className="mt-2 space-y-1">
              <RefreshMeta
                refreshState={refreshState}
                subscription={subscription}
                effectiveLastFetchAttemptAt={effectiveLastFetchAttemptAt}
                effectiveLastFetchSuccessAt={effectiveLastFetchSuccessAt}
                rowLogMessage={rowLogMessage}
              />
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              onTogglePreview((prev) => (prev === subscription.id ? null : subscription.id))
            }
            title={
              isPreviewOpen ? t('manageFeeds.hideRecentArticles') : t('manageFeeds.previewRecentArticles')
            }
            className={ICON_BUTTON_CLASS}
          >
            {isPreviewOpen ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => window.open(subscription.feed.url, '_blank')}
            title={t('manageFeeds.openFeed')}
            className={ICON_BUTTON_CLASS}
          >
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void onRefresh(subscription.id)}
            disabled={refreshingId === subscription.id || isRefreshingRow}
            title={t('manageFeeds.refreshFeed')}
            className={ICON_BUTTON_CLASS}
          >
            <RefreshCw
              className={cn(
                'h-4 w-4',
                (refreshingId === subscription.id || isRefreshingRow) && 'animate-spin'
              )}
            />
          </Button>
          <Menu>
            <MenuTrigger className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                onClick={() => {
                  console.log('Edit feed:', subscription.id)
                }}
              >
                <Pencil className="h-4 w-4" />
                {t('manageFeeds.edit')}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                variant="destructive"
                onClick={() => void onDelete(subscription.id)}
                disabled={isDeletePending}
              >
                <Trash2 className="h-4 w-4" />
                {t('manageFeeds.unsubscribe')}
              </MenuItem>
            </MenuPopup>
          </Menu>
        </div>
      </div>

      {isPreviewOpen && (
        <div style={{ paddingLeft: `${28 + depth * 16}px` }}>
          <RecentEntriesPreview feedId={subscription.feed_id} feedUrl={subscription.feed.url} />
        </div>
      )}
    </div>
  )
}

function isPendingRefreshStatus(statusValue: string) {
  return statusValue === 'queued' || statusValue === 'deferred' || statusValue === 'in_progress'
}

function RefreshMeta({
  refreshState,
  subscription,
  effectiveLastFetchAttemptAt,
  effectiveLastFetchSuccessAt,
  rowLogMessage,
}: {
  refreshState: FeedRefreshState
  subscription: Subscription
  effectiveLastFetchAttemptAt: string | null | undefined
  effectiveLastFetchSuccessAt: string | null | undefined
  rowLogMessage: string | null
}) {
  const { t } = useTranslation('settings')
  const isError = refreshState.resultStatus === 'error'
  const isDone = refreshState.status === 'complete' || refreshState.status === 'not_found'
  const isPendingRow = isPendingRefreshStatus(refreshState.status)
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
  const statusLabel = statusLabelMap[refreshState.status] || refreshState.status
  const resultStatusLabel =
    refreshState.resultStatus &&
    (resultStatusLabelMap[refreshState.resultStatus] || refreshState.resultStatus)

  return (
    <>
      <div className={cn('flex flex-wrap items-center gap-2 text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
        <span>
          {statusLabel}
          {resultStatusLabel ? ` · ${resultStatusLabel}` : ''}
          {refreshState.newEntries !== null
            ? ` · +${refreshState.newEntries}${refreshState.totalEntries !== null ? ` / ${refreshState.totalEntries}` : ''} ${t('manageFeeds.entriesSuffix')}`
            : ''}
        </span>
        <span>
          {new Date(effectiveLastFetchAttemptAt || subscription.feed.created_at).toLocaleString()}
        </span>
      </div>

      {effectiveLastFetchSuccessAt && (
        <p className="text-xs text-muted-foreground">
          {t('manageFeeds.lastSuccessLabel')}: {new Date(effectiveLastFetchSuccessAt).toLocaleString()}
        </p>
      )}

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {isPendingRow && (
          <div className="h-full w-1/4 animate-progress-indeterminate rounded-full bg-primary" />
        )}
        {isDone && !isError && <div className="h-full w-full rounded-full bg-primary" />}
        {isError && <div className="h-full w-full rounded-full bg-destructive" />}
      </div>

      {rowLogMessage && (
        <div className={cn('flex items-start gap-1 text-xs', isError ? 'text-destructive' : 'text-muted-foreground')}>
          {isError && <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
          <p className="line-clamp-2">{rowLogMessage}</p>
        </div>
      )}
    </>
  )
}

function RecentEntriesPreview({ feedId, feedUrl }: { feedId: string; feedUrl: string }) {
  const { t } = useTranslation('settings')
  const { user } = useAuthStore()
  const { data, isLoading, error } = useEntries({
    feed_id: feedId,
    page: 1,
    per_page: 10,
    view: 'timeline',
  })

  const items = useMemo(() => data?.items ?? [], [data?.items])
  const [translatedTitles, setTranslatedTitles] = useState<Record<string, string>>({})
  const listTranslationAutoEnabled = user?.settings?.list_translation_auto_enabled ?? false
  const preferredTargetLanguage = user?.settings?.translation_target_language ?? 'zh-CN'

  useEffect(() => {
    let cancelled = false

    if (!listTranslationAutoEnabled || items.length === 0) {
      setTranslatedTitles({})
      return
    }

    const titlesToTranslate = items
      .map((entry) => ({ id: entry.id, title: entry.title.trim() }))
      .filter(({ title }) => title.length > 0 && shouldAutoTranslate(title, preferredTargetLanguage))

    if (titlesToTranslate.length === 0) {
      setTranslatedTitles({})
      return
    }

    const uniqueTitles = [...new Set(titlesToTranslate.map(({ title }) => title))]

    void (async () => {
      try {
        const response = await entryService.translateTexts(uniqueTitles, preferredTargetLanguage, 'auto')
        if (cancelled) return

        const byTitle = new Map<string, string>()
        uniqueTitles.forEach((title, index) => {
          const translated = response.translations[index]?.trim()
          if (translated) byTitle.set(title, translated)
        })

        const next: Record<string, string> = {}
        titlesToTranslate.forEach(({ id, title }) => {
          const translated = byTitle.get(title)
          if (translated) next[id] = translated
        })
        setTranslatedTitles(next)
      } catch {
        if (!cancelled) setTranslatedTitles({})
      }
    })()

    return () => {
      cancelled = true
    }
  }, [items, listTranslationAutoEnabled, preferredTargetLanguage])

  return (
    <div className="mt-2 border border-dashed bg-muted/20 px-4 py-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t('manageFeeds.recentArticlesTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('manageFeeds.recentArticlesDescription')}</p>
        </div>
        <span className="text-xs text-muted-foreground">
          {t('manageFeeds.recentArticlesCount', { count: items.length })}
        </span>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={`entry-skeleton-${index}`} className="space-y-1">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      )}

      {!isLoading && error && (
        <p className="text-sm text-destructive">{t('manageFeeds.recentArticlesFailed')}</p>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('manageFeeds.recentArticlesEmpty')}</p>
      )}

      {!isLoading && !error && items.length > 0 && (
        <div className="space-y-2">
          {items.map((entry: EntryWithState) => (
            <a
              key={entry.id}
              href={entry.url || feedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start justify-between gap-3 rounded-md px-2 py-2 transition-colors hover:bg-background/80"
            >
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">
                  {translatedTitles[entry.id] || entry.title}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{entry.author || t('manageFeeds.unknownAuthor')}</span>
                  <span>•</span>
                  <span>{formatEntryDate(entry.published_at || entry.created_at)}</span>
                  {!entry.is_read && (
                    <>
                      <span>•</span>
                      <span>{t('manageFeeds.unread')}</span>
                    </>
                  )}
                </div>
              </div>
              <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function formatEntryDate(value: string) {
  return new Date(value).toLocaleString()
}
