/**
 * Domain model type definitions.
 *
 * These types correspond to the backend database models
 * and are used throughout the frontend application.
 */

/** User account information */
export interface User {
  id: string
  email: string
  name: string
  avatar_url: string | null
  is_active: boolean
  is_verified: boolean
  created_at: string
}

/** RSS feed status */
export enum FeedStatus {
  ACTIVE = 'ACTIVE',
  ERROR = 'ERROR',
  PAUSED = 'PAUSED',
}

/** RSS feed */
export interface Feed {
  id: string
  url: string
  title: string | null
  site_url: string | null
  description: string | null
  icon_url: string | null
  language: string | null
  status: FeedStatus
  error_count: number
  fetch_error_message: string | null
  last_fetched_at: string | null
  last_entry_at: string | null
  created_at: string
  updated_at: string
}

/** User subscription to a feed */
export interface Subscription {
  id: string
  user_id: string
  feed_id: string
  custom_title: string | null
  created_at: string
  feed: Feed
  unread_count: number
}

/** Feed entry (article) */
export interface Entry {
  id: string
  feed_id: string
  guid: string
  url: string
  title: string
  author: string | null
  content: string | null
  summary: string | null
  published_at: string | null
  created_at: string
}

/** Entry with user state */
export interface EntryWithState extends Entry {
  is_read: boolean
  is_liked: boolean | null  // true = liked, false = disliked, null = no feedback
  read_later: boolean
  read_at: string | null
}
