import type { EntryWithState, EntryListResponse, UpdateEntryStateRequest } from '@glean/types'
import { ApiClient } from '../client'

/**
 * Entries API service.
 *
 * Handles entry listing, retrieval, and state management.
 */
export class EntryService {
  constructor(private client: ApiClient) {}

  /**
   * Get entries with filtering and pagination.
   */
  async getEntries(params?: {
    feed_id?: string
    folder_id?: string
    is_read?: boolean
    is_liked?: boolean
    read_later?: boolean
    page?: number
    per_page?: number
  }): Promise<EntryListResponse> {
    return this.client.get<EntryListResponse>('/entries', { params })
  }

  /**
   * Get a specific entry.
   */
  async getEntry(entryId: string): Promise<EntryWithState> {
    return this.client.get<EntryWithState>(`/entries/${entryId}`)
  }

  /**
   * Update entry state (read, liked, read later).
   */
  async updateEntryState(entryId: string, data: UpdateEntryStateRequest): Promise<EntryWithState> {
    return this.client.patch<EntryWithState>(`/entries/${entryId}`, data)
  }

  /**
   * Mark all entries as read.
   */
  async markAllRead(feedId?: string, folderId?: string): Promise<{ message: string }> {
    return this.client.post<{ message: string }>('/entries/mark-all-read', {
      feed_id: feedId,
      folder_id: folderId,
    })
  }
}
