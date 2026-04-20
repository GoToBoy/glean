import type { EntryWithState, FolderTreeNode, Subscription } from '@glean/types'

export interface DigestSection {
  folderId: string | null
  folderName: string
  entries: EntryWithState[]
  sourceCount: number
}

export interface DigestStats {
  total: number
  sourceCount: number
  topicCount: number
  estimatedMinutes: number
  readCount: number
}

/**
 * Estimate reading time for an entry based on content/summary length.
 * Assumes ~300 words per minute for English, ~500 chars per minute for Chinese.
 */
export function estimateReadingMinutes(entry: EntryWithState): number {
  if (entry.estimated_read_time_sec) {
    return Math.ceil(entry.estimated_read_time_sec / 60)
  }

  const text = entry.content || entry.summary || ''
  // Rough heuristic: count words (ASCII) + CJK characters
  const wordCount = (text.match(/[a-zA-Z]+/g) ?? []).length
  const cjkCount = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length
  const minutes = wordCount / 300 + cjkCount / 500
  return Math.max(1, Math.ceil(minutes))
}

/**
 * Group entries by folder, using subscription data to map feed -> folder.
 * Returns sections sorted by folder position, with "Others" at the end.
 */
export function groupEntriesByFolder(
  entries: EntryWithState[],
  folders: FolderTreeNode[],
  subscriptions: Subscription[]
): DigestSection[] {
  // Build feed_id -> folder_id map
  const feedFolderMap = new Map<string, string | null>()
  for (const sub of subscriptions) {
    feedFolderMap.set(sub.feed_id, sub.folder_id)
  }

  // Map every nested folder back to the top-level section it should appear in.
  // The caller passes folders already filtered by type ('feed'); we intentionally do not
  // re-filter here because the server-side type field is a plain string column and any
  // unexpected casing/value would silently drop valid folders and funnel every entry into
  // the Others bucket (regression observed after the i18n retrofit).
  const topFolderByFolderId = new Map<string, string>()
  function collectFolderIds(nodes: FolderTreeNode[], topFolderId: string | null = null) {
    for (const node of nodes) {
      const resolvedTopFolderId = topFolderId ?? node.id
      topFolderByFolderId.set(node.id, resolvedTopFolderId)
      if (node.children.length > 0) {
        collectFolderIds(node.children, resolvedTopFolderId)
      }
    }
  }
  collectFolderIds(folders)

  // Group entries by folder (use top-level folder matching)
  const folderEntries = new Map<string | null, EntryWithState[]>()

  // Initialize with top-level folders (caller already filtered by type).
  for (const folder of folders) {
    folderEntries.set(folder.id, [])
  }
  folderEntries.set(null, []) // "Others"

  for (const entry of entries) {
    const folderId = feedFolderMap.get(entry.feed_id) ?? null

    const topFolderId = folderId ? topFolderByFolderId.get(folderId) ?? null : null

    const bucket = folderEntries.get(topFolderId)
    if (bucket) {
      bucket.push(entry)
    } else {
      const othersBucket = folderEntries.get(null)
      if (othersBucket) othersBucket.push(entry)
    }
  }

  // Sort entries within each section by published_at desc
  for (const [, sectionEntries] of folderEntries) {
    sectionEntries.sort((a, b) => {
      const aTime = a.published_at ? new Date(a.published_at).getTime() : 0
      const bTime = b.published_at ? new Date(b.published_at).getTime() : 0
      return bTime - aTime
    })
  }

  // Build result sections
  const sections: DigestSection[] = []

  // Add folder sections (in folder order)
  for (const folder of folders) {
    const sectionEntries = folderEntries.get(folder.id) ?? []
    if (sectionEntries.length === 0) continue

    const sourceFeedIds = new Set(sectionEntries.map((e) => e.feed_id))
    sections.push({
      folderId: folder.id,
      folderName: folder.name,
      entries: sectionEntries,
      sourceCount: sourceFeedIds.size,
    })
  }

  // Add "Others" section at end
  const othersEntries = folderEntries.get(null) ?? []
  if (othersEntries.length > 0) {
    const sourceFeedIds = new Set(othersEntries.map((e) => e.feed_id))
    sections.push({
      folderId: null,
      folderName: '',
      entries: othersEntries,
      sourceCount: sourceFeedIds.size,
    })
  }

  return sections
}

/**
 * Compute aggregate stats from today's entries.
 */
export function computeDigestStats(entries: EntryWithState[]): DigestStats {
  const total = entries.length
  const readCount = entries.filter((e) => e.is_read).length
  const sourceFeedIds = new Set(entries.map((e) => e.feed_id))
  const sourceCount = sourceFeedIds.size
  const estimatedMinutes = entries.reduce((sum, e) => sum + estimateReadingMinutes(e), 0)

  return {
    total,
    sourceCount,
    topicCount: 0, // Will be computed after grouping
    estimatedMinutes,
    readCount,
  }
}

/**
 * Format minutes into human-readable string like "2h 14m" or "45m".
 */
export function formatReadingTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
}

/**
 * Generate a deterministic color for a feed based on feed_id.
 */
const SOURCE_COLORS = [
  '#B8312F',
  '#3A5F7D',
  '#6B8F71',
  '#B8863B',
  '#7D4E8C',
  '#4A7C8C',
  '#8C6B4A',
  '#4A8C6B',
  '#8C4A6B',
  '#6B4A8C',
]

export function getFeedColor(feedId: string): string {
  let hash = 0
  for (let i = 0; i < feedId.length; i++) {
    hash = (hash * 31 + feedId.charCodeAt(i)) >>> 0
  }
  return SOURCE_COLORS[hash % SOURCE_COLORS.length]
}
