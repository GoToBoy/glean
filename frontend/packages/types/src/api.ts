/**
 * API response type definitions.
 *
 * These types define the structure of API responses
 * for consistent handling across the application.
 */

import type { DiscoveryCandidate, EntryWithState, Subscription, User } from './models'

/** Authentication token response */
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

/** Authentication response (login/register) */
export interface AuthResponse {
  user: User
  tokens: TokenResponse
}

/** Generic paginated response wrapper */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

/** API error response */
export interface ApiError {
  detail: string
  code?: string
}

/** Health check response */
export interface HealthCheckResponse {
  status: string
  version?: string
}

/** Login request */
export interface LoginRequest {
  email: string
  password: string
}

/** Register request */
export interface RegisterRequest {
  email: string
  password: string
  name: string
}

/** Refresh token request */
export interface RefreshTokenRequest {
  refresh_token: string
}

/** Discover feed request */
export interface DiscoverFeedRequest {
  url: string
  folder_id?: string | null
  rsshub_path?: string | null
}

/** Update subscription request */
export interface UpdateSubscriptionRequest {
  custom_title?: string | null
  folder_id?: string | null
  feed_url?: string | null
  rsshub_path?: string | null
}

/** Update entry state request */
export interface UpdateEntryStateRequest {
  is_read?: boolean
  is_liked?: boolean | null // null to clear like/dislike
  read_later?: boolean
  read_later_days?: number
  triage_state?: 'now' | 'later' | 'archive' | 'trial'
  defer_until?: string | null
  expires_at?: string | null
  estimated_read_time_sec?: number
  content_temporality?: 'timely' | 'evergreen' | 'mixed'
}

export type EntryEventType =
  | 'entry_impression'
  | 'entry_open'
  | 'entry_dwell'
  | 'entry_scroll_depth'
  | 'entry_exit'
  | 'entry_return'

export interface TrackEntryEventRequest {
  event_id: string
  event_type: EntryEventType
  session_id: string
  occurred_at: string
  client_ts?: string
  view?: 'timeline' | 'smart'
  device_type?: 'desktop' | 'mobile' | 'tablet' | 'unknown'
  active_ms?: number
  scroll_depth_max?: number
  est_read_time_sec?: number
  extra?: Record<string, string | number | boolean | null>
}

export interface TrackEntryEventResponse {
  accepted: boolean
  duplicate: boolean
}

export interface FeedbackSummaryResponse {
  recent_explicit_feedback_count: number
}

/** Entry list response */
export type EntryListResponse = PaginatedResponse<EntryWithState>

export interface DiscoveryListResponse {
  items: DiscoveryCandidate[]
  total: number
}

export interface DiscoveryTrialRequest {
  days?: number
}

export interface DiscoveryFeedbackRequest {
  feedback_type: 'dismiss_source' | 'reduce_topic' | 'trial_start' | 'trial_end' | 'subscribed'
  topic?: string
}

export interface DiscoveryActionResponse {
  ok: boolean
  message: string
}

/** Subscription list response (paginated) */
export interface SubscriptionListResponse {
  items: Subscription[]
  total: number
  page: number
  per_page: number
  total_pages: number
}

/** Subscription sync response (all subscriptions with ETag) */
export interface SubscriptionSyncResponse {
  items: Subscription[]
  etag: string
}

/** Subscription list params */
export interface SubscriptionListParams {
  page?: number
  per_page?: number
  folder_id?: string | null
  search?: string
}

/** OPML import response */
export interface OPMLImportResponse {
  success: number
  failed: number
  total: number
  folders_created: number
}

/** Batch delete subscriptions request */
export interface BatchDeleteSubscriptionsRequest {
  subscription_ids: string[]
}

/** Batch delete subscriptions response */
export interface BatchDeleteSubscriptionsResponse {
  deleted_count: number
  failed_count: number
}

export interface FeedRefreshJob {
  subscription_id?: string
  feed_id: string
  job_id: string
  feed_title?: string
}

export interface RefreshFeedResponse {
  status: string
  job_id: string
  feed_id: string
  feed_title?: string
}

export interface RefreshAllFeedsResponse {
  status: string
  queued_count: number
  jobs: FeedRefreshJob[]
}

export interface RefreshStatusRequest {
  items: Array<{
    feed_id: string
    job_id: string
  }>
}

export interface RefreshStatusItem {
  feed_id: string
  job_id: string
  status: string
  result_status: string | null
  new_entries: number | null
  message: string | null
  last_fetch_attempt_at: string | null
  last_fetch_success_at: string | null
  last_fetched_at: string | null
  error_count: number
  fetch_error_message: string | null
}

export interface RefreshStatusResponse {
  items: RefreshStatusItem[]
}
