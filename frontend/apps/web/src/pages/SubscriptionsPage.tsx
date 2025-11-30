import { useState } from 'react'
import {
  useSubscriptions,
  useDiscoverFeed,
  useDeleteSubscription,
  useRefreshFeed,
  useImportOPML,
  useExportOPML,
} from '../hooks/useSubscriptions'
import {
  Plus,
  Trash2,
  Upload,
  Download,
  AlertCircle,
  Rss,
  ExternalLink,
  Loader2,
  RefreshCw,
  X,
  Sparkles,
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import {
  Button,
  Input,
  Label,
  Alert,
  AlertTitle,
  AlertDescription,
  Badge,
  AlertDialog,
  AlertDialogPopup,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogClose,
} from '@glean/ui'
import type { Subscription } from '@glean/types'

/**
 * Subscriptions management page.
 *
 * Displays user's feed subscriptions with options to add, remove,
 * import/export OPML.
 */
export default function SubscriptionsPage() {
  const { data: subscriptions, isLoading, error } = useSubscriptions()
  const [showAddDialog, setShowAddDialog] = useState(false)

  return (
    <div className="min-h-full bg-background p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground">Subscriptions</h1>
          <p className="mt-2 text-muted-foreground">Manage your RSS feed subscriptions</p>
        </div>

        {/* Actions bar */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setShowAddDialog(true)} className="btn-glow">
              <Plus className="h-4 w-4" />
              <span>Add Feed</span>
            </Button>
            <ImportOPMLButton />
            <ExportOPMLButton />
          </div>

          {subscriptions && (
            <div className="text-sm text-muted-foreground">
              {subscriptions.length} {subscriptions.length === 1 ? 'subscription' : 'subscriptions'}
            </div>
          )}
        </div>

        {/* Loading state */}
        {isLoading && (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <Alert variant="error" className="mb-6">
            <AlertCircle />
            <AlertTitle>Failed to load subscriptions</AlertTitle>
            <AlertDescription>{(error as Error).message}</AlertDescription>
          </Alert>
        )}

        {/* Empty state */}
        {subscriptions && subscriptions.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 py-16">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-muted">
              <Rss className="h-10 w-10 text-muted-foreground" />
            </div>
            <h3 className="mb-2 font-display text-xl font-semibold text-foreground">
              No subscriptions yet
            </h3>
            <p className="mb-6 max-w-sm text-center text-muted-foreground">
              Start by adding your first RSS feed or importing an OPML file
            </p>
            <Button onClick={() => setShowAddDialog(true)} className="btn-glow">
              <Plus className="h-4 w-4" />
              <span>Add Your First Feed</span>
            </Button>
          </div>
        )}

        {/* Subscriptions grid */}
        {subscriptions && subscriptions.length > 0 && (
          <div className="stagger-children grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {subscriptions.map((subscription) => (
              <SubscriptionCard key={subscription.id} subscription={subscription} />
            ))}
          </div>
        )}

        {/* Add feed dialog */}
        {showAddDialog && <AddFeedDialog onClose={() => setShowAddDialog(false)} />}
      </div>
    </div>
  )
}

function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const deleteMutation = useDeleteSubscription()
  const refreshMutation = useRefreshFeed()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleDelete = async () => {
    await deleteMutation.mutateAsync(subscription.id)
    setShowDeleteConfirm(false)
  }

  const handleRefresh = async () => {
    await refreshMutation.mutateAsync(subscription.id)
  }

  const feed = subscription.feed
  const title = subscription.custom_title || feed.title || feed.url

  return (
    <div className="card-hover group rounded-xl border border-border bg-card p-5">
      {/* Feed icon and title */}
      <div className="mb-4 flex items-start gap-3">
        {feed.icon_url ? (
          <img 
            src={feed.icon_url} 
            alt="" 
            className="h-12 w-12 shrink-0 rounded-lg bg-muted object-cover" 
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500/20 to-primary-600/20">
            <Rss className="h-6 w-6 text-primary" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-display font-semibold text-foreground">{title}</h3>
            {subscription.unread_count > 0 && (
              <Badge size="sm" className="shrink-0">
                {subscription.unread_count}
              </Badge>
            )}
          </div>
          {feed.description && (
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{feed.description}</p>
          )}
        </div>
      </div>

      {/* Feed metadata */}
      <div className="mb-4 space-y-2 text-sm">
        {feed.site_url && (
          <a
            href={feed.site_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-muted-foreground transition-colors hover:text-primary"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span className="truncate">Visit site</span>
          </a>
        )}

        {feed.last_fetched_at && (
          <div className="text-xs text-muted-foreground/70">
            Updated {formatDistanceToNow(new Date(feed.last_fetched_at), { addSuffix: true })}
          </div>
        )}

        {feed.status === 'ERROR' && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>Fetch error ({feed.error_count} failures)</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshMutation.isPending}
          title="Refresh this feed now"
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 ${refreshMutation.isPending ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </Button>
        <Button
          variant="destructive-outline"
          size="sm"
          onClick={() => setShowDeleteConfirm(true)}
          disabled={deleteMutation.isPending}
        >
          <Trash2 className="h-4 w-4" />
          <span>Remove</span>
        </Button>
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
              {deleteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Removing...</span>
                </>
              ) : (
                'Unsubscribe'
              )}
            </AlertDialogClose>
          </AlertDialogFooter>
        </AlertDialogPopup>
      </AlertDialog>
    </div>
  )
}

function AddFeedDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('')
  const discoverMutation = useDiscoverFeed()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!url.trim()) return

    try {
      await discoverMutation.mutateAsync({ url: url.trim() })
      onClose()
    } catch (err) {
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

function ImportOPMLButton() {
  const importMutation = useImportOPML()
  const [fileInputKey, setFileInputKey] = useState(0)
  const [importResult, setImportResult] = useState<{
    success: number
    failed: number
    total: number
  } | null>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await importMutation.mutateAsync(file)
      setImportResult(result)
      setFileInputKey((prev) => prev + 1)
    } catch (err) {
      setImportError((err as Error).message)
    }
  }

  return (
    <>
      <Button 
        variant="outline" 
        render={(props: React.HTMLAttributes<HTMLLabelElement> & { className?: string }) => (
          <label {...props} className={`${props.className} cursor-pointer`} />
        )}
      >
        <Upload className="h-4 w-4" />
        <span>Import OPML</span>
        <input
          key={fileInputKey}
          type="file"
          accept=".opml,.xml"
          onChange={handleFileChange}
          disabled={importMutation.isPending}
          className="hidden"
        />
      </Button>

      {/* Import result dialog */}
      <AlertDialog open={!!importResult} onOpenChange={() => setImportResult(null)}>
        <AlertDialogPopup>
          <AlertDialogHeader>
            <AlertDialogTitle>Import Completed</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-1 text-left">
                <div>Success: {importResult?.success}</div>
                <div>Failed: {importResult?.failed}</div>
                <div>Total: {importResult?.total}</div>
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
    </>
  )
}

function ExportOPMLButton() {
  const exportMutation = useExportOPML()

  const handleExport = () => {
    exportMutation.mutate()
  }

  return (
    <Button 
      variant="outline" 
      onClick={handleExport} 
      disabled={exportMutation.isPending}
    >
      <Download className="h-4 w-4" />
      <span>Export OPML</span>
    </Button>
  )
}
