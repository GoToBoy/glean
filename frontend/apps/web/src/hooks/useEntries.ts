import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { entryService } from '@glean/api-client'
import type { UpdateEntryStateRequest } from '@glean/types'
import { subscriptionKeys } from './useSubscriptions'

/**
 * Query key factory for entries.
 */
export const entryKeys = {
  all: ['entries'] as const,
  lists: () => [...entryKeys.all, 'list'] as const,
  list: (filters: EntryFilters) => [...entryKeys.lists(), filters] as const,
  detail: (id: string) => [...entryKeys.all, 'detail', id] as const,
}

/**
 * Entry list filters.
 */
export interface EntryFilters {
  feed_id?: string
  folder_id?: string
  is_read?: boolean
  is_liked?: boolean
  read_later?: boolean
  page?: number
  per_page?: number
}

/**
 * Hook to fetch entries with filters.
 */
export function useEntries(filters?: EntryFilters) {
  return useQuery({
    queryKey: entryKeys.list(filters || {}),
    queryFn: () => entryService.getEntries(filters),
  })
}

/**
 * Hook to fetch a single entry.
 */
export function useEntry(entryId: string) {
  return useQuery({
    queryKey: entryKeys.detail(entryId),
    queryFn: () => entryService.getEntry(entryId),
    enabled: !!entryId,
  })
}

/**
 * Hook to update entry state.
 */
export function useUpdateEntryState() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ entryId, data }: { entryId: string; data: UpdateEntryStateRequest }) =>
      entryService.updateEntryState(entryId, data),
    onSuccess: (updatedEntry, variables) => {
      // Update the specific entry in cache
      queryClient.setQueryData(entryKeys.detail(variables.entryId), updatedEntry)
      
      // Invalidate all entry lists to refetch with updated data
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
      
      // Invalidate subscriptions to update unread counts
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
    },
  })
}

/**
 * Hook to mark all entries as read.
 */
export function useMarkAllRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ feedId, folderId }: { feedId?: string; folderId?: string }) =>
      entryService.markAllRead(feedId, folderId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: entryKeys.lists() })
      // Invalidate subscriptions to update unread counts
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
    },
  })
}
