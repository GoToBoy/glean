import { Link, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { Menu, LogOut, Settings, Rss, BookOpen } from 'lucide-react'
import { useState } from 'react'

/**
 * Main application layout.
 *
 * Provides navigation sidebar and header for authenticated pages.
 */
export function Layout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } bg-white border-r border-gray-200 transition-all duration-300`}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200">
            <Link to="/" className="flex items-center space-x-2">
              <Rss className="w-6 h-6 text-blue-600" />
              {isSidebarOpen && (
                <span className="text-xl font-bold text-gray-900">Glean</span>
              )}
            </Link>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <Menu className="w-5 h-5 text-gray-600" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 p-4 space-y-2">
            <NavLink
              to="/reader"
              icon={<BookOpen className="w-5 h-5" />}
              label="Reader"
              isOpen={isSidebarOpen}
            />
            <NavLink
              to="/subscriptions"
              icon={<Rss className="w-5 h-5" />}
              label="Subscriptions"
              isOpen={isSidebarOpen}
            />
            <NavLink
              to="/settings"
              icon={<Settings className="w-5 h-5" />}
              label="Settings"
              isOpen={isSidebarOpen}
            />
          </nav>

          {/* User menu */}
          <div className="p-4 border-t border-gray-200">
            {isSidebarOpen ? (
              <div className="space-y-2">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white font-medium">
                    {user?.name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {user?.name || user?.email}
                    </p>
                    {user?.name && (
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogout}
                className="w-full flex justify-center p-2 text-gray-700 hover:bg-gray-100 rounded"
                title="Logout"
              >
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
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
}

function NavLink({ to, icon, label, isOpen }: NavLinkProps) {
  return (
    <Link
      to={to}
      className="flex items-center space-x-3 px-3 py-2 text-gray-700 hover:bg-gray-100 rounded transition-colors"
    >
      {icon}
      {isOpen && <span className="text-sm font-medium">{label}</span>}
    </Link>
  )
}
