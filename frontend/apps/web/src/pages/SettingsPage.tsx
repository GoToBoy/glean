import { useAuthStore } from '../stores/authStore'
import { useThemeStore, type Theme } from '../stores/themeStore'
import { User, Mail, Shield, CheckCircle, AlertCircle, Sun, Moon, Palette, Monitor } from 'lucide-react'
import { Label } from '@glean/ui'

/**
 * Settings page.
 *
 * User profile and application settings.
 */
export default function SettingsPage() {
  const { user } = useAuthStore()
  const { theme, resolvedTheme, setTheme } = useThemeStore()

  return (
    <div className="min-h-full bg-background p-6 lg:p-8">
      <div className="mx-auto max-w-3xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold text-foreground">Settings</h1>
          <p className="mt-2 text-muted-foreground">Manage your account and preferences</p>
        </div>

        {/* Profile section */}
        <section className="animate-fade-in mb-6 rounded-xl border border-border bg-card p-6">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <User className="h-5 w-5 text-primary" />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Profile</h2>
          </div>

          <div className="space-y-5">
            {/* Name */}
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">Name</Label>
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
                <User className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{user?.name || 'Not set'}</span>
              </div>
            </div>

            {/* Email */}
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">Email</Label>
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-4">
                <Mail className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium text-foreground">{user?.email}</span>
              </div>
            </div>

            {/* Account Status */}
            <div>
              <Label className="mb-2 block text-sm text-muted-foreground">Account Status</Label>
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                    user?.is_active
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {user?.is_active ? (
                    <CheckCircle className="h-3.5 w-3.5" />
                  ) : (
                    <AlertCircle className="h-3.5 w-3.5" />
                  )}
                  {user?.is_active ? 'Active' : 'Inactive'}
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium ${
                    user?.is_verified
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <Shield className="h-3.5 w-3.5" />
                  {user?.is_verified ? 'Verified' : 'Not Verified'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Preferences section */}
        <section 
          className="animate-fade-in rounded-xl border border-border bg-card p-6"
          style={{ animationDelay: '0.1s' }}
        >
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary/10">
              <Palette className="h-5 w-5 text-secondary" />
            </div>
            <h2 className="font-display text-xl font-semibold text-foreground">Preferences</h2>
          </div>
          
          <div className="space-y-5">
            {/* Theme */}
            <div>
              <Label className="mb-3 block text-sm text-muted-foreground">Theme</Label>
              <div className="grid grid-cols-3 gap-3">
                <ThemeOption
                  value="dark"
                  label="Night"
                  icon={<Moon className="h-5 w-5" />}
                  isActive={theme === 'dark'}
                  onClick={() => setTheme('dark')}
                />
                <ThemeOption
                  value="light"
                  label="Day"
                  icon={<Sun className="h-5 w-5" />}
                  isActive={theme === 'light'}
                  onClick={() => setTheme('light')}
                />
                <ThemeOption
                  value="system"
                  label="System"
                  icon={<Monitor className="h-5 w-5" />}
                  isActive={theme === 'system'}
                  onClick={() => setTheme('system')}
                  subtitle={theme === 'system' ? `(${resolvedTheme === 'dark' ? 'Night' : 'Day'})` : undefined}
                />
              </div>
            </div>
          </div>
        </section>

        {/* App info */}
        <div className="mt-8 text-center text-xs text-muted-foreground">
          <p>Glean v0.1.0</p>
          <p className="mt-1">Your personal knowledge management companion</p>
        </div>
      </div>
    </div>
  )
}

interface ThemeOptionProps {
  value: Theme
  label: string
  icon: React.ReactNode
  isActive: boolean
  onClick: () => void
  subtitle?: string
}

function ThemeOption({ label, icon, isActive, onClick, subtitle }: ThemeOptionProps) {
  return (
    <button
      onClick={onClick}
      className={`group flex flex-col items-center gap-2.5 rounded-xl border-2 p-4 transition-all duration-200 ${
        isActive
          ? 'border-primary bg-primary/5 shadow-md shadow-primary/10'
          : 'border-border bg-muted/30 hover:border-muted-foreground/30 hover:bg-muted/50'
      }`}
    >
      <div
        className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors ${
          isActive
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground group-hover:bg-accent group-hover:text-foreground'
        }`}
      >
        {icon}
      </div>
      <div className="flex flex-col items-center gap-0.5">
        <span
          className={`text-sm font-medium ${
            isActive ? 'text-foreground' : 'text-muted-foreground'
          }`}
        >
          {label}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">{subtitle}</span>
        )}
      </div>
      {isActive && (
        <span className="flex items-center gap-1 text-xs text-primary">
          <CheckCircle className="h-3.5 w-3.5" />
          Active
        </span>
      )}
    </button>
  )
}
