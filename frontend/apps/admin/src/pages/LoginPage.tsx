import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Button, Label, Alert, AlertTitle, AlertDescription } from '@glean/ui'
import { Lock, User, Rss, AlertCircle } from 'lucide-react'

/**
 * Admin login page.
 */
export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((state) => state.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await login(username, password)
      navigate('/dashboard')
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } }
      setError(error.response?.data?.detail || 'Invalid username or password')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary/20">
            <Rss className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="font-display text-3xl font-bold text-foreground">Glean Admin</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in to manage your system</p>
        </div>

        {/* Login form */}
        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <Alert variant="error">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <div className="input-container flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 shadow-2xs ring-ring/24 transition-shadow focus-within:border-ring focus-within:ring-[3px] dark:bg-input/32">
                <User className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/64"
                  placeholder="Enter your username"
                  required
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="input-container flex items-center gap-3 rounded-lg border border-input bg-background px-3 py-2 shadow-2xs ring-ring/24 transition-shadow focus-within:border-ring focus-within:ring-[3px] dark:bg-input/32">
                <Lock className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/64"
                  placeholder="Enter your password"
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Admin access only. Unauthorized access is prohibited.
        </p>
      </div>
    </div>
  )
}

