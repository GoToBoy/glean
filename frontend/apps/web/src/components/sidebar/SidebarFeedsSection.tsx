import { useState } from 'react'
import { useTranslation } from '@glean/i18n'
import {
  Button,
  Badge,
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  cn,
} from '@glean/ui'
import {
  ChevronRight,
  Inbox,
  Plus,
  FolderPlus,
  MoreHorizontal,
  RefreshCw,
  Upload,
  Download,
  Sparkles,
  FolderInput,
  Folder,
  FolderOpen,
  Trash2,
  Pencil,
  MoreHorizontal as MoreIcon,
  CheckCheck,
  CheckSquare,
  Square,
} from 'lucide-react'
import type { FolderTreeNode, Subscription } from '@glean/types'
import {
  useDeleteSubscription,
  useRefreshFeed,
  useUpdateSubscription,
} from '../../hooks/useSubscriptions'
import { useMarkAllRead } from '../../hooks/useEntries'
import { useFolderStore } from '../../stores/folderStore'
import { SidebarItem } from './SidebarItem'

interface SidebarFeedsSectionProps {
  readonly isSidebarOpen: boolean
  readonly isMobileSidebarOpen: boolean
  readonly isFeedsSectionExpanded: boolean
  readonly onToggleFeedsSection: () => void
  readonly onAddFeed: () => void
  readonly onCreateFolder: (parentId: string | null) => void
  readonly onRefreshAll: () => void
  readonly refreshAllPending: boolean
  readonly onImportOPML: () => void
  readonly importPending: boolean
  readonly onExportOPML: () => void
  readonly exportPending: boolean
  readonly onFeedSelect: (feedId?: string, folderId?: string) => void
  readonly onSmartViewSelect: () => void
  readonly isSmartView: boolean
  readonly isReaderPage: boolean
  readonly currentFeedId?: string
  readonly currentFolderId?: string
  readonly feedFolders: FolderTreeNode[]
  readonly subscriptionsByFolder: Record<string, Subscription[]>
  readonly ungroupedSubscriptions: Subscription[]
  readonly expandedFolders: Set<string>
  readonly toggleFolder: (folderId: string) => void
  readonly draggedFeed: Subscription | null
  readonly setDraggedFeed: (feed: Subscription | null) => void
  readonly dragOverFolderId: string | null
  readonly setDragOverFolderId: (id: string | null) => void
}

