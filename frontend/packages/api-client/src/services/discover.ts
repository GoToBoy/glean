import type {
  DiscoveryActionResponse,
  DiscoveryFeedbackRequest,
  DiscoveryListResponse,
  DiscoveryTrialRequest,
} from '@glean/types'
import { ApiClient } from '../client'

export class DiscoverService {
  constructor(private client: ApiClient) {}

  async listSources(params?: {
    limit?: number
    refresh?: boolean
  }): Promise<DiscoveryListResponse> {
    return this.client.get<DiscoveryListResponse>('/discover/sources', { params })
  }

  async startTrial(candidateId: string, data?: DiscoveryTrialRequest): Promise<DiscoveryActionResponse> {
    return this.client.post<DiscoveryActionResponse>(`/discover/${candidateId}/trial`, {
      days: data?.days ?? 7,
    })
  }

  async markSubscribed(candidateId: string): Promise<DiscoveryActionResponse> {
    return this.client.post<DiscoveryActionResponse>(`/discover/${candidateId}/subscribe`)
  }

  async submitFeedback(
    candidateId: string,
    data: DiscoveryFeedbackRequest,
  ): Promise<DiscoveryActionResponse> {
    return this.client.post<DiscoveryActionResponse>(`/discover/${candidateId}/feedback`, data)
  }
}
