import { Link, Outlet, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { LogOut, Settings, Rss, ChevronLeft, Inbox } from 'lucide-react'
import { useState } from 'react'
import { Button, Badge } from '@glean/ui'
import { useSubscriptions } from '../hooks/useSubscriptions'

/**
 * Main application layout.
 *
 * Provides navigation sidebar and header for authenticated pages.
 * Includes integrated feed list for unified navigation experience.
 */
export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const { data: subscriptions } = useSubscriptions()

  const currentFeedId = searchParams.get('feed') || undefined
  const isReaderPage = location.pathname === '/reader'

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const handleFeedSelect = (feedId?: string) => {
    if (feedId) {
      navigate(`/reader?feed=${feedId}`)
    } else {
      navigate('/reader')
    }
  }

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? 'w-64' : 'w-[72px]'
        } relative flex flex-col border-r border-border bg-card transition-all duration-300`}
      >
        {/* Logo */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <Link to="/" className="flex items-center gap-3 overflow-hidden">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500 to-primary-600 shadow-lg shadow-primary/20">
              <Rss className="h-5 w-5 text-primary-foreground" />
            </div>
            {isSidebarOpen && (
              <span className="font-display text-xl font-bold text-foreground">
                Glean
              </span>
            )}
          </Link>
        </div>

        {/* Toggle button */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="absolute -right-3 top-16 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeft className={`h-4 w-4 transition-transform ${!isSidebarOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-3">
          {/* Feeds Section */}
          {isSidebarOpen && (
            <div className="mb-2">
              <h3 className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                Feeds
              </h3>
            </div>
          )}
          
          {/* All Feeds */}
          <button
            onClick={() => handleFeedSelect(undefined)}
            className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
              isReaderPage && !currentFeedId
                ? 'bg-primary/10 text-primary shadow-sm'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground'
            } ${!isSidebarOpen ? 'justify-center' : ''}`}
            title={!isSidebarOpen ? 'All Feeds' : undefined}
          >
            <span className={`shrink-0 ${isReaderPage && !currentFeedId ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
              <Inbox className="h-5 w-5" />
            </span>
            {isSidebarOpen && <span>All Feeds</span>}
            {isReaderPage && !currentFeedId && isSidebarOpen && (
              <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>

          {/* Individual Feeds */}
          {isSidebarOpen && subscriptions && subscriptions.length > 0 && (
            <div className="mt-1 space-y-0.5 pl-2">
              {subscriptions.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => handleFeedSelect(sub.feed_id)}
                  className={`group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-all duration-200 ${
                    isReaderPage && currentFeedId === sub.feed_id
                      ? 'bg-primary/10 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  {sub.feed.icon_url ? (
                    <img src={sub.feed.icon_url} alt="" className="h-4 w-4 shrink-0 rounded" />
                  ) : (
                    <div className="h-4 w-4 shrink-0 rounded bg-muted" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-left">
                    {sub.custom_title || sub.feed.title || sub.feed.url}
                  </span>
                  {sub.unread_count > 0 && (
                    <Badge size="sm" variant="secondary" className="shrink-0 text-[10px]">
                      {sub.unread_count}
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Divider */}
          <div className="my-3 border-t border-border" />

          {/* Other Navigation */}
          <NavLink
            to="/subscriptions"
            icon={<Rss className="h-5 w-5" />}
            label="Manage Feeds"
            isOpen={isSidebarOpen}
            isActive={location.pathname === '/subscriptions'}
          />
          <NavLink
            to="/settings"
            icon={<Settings className="h-5 w-5" />}
            label="Settings"
            isOpen={isSidebarOpen}
            isActive={location.pathname === '/settings'}
          />
        </nav>

        {/* User menu */}
        <div className="border-t border-border p-3">
          {isSidebarOpen ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 font-medium text-primary-foreground shadow-md">
                  {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {user?.name || user?.email}
                  </p>
                  {user?.name && (
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                  )}
                </div>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={handleLogout} 
                className="w-full justify-start text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 font-medium text-primary-foreground shadow-md">
                {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleLogout}
                title="Sign out"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-background">
        <Outlet />
      </main>
    </div>
  )
}

interface NavLinkProps {
  to: string
  icon: React.ReactNode
  label: string
  isOpen: boolean
  isActive: boolean
}

function NavLink({ to, icon, label, isOpen, isActive }: NavLinkProps) {
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 ${
        isActive
          ? 'bg-primary/10 text-primary shadow-sm'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground'
      } ${!isOpen ? 'justify-center' : ''}`}
      title={!isOpen ? label : undefined}
    >
      <span className={`shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`}>
        {icon}
      </span>
      {isOpen && <span>{label}</span>}
      {isActive && isOpen && (
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
      )}
    </Link>
  )
}
