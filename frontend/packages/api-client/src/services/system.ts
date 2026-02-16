/**
 * System service for system-level API endpoints.
 */

import type { ApiClient } from '../client'

export interface VectorizationStatus {
  enabled: boolean
  status: 'disabled' | 'idle' | 'validating' | 'rebuilding' | 'error'
  has_error: boolean
  error_message: string | null
  rebuild_progress?: {
    total: number
    pending: number
    processing: number
    done: number
    failed: number
  } | null
}

export interface ReaderBehaviorConfig {
  list_min_visible_ratio: number
  list_exposed_ms: number
  list_skimmed_ms: number
}

export class SystemService {
  constructor(private readonly client: ApiClient) {}

  /**
   * Get vectorization system status.
   */
  async getVectorizationStatus(): Promise<VectorizationStatus> {
    return this.client.get<VectorizationStatus>('/system/vectorization-status')
  }

  /**
   * Get reader behavior config for list engagement tracking.
   */
  async getReaderBehaviorConfig(): Promise<ReaderBehaviorConfig> {
    return this.client.get<ReaderBehaviorConfig>('/system/reader-behavior-config')
  }
}
