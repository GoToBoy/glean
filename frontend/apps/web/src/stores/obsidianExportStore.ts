import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface ObsidianExportState {
  enabled: boolean
  directoryName: string | null
  setEnabled: (enabled: boolean) => void
  setDirectoryName: (name: string | null) => void
  reset: () => void
}

export const useObsidianExportStore = create<ObsidianExportState>()(
  persist(
    (set) => ({
      enabled: false,
      directoryName: null,
      setEnabled: (enabled) => set({ enabled }),
      setDirectoryName: (directoryName) => set({ directoryName }),
      reset: () => set({ enabled: false, directoryName: null }),
    }),
    {
      name: 'glean-obsidian-export',
    }
  )
)
