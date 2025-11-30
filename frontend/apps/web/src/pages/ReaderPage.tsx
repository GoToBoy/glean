import { useState } from 'react'
import { useEntries, useUpdateEntryState, useMarkAllRead } from '../hooks/useEntries'
import { useSubscriptions } from '../hooks/useSubscriptions'
import type { EntryWithState } from '@glean/types'
import {
  Filter,
  Heart,
  CheckCheck,
  Bookmark,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'

/**
 * Reader page.
 *
 * Main reading interface with entry list, filters, and reading pane.
 */
export default function ReaderPage() {
  const [selectedFeedId, setSelectedFeedId] = useState<string | undefined>(undefined)
  const [filterRead, setFilterRead] = useState<boolean | undefined>(false)
  const [filterLiked, setFilterLiked] = useState<boolean | undefined>(undefined)
  const [filterReadLater, setFilterReadLater] = useState<boolean | undefined>(undefined)
  const [selectedEntry, setSelectedEntry] = useState<EntryWithState | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  const { data: subscriptions } = useSubscriptions()
  const { data: entriesData, isLoading, error } = useEntries({
    feed_id: selectedFeedId,
    is_read: filterRead,
    is_liked: filterLiked,
    read_later: filterReadLater,
    page: currentPage,
    per_page: 20,
  })

  const entries = entriesData?.items || []
  const totalPages = entriesData?.total_pages || 1

  return (
    <div className="flex h-full">
      {/* Left sidebar - Feed list */}
      <div className="w-64 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Feeds</h2>

          <button
            onClick={() => setSelectedFeedId(undefined)}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedFeedId === undefined
                ? 'bg-blue-50 text-blue-700 font-medium'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            All Feeds
          </button>

          {subscriptions?.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setSelectedFeedId(sub.feed_id)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mt-1 ${
                selectedFeedId === sub.feed_id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <div className="truncate">{sub.custom_title || sub.feed.title || sub.feed.url}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Middle - Entry list */}
      <div className="flex-1 flex flex-col bg-gray-50">
        {/* Filters */}
        <div className="bg-white border-b border-gray-200 p-4">
          <div className="flex items-center space-x-4">
            <Filter className="w-5 h-5 text-gray-500" />

            <button
              onClick={() => setFilterRead(filterRead === false ? undefined : false)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filterRead === false
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Unread Only
            </button>

            <button
              onClick={() => setFilterLiked(filterLiked === true ? undefined : true)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filterLiked === true
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Liked
            </button>

            <button
              onClick={() => setFilterReadLater(filterReadLater === true ? undefined : true)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filterReadLater === true
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Read Later
            </button>

            <div className="flex-1" />

            <MarkAllReadButton feedId={selectedFeedId} />
          </div>
        </div>

        {/* Entry list */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
          )}

          {error && (
            <div className="p-4">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-800">Failed to load entries</p>
                  <p className="text-sm text-red-700 mt-1">{(error as Error).message}</p>
                </div>
              </div>
            </div>
          )}

          {entries.length === 0 && !isLoading && (
            <div className="text-center py-12">
              <p className="text-gray-600">No entries found</p>
            </div>
          )}

          <div className="divide-y divide-gray-200">
            {entries.map((entry) => (
              <EntryListItem
                key={entry.id}
                entry={entry}
                isSelected={selectedEntry?.id === entry.id}
                onClick={() => setSelectedEntry(entry)}
              />
            ))}
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <span className="text-sm text-gray-600">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Right - Reading pane */}
      {selectedEntry ? (
        <ReadingPane entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
      ) : (
        <div className="w-1/2 bg-white border-l border-gray-200 flex items-center justify-center text-gray-500">
          Select an entry to read
        </div>
      )}
    </div>
  )
}

function EntryListItem({
  entry,
  isSelected,
  onClick,
}: {
  entry: EntryWithState
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className={`p-4 cursor-pointer transition-colors ${
        isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
      } ${!entry.is_read ? 'border-l-4 border-blue-600' : ''}`}
    >
      <h3
        className={`font-medium mb-1 ${
          entry.is_read ? 'text-gray-700' : 'text-gray-900 font-semibold'
        }`}
      >
        {entry.title}
      </h3>

      {entry.summary && (
        <p className="text-sm text-gray-600 line-clamp-2 mb-2">{entry.summary}</p>
      )}

      <div className="flex items-center space-x-4 text-xs text-gray-500">
        {entry.author && <span>{entry.author}</span>}
        {entry.published_at && <span>{format(new Date(entry.published_at), 'MMM d, yyyy')}</span>}

        <div className="flex items-center space-x-2 ml-auto">
          {entry.is_liked && <Heart className="w-4 h-4 text-red-600 fill-current" />}
          {entry.read_later && <Bookmark className="w-4 h-4 text-yellow-600" />}
        </div>
      </div>
    </div>
  )
}

function ReadingPane({ entry }: { entry: EntryWithState; onClose: () => void }) {
  const updateMutation = useUpdateEntryState()

  const handleToggleRead = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { is_read: !entry.is_read },
    })
  }

  const handleToggleLiked = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { is_liked: !entry.is_liked },
    })
  }

  const handleToggleReadLater = async () => {
    await updateMutation.mutateAsync({
      entryId: entry.id,
      data: { read_later: !entry.read_later },
    })
  }

  return (
    <div className="w-1/2 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 flex-1">{entry.title}</h1>
        </div>

        <div className="flex items-center space-x-4 text-sm text-gray-600 mb-4">
          {entry.author && <span>{entry.author}</span>}
          {entry.published_at && (
            <span>{format(new Date(entry.published_at), 'MMMM d, yyyy')}</span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          <a
            href={entry.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open Original</span>
          </a>

          <button
            onClick={handleToggleRead}
            className={`flex items-center space-x-1 px-3 py-1.5 text-sm rounded transition-colors ${
              entry.is_read
                ? 'text-gray-600 hover:bg-gray-100'
                : 'text-blue-600 hover:bg-blue-50'
            }`}
          >
            <CheckCheck className="w-4 h-4" />
            <span>{entry.is_read ? 'Mark Unread' : 'Mark Read'}</span>
          </button>

          <button
            onClick={handleToggleLiked}
            className={`flex items-center space-x-1 px-3 py-1.5 text-sm rounded transition-colors ${
              entry.is_liked ? 'text-red-600 hover:bg-red-50' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Heart className={`w-4 h-4 ${entry.is_liked ? 'fill-current' : ''}`} />
            <span>{entry.is_liked ? 'Unlike' : 'Like'}</span>
          </button>

          <button
            onClick={handleToggleReadLater}
            className={`flex items-center space-x-1 px-3 py-1.5 text-sm rounded transition-colors ${
              entry.read_later
                ? 'text-yellow-600 hover:bg-yellow-50'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Bookmark className="w-4 h-4" />
            <span>{entry.read_later ? 'Remove from Read Later' : 'Read Later'}</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {entry.content ? (
          <div
            className="prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: entry.content }}
          />
        ) : entry.summary ? (
          <p className="text-gray-700">{entry.summary}</p>
        ) : (
          <p className="text-gray-500 italic">No content available</p>
        )}
      </div>
    </div>
  )
}

function MarkAllReadButton({ feedId }: { feedId?: string }) {
  const markAllMutation = useMarkAllRead()

  const handleMarkAll = async () => {
    if (confirm('Mark all entries as read?')) {
      await markAllMutation.mutateAsync(feedId)
    }
  }

  return (
    <button
      onClick={handleMarkAll}
      disabled={markAllMutation.isPending}
      className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
    >
      <CheckCheck className="w-4 h-4" />
      <span>Mark All Read</span>
    </button>
  )
}
