import { Link, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { LogOut, Settings, Rss, ChevronLeft, Inbox, Bookmark, Tag, FolderPlus, ChevronRight, Folder, MoreHorizontal, Pencil, Trash2, RefreshCw, FolderInput, Plus, Upload, Download, AlertCircle, X, Sparkles, Loader2, FolderOpen, Menu as MenuIcon, ListChecks, CheckCheck, Sun, Moon, Monitor } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import {
  Button,
  Badge,
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Input,
  Label,
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubPopup,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
  Alert,
  AlertDescription,
} from '@glean/ui'
import { useSubscriptions, useDeleteSubscription, useRefreshFeed, useRefreshAllFeeds, useUpdateSubscription, useDiscoverFeed, useImportOPML, useExportOPML } from '../hooks/useSubscriptions'
import { useThemeStore } from '../stores/themeStore'
import { useMarkAllRead } from '../hooks/useEntries'
import { useFolderStore } from '../stores/folderStore'
import { useTagStore } from '../stores/tagStore'
import type { FolderTreeNode, Subscription, TagWithCounts, CreateTagRequest } from '@glean/types'

/**
 * Main application layout.
 *
 * Provides navigation sidebar and header for authenticated pages.
 * Includes integrated feed list for unified navigation experience.
 */
// Constants for sidebar resize
const SIDEBAR_MIN_WIDTH = 200
const SIDEBAR_MAX_WIDTH = 400
const SIDEBAR_DEFAULT_WIDTH = 256
const SIDEBAR_COLLAPSED_WIDTH = 72
const SIDEBAR_STORAGE_KEY = 'glean-sidebar-width'

export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const { data: subscriptions } = useSubscriptions()
  
  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY)
    return saved ? parseInt(saved, 10) : SIDEBAR_DEFAULT_WIDTH
  })
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)
  
  // Folder state
  const { feedFolders, bookmarkFolders, fetchFolders, createFolder, updateFolder, deleteFolder } = useFolderStore()
  const { tags, fetchTags, createTag, updateTag, deleteTag } = useTagStore()
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedBookmarkFolders, setExpandedBookmarkFolders] = useState<Set<string>>(new Set())
  const [isFeedsSectionExpanded, setIsFeedsSectionExpanded] = useState(true)
  const [isBookmarkSectionExpanded, setIsBookmarkSectionExpanded] = useState(true)
  const [isTagSectionExpanded, setIsTagSectionExpanded] = useState(true)
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null)
  const [createFolderType, setCreateFolderType] = useState<'feed' | 'bookmark'>('feed')
  
  // Tag management
  const [showCreateTagDialog, setShowCreateTagDialog] = useState(false)
  const [editingTag, setEditingTag] = useState<TagWithCounts | null>(null)
  const [deleteConfirmTag, setDeleteConfirmTag] = useState<TagWithCounts | null>(null)
  const [isDeletingTag, setIsDeletingTag] = useState(false)
  
  // Add Feed dialog state
  const [showAddFeedDialog, setShowAddFeedDialog] = useState(false)
  
  // Drag and drop state
  const [draggedFeed, setDraggedFeed] = useState<Subscription | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const updateMutation = useUpdateSubscription()
  
  // OPML Import/Export state
  const importMutation = useImportOPML()
  const exportMutation = useExportOPML()
  const refreshAllMutation = useRefreshAllFeeds()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [importResult, setImportResult] = useState<{
    success: number
    failed: number
    total: number
    folders_created: number
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const currentFeedId = searchParams.get('feed') || undefined
  const currentFolderId = searchParams.get('folder') || undefined
  const isReaderPage = location.pathname === '/reader'
  const isBookmarksPage = location.pathname === '/bookmarks'
  const currentBookmarkFolderId = isBookmarksPage ? searchParams.get('folder') : undefined
  const currentBookmarkTagId = isBookmarksPage ? searchParams.get('tag') : undefined

  // Fetch folders and tags on mount
  useEffect(() => {
    fetchFolders('feed')
    fetchFolders('bookmark')
    fetchTags()
  }, [fetchFolders, fetchTags])

  // Handle sidebar resize
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return
      
      const newWidth = e.clientX
      if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
        setSidebarWidth(newWidth)
      }
    }

    const handleMouseUp = () => {
      if (isResizing) {
        setIsResizing(false)
        localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarWidth.toString())
      }
    }

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, sidebarWidth])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleFeedSelect = (feedId?: string, folderId?: string) => {
    if (folderId) {
      navigate(`/reader?folder=${folderId}`)
    } else if (feedId) {
      navigate(`/reader?feed=${feedId}`)
    } else {
      navigate('/reader')
    }
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    
    setIsCreatingFolder(true)
    try {
      await createFolder({ 
        name: newFolderName.trim(), 
        type: createFolderType,
        parent_id: createFolderParentId 
      })
      setNewFolderName('')
      setIsCreateFolderOpen(false)
      setCreateFolderParentId(null)
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const openCreateFolderDialog = (parentId: string | null = null, type: 'feed' | 'bookmark' = 'feed') => {
    setCreateFolderParentId(parentId)
    setCreateFolderType(type)
    setIsCreateFolderOpen(true)
  }

  const handleBookmarkFolderSelect = (folderId?: string) => {
    if (folderId) {
      navigate(`/bookmarks?folder=${folderId}`)
    } else {
      navigate('/bookmarks')
    }
  }

  const handleTagSelect = (tagId?: string) => {
    if (tagId) {
      navigate(`/bookmarks?tag=${tagId}`)
    } else {
      navigate('/bookmarks')
    }
  }

  const toggleBookmarkFolder = (folderId: string) => {
    setExpandedBookmarkFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const handleDeleteTagConfirm = async () => {
    if (!deleteConfirmTag) return
    setIsDeletingTag(true)
    try {
      await deleteTag(deleteConfirmTag.id)
      setDeleteConfirmTag(null)
    } finally {
      setIsDeletingTag(false)
    }
  }

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await importMutation.mutateAsync(file)
      setImportResult(result)
      setFileInputKey((prev) => prev + 1)
      // Refresh folder list after import (folders may have been created)
      fetchFolders('feed')
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  const handleExport = () => {
    exportMutation.mutate()
  }

  // Group subscriptions by folder_id
  const subscriptionsByFolder = (subscriptions || []).reduce<Record<string, Subscription[]>>((acc, sub) => {
    const key = sub.folder_id || '__ungrouped__'
    if (!acc[key]) acc[key] = []
    acc[key].push(sub)
    return acc
  }, {})

  // Get subscriptions for a specific folder
  const getSubscriptionsForFolder = (folderId: string) => subscriptionsByFolder[folderId] || []

  // Get ungrouped subscriptions (no folder assigned)
  const ungroupedSubscriptions = subscriptionsByFolder['__ungrouped__'] || []

  // Close mobile sidebar on navigation
  useEffect(() => {
    setIsMobileSidebarOpen(false)
  }, [location.pathname, searchParams.toString()])

  return (
    <div className="flex h-screen flex-col bg-background md:flex-row">
      {/* Mobile Header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <button
          onClick={() => setIsMobileSidebarOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 shadow-md shadow-primary/20">
            <Rss className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-display text-lg font-bold text-foreground">Glean</span>
        </Link>
        <div className="w-10" /> {/* Spacer for centering */}
      </header>

      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        className={`
          fixed inset-y-0 left-0 z-50 flex flex-col border-r border-border bg-card md:relative md:z-10
          ${isMobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0
          ${isResizing ? 'sidebar-no-transition' : 'sidebar-transition'}
        `}
        style={{
          width: isMobileSidebarOpen 
            ? '288px' 
            : isSidebarOpen 
              ? `${sidebarWidth}px` 
              : `${SIDEBAR_COLLAPSED_WIDTH}px`
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-border p-3 md:p-4">
          <Link to="/" className="flex items-center gap-2.5 overflow-hidden md:gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary/20 md:h-9 md:w-9">
              <Rss className="h-4 w-4 text-primary-foreground md:h-5 md:w-5" />
            </div>
            {(isSidebarOpen || isMobileSidebarOpen) && (
              <span className="font-display text-lg font-bold text-foreground md:text-xl">
                Glean
              </span>
            )}
          </Link>
          {/* Mobile close button */}
          <button
            onClick={() => setIsMobileSidebarOpen(false)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toggle button - desktop only */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-16 z-10 hidden h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground md:flex"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${!isSidebarOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Resize handle - desktop only, when sidebar is expanded */}
        {isSidebarOpen && (
          <div
            className="absolute -right-1 top-0 bottom-0 hidden w-2 cursor-col-resize md:block"
            onMouseDown={handleResizeStart}
          >
            <div 
              className={`absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 transition-colors ${
                isResizing ? 'bg-primary' : 'bg-transparent hover:bg-border'
              }`}
            />
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 md:p-3">
          {/* Feeds Section */}
          {(isSidebarOpen || isMobileSidebarOpen) && (
            <div className="mb-1 flex items-center justify-between md:mb-2">
              <button
                onClick={() => setIsFeedsSectionExpanded(!isFeedsSectionExpanded)}
                className="flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-muted-foreground md:px-3 md:text-xs"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${isFeedsSectionExpanded ? 'rotate-90' : ''}`} />
                Feeds
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowAddFeedDialog(true)}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                  title="Add feed"
                >
                  <Plus className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openCreateFolderDialog(null)}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                  title="Create folder"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
                <Menu>
                  <MenuTrigger className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                  </MenuTrigger>
                  <MenuPopup align="end">
                    <MenuItem onClick={() => refreshAllMutation.mutate()} disabled={refreshAllMutation.isPending}>
                      <RefreshCw className={`h-4 w-4 ${refreshAllMutation.isPending ? 'animate-spin' : ''}`} />
                      <span>{refreshAllMutation.isPending ? 'Refreshing...' : 'Refresh All'}</span>
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem onClick={handleImportClick} disabled={importMutation.isPending}>
                      <Upload className="h-4 w-4" />
                      <span>{importMutation.isPending ? 'Importing...' : 'Import OPML'}</span>
                    </MenuItem>
                    <MenuItem onClick={handleExport} disabled={exportMutation.isPending}>
                      <Download className="h-4 w-4" />
                      <span>{exportMutation.isPending ? 'Exporting...' : 'Export OPML'}</span>
                    </MenuItem>
                  </MenuPopup>
                </Menu>
              </div>
            </div>
          )}
          
          {/* Add Feed button - collapsed state (desktop only) */}
          {!isSidebarOpen && !isMobileSidebarOpen && (
            <button
              onClick={() => setShowAddFeedDialog(true)}
              className="group flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
              title="Add Feed"
            >
              <Plus className="h-5 w-5" />
            </button>
          )}

          {/* Feeds Section Content - collapsible */}
          {isFeedsSectionExpanded && (
            <>
              {/* All Feeds */}
              <button
                onClick={() => handleFeedSelect(undefined)}
                className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 md:gap-3 md:px-3 md:py-2.5 ${
                  isReaderPage && !currentFeedId && !currentFolderId
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                } ${!isSidebarOpen && !isMobileSidebarOpen ? 'justify-center' : ''}`}
                title={!isSidebarOpen && !isMobileSidebarOpen ? 'All Feeds' : undefined}
              >
                <span className={`shrink-0 ${isReaderPage && !currentFeedId && !currentFolderId ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                  <Inbox className="h-4 w-4 md:h-5 md:w-5" />
                </span>
                {(isSidebarOpen || isMobileSidebarOpen) && <span>All Feeds</span>}
                {isReaderPage && !currentFeedId && !currentFolderId && (isSidebarOpen || isMobileSidebarOpen) && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>

              {/* Folders */}
              {(isSidebarOpen || isMobileSidebarOpen) && feedFolders.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {feedFolders.map((folder) => (
                    <SidebarFolderItem
                      key={folder.id}
                      folder={folder}
                      isExpanded={expandedFolders.has(folder.id)}
                      onToggle={() => toggleFolder(folder.id)}
                      onSelect={(folderId) => handleFeedSelect(undefined, folderId)}
                      isActive={currentFolderId === folder.id}
                      subscriptions={getSubscriptionsForFolder(folder.id)}
                      subscriptionsByFolder={subscriptionsByFolder}
                      expandedFolders={expandedFolders}
                      toggleFolder={toggleFolder}
                      currentFeedId={currentFeedId}
                      currentFolderId={currentFolderId}
                      onFeedSelect={(feedId) => handleFeedSelect(feedId)}
                      allFolders={feedFolders}
                      onCreateSubfolder={() => openCreateFolderDialog(folder.id)}
                      draggedFeed={draggedFeed}
                      setDraggedFeed={setDraggedFeed}
                      dragOverFolderId={dragOverFolderId}
                      setDragOverFolderId={setDragOverFolderId}
                    />
                  ))}
                </div>
              )}

              {/* Uncategorized drop zone - show when dragging a feed that's in a folder */}
              {(isSidebarOpen || isMobileSidebarOpen) && draggedFeed && draggedFeed.folder_id !== null && (
                <div
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
                  onDrop={async (e) => {
                    e.preventDefault()
                    if (draggedFeed) {
                      await updateMutation.mutateAsync({
                        subscriptionId: draggedFeed.id,
                        data: { folder_id: null },
                      })
                    }
                    setDraggedFeed(null)
                    setDragOverFolderId(null)
                  }}
                >
                  <FolderInput className="h-4 w-4" />
                  <span>Remove from folder</span>
                </div>
              )}

              {/* Individual Feeds (ungrouped) */}
              {(isSidebarOpen || isMobileSidebarOpen) && ungroupedSubscriptions.length > 0 && (
                <div className="mt-1 space-y-0.5 pl-2">
                  {ungroupedSubscriptions.map((sub) => (
                    <SidebarFeedItem
                      key={sub.id}
                      subscription={sub}
                      isActive={isReaderPage && currentFeedId === sub.feed_id}
                      onClick={() => handleFeedSelect(sub.feed_id)}
                      allFolders={feedFolders}
                      isDragging={draggedFeed?.id === sub.id}
                      onDragStart={() => setDraggedFeed(sub)}
                      onDragEnd={() => {
                        setDraggedFeed(null)
                        setDragOverFolderId(null)
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Divider */}
          <div className="my-2 border-t border-border md:my-3" />

          {/* Bookmarks Section */}
          {(isSidebarOpen || isMobileSidebarOpen) && (
            <div className="mb-1 flex items-center justify-between md:mb-2">
              <button
                onClick={() => setIsBookmarkSectionExpanded(!isBookmarkSectionExpanded)}
                className="flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-muted-foreground md:px-3 md:text-xs"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${isBookmarkSectionExpanded ? 'rotate-90' : ''}`} />
                Bookmarks
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openCreateFolderDialog(null, 'bookmark')}
                  className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                  title="Create folder"
                >
                  <FolderPlus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Bookmarks Section Content - collapsible */}
          {isBookmarkSectionExpanded && (
            <>
              {/* All Bookmarks */}
              <button
                onClick={() => handleBookmarkFolderSelect(undefined)}
                className={`group flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 md:gap-3 md:px-3 md:py-2.5 ${
                  isBookmarksPage && !currentBookmarkFolderId && !currentBookmarkTagId
                    ? 'bg-primary/10 text-primary shadow-sm'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                } ${!isSidebarOpen && !isMobileSidebarOpen ? 'justify-center' : ''}`}
                title={!isSidebarOpen && !isMobileSidebarOpen ? 'All Bookmarks' : undefined}
              >
                <span className={`shrink-0 ${isBookmarksPage && !currentBookmarkFolderId && !currentBookmarkTagId ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
                  <Bookmark className="h-4 w-4 md:h-5 md:w-5" />
                </span>
                {(isSidebarOpen || isMobileSidebarOpen) && <span>All Bookmarks</span>}
                {isBookmarksPage && !currentBookmarkFolderId && !currentBookmarkTagId && (isSidebarOpen || isMobileSidebarOpen) && (
                  <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
                )}
              </button>

              {/* Bookmark Folders */}
              {(isSidebarOpen || isMobileSidebarOpen) && bookmarkFolders.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {bookmarkFolders.map((folder) => (
                    <SidebarBookmarkFolderItem
                      key={folder.id}
                      folder={folder}
                      isExpanded={expandedBookmarkFolders.has(folder.id)}
                      onToggle={() => toggleBookmarkFolder(folder.id)}
                      onSelect={(folderId) => handleBookmarkFolderSelect(folderId)}
                      isActive={currentBookmarkFolderId === folder.id}
                      expandedFolders={expandedBookmarkFolders}
                      toggleFolder={toggleBookmarkFolder}
                      currentFolderId={currentBookmarkFolderId ?? undefined}
                      onCreateSubfolder={() => openCreateFolderDialog(folder.id, 'bookmark')}
                      onRename={updateFolder}
                      onDelete={deleteFolder}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* Divider */}
          <div className="my-2 border-t border-border md:my-3" />

          {/* Tags Section */}
          {(isSidebarOpen || isMobileSidebarOpen) && (
            <div className="mb-1 flex items-center justify-between md:mb-2">
              <button
                onClick={() => setIsTagSectionExpanded(!isTagSectionExpanded)}
                className="flex items-center gap-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 transition-colors hover:text-muted-foreground md:px-3 md:text-xs"
              >
                <ChevronRight className={`h-3 w-3 transition-transform ${isTagSectionExpanded ? 'rotate-90' : ''}`} />
                Tags
              </button>
              <button
                onClick={() => setShowCreateTagDialog(true)}
                className="rounded p-1 text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground"
                title="Create tag"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Tag icon when collapsed (desktop only) */}
          {!isSidebarOpen && !isMobileSidebarOpen && (
            <button
              onClick={() => setShowCreateTagDialog(true)}
              className="group flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground"
              title="Tags"
            >
              <Tag className="h-5 w-5" />
            </button>
          )}

          {/* Tags Section Content - collapsible */}
          {isTagSectionExpanded && (
            <>
              {/* Tags List */}
              {(isSidebarOpen || isMobileSidebarOpen) && tags.length > 0 && (
                <div className="space-y-0.5 pl-1 md:pl-2">
                  {tags.map((tag) => (
                    <div
                      key={tag.id}
                      className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-200 md:gap-2.5 md:px-3 md:py-2 ${
                        currentBookmarkTagId === tag.id
                          ? 'bg-primary/10 font-medium text-primary'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                      }`}
                    >
                      <button
                        onClick={() => handleTagSelect(tag.id)}
                        className="flex min-w-0 flex-1 items-center gap-2.5"
                      >
                        {tag.color ? (
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        ) : (
                          <Tag className="h-4 w-4 shrink-0" />
                        )}
                        <span className="min-w-0 flex-1 truncate text-left">{tag.name}</span>
                      </button>
                      {tag.bookmark_count > 0 && (
                        <Badge size="sm" variant="secondary" className="shrink-0 text-[10px]">
                          {tag.bookmark_count}
                        </Badge>
                      )}
                      {/* Context menu */}
                      <Menu>
                        <MenuTrigger className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </MenuTrigger>
                        <MenuPopup align="end">
                          <MenuItem onClick={() => setEditingTag(tag)}>
                            <Pencil className="h-4 w-4" />
                            <span>Edit</span>
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem variant="destructive" onClick={() => setDeleteConfirmTag(tag)}>
                            <Trash2 className="h-4 w-4" />
                            <span>Delete</span>
                          </MenuItem>
                        </MenuPopup>
                      </Menu>
                    </div>
                  ))}
                </div>
              )}

              {/* Empty tags state */}
              {(isSidebarOpen || isMobileSidebarOpen) && tags.length === 0 && (
                <p className="px-4 py-1.5 text-xs text-muted-foreground/60 md:px-5 md:py-2">
                  No tags yet
                </p>
              )}
            </>
          )}
        </nav>

        {/* Bottom fixed area: Navigation + User menu */}
        <div className="border-t border-border p-2 md:p-3">
          {/* Navigation links */}
          <div className="mb-2 space-y-0.5 md:mb-3">
            <NavLink
              to="/subscriptions"
              icon={<ListChecks className="h-5 w-5" />}
              label="Manage Feeds"
              isOpen={isSidebarOpen || isMobileSidebarOpen}
              isActive={location.pathname === '/subscriptions'}
            />
            <NavLink
              to="/settings"
              icon={<Settings className="h-5 w-5" />}
              label="Settings"
              isOpen={isSidebarOpen || isMobileSidebarOpen}
              isActive={location.pathname === '/settings'}
            />
            <ThemeToggle isOpen={isSidebarOpen || isMobileSidebarOpen} sidebarWidth={isMobileSidebarOpen ? 288 : sidebarWidth} />
          </div>
          
          {/* User section */}
          {(isSidebarOpen || isMobileSidebarOpen) ? (
            <div className="space-y-2 md:space-y-3">
              <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 p-2.5 md:gap-3 md:p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-sm font-medium text-primary-foreground shadow-md md:h-10 md:w-10">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.name || user?.email}
                  </p>
                  {user?.name && (
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout} 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 font-medium text-primary-foreground shadow-md">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleLogout}
                title="Sign out"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="min-h-0 flex-1 overflow-auto bg-background">
        <div key={location.pathname} className="page-transition h-full">
          <Outlet />
        </div>
      </main>

      {/* Create folder dialog */}
      <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>
              {createFolderParentId ? 'Create Subfolder' : 'Create Folder'}
            </DialogTitle>
            <DialogDescription>
              {createFolderParentId
                ? `Create a new subfolder to further organize your ${createFolderType === 'feed' ? 'feeds' : 'bookmarks'}.`
                : `Create a new folder to organize your ${createFolderType === 'feed' ? 'feeds' : 'bookmarks'}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Enter folder name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreateFolder()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setIsCreateFolderOpen(false)
                setCreateFolderParentId(null)
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || isCreatingFolder}
            >
              {isCreatingFolder ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {/* Add Feed dialog */}
      {showAddFeedDialog && <AddFeedDialog onClose={() => setShowAddFeedDialog(false)} />}

      {/* Hidden file input for OPML import */}
      <input
        ref={fileInputRef}
        key={fileInputKey}
        type="file"
        accept=".opml,.xml"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Import result dialog */}
      <AlertDialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Completed</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-1 text-left">
                <div>Feeds imported: {importResult?.success}</div>
                <div>Folders created: {importResult?.folders_created}</div>
                <div>Failed: {importResult?.failed}</div>
                <div>Total feeds: {importResult?.total}</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button />}>OK</AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Import error dialog */}
      <AlertDialog open={!!importError} onOpenChange={() => setImportError(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Failed</AlertDialogTitle>
            <AlertDialogDescription>{importError}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button />}>OK</AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Create Tag dialog */}
      <CreateTagDialog
        open={showCreateTagDialog}
        onOpenChange={setShowCreateTagDialog}
        onSubmit={async (data) => {
          await createTag(data)
          setShowCreateTagDialog(false)
        }}
      />

      {/* Edit Tag dialog */}
      <EditTagDialog
        open={!!editingTag}
        onOpenChange={(open) => !open && setEditingTag(null)}
        tag={editingTag}
        onSubmit={async (data) => {
          if (editingTag && data.name) {
            await updateTag(editingTag.id, { name: data.name, color: data.color })
            setEditingTag(null)
          }
        }}
      />

      {/* Delete Tag confirmation dialog */}
      <AlertDialog open={!!deleteConfirmTag} onOpenChange={() => setDeleteConfirmTag(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tag?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the tag &quot;{deleteConfirmTag?.name}&quot;? This will remove
              it from all associated bookmarks and entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleDeleteTagConfirm}
              disabled={isDeletingTag}
            >
              {isDeletingTag ? (
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

interface NavLinkProps {
  to: string
  icon: React.ReactNode
  label: string
  isOpen: boolean
  isActive: boolean
}

function NavLink({ to, icon, label, isOpen, isActive }: NavLinkProps) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-all duration-200 md:gap-3 md:px-3 md:py-2.5 ${
        isActive
          ? 'bg-primary/10 text-primary shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      } ${!isOpen ? 'justify-center' : ''}`}
      title={!isOpen ? label : undefined}
    >
      <span className={`shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
        {icon}
      </span>
      {isOpen && <span>{label}</span>}
      {isActive && isOpen && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </Link>
  )
}

interface ThemeToggleProps {
  isOpen: boolean
  sidebarWidth: number
}

function ThemeToggle({ isOpen, sidebarWidth }: ThemeToggleProps) {
  const { theme, setTheme } = useThemeStore()
  
  // Show labels only when sidebar is wide enough
  const showLabels = sidebarWidth >= 240

  const themes = [
    { value: 'dark' as const, icon: Moon, label: 'Night' },
    { value: 'light' as const, icon: Sun, label: 'Day' },
    { value: 'system' as const, icon: Monitor, label: 'Auto' },
  ]
  
  // Calculate slider position based on active theme
  const activeIndex = themes.findIndex(t => t.value === theme)

  if (!isOpen) {
    // Collapsed state: show current theme icon only, click to cycle
    const currentTheme = themes.find(t => t.value === theme) || themes[0]
    const CurrentIcon = currentTheme.icon
    return (
      <button
        onClick={() => {
          const currentIndex = themes.findIndex(t => t.value === theme)
          const nextTheme = themes[(currentIndex + 1) % themes.length]
          setTheme(nextTheme.value)
        }}
        className="group flex w-full items-center justify-center rounded-lg px-2.5 py-2 text-muted-foreground transition-all duration-200 hover:bg-accent hover:text-foreground md:py-2.5"
        title={`Theme: ${currentTheme.label} (click to change)`}
      >
        <CurrentIcon className="h-5 w-5 transition-transform duration-200 group-hover:scale-110" />
      </button>
    )
  }

  // Expanded state: show segmented control with sliding indicator
  return (
    <div className="px-2.5 py-1.5 md:px-3 md:py-2">
      <div className="relative flex items-center rounded-lg border border-border bg-muted/30 p-0.5">
        {/* Sliding background indicator */}
        <div
          className="theme-slider absolute left-0.5 top-0.5 bottom-0.5 w-[calc(33.333%-1px)] rounded-md bg-primary/15 shadow-sm"
          style={{
            transform: `translateX(${activeIndex * 100}%)`,
          }}
        />
        
        {themes.map(({ value, icon: Icon, label }) => {
          const isActive = theme === value
          return (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors duration-200 ${
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              title={label}
            >
              <Icon 
                className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${isActive ? 'text-primary scale-110' : 'scale-100'}`}
              />
              {showLabels && <span>{label}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

interface SidebarFolderItemProps {
  folder: FolderTreeNode
  isExpanded: boolean
  onToggle: () => void
  onSelect: (folderId: string) => void
  isActive: boolean
  subscriptions: Subscription[]
  subscriptionsByFolder: Record<string, Subscription[]>
  expandedFolders: Set<string>
  toggleFolder: (folderId: string) => void
  currentFeedId?: string
  currentFolderId?: string
  onFeedSelect: (feedId: string) => void
  allFolders: FolderTreeNode[]
  onCreateSubfolder: () => void
  draggedFeed: Subscription | null
  setDraggedFeed: (feed: Subscription | null) => void
  dragOverFolderId: string | null
  setDragOverFolderId: (id: string | null) => void
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
}: SidebarFolderItemProps) {
  const { deleteFolder, updateFolder } = useFolderStore()
  const updateMutation = useUpdateSubscription()
  const markAllReadMutation = useMarkAllRead()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameFolderName, setRenameFolderName] = useState(folder.name)
  const [isRenaming, setIsRenaming] = useState(false)

  // Calculate total unread count for this folder (including children)
  const totalUnread = subscriptions.reduce((sum, sub) => sum + sub.unread_count, 0)

  const isDragTarget = dragOverFolderId === folder.id
  const canReceiveDrop = draggedFeed && draggedFeed.folder_id !== folder.id

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = canReceiveDrop ? 'move' : 'none'
    setDragOverFolderId(folder.id)
  }

  const handleDragLeave = () => {
    setDragOverFolderId(null)
  }

  const handleDrop = async (e: React.DragEvent) => {
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

  const handleDeleteFolder = async () => {
    await deleteFolder(folder.id)
    setShowDeleteConfirm(false)
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

  return (
    <div>
      <div
        className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-200 md:px-3 md:py-2 ${
          isDragTarget && canReceiveDrop
            ? 'bg-primary/10 ring-2 ring-primary/30'
            : isActive
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
        onContextMenu={handleContextMenu}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button onClick={onToggle} className="flex items-center gap-2">
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          />
          <Folder className="h-4 w-4 shrink-0" />
        </button>
        <button
          onClick={() => onSelect(folder.id)}
          className="min-w-0 flex-1 truncate text-left"
        >
          {folder.name}
        </button>
        {!isExpanded && totalUnread > 0 && (
          <Badge size="sm" variant="secondary" className="shrink-0 text-[10px]">
            {totalUnread}
          </Badge>
        )}
        
        {/* Context menu */}
        <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <MenuTrigger className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem 
              onClick={() => markAllReadMutation.mutate({ folderId: folder.id })}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className={`h-4 w-4 ${markAllReadMutation.isPending ? 'animate-pulse' : ''}`} />
              <span>{markAllReadMutation.isPending ? 'Marking...' : 'Mark All as Read'}</span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={onCreateSubfolder}>
              <FolderPlus className="h-4 w-4" />
              <span>Create Subfolder</span>
            </MenuItem>
            <MenuItem onClick={() => setShowRenameDialog(true)}>
              <Pencil className="h-4 w-4" />
              <span>Rename</span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {/* Child folders */}
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
            />
          ))}

          {/* Feeds in this folder */}
          {subscriptions.map((sub) => (
            <SidebarFeedItem
              key={sub.id}
              subscription={sub}
              isActive={currentFeedId === sub.feed_id}
              onClick={() => onFeedSelect(sub.feed_id)}
              allFolders={allFolders}
              isDragging={draggedFeed?.id === sub.id}
              onDragStart={() => setDraggedFeed(sub)}
              onDragEnd={() => {
                setDraggedFeed(null)
                setDragOverFolderId(null)
              }}
            />
          ))}

          {/* Empty state */}
          {subscriptions.length === 0 && folder.children.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground/60">
              Empty folder
            </p>
          )}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{folder.name}&quot;? Feeds in this folder will be moved to uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleDeleteFolder}
            >
              Delete
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-folder">Folder Name</Label>
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
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={!renameFolderName.trim() || isRenaming}
            >
              {isRenaming ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

interface SidebarFeedItemProps {
  subscription: Subscription
  isActive: boolean
  onClick: () => void
  allFolders: FolderTreeNode[]
  isDragging?: boolean
  onDragStart?: () => void
  onDragEnd?: () => void
}

function SidebarFeedItem({ subscription, isActive, onClick, allFolders, isDragging = false, onDragStart, onDragEnd }: SidebarFeedItemProps) {
  const deleteMutation = useDeleteSubscription()
  const refreshMutation = useRefreshFeed()
  const updateMutation = useUpdateSubscription()
  const markAllReadMutation = useMarkAllRead()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
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
    setShowDeleteConfirm(false)
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
      // Only include feed_url if it was changed
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

  // Flatten folders for move submenu
  const flattenFolders = (nodes: FolderTreeNode[], depth = 0): { id: string; name: string; depth: number }[] => {
    return nodes.flatMap((node) => [
      { id: node.id, name: node.name, depth },
      ...flattenFolders(node.children, depth + 1),
    ])
  }
  const flatFolders = flattenFolders(allFolders)

  return (
    <>
      <div
        className={`group flex w-full cursor-grab items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-200 active:cursor-grabbing md:gap-2.5 md:px-3 md:py-2 ${
          isDragging
            ? 'opacity-50 ring-2 ring-primary/30'
            : isActive
              ? 'bg-primary/10 font-medium text-primary'
              : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = 'move'
          onDragStart?.()
        }}
        onDragEnd={onDragEnd}
        onContextMenu={handleContextMenu}
      >
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2.5">
          {subscription.feed.icon_url ? (
            <img src={subscription.feed.icon_url} alt="" className="h-4 w-4 shrink-0 rounded" draggable={false} />
          ) : (
            <div className="h-4 w-4 shrink-0 rounded bg-muted" />
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {subscription.custom_title || subscription.feed.title || subscription.feed.url}
          </span>
        </button>
        {subscription.unread_count > 0 && (
          <Badge size="sm" variant="secondary" className="shrink-0 text-[10px]">
            {subscription.unread_count}
          </Badge>
        )}
        
        {/* Context menu */}
        <Menu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
          <MenuTrigger className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem 
              onClick={() => markAllReadMutation.mutate({ feedId: subscription.feed_id })}
              disabled={markAllReadMutation.isPending}
            >
              <CheckCheck className={`h-4 w-4 ${markAllReadMutation.isPending ? 'animate-pulse' : ''}`} />
              <span>{markAllReadMutation.isPending ? 'Marking...' : 'Mark All as Read'}</span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={() => setShowEditDialog(true)}>
              <Pencil className="h-4 w-4" />
              <span>Edit</span>
            </MenuItem>
            <MenuItem onClick={handleRefresh} disabled={refreshMutation.isPending}>
              <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </MenuItem>
            {allFolders.length > 0 && (
              <MenuSub>
                <MenuSubTrigger>
                  <FolderInput className="h-4 w-4" />
                  <span>Move to Folder</span>
                </MenuSubTrigger>
                <MenuSubPopup>
                  <MenuItem onClick={() => handleFolderChange(null)}>
                    <span className="text-muted-foreground">No folder</span>
                  </MenuItem>
                  <MenuSeparator />
                  {flatFolders.map((folder) => (
                    <MenuItem 
                      key={folder.id} 
                      onClick={() => handleFolderChange(folder.id)}
                    >
                      <span style={{ paddingLeft: `${folder.depth * 12}px` }}>
                        {folder.name}
                      </span>
                    </MenuItem>
                  ))}
                </MenuSubPopup>
              </MenuSub>
            )}
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4" />
              <span>Unsubscribe</span>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubscribe from feed?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unsubscribe from this feed? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              Unsubscribe
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Edit dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Edit Subscription</DialogTitle>
            <DialogDescription>
              Customize how this feed appears in your reader.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-title">Custom Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                placeholder={subscription.feed.title || subscription.feed.url}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the original feed title
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-url">Feed URL</Label>
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
              <p className="text-xs text-muted-foreground">
                The RSS or Atom feed URL
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  )
}

/**
 * Dialog for adding a new feed subscription.
 */
function AddFeedDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const discoverMutation = useDiscoverFeed()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) return

    try {
      await discoverMutation.mutateAsync({ url: url.trim() })
      onClose()
    } catch {
      // Error is handled by mutation
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div 
        className="animate-fade-in w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-display text-xl font-bold text-foreground">Add Feed</h2>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {discoverMutation.error && (
            <Alert variant="error">
              <AlertCircle />
              <AlertDescription>
                {(discoverMutation.error as Error).message}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="feedUrl" className="text-foreground">
              Feed URL or Website URL
            </Label>
            <Input
              id="feedUrl"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed"
              disabled={discoverMutation.isPending}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Enter a feed URL or website URL — we&apos;ll try to discover the feed automatically
            </p>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={discoverMutation.isPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={discoverMutation.isPending || !url.trim()}
              className="btn-glow"
            >
              {discoverMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Adding...</span>
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span>Add Feed</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

/**
 * Sidebar bookmark folder item component.
 */
interface SidebarBookmarkFolderItemProps {
  folder: FolderTreeNode
  isExpanded: boolean
  onToggle: () => void
  onSelect: (folderId: string) => void
  isActive: boolean
  expandedFolders: Set<string>
  toggleFolder: (folderId: string) => void
  currentFolderId?: string
  onCreateSubfolder: () => void
  onRename: (id: string, name: string) => Promise<unknown>
  onDelete: (id: string) => Promise<boolean>
}

function SidebarBookmarkFolderItem({
  folder,
  isExpanded,
  onToggle,
  onSelect,
  isActive,
  expandedFolders,
  toggleFolder,
  currentFolderId,
  onCreateSubfolder,
  onRename,
  onDelete,
}: SidebarBookmarkFolderItemProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showRenameDialog, setShowRenameDialog] = useState(false)
  const [renameFolderName, setRenameFolderName] = useState(folder.name)
  const [isRenaming, setIsRenaming] = useState(false)

  const hasChildren = folder.children && folder.children.length > 0

  const handleDeleteFolder = async () => {
    await onDelete(folder.id)
    setShowDeleteConfirm(false)
  }

  const handleRenameFolder = async () => {
    if (!renameFolderName.trim() || renameFolderName === folder.name) {
      setShowRenameDialog(false)
      return
    }
    setIsRenaming(true)
    try {
      await onRename(folder.id, renameFolderName.trim())
      setShowRenameDialog(false)
    } finally {
      setIsRenaming(false)
    }
  }

  return (
    <div>
      <div
        className={`group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-200 md:px-3 md:py-2 ${
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
        }`}
      >
        <button onClick={onToggle} className="flex items-center gap-2">
          {hasChildren ? (
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
          ) : (
            <span className="w-3.5" />
          )}
          <FolderOpen className="h-4 w-4 shrink-0" />
        </button>
        <button
          onClick={() => onSelect(folder.id)}
          className="min-w-0 flex-1 truncate text-left"
        >
          {folder.name}
        </button>
        
        {/* Context menu */}
        <Menu>
          <MenuTrigger className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem onClick={onCreateSubfolder}>
              <FolderPlus className="h-4 w-4" />
              <span>Create Subfolder</span>
            </MenuItem>
            <MenuItem onClick={() => setShowRenameDialog(true)}>
              <Pencil className="h-4 w-4" />
              <span>Rename</span>
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="h-4 w-4" />
              <span>Delete</span>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      {/* Expanded content */}
      {isExpanded && hasChildren && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-border pl-2">
          {folder.children.map((child) => (
            <SidebarBookmarkFolderItem
              key={child.id}
              folder={child}
              isExpanded={expandedFolders.has(child.id)}
              onToggle={() => toggleFolder(child.id)}
              onSelect={onSelect}
              isActive={currentFolderId === child.id}
              expandedFolders={expandedFolders}
              toggleFolder={toggleFolder}
              currentFolderId={currentFolderId}
              onCreateSubfolder={onCreateSubfolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{folder.name}&quot;? Bookmarks in this folder will be moved to uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
            <AlertDialogClose
              render={<Button variant="destructive" />}
              onClick={handleDeleteFolder}
            >
              Delete
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>

      {/* Rename dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogPopup>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
          </DialogHeader>
          <div className="px-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="rename-bookmark-folder">Folder Name</Label>
              <Input
                id="rename-bookmark-folder"
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
              Cancel
            </Button>
            <Button
              onClick={handleRenameFolder}
              disabled={!renameFolderName.trim() || isRenaming}
            >
              {isRenaming ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

// Predefined color palette for tags
const TAG_COLOR_PALETTE = [
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#eab308', // yellow
  '#84cc16', // lime
  '#22c55e', // green
  '#14b8a6', // teal
  '#06b6d4', // cyan
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#a855f7', // purple
  '#d946ef', // fuchsia
  '#ec4899', // pink
  '#f43f5e', // rose
]

/**
 * Dialog for creating a new tag.
 */
interface CreateTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: CreateTagRequest) => Promise<void>
}

function CreateTagDialog({ open, onOpenChange, onSubmit }: CreateTagDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setName('')
      setColor(null)
      setError('')
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Tag name is required')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      await onSubmit({ name: name.trim(), color })
      setName('')
      setColor(null)
    } catch (err) {
      setError('Failed to create tag')
      console.error('Failed to create tag:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Tag</DialogTitle>
            <DialogDescription>
              Create a new tag to organize your bookmarks.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div>
              <Label htmlFor="tag-name" className="mb-1.5 block text-sm font-medium text-foreground">
                Name
              </Label>
              <Input
                id="tag-name"
                type="text"
                placeholder="e.g., Technology, Reading List"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-foreground">
                Color
              </Label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-lg transition-transform hover:scale-110 ${
                      color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-transform hover:scale-110 ${
                    color === null ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                  }`}
                  title="No color"
                >
                  ×
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Tag'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}

/**
 * Dialog for editing an existing tag.
 */
interface EditTagDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tag: TagWithCounts | null
  onSubmit: (data: CreateTagRequest) => Promise<void>
}

function EditTagDialog({ open, onOpenChange, tag, onSubmit }: EditTagDialogProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Reset form when dialog opens or tag changes
  useEffect(() => {
    if (open && tag) {
      setName(tag.name)
      setColor(tag.color || null)
      setError('')
    }
  }, [open, tag])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Tag name is required')
      return
    }

    setIsSubmitting(true)
    setError('')

    try {
      await onSubmit({ name: name.trim(), color })
    } catch (err) {
      setError('Failed to update tag')
      console.error('Failed to update tag:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
            <DialogDescription>
              Update the tag name and color.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 px-6 py-4">
            <div>
              <Label htmlFor="edit-tag-name" className="mb-1.5 block text-sm font-medium text-foreground">
                Name
              </Label>
              <Input
                id="edit-tag-name"
                type="text"
                placeholder="e.g., Technology, Reading List"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>

            <div>
              <Label className="mb-1.5 block text-sm font-medium text-foreground">
                Color
              </Label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-lg transition-transform hover:scale-110 ${
                      color === c ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                <button
                  type="button"
                  onClick={() => setColor(null)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg border-2 border-dashed border-border text-muted-foreground transition-transform hover:scale-110 ${
                    color === null ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : ''
                  }`}
                  title="No color"
                >
                  ×
                </button>
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
