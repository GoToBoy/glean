import { useState } from 'react'
import { Button } from '@glean/ui'
import { authService } from '@glean/api-client'
import { logger } from '@glean/logger'

/**
 * OIDC login button component.
 *
 * Initiates OAuth/OIDC authentication flow by redirecting to provider.
 */
export function OIDCLoginButton() {
  const [loading, setLoading] = useState(false)

  const handleOIDCLogin = async () => {
    try {
      setLoading(true)

      // Clear any previous OIDC state to prevent stale data
      localStorage.removeItem('oidc_state')

      // Get authorization URL from backend
      const { authorization_url, state } = await authService.getOIDCAuthUrl()

      // Save state for CSRF validation
      localStorage.setItem('oidc_state', state)

      // Add a small delay to ensure localStorage is updated before redirect
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Redirect to OIDC provider
      window.location.href = authorization_url
    } catch (error) {
      logger.error('Failed to initiate OIDC login', { error })
      setLoading(false)
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleOIDCLogin}
      disabled={loading}
      className="w-full"
    >
      {loading ? (
        <span>Redirecting...</span>
      ) : (
        <>
          <svg
            className="mr-2 h-5 w-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Generic OAuth icon */}
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          </svg>
          <span>Sign in with SSO</span>
        </>
      )}
    </Button>
  )
}
