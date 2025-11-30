import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { feedService } from '@glean/api-client'
import type {
  DiscoverFeedRequest,
  UpdateSubscriptionRequest,
} from '@glean/types'

/**
 * Query key factory for subscriptions.
 */
export const subscriptionKeys = {
  all: ['subscriptions'] as const,
  lists: () => [...subscriptionKeys.all, 'list'] as const,
  detail: (id: string) => [...subscriptionKeys.all, 'detail', id] as const,
}

/**
 * Hook to fetch all user subscriptions.
 */
export function useSubscriptions() {
  return useQuery({
    queryKey: subscriptionKeys.lists(),
    queryFn: () => feedService.getSubscriptions(),
  })
}

/**
 * Hook to fetch a single subscription.
 */
export function useSubscription(subscriptionId: string) {
  return useQuery({
    queryKey: subscriptionKeys.detail(subscriptionId),
    queryFn: () => feedService.getSubscription(subscriptionId),
    enabled: !!subscriptionId,
  })
}

/**
 * Hook to discover and subscribe to a feed.
 */
export function useDiscoverFeed() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: DiscoverFeedRequest) => feedService.discoverFeed(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
    },
  })
}

/**
 * Hook to update a subscription.
 */
export function useUpdateSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      subscriptionId,
      data,
    }: {
      subscriptionId: string
      data: UpdateSubscriptionRequest
    }) => feedService.updateSubscription(subscriptionId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
      queryClient.invalidateQueries({
        queryKey: subscriptionKeys.detail(variables.subscriptionId),
      })
    },
  })
}

/**
 * Hook to delete a subscription.
 */
export function useDeleteSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (subscriptionId: string) => feedService.deleteSubscription(subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
    },
  })
}

/**
 * Hook to import OPML file.
 */
export function useImportOPML() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => feedService.importOPML(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: subscriptionKeys.lists() })
    },
  })
}

/**
 * Hook to export OPML file.
 */
export function useExportOPML() {
  return useMutation({
    mutationFn: () => feedService.exportOPML(),
    onSuccess: (blob) => {
      // Create download link
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'glean-subscriptions.opml'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    },
  })
}
