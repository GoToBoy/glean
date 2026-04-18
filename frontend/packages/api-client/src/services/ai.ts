import type { AIDailySummaryResponse } from '@glean/types'
import type { ApiClient } from '../client'

export class AIService {
  constructor(private readonly client: ApiClient) {}

  async getTodaySummary(params: {
    date: string
    timezone: string
  }): Promise<AIDailySummaryResponse> {
    return this.client.get<AIDailySummaryResponse>('/ai/today-summary', { params })
  }
}
