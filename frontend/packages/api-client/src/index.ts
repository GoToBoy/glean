/**
 * API client package entry point.
 */

export { ApiClient, apiClient } from './client'
export { AuthService } from './services/auth'
export { FeedService } from './services/feeds'
export { EntryService } from './services/entries'

// Create service instances
import { apiClient } from './client'
import { AuthService } from './services/auth'
import { FeedService } from './services/feeds'
import { EntryService } from './services/entries'

export const authService = new AuthService(apiClient)
export const feedService = new FeedService(apiClient)
export const entryService = new EntryService(apiClient)
