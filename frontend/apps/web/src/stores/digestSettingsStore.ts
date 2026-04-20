import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface DigestSettingsState {
  /** Auto-mark an article as read when it is opened from the digest view */
  autoMarkRead: boolean
  setAutoMarkRead: (value: boolean) => void
}

export const useDigestSettingsStore = create<DigestSettingsState>()(
  persist(
    (set) => ({
      autoMarkRead: false,
      setAutoMarkRead: (value) => set({ autoMarkRead: value }),
    }),
    { name: 'glean-digest-settings' }
  )
)
