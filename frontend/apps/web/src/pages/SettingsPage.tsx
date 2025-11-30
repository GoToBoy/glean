import { useAuthStore } from '../stores/authStore'
import { User, Mail } from 'lucide-react'

/**
 * Settings page.
 *
 * User profile and application settings.
 */
export default function SettingsPage() {
  const { user } = useAuthStore()

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-2">Manage your account and preferences</p>
      </div>

      {/* Profile section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Profile</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Name</label>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <User className="w-5 h-5 text-gray-400" />
              <span className="text-gray-900">{user?.name || 'Not set'}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
            <div className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
              <Mail className="w-5 h-5 text-gray-400" />
              <span className="text-gray-900">{user?.email}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Account Status</label>
            <div className="flex items-center space-x-2">
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  user?.is_active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-red-100 text-red-800'
                }`}
              >
                {user?.is_active ? 'Active' : 'Inactive'}
              </span>
              <span
                className={`px-3 py-1 rounded-full text-xs font-medium ${
                  user?.is_verified
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {user?.is_verified ? 'Verified' : 'Not Verified'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Preferences section (placeholder) */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Preferences</h2>
        <p className="text-gray-600 text-sm">
          Additional settings will be available in future updates.
        </p>
      </div>
    </div>
  )
}
