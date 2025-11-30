import type {
  Subscription,
  SubscriptionListResponse,
  DiscoverFeedRequest,
  UpdateSubscriptionRequest,
  OPMLImportResponse,
} from '@glean/types'
import { ApiClient } from '../client'

/**
 * Feeds and subscriptions API service.
 *
 * Handles feed discovery, subscription management, and OPML import/export.
 */
export class FeedService {
  constructor(private client: ApiClient) {}

  /**
   * Get all user subscriptions.
   */
  async getSubscriptions(): Promise<SubscriptionListResponse> {
    return this.client.get<SubscriptionListResponse>('/feeds')
  }

  /**
   * Get a specific subscription.
   */
  async getSubscription(subscriptionId: string): Promise<Subscription> {
    return this.client.get<Subscription>(`/feeds/${subscriptionId}`)
  }

  /**
   * Discover and subscribe to a feed from URL.
   */
  async discoverFeed(data: DiscoverFeedRequest): Promise<Subscription> {
    return this.client.post<Subscription>('/feeds/discover', data)
  }

  /**
   * Update subscription settings.
   */
  async updateSubscription(
    subscriptionId: string,
    data: UpdateSubscriptionRequest
  ): Promise<Subscription> {
    return this.client.patch<Subscription>(`/feeds/${subscriptionId}`, data)
  }

  /**
   * Delete a subscription.
   */
  async deleteSubscription(subscriptionId: string): Promise<void> {
    await this.client.delete(`/feeds/${subscriptionId}`)
  }

  /**
   * Import subscriptions from OPML file.
   */
  async importOPML(file: File): Promise<OPMLImportResponse> {
    const formData = new FormData()
    formData.append('file', file)

    return this.client.post<OPMLImportResponse>('/feeds/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  }

  /**
   * Export subscriptions as OPML file.
   */
  async exportOPML(): Promise<Blob> {
    const response = await this.client.get<Blob>('/feeds/export', {
      responseType: 'blob',
    })
    return response
  }
}
