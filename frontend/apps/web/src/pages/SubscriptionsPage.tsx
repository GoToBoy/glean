import { useState } from 'react'
import {
  useSubscriptions,
  useDiscoverFeed,
  useDeleteSubscription,
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
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

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
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Subscriptions</h1>
        <p className="text-gray-600 mt-2">Manage your RSS feed subscriptions</p>
      </div>

      {/* Actions bar */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setShowAddDialog(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span>Add Feed</span>
          </button>
          <ImportOPMLButton />
          <ExportOPMLButton />
        </div>

        {subscriptions && (
          <div className="text-sm text-gray-600">
            {subscriptions.length} {subscriptions.length === 1 ? 'subscription' : 'subscriptions'}
          </div>
        )}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Failed to load subscriptions</p>
            <p className="text-sm text-red-700 mt-1">{(error as Error).message}</p>
          </div>
        </div>
      )}

      {/* Subscriptions list */}
      {subscriptions && subscriptions.length === 0 && (
        <div className="text-center py-12">
          <Rss className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No subscriptions yet</h3>
          <p className="text-gray-600 mb-6">
            Start by adding your first RSS feed or importing an OPML file
          </p>
          <button
            onClick={() => setShowAddDialog(true)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-5 h-5" />
            <span>Add Your First Feed</span>
          </button>
        </div>
      )}

      {subscriptions && subscriptions.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((subscription) => (
            <SubscriptionCard key={subscription.id} subscription={subscription} />
          ))}
        </div>
      )}

      {/* Add feed dialog */}
      {showAddDialog && <AddFeedDialog onClose={() => setShowAddDialog(false)} />}
    </div>
  )
}

function SubscriptionCard({ subscription }: { subscription: any }) {
  const deleteMutation = useDeleteSubscription()

  const handleDelete = async () => {
    if (confirm('Are you sure you want to unsubscribe from this feed?')) {
      await deleteMutation.mutateAsync(subscription.id)
    }
  }

  const feed = subscription.feed
  const title = subscription.custom_title || feed.title || feed.url

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-lg transition-shadow">
      {/* Feed icon and title */}
      <div className="flex items-start space-x-3 mb-3">
        {feed.icon_url ? (
          <img src={feed.icon_url} alt="" className="w-10 h-10 rounded flex-shrink-0" />
        ) : (
          <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center flex-shrink-0">
            <Rss className="w-5 h-5 text-blue-600" />
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
          {feed.description && (
            <p className="text-sm text-gray-600 line-clamp-2 mt-1">{feed.description}</p>
          )}
        </div>
      </div>

      {/* Feed metadata */}
      <div className="space-y-2 text-sm text-gray-600 mb-4">
        {feed.site_url && (
          <a
            href={feed.site_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 hover:text-blue-600"
          >
            <ExternalLink className="w-4 h-4" />
            <span className="truncate">Visit site</span>
          </a>
        )}

        {feed.last_fetched_at && (
          <div className="text-xs">
            Last updated: {formatDistanceToNow(new Date(feed.last_fetched_at), { addSuffix: true })}
          </div>
        )}

        {feed.status === 'ERROR' && (
          <div className="text-xs text-red-600 flex items-center space-x-1">
            <AlertCircle className="w-3 h-3" />
            <span>Fetch error ({feed.error_count} failures)</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end space-x-2 pt-3 border-t border-gray-200">
        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="flex items-center space-x-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          <span>Unsubscribe</span>
        </button>
      </div>
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Add Feed</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {discoverMutation.error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 flex items-start space-x-2">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700">{(discoverMutation.error as Error).message}</p>
            </div>
          )}

          <div>
            <label htmlFor="feedUrl" className="block text-sm font-medium text-gray-700 mb-2">
              Feed URL or Website URL
            </label>
            <input
              id="feedUrl"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/feed"
              className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              disabled={discoverMutation.isPending}
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter a feed URL or website URL - we'll try to discover the feed automatically
            </p>
          </div>

          <div className="flex items-center justify-end space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={discoverMutation.isPending}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={discoverMutation.isPending || !url.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {discoverMutation.isPending ? 'Adding...' : 'Add Feed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ImportOPMLButton() {
  const importMutation = useImportOPML()
  const [fileInputKey, setFileInputKey] = useState(0)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const result = await importMutation.mutateAsync(file)
      alert(
        `Import completed!\nSuccess: ${result.success}\nFailed: ${result.failed}\nTotal: ${result.total}`
      )
      setFileInputKey((prev) => prev + 1)
    } catch (err) {
      alert(`Import failed: ${(err as Error).message}`)
    }
  }

  return (
    <label className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors">
      <Upload className="w-5 h-5" />
      <span>Import OPML</span>
      <input
        key={fileInputKey}
        type="file"
        accept=".opml,.xml"
        onChange={handleFileChange}
        disabled={importMutation.isPending}
        className="hidden"
      />
    </label>
  )
}

function ExportOPMLButton() {
  const exportMutation = useExportOPML()

  const handleExport = () => {
    exportMutation.mutate()
  }

  return (
    <button
      onClick={handleExport}
      disabled={exportMutation.isPending}
      className="flex items-center space-x-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
    >
      <Download className="w-5 h-5" />
      <span>Export OPML</span>
    </button>
  )
}