export function SidebarFeedsSection({
  isSidebarOpen,
  isMobileSidebarOpen,
  isFeedsSectionExpanded,
  onToggleFeedsSection,
  onAddFeed,
  onCreateFolder,
  onRefreshAll,
  refreshAllPending,
  onImportOPML,
  importPending,
  onExportOPML,
  exportPending,
  onFeedSelect,
  onSmartViewSelect,
  isSmartView,
  isReaderPage,
  currentFeedId,
  currentFolderId,
  feedFolders,
  subscriptionsByFolder,
  ungroupedSubscriptions,
  expandedFolders,
  toggleFolder,
  draggedFeed,
  setDraggedFeed,
  dragOverFolderId,
  setDragOverFolderId,
}: SidebarFeedsSectionProps) {
  const { t } = useTranslation('feeds')
  const { createFolder } = useFolderStore()
  const updateMutation = useUpdateSubscription()
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedSubscriptionIds, setSelectedSubscriptionIds] = useState<Set<string>>(new Set())
  const [showGroupDialog, setShowGroupDialog] = useState(false)
  const [groupFolderName, setGroupFolderName] = useState('')
  const [isGrouping, setIsGrouping] = useState(false)

  const getSubscriptionsForFolder = (folderId: string) => subscriptionsByFolder[folderId] || []
  const selectedCount = selectedSubscriptionIds.size

  const toggleFeedSelection = (subscriptionId: string) => {
    setSelectedSubscriptionIds((prev) => {
      const next = new Set(prev)
      if (next.has(subscriptionId)) {
        next.delete(subscriptionId)
      } else {
        next.add(subscriptionId)
      }
      return next
    })
  }

  const exitSelectionMode = () => {
    setIsSelectionMode(false)
    setSelectedSubscriptionIds(new Set())
  }

  const handleGroupSelectedFeeds = async () => {
    if (!groupFolderName.trim() || selectedCount < 2) return

    setIsGrouping(true)
    try {
      const folder = await createFolder({
        name: groupFolderName.trim(),
        type: 'feed',
        parent_id: null,
      })
      if (!folder) return

      await Promise.all(
        Array.from(selectedSubscriptionIds).map((subscriptionId) =>
          updateMutation.mutateAsync({
            subscriptionId,
            data: { folder_id: folder.id },
          })
        )
      )

      setShowGroupDialog(false)
      setGroupFolderName('')
      exitSelectionMode()
    } finally {
      setIsGrouping(false)
    }
  }

  return (
    <>
      {(isSidebarOpen || isMobileSidebarOpen) && (
        <div className="mb-1 flex items-center justify-between md:mb-2">
          <button
            onClick={onToggleFeedsSection}
            className="text-muted-foreground/60 hover:text-muted-foreground flex items-center gap-1 px-2 text-[10px] font-semibold tracking-wider uppercase transition-colors md:px-3 md:text-xs"
            aria-label={isFeedsSectionExpanded ? 'Collapse feeds section' : 'Expand feeds section'}
          >
            <ChevronRight
              className={`h-3 w-3 transition-transform ${
                isFeedsSectionExpanded ? 'rotate-90' : ''
              }`}
            />
            {t('sidebar.feeds')}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={onAddFeed}
              className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
              title={t('actions.addFeed')}
              aria-label={t('actions.addFeed')}
            >
              <Plus className="h-4 w-4" />
            </button>
            <button
              onClick={() => onCreateFolder(null)}
              className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
              title={t('actions.createFolder')}
              aria-label={t('actions.createFolder')}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
            <Menu>
              <MenuTrigger
                className="text-muted-foreground/60 hover:bg-accent hover:text-foreground rounded p-1 transition-colors"
                aria-label="Feed management menu"
              >
                <MoreHorizontal className="h-4 w-4" />
              </MenuTrigger>
              <MenuPopup align="end">
                <MenuItem onClick={onRefreshAll} disabled={refreshAllPending}>
                  <RefreshCw className={`h-4 w-4 ${refreshAllPending ? 'animate-spin' : ''}`} />
                  <span>
                    {refreshAllPending ? t('states.refreshing') : t('actions.refreshAll')}
                  </span>
                </MenuItem>
                <MenuSeparator />
                <MenuItem onClick={onImportOPML} disabled={importPending}>
                  <Upload className="h-4 w-4" />
                  <span>{importPending ? t('states.importing') : t('actions.importOPML')}</span>
                </MenuItem>
                <MenuItem onClick={onExportOPML} disabled={exportPending}>
                  <Download className="h-4 w-4" />
                  <span>{exportPending ? t('states.exporting') : t('actions.exportOPML')}</span>
                </MenuItem>
                {isSidebarOpen && !isMobileSidebarOpen && (
                  <>
                    <MenuSeparator />
                    <MenuItem onClick={() => setIsSelectionMode(true)} disabled={isSelectionMode}>
                      <CheckCheck className="h-4 w-4" />
                      <span>{t('actions.selectFeeds')}</span>
                    </MenuItem>
                  </>
                )}
              </MenuPopup>
            </Menu>
          </div>
        </div>
      )}

      {!isSidebarOpen && !isMobileSidebarOpen && (
        <button
          onClick={onAddFeed}
          className="group text-muted-foreground hover:bg-accent hover:text-foreground flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200"
          title={t('actions.addFeed')}
          aria-label={t('actions.addFeed')}
        >
          <Plus className="h-5 w-5" />
        </button>
      )}

      {isFeedsSectionExpanded && (
        <>
          <SidebarItem
            icon={<Sparkles />}
            label={t('sidebar.smart')}
            isActive={isSmartView}
            onClick={onSmartViewSelect}
            isSidebarCollapsed={!isSidebarOpen && !isMobileSidebarOpen}
            title={t('sidebar.smart')}
          />

          <SidebarItem
            icon={<Inbox />}
            label={t('sidebar.allFeeds')}
            isActive={isReaderPage && !currentFeedId && !currentFolderId && !isSmartView}
            onClick={() => onFeedSelect(undefined)}
            isSidebarCollapsed={!isSidebarOpen && !isMobileSidebarOpen}
            title={t('sidebar.allFeeds')}
            className="mt-0.5"
          />

          {isSidebarOpen && !isMobileSidebarOpen && isSelectionMode && (
            <div className="border-border bg-muted/30 mt-2 rounded-lg border px-3 py-2">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-muted-foreground text-xs">
                  {t('common.selectedCount', { count: selectedCount })}
                </span>
                <Button size="sm" variant="ghost" onClick={exitSelectionMode}>
                  {t('common.cancel')}
                </Button>
              </div>
              <Button
                size="sm"
                className="w-full"
                onClick={() => setShowGroupDialog(true)}
                disabled={selectedCount < 2}
              >
                {t('actions.groupSelectedFeeds')}
              </Button>
            </div>
          )}

          {(isSidebarOpen || isMobileSidebarOpen) && feedFolders.length > 0 && (
            <div className="space-y-0.5">
              {feedFolders.map((folder) => (
                <SidebarFolderItem
                  key={folder.id}
                  folder={folder}
                  isExpanded={expandedFolders.has(folder.id)}
                  onToggle={() => toggleFolder(folder.id)}
                  onSelect={(folderId) => onFeedSelect(undefined, folderId)}
                  isActive={currentFolderId === folder.id}
                  subscriptions={getSubscriptionsForFolder(folder.id)}
                  subscriptionsByFolder={subscriptionsByFolder}
                  expandedFolders={expandedFolders}
                  toggleFolder={toggleFolder}
                  currentFeedId={currentFeedId}
                  currentFolderId={currentFolderId}
                  onFeedSelect={(feedId) => onFeedSelect(feedId)}
                  allFolders={feedFolders}
                  onCreateSubfolder={() => onCreateFolder(folder.id)}
                  draggedFeed={draggedFeed}
                  setDraggedFeed={setDraggedFeed}
                  dragOverFolderId={dragOverFolderId}
                  setDragOverFolderId={setDragOverFolderId}
                  isSelectionMode={isSidebarOpen && !isMobileSidebarOpen && isSelectionMode}
                  selectedSubscriptionIds={selectedSubscriptionIds}
                  onToggleFeedSelection={toggleFeedSelection}
                />
              ))}
            </div>
          )}

          {(isSidebarOpen || isMobileSidebarOpen) &&
            !(isSidebarOpen && !isMobileSidebarOpen && isSelectionMode) &&
            draggedFeed !== null &&
            draggedFeed.folder_id !== null && (
              <section
                aria-label={t('common.removeFromFolder')}
                className={`mt-2 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 py-2 text-xs transition-all ${
                  dragOverFolderId === '__uncategorized__'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-muted-foreground/30 text-muted-foreground'
                }`}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverFolderId('__uncategorized__')
                }}
                onDragLeave={() => setDragOverFolderId(null)}
                onDrop={(e) => {
                  e.preventDefault()
                  if (draggedFeed) {
                    updateMutation.mutate({
                      subscriptionId: draggedFeed.id,
                      data: { folder_id: null },
                    })
                  }
                  setDraggedFeed(null)
                  setDragOverFolderId(null)
                }}
              >
                <FolderInput className="h-4 w-4" />
                <span>{t('common.removeFromFolder')}</span>
              </section>
            )}

          {(isSidebarOpen || isMobileSidebarOpen) && ungroupedSubscriptions.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {ungroupedSubscriptions.map((sub) => (
                <SidebarFeedItem
                  key={sub.id}
                  subscription={sub}
                  isActive={isReaderPage && currentFeedId === sub.feed_id}
                  onClick={() => onFeedSelect(sub.feed_id)}
                  allFolders={feedFolders}
                  isDragging={
                    !(isSidebarOpen && !isMobileSidebarOpen && isSelectionMode) &&
                    draggedFeed?.id === sub.id
                  }
                  onDragStart={() => setDraggedFeed(sub)}
                  onDragEnd={() => {
                    setDraggedFeed(null)
                    setDragOverFolderId(null)
                  }}
                  isSelectionMode={isSidebarOpen && !isMobileSidebarOpen && isSelectionMode}
                  isSelected={selectedSubscriptionIds.has(sub.id)}
                  onToggleSelect={toggleFeedSelection}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Dialog open={showGroupDialog} onOpenChange={setShowGroupDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t('dialogs.groupFeeds.title')}</DialogTitle>
            <DialogDescription>
              {t('dialogs.groupFeeds.description', { count: selectedCount })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6 py-4">
            <Label htmlFor="group-folder-name">{t('dialogs.createFolder.name')}</Label>
            <Input
              id="group-folder-name"
              value={groupFolderName}
              onChange={(e) => setGroupFolderName(e.target.value)}
              placeholder={t('dialogs.createFolder.namePlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleGroupSelectedFeeds()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowGroupDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleGroupSelectedFeeds}
              disabled={isGrouping || !groupFolderName.trim() || selectedCount < 2}
            >
              {isGrouping ? t('common.creating') : t('actions.groupIntoFolder')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  )
}

interface SidebarFolderItemProps {
  readonly folder: FolderTreeNode
  readonly isExpanded: boolean
  readonly onToggle: () => void
  readonly onSelect: (folderId: string) => void
  readonly isActive: boolean
  readonly subscriptions: Subscription[]
  readonly subscriptionsByFolder: Record<string, Subscription[]>
  readonly expandedFolders: Set<string>
  readonly toggleFolder: (folderId: string) => void
  readonly currentFeedId?: string
  readonly currentFolderId?: string
  readonly onFeedSelect: (feedId: string) => void
  readonly allFolders: FolderTreeNode[]
  readonly onCreateSubfolder: () => void
  readonly draggedFeed: Subscription | null
  readonly setDraggedFeed: (feed: Subscription | null) => void
  readonly dragOverFolderId: string | null
  readonly setDragOverFolderId: (id: string | null) => void
  readonly isSelectionMode: boolean
  readonly selectedSubscriptionIds: Set<string>
  readonly onToggleFeedSelection: (subscriptionId: string) => void
}

function SidebarFolderItem({
  folder,
  isExpanded,
  onToggle,
  onSelect,
  isActive,
  subscriptions,
  subscriptionsByFolder,
  expandedFolders,
  toggleFolder,
  currentFeedId,
  currentFolderId,
  onFeedSelect,
  allFolders,
  onCreateSubfolder,
  draggedFeed,
  setDraggedFeed,
  dragOverFolderId,
  setDragOverFolderId,
  isSelectionMode,
  selectedSubscriptionIds,
  onToggleFeedSelection,
}: SidebarFolderItemProps) {
  const { t } = useTranslation('feeds')
  const { deleteFolder, updateFolder } = useFolderStore()
  const updateMutation = useUpdateSubscription()
  const markAllReadMutation = useMarkAllRead()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameFolderName, setRenameFolderName] = useState(folder.name)
  const [isRenaming, setIsRenaming] = useState(false)

  const totalUnread = subscriptions.reduce((sum, sub) => sum + sub.unread_count, 0)

  const isDragTarget = dragOverFolderId === folder.id
  const canReceiveDrop = draggedFeed && draggedFeed.folder_id !== folder.id

  const handleDragOver = (e: React.DragEvent) => {
    if (isSelectionMode) return
    e.preventDefault()
    e.dataTransfer.dropEffect = canReceiveDrop ? 'move' : 'none'
    setDragOverFolderId(folder.id)
  }

  const handleDragLeave = () => {
    setDragOverFolderId(null)
  }

  const handleDrop = async (e: React.DragEvent) => {
    if (isSelectionMode) return
    e.preventDefault()
    if (draggedFeed && draggedFeed.folder_id !== folder.id) {
      await updateMutation.mutateAsync({
        subscriptionId: draggedFeed.id,
        data: { folder_id: folder.id },
      })
    }
    setDraggedFeed(null)
    setDragOverFolderId(null)
  }

  const handleDissolveFolder = async () => {
    await deleteFolder(folder.id)
    setIsMenuOpen(false)
  }

  const handleRenameFolder = async () => {
    if (!renameFolderName.trim() || renameFolderName === folder.name) {
      setShowRenameDialog(false)
      return
    }
    setIsRenaming(true)
    try {
      await updateFolder(folder.id, renameFolderName.trim())
      setShowRenameDialog(false)
    } finally {
      setIsRenaming(false)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsMenuOpen(true)
  }

  const getContainerClasses = () => {
    if (isDragTarget && canReceiveDrop) {
      return 'bg-primary/10 ring-primary/30 ring-2'
    }
    if (isActive) {
      return 'bg-primary/10 text-primary scale-[1.01] font-medium shadow-sm'
    }
    return 'text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-[1.01]'
  }

  return (
    <div>
      <button
        type="button"
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
          getContainerClasses()
        )}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => onSelect(folder.id)}
      >
        <button onClick={onToggle} className="touch-target-none flex h-5 items-center gap-2.5">
          <ChevronRight
            className={cn(
              'h-3 w-3 shrink-0 transition-transform duration-200',
              isExpanded && 'rotate-90'
            )}
          />
          <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
            <Folder
              className={cn(
                'absolute h-4 w-4 transition-all duration-300 ease-out',
                isExpanded ? 'scale-50 -rotate-[15deg] opacity-0' : 'scale-100 rotate-0 opacity-100'
              )}
            />
            <FolderOpen
              className={cn(
                'absolute h-4 w-4 transition-all duration-300 ease-out',
                isExpanded ? 'scale-100 rotate-0 opacity-100' : 'scale-50 rotate-[15deg] opacity-0'
              )}
            />
          </span>
        </button>
        <button
          onClick={() => onSelect(folder.id)}
          className="touch-target-none h-5 min-w-0 flex-1 truncate text-left"
        >
          {folder.name}
        </button>
        {!isExpanded && totalUnread > 0 && (
          <Badge size="sm" className="bg-muted text-muted-foreground shrink-0 text-[10px]">
            {totalUnread}
          </Badge>
        )}

        <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <MenuTrigger className="touch-target-none text-muted-foreground hover:bg-accent hover:text-foreground h-5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
            <MoreIcon className="h-3.5 w-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              onClick={() => markAllReadMutation.mutate({ folderId: folder.id })}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck
                className={cn('h-4 w-4', markAllReadMutation.isPending && 'animate-pulse')}
              />
              <span>
                {markAllReadMutation.isPending ? t('common.marking') : t('actions.markAllAsRead')}
              </span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={onCreateSubfolder}>
              <FolderPlus className="h-4 w-4" />
              <span>{t('actions.createSubfolder')}</span>
            </MenuItem>
            <MenuItem onClick={() => setShowRenameDialog(true)}>
              <Pencil className="h-4 w-4" />
              <span>{t('common.rename')}</span>
            </MenuItem>
            <MenuSeparator />
            <MenuSub>
              <MenuSubTrigger className="text-destructive data-highlighted:bg-destructive/10 data-highlighted:text-destructive">
                <Trash2 className="h-4 w-4" />
                <span>{t('actions.dissolveFolder')}</span>
              </MenuSubTrigger>
              <MenuSubPopup>
                <p className="text-muted-foreground px-2 py-1 text-xs">
                  {t('dialogs.dissolveFolder.description', { name: folder.name })}
                </p>
                <MenuSeparator />
                <MenuItem variant="destructive" onClick={() => void handleDissolveFolder()}>
                  <Trash2 className="h-4 w-4" />
                  <span>{t('dialogs.dissolveFolder.confirm')}</span>
                </MenuItem>
              </MenuSubPopup>
            </MenuSub>
          </MenuPopup>
        </Menu>
      </button>

      {isExpanded && (
        <div className="border-border mt-0.5 ml-4 space-y-0.5 border-l pl-2">
          {folder.children.map((child) => (
            <SidebarFolderItem
              key={child.id}
              folder={child}
              isExpanded={expandedFolders.has(child.id)}
              onToggle={() => toggleFolder(child.id)}
              onSelect={onSelect}
              isActive={currentFolderId === child.id}
              subscriptions={subscriptionsByFolder[child.id] || []}
              subscriptionsByFolder={subscriptionsByFolder}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              currentFeedId={currentFeedId}
              currentFolderId={currentFolderId}
              onFeedSelect={onFeedSelect}
              allFolders={allFolders}
              onCreateSubfolder={() => {}}
              draggedFeed={draggedFeed}
              setDraggedFeed={setDraggedFeed}
              dragOverFolderId={dragOverFolderId}
              setDragOverFolderId={setDragOverFolderId}
              isSelectionMode={isSelectionMode}
              selectedSubscriptionIds={selectedSubscriptionIds}
              onToggleFeedSelection={onToggleFeedSelection}
            />
          ))}

          {subscriptions.map((sub) => (
            <SidebarFeedItem
              key={sub.id}
              subscription={sub}
              isActive={currentFeedId === sub.feed_id}
              onClick={() => onFeedSelect(sub.feed_id)}
              allFolders={allFolders}
              isDragging={!isSelectionMode && draggedFeed?.id === sub.id}
              onDragStart={() => setDraggedFeed(sub)}
              onDragEnd={() => {
                setDraggedFeed(null)
                setDragOverFolderId(null)
              }}
              isSelectionMode={isSelectionMode}
              isSelected={selectedSubscriptionIds.has(sub.id)}
              onToggleSelect={onToggleFeedSelection}
            />
          ))}

          {subscriptions.length === 0 && folder.children.length === 0 && (
            <p className="text-muted-foreground/60 px-3 py-2 text-xs">{t('common.emptyFolder')}</p>
          )}
        </div>
      )}

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t('dialogs.renameFolder.title')}</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-folder">{t('dialogs.createFolder.name')}</Label>
              <Input
                id="rename-folder"
                value={renameFolderName}
                onChange={(e) => setRenameFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameFolder()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRenameDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleRenameFolder} disabled={!renameFolderName.trim() || isRenaming}>
              {isRenaming ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

interface SidebarFeedItemProps {
  readonly subscription: Subscription
  readonly isActive: boolean
  readonly onClick: () => void
  readonly allFolders: FolderTreeNode[]
  readonly isDragging?: boolean
  readonly onDragStart?: () => void
  readonly onDragEnd?: () => void
  readonly isSelectionMode?: boolean
  readonly isSelected?: boolean
  readonly onToggleSelect?: (subscriptionId: string) => void
}

function SidebarFeedItem({
  subscription,
  isActive,
  onClick,
  allFolders,
  isDragging = false,
  onDragStart,
  onDragEnd,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelect,
}: SidebarFeedItemProps) {
  const { t } = useTranslation('feeds')
  const deleteMutation = useDeleteSubscription()
  const refreshMutation = useRefreshFeed()
  const updateMutation = useUpdateSubscription()
  const markAllReadMutation = useMarkAllRead()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [editTitle, setEditTitle] = useState(subscription.custom_title || '')
  const [editUrl, setEditUrl] = useState(subscription.feed.url || '')
  const [isSaving, setIsSaving] = useState(false)

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsMenuOpen(true)
  }

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(subscription.id)
    setIsMenuOpen(false)
  }

  const handleRefresh = async () => {
    await refreshMutation.mutateAsync(subscription.id)
  }

  const handleFolderChange = async (folderId: string | null) => {
    await updateMutation.mutateAsync({
      subscriptionId: subscription.id,
      data: { folder_id: folderId },
    })
  }

  const handleSaveEdit = async () => {
    setIsSaving(true)
    try {
      const updateData: { custom_title: string | null; feed_url?: string } = {
        custom_title: editTitle || null,
      }
      if (editUrl && editUrl !== subscription.feed.url) {
        updateData.feed_url = editUrl
      }
      await updateMutation.mutateAsync({
        subscriptionId: subscription.id,
        data: updateData,
      })
      setShowEditDialog(false)
    } finally {
      setIsSaving(false)
    }
  }

  const flattenFolders = (
    nodes: FolderTreeNode[],
    depth = 0
  ): { id: string; name: string; depth: number }[] => {
    return nodes.flatMap((node) => [
      { id: node.id, name: node.name, depth },
      ...flattenFolders(node.children, depth + 1),
    ])
  }
  const flatFolders = flattenFolders(allFolders)

  const getFeedItemClasses = () => {
    if (isDragging) {
      return 'opacity-50 border-2 border-dashed border-primary/50 bg-primary/5'
    }
    if (isActive) {
      return 'bg-primary/10 text-primary scale-[1.01] font-medium shadow-sm'
    }
    return 'text-muted-foreground hover:bg-accent hover:text-foreground hover:scale-[1.01]'
  }

  const handleClick = () => {
    if (isSelectionMode) {
      onToggleSelect?.(subscription.id)
      return
    }
    onClick()
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          'group flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200',
          !isSelectionMode && 'cursor-grab active:cursor-grabbing',
          getFeedItemClasses()
        )}
        draggable={!isSelectionMode}
        onDragStart={(e) => {
          if (isSelectionMode) return
          e.dataTransfer.effectAllowed = 'move'
          onDragStart?.()
        }}
        onDragEnd={onDragEnd}
        onContextMenu={handleContextMenu}
        onClick={handleClick}
      >
        <button
          onClick={handleClick}
          className="touch-target-none flex h-5 min-w-0 flex-1 items-center gap-3"
        >
          {isSelectionMode &&
            (isSelected ? (
              <CheckSquare className="text-primary h-4 w-4 shrink-0" />
            ) : (
              <Square className="text-muted-foreground h-4 w-4 shrink-0" />
            ))}
          {subscription.feed.icon_url ? (
            <img
              src={subscription.feed.icon_url}
              alt=""
              className="h-4 w-4 shrink-0 rounded object-cover"
              draggable={false}
            />
          ) : (
            <div className="bg-muted h-4 w-4 shrink-0 rounded" />
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {subscription.custom_title || subscription.feed.title || subscription.feed.url}
          </span>
        </button>
        {subscription.unread_count > 0 && (
          <Badge size="sm" className="bg-muted text-muted-foreground shrink-0 text-[10px]">
            {subscription.unread_count}
          </Badge>
        )}

        {!isSelectionMode && (
          <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <MenuTrigger className="touch-target-none text-muted-foreground hover:bg-accent hover:text-foreground h-5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100">
              <MoreIcon className="h-3.5 w-3.5" />
            </MenuTrigger>
            <MenuPopup align="end">
              <MenuItem
                onClick={() => markAllReadMutation.mutate({ feedId: subscription.feed_id })}
                disabled={markAllReadMutation.isPending}
              >
                <CheckCheck
                  className={cn('h-4 w-4', markAllReadMutation.isPending && 'animate-pulse')}
                />
                <span>
                  {markAllReadMutation.isPending ? t('common.marking') : t('actions.markAllAsRead')}
                </span>
              </MenuItem>
              <MenuSeparator />
              <MenuItem onClick={() => setShowEditDialog(true)}>
                <Pencil className="h-4 w-4" />
                <span>{t('common.edit')}</span>
              </MenuItem>
              <MenuItem onClick={handleRefresh} disabled={refreshMutation.isPending}>
                <RefreshCw
                  className={cn('h-4 w-4', refreshMutation.isPending && 'animate-spin')}
                />
                <span>{t('common.refresh')}</span>
              </MenuItem>
              {allFolders.length > 0 && (
                <MenuSub>
                  <MenuSubTrigger>
                    <FolderInput className="h-4 w-4" />
                    <span>{t('common.moveToFolder')}</span>
                  </MenuSubTrigger>
                  <MenuSubPopup>
                    <MenuItem onClick={() => handleFolderChange(null)}>
                      <span className="text-muted-foreground">{t('common.noFolder')}</span>
                    </MenuItem>
                    <MenuSeparator />
                    {flatFolders.map((folder) => (
                      <MenuItem key={folder.id} onClick={() => handleFolderChange(folder.id)}>
                        <span style={{ paddingLeft: `${folder.depth * 12}px` }}>{folder.name}</span>
                      </MenuItem>
                    ))}
                  </MenuSubPopup>
                </MenuSub>
              )}
              <MenuSeparator />
              <MenuItem
                variant="destructive"
                onClick={() => void handleDelete()}
                disabled={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
                <span>{t('actions.unsubscribe')}</span>
              </MenuItem>
            </MenuPopup>
          </Menu>
        )}
      </button>

      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>{t('dialogs.editFeed.title')}</DialogTitle>
            <DialogDescription>{t('dialogs.editFeed.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">{t('manageSubscriptions.customTitle')}</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={subscription.feed.title || subscription.feed.url}
              />
              <p className="text-muted-foreground text-xs">{t('manageSubscriptions.leaveEmpty')}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">{t('manageSubscriptions.feedUrl')}</Label>
              <Input
                id="edit-url"
                type="url"
                value={editUrl}
                onChange={(e) => setEditUrl(e.target.value)}
                placeholder="https://example.com/feed.xml"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveEdit()
                  }
                }}
              />
              <p className="text-muted-foreground text-xs">
                {t('manageSubscriptions.rssUrlDescription')}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  )
}
