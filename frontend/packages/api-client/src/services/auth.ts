import type {
  LoginRequest,
  RegisterRequest,
  RefreshTokenRequest,
  AuthResponse,
  TokenResponse,
  User,
} from '@glean/types'
import { ApiClient } from '../client'

/**
 * Authentication API service.
 *
 * Handles user registration, login, token refresh, and profile retrieval.
 */
export class AuthService {
  constructor(private client: ApiClient) {}

  /**
   * Register a new user account.
   */
  async register(data: RegisterRequest): Promise<AuthResponse> {
    return this.client.post<AuthResponse>('/auth/register', data)
  }

  /**
   * Authenticate user and get tokens.
   */
  async login(data: LoginRequest): Promise<AuthResponse> {
    return this.client.post<AuthResponse>('/auth/login', data)
  }

  /**
   * Refresh access token using refresh token.
   */
  async refreshToken(data: RefreshTokenRequest): Promise<TokenResponse> {
    return this.client.post<TokenResponse>('/auth/refresh', data)
  }

  /**
   * Logout current user.
   */
  async logout(): Promise<void> {
    await this.client.post<{ message: string }>('/auth/logout')
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  /**
   * Get current authenticated user profile.
   */
  async getCurrentUser(): Promise<User> {
    return this.client.get<User>('/auth/me')
  }

  /**
   * Save authentication tokens to local storage.
   */
  saveTokens(tokens: TokenResponse): void {
    localStorage.setItem('access_token', tokens.access_token)
    localStorage.setItem('refresh_token', tokens.refresh_token)
  }

  /**
   * Clear authentication tokens from local storage.
   */
  clearTokens(): void {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
  }

  /**
   * Check if user is authenticated.
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token')
  }
}
